"""Calendar events: create/edit/archive, single-occurrence changes, and expanding events into occurrences."""

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, or_, select

from app.common.errors import ApiError
from app.common.models import utcnow
from app.common.ownership import get_owned_or_404
from app.common.timeutil import user_zone
from app.extensions import db
from app.modules.calendar.models import EventException, ScheduleEvent
from app.modules.calendar.recurrence import expand, is_occurrence, series_end
from app.modules.calendar.schemas import EventCreate, EventPatch, OccurrencePatch
from app.modules.categories.models import Category
from app.modules.tasks.models import Task


def _rule(message: str) -> ApiError:
    return ApiError(422, "rule_violation", message)


def _iso(v):
    return v.isoformat() if v else None


DEFAULT_HARD = {"appointment": True, "task_block": False, "preference": False}


@dataclass
class Occ:
    event: ScheduleEvent
    original_start: datetime
    starts_at: datetime
    ends_at: datetime
    title: str
    is_exception: bool = False

    @property
    def busy(self) -> bool:
        """Counts as taken time: not all-day, and not a soft preference window."""
        return not self.event.all_day and self.event.kind != "preference"

    @property
    def id(self) -> str:
        return f"{self.event.id}_{int(self.original_start.timestamp())}"


# ---------- serialisation ----------

def _all_day_dates(e_start: datetime, e_end: datetime, tz: ZoneInfo) -> tuple[str, str]:
    """All-day events are stored as local midnights; return inclusive local dates."""
    return e_start.astimezone(tz).date().isoformat(), (e_end.astimezone(tz) - timedelta(days=1)).date().isoformat()


def event_to_dict(e: ScheduleEvent) -> dict:
    out = {
        "id": str(e.id),
        "title": e.title,
        "description": e.description,
        "kind": e.kind,
        "is_hard": e.is_hard,
        "all_day": e.all_day,
        "starts_at": _iso(e.starts_at),
        "ends_at": _iso(e.ends_at),
        "tzid": e.tzid,
        "rrule": e.rrule,
        "task_id": str(e.task_id) if e.task_id else None,
        "category_id": str(e.category_id) if e.category_id else None,
        "exception_count": len(e.exceptions),
        "archived_at": _iso(e.archived_at),
        "created_at": _iso(e.created_at),
        "updated_at": _iso(e.updated_at),
    }
    if e.all_day:
        out["start_date"], out["end_date"] = _all_day_dates(e.starts_at, e.ends_at, ZoneInfo(e.tzid))
    return out


def occurrence_to_dict(o: Occ) -> dict:
    e = o.event
    out = {
        "id": o.id,
        "event_id": str(e.id),
        "title": o.title,
        "kind": e.kind,
        "is_hard": e.is_hard,
        "all_day": e.all_day,
        "starts_at": _iso(o.starts_at),
        "ends_at": _iso(o.ends_at),
        "original_start": _iso(o.original_start),
        "recurring": e.rrule is not None,
        "is_exception": o.is_exception,
        "task_id": str(e.task_id) if e.task_id else None,
        "category_id": str(e.category_id) if e.category_id else None,
    }
    if e.all_day:
        out["start_date"], out["end_date"] = _all_day_dates(o.starts_at, o.ends_at, ZoneInfo(e.tzid))
    return out


# ---------- reading occurrences ----------

def occurrences(user, start: datetime, end: datetime) -> list[Occ]:
    """Every occurrence overlapping [start, end), with single-occurrence edits and cancellations applied."""
    events = db.session.scalars(
        select(ScheduleEvent).where(
            ScheduleEvent.user_id == user.id,
            ScheduleEvent.archived_at.is_(None),
            ScheduleEvent.starts_at < end,
            or_(ScheduleEvent.recurrence_until.is_(None), ScheduleEvent.recurrence_until > start),
        )
    ).all()
    out: list[Occ] = []
    for e in events:
        exceptions = {x.original_start: x for x in e.exceptions}
        seen = set()
        for occ in expand(e.starts_at, e.ends_at, e.tzid, e.rrule, start, end):
            seen.add(occ.original_start)
            x = exceptions.get(occ.original_start)
            if x is None:
                out.append(Occ(e, occ.original_start, occ.starts_at, occ.ends_at, e.title))
            elif not x.is_cancelled and x.override_starts_at < end and x.override_ends_at > start:
                out.append(Occ(e, x.original_start, x.override_starts_at, x.override_ends_at, x.override_title or e.title, True))
        # An occurrence moved INTO this range from outside it.
        for x in e.exceptions:
            if (x.original_start not in seen and not x.is_cancelled
                    and x.override_starts_at < end and x.override_ends_at > start):
                out.append(Occ(e, x.original_start, x.override_starts_at, x.override_ends_at, x.override_title or e.title, True))
    out.sort(key=lambda o: (o.starts_at, o.ends_at))
    return out


