"""Rule-based scheduling help. Transparent and deliberately simple — it never claims an "optimal" schedule.

- Busy time: timed appointments and task blocks. Preference windows (e.g. study hours) and all-day events are not busy.
- Free time: your working hours (Settings) minus busy time, from now on.
- Conflicts: two busy occurrences that overlap. "hard" when both are fixed commitments.
- At risk: an open task whose estimate, minus the time already blocked for it, no longer fits in the free time
  left before its deadline (or the end of its due date).
- Suggestions: free slots before the task is due, preferring your preference windows, then the earliest.
Nothing here writes to the database: suggestions are applied only when you confirm them in the app.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from sqlalchemy import select

from app.common.models import utcnow
from app.common.timeutil import user_zone
from app.extensions import db
from app.modules.auth.models import DEFAULT_WORKING_HOURS, WEEKDAYS
from app.modules.calendar.links import google_busy
from app.modules.calendar.service import Occ, occurrences
from app.modules.tasks.models import Task

RISK_HORIZON = timedelta(days=14)
MAX_BLOCK = timedelta(hours=3)  # longest single block we propose
MIN_SUGGESTION = timedelta(minutes=30)


@dataclass
class Interval:
    start: datetime
    end: datetime

    @property
    def minutes(self) -> int:
        return int((self.end - self.start).total_seconds() // 60)


def _iso(v):
    return v.isoformat() if v else None


def working_hours(user) -> dict:
    return user.settings.working_hours or DEFAULT_WORKING_HOURS


def _working_windows(user, start: datetime, end: datetime) -> list[Interval]:
    tz = user_zone(user)
    hours = working_hours(user)
    day = start.astimezone(tz).date() - timedelta(days=1)
    last = end.astimezone(tz).date()
    out = []
    while day <= last:
        for open_, close in hours.get(WEEKDAYS[day.weekday()], []):
            s = datetime.combine(day, time.fromisoformat(open_), tz)
            e = datetime.combine(day, time.fromisoformat(close), tz)
            s, e = max(s, start), min(e, end)
            if e > s:
                out.append(Interval(s, e))
        day += timedelta(days=1)
    return out


def _subtract(windows: list[Interval], busy: list[Interval]) -> list[Interval]:
    busy = sorted(busy, key=lambda b: b.start)
    free = []
    for w in windows:
        cursor = w.start
        for b in busy:
            if b.end <= cursor or b.start >= w.end:
                continue
            if b.start > cursor:
                free.append(Interval(cursor, b.start))
            cursor = max(cursor, b.end)
        if cursor < w.end:
            free.append(Interval(cursor, w.end))
    return free


def free_slots(user, start: datetime, end: datetime, min_minutes: int = 30, occs: list[Occ] | None = None,
               ignore_event_id=None) -> list[Interval]:
    start = max(start, utcnow())
    if end <= start:
        return []
    occs = occs if occs is not None else occurrences(user, start, end)
    busy = [Interval(o.starts_at, o.ends_at) for o in occs if o.busy and o.event.id != ignore_event_id]
    busy += [Interval(s, e) for s, e in google_busy(user, start, end)]  # a linked Google calendar is busy time too
    return [s for s in _subtract(_working_windows(user, start, end), busy) if s.minutes >= min_minutes]


def slot_to_dict(s: Interval) -> dict:
    return {"starts_at": _iso(s.start), "ends_at": _iso(s.end), "minutes": s.minutes}


# ---------- conflicts ----------

def conflicts(user, start: datetime, end: datetime) -> list[dict]:
    occs = occurrences(user, start, end)
    busy = [o for o in occs if o.busy]
    out = []
    for i, a in enumerate(busy):
        for b in busy[i + 1:]:
            if b.starts_at >= a.ends_at:
                break  # sorted by start: nothing later can overlap a
            overlap = int((min(a.ends_at, b.ends_at) - b.starts_at).total_seconds() // 60)
            item = {
                "a": _brief(a), "b": _brief(b),
                "overlap_minutes": overlap,
                "severity": "hard" if a.event.is_hard and b.event.is_hard else "soft",
                "suggestion": None,
            }
            # Offer to move a flexible task block (never a fixed appointment) to the next free slot.
            movable = next((o for o in (b, a) if o.event.kind == "task_block" and not o.event.is_hard), None)
            if movable is not None:
                duration = movable.ends_at - movable.starts_at
                slots = free_slots(user, max(utcnow(), movable.starts_at), movable.starts_at + timedelta(days=7),
                                   int(duration.total_seconds() // 60), ignore_event_id=movable.event.id)
                if slots:
                    item["suggestion"] = {
                        "occurrence": _brief(movable),
                        "starts_at": _iso(slots[0].start),
                        "ends_at": _iso(slots[0].start + duration),
                    }
            out.append(item)
    return out


def _brief(o: Occ) -> dict:
    return {
        "event_id": str(o.event.id), "title": o.title, "kind": o.event.kind, "is_hard": o.event.is_hard,
        "starts_at": _iso(o.starts_at), "ends_at": _iso(o.ends_at), "original_start": _iso(o.original_start),
        "recurring": o.event.rrule is not None,
    }


# ---------- deadlines at risk ----------

def _target_end(user, task: Task) -> datetime | None:
    """When the work must be finished: the deadline, else the end of the due date (local)."""
    if task.deadline:
        return task.deadline
    if task.due_date:
        return datetime.combine(task.due_date + timedelta(days=1), time.min, user_zone(user))
    return None


def _scheduled_minutes(occs: list[Occ], task_id, after: datetime, before: datetime) -> int:
    total = 0
    for o in occs:
        if o.event.kind == "task_block" and o.event.task_id == task_id:
            s, e = max(o.starts_at, after), min(o.ends_at, before)
            if e > s:
                total += int((e - s).total_seconds() // 60)
    return total


def workload(user) -> list[dict]:
    """Open tasks with an estimate that are due within the horizon: how much time is still needed vs. free."""
    now = utcnow()
    horizon = now + RISK_HORIZON
    tasks = db.session.scalars(
        select(Task).where(
            Task.user_id == user.id, Task.archived_at.is_(None), Task.status != "done",
            Task.parent_task_id.is_(None), Task.estimate_minutes > 0,
        )
    ).all()
    targets = [(t, _target_end(user, t)) for t in tasks]
    targets = [(t, end) for t, end in targets if end is not None and now < end <= horizon]
    if not targets:
        return []
    occs = occurrences(user, now, horizon)
    out = []
    for t, end in sorted(targets, key=lambda x: x[1]):
        scheduled = _scheduled_minutes(occs, t.id, now, end)
        remaining = max(t.estimate_minutes - scheduled, 0)
        if remaining == 0:
            continue
        free = sum(s.minutes for s in free_slots(user, now, end, 5, occs=[o for o in occs if o.starts_at < end]))
        out.append({
            "task_id": str(t.id), "title": t.title, "due_by": _iso(end),
            "estimate_minutes": t.estimate_minutes, "scheduled_minutes": scheduled,
            "remaining_minutes": remaining, "free_minutes": free,
            "status": "at_risk" if remaining > free else "needs_time",
        })
    return out


# ---------- suggestions for one task ----------

def suggestions(user, task: Task, limit: int = 3) -> dict:
    now = utcnow()
    end = _target_end(user, task)
    has_deadline = end is not None and end > now
    window_end = end if has_deadline else now + timedelta(days=7)
    occs = occurrences(user, now, window_end)
    scheduled = _scheduled_minutes(occs, task.id, now, window_end)
    estimate = task.estimate_minutes or 60  # no estimate: propose one hour and say so
    remaining = max(estimate - scheduled, 0)
    result = {
        "task_id": str(task.id), "estimate_minutes": task.estimate_minutes, "assumed_estimate": task.estimate_minutes is None,
        "scheduled_minutes": scheduled, "remaining_minutes": remaining, "due_by": _iso(end) if has_deadline else None,
        "slots": [],
    }
    if remaining == 0:
        return result
    block = min(timedelta(minutes=remaining), MAX_BLOCK)
    min_len = min(block, MIN_SUGGESTION)
    prefs = [o for o in occs if o.event.kind == "preference" and not o.event.all_day]
    candidates = []
    for slot in free_slots(user, now, window_end, int(min_len.total_seconds() // 60), occs=occs):
        start, reason = slot.start, "earliest_free"
        for p in prefs:  # start inside a preferred window when one overlaps this free slot
            s, e = max(slot.start, p.starts_at), min(slot.end, p.ends_at)
            if e - s >= min_len:
                start, reason = s, "preferred_time"
                break
        length = min(block, slot.end - start)
        candidates.append({
            "starts_at": _iso(start), "ends_at": _iso(start + length),
            "minutes": int(length.total_seconds() // 60),
            "reason": reason, "covers_remaining": length >= timedelta(minutes=remaining),
        })
    candidates.sort(key=lambda c: (c["reason"] != "preferred_time", c["starts_at"]))
    result["slots"] = candidates[:limit]
    return result