def task_markers(user, start: datetime, end: datetime) -> list[dict]:
    """Due dates and deadlines of open tasks inside the range, so they show on the calendar."""
    tz = user_zone(user)
    first, last = start.astimezone(tz).date(), (end - timedelta(microseconds=1)).astimezone(tz).date()
    tasks = db.session.scalars(
        select(Task).where(
            Task.user_id == user.id,
            Task.archived_at.is_(None),
            Task.status != "done",
            Task.parent_task_id.is_(None),
            or_(and_(Task.due_date >= first, Task.due_date <= last), and_(Task.deadline >= start, Task.deadline < end)),
        )
    ).all()
    out = []
    for t in tasks:
        if t.due_date and first <= t.due_date <= last:
            out.append({"task_id": str(t.id), "title": t.title, "kind": "due", "date": t.due_date.isoformat(), "priority": t.priority})
        if t.deadline and start <= t.deadline < end:
            out.append({"task_id": str(t.id), "title": t.title, "kind": "deadline", "at": _iso(t.deadline), "priority": t.priority})
    return out


# ---------- writes ----------

def _check_links(kind: str, task_id, category_id) -> None:
    if task_id is not None:
        task = get_owned_or_404(Task, task_id, "Task")
        if task.parent_task_id is not None:
            raise _rule("Schedule the parent task, not a subtask.")
    if kind == "task_block" and task_id is None:
        raise _rule("A task block must be linked to a task.")
    if category_id is not None:
        get_owned_or_404(Category, category_id, "Category")


def _local_midnight(d: date, tz: ZoneInfo) -> datetime:
    return datetime.combine(d, time.min, tz)


def _times_from(data, tz: ZoneInfo, all_day: bool, current: ScheduleEvent | None = None):
    if all_day:
        start_d = data.start_date or (current and _date_of(current.starts_at, tz))
        end_d = data.end_date or (current and _date_of(current.ends_at, tz) - timedelta(days=1))
        return _local_midnight(start_d, tz), _local_midnight(end_d + timedelta(days=1), tz)
    return data.starts_at or current.starts_at, data.ends_at or current.ends_at


def _date_of(dt: datetime, tz: ZoneInfo) -> date:
    return dt.astimezone(tz).date()


def create_event(user, data: EventCreate) -> ScheduleEvent:
    if data.id and db.session.get(ScheduleEvent, data.id):
        raise ApiError(409, "conflict", "An event with this id already exists.")
    _check_links(data.kind, data.task_id, data.category_id)
    tz = user_zone(user)
    starts_at, ends_at = _times_from(data, tz, bool(data.all_day))
    is_hard = False if data.kind == "preference" else (data.is_hard if data.is_hard is not None else DEFAULT_HARD[data.kind])
    e = ScheduleEvent(
        id=data.id or uuid.uuid4(), user_id=user.id, title=data.title, description=data.description, kind=data.kind,
        is_hard=is_hard, all_day=bool(data.all_day), starts_at=starts_at, ends_at=ends_at,
        tzid=user.settings.timezone, rrule=data.rrule, task_id=data.task_id, category_id=data.category_id,
    )
    e.recurrence_until = series_end(e.starts_at, e.ends_at, e.tzid, e.rrule)
    db.session.add(e)
    db.session.commit()
    return e


def update_event(user, e: ScheduleEvent, data: EventPatch) -> tuple[ScheduleEvent, int]:
    """Edits the whole series. Returns (event, number of single-occurrence edits that had to be dropped)."""
    changes = data.model_dump(exclude_unset=True)
    expected = changes.pop("if_updated_at", None)
    if expected is not None and e.updated_at != expected:
        raise ApiError(409, "stale_update", "This event was changed elsewhere since you opened it.",
                       extra={"current": event_to_dict(e)})
    for required in ("title", "kind", "is_hard", "all_day"):
        if required in changes and changes[required] is None:
            raise ApiError(422, "validation_error", "Some fields are invalid.",
                           fields={required: [{"type": "missing", "message": "Cannot be null"}]})
    kind = changes.get("kind", e.kind)
    _check_links(kind, changes.get("task_id", e.task_id), changes.get("category_id", e.category_id))

    tz = ZoneInfo(e.tzid)
    all_day = changes.get("all_day", e.all_day)
    timing_changed = any(k in changes for k in ("starts_at", "ends_at", "start_date", "end_date", "all_day", "rrule"))
    if timing_changed:
        if all_day != e.all_day and not (data.start_date or data.starts_at):
            raise ApiError(422, "validation_error", "Some fields are invalid.",
                           fields={"all_day": [{"type": "missing", "message": "Send the new times too"}]})
        e.starts_at, e.ends_at = _times_from(data, tz, all_day, e)
        if e.ends_at <= e.starts_at:
            raise ApiError(422, "validation_error", "Some fields are invalid.",
                           fields={"ends_at": [{"type": "invalid", "message": "Must be after the start"}]})
        e.all_day = all_day
    for field in ("title", "description", "kind", "task_id", "category_id"):
        if field in changes:
            setattr(e, field, changes[field])
    if "rrule" in changes:
        e.rrule = changes["rrule"]
    if "is_hard" in changes:
        e.is_hard = changes["is_hard"]
    if e.kind == "preference":
        e.is_hard = False

    dropped = 0
    if timing_changed and e.exceptions:
        # Single-occurrence edits are tied to the old start times; after a series change they no longer line up.
        dropped = len(e.exceptions)
        e.exceptions.clear()
    e.recurrence_until = series_end(e.starts_at, e.ends_at, e.tzid, e.rrule)
    db.session.commit()
    return e, dropped


def archive_event(e: ScheduleEvent) -> ScheduleEvent:
    if e.archived_at is None:
        e.archived_at = utcnow()
        db.session.commit()
    return e


def restore_event(e: ScheduleEvent) -> ScheduleEvent:
    e.archived_at = None
    db.session.commit()
    return e


def _exception_for(e: ScheduleEvent, original_start: datetime) -> EventException:
    if not e.rrule:
        raise _rule("Only repeating events have single occurrences. Edit the event itself.")
    if not is_occurrence(e.starts_at, e.ends_at, e.tzid, e.rrule, original_start):
        raise ApiError(404, "not_found", "That occurrence does not exist in this series.")
    x = next((x for x in e.exceptions if x.original_start == original_start), None)
    if x is None:
        x = EventException(event_id=e.id, original_start=original_start)
        e.exceptions.append(x)
    return x


def edit_occurrence(e: ScheduleEvent, original_start: datetime, data: OccurrencePatch) -> Occ:
    if e.all_day:
        raise _rule("Single occurrences of all-day events can only be cancelled.")
    x = _exception_for(e, original_start)
    x.is_cancelled = False
    x.override_starts_at, x.override_ends_at = data.starts_at, data.ends_at
    if data.title is not None:
        x.override_title = data.title
    db.session.commit()
    return Occ(e, x.original_start, x.override_starts_at, x.override_ends_at, x.override_title or e.title, True)


def cancel_occurrence(e: ScheduleEvent, original_start: datetime) -> None:
    x = _exception_for(e, original_start)
    x.is_cancelled = True
    x.override_starts_at = x.override_ends_at = None
    db.session.commit()


def restore_occurrence(e: ScheduleEvent, original_start: datetime) -> None:
    """Undo a single-occurrence change or cancellation."""
    x = next((x for x in e.exceptions if x.original_start == original_start), None)
    if x is not None:
        e.exceptions.remove(x)
        db.session.commit()
