"""Plan my day and the weekly review. Both are built only from your own data, by fixed rules written down here — no
outside service sees anything, and nothing is written until you confirm in the app.

Plan my day: rank your open tasks by urgency, suggest a short list, then place the ones you pick into the free time
of your working hours (estimates decide the block length). The app creates the calendar blocks you keep.

Weekly review: the week's numbers (from Insights), what you finished, what's left over, and your saved reflection.
"""

from datetime import date, datetime, time, timedelta

from sqlalchemy import or_, select

from app.common.models import utcnow
from app.common.timeutil import user_today, user_zone
from app.extensions import db
from app.modules.activity.service import tracked_minutes
from app.modules.calendar.scheduling import Interval, free_slots, slot_to_dict
from app.modules.calendar.service import occurrence_to_dict, occurrences
from app.modules.goals.models import Goal
from app.modules.goals.service import progress_for
from app.modules.habits.models import Habit
from app.modules.habits.service import _logs_since, habit_to_dict
from app.modules.habits.streaks import week_start
from app.modules.insights import metrics
from app.modules.planning.models import WeeklyReview
from app.modules.tasks.models import Task
from app.modules.tasks.service import subtask_counts, task_to_dict

# Why a task is worth doing today, most urgent first. The order also sorts the list.
REASONS = ("overdue", "due_today", "deadline_soon", "in_progress", "high_priority", "due_soon")
URGENT = {"overdue", "due_today", "deadline_soon"}
MAX_CANDIDATES = 30
SUGGESTED = 3  # a short list that gets done beats a long one
DEFAULT_MINUTES = 45  # block length for a task without an estimate
MIN_BLOCK, MAX_BLOCK = 15, 180
GAP = 10  # breathing room after each block
CARRY_OVER_MAX = 30
MAX_PRIORITIES = 3


def _midnight(d: date, tz) -> datetime:
    return datetime.combine(d, time.min, tz)


def _reasons(t: Task, day: date, now: datetime, tz) -> list[str]:
    out = []
    if (t.due_date and t.due_date < day) or (t.deadline and t.deadline < now):
        out.append("overdue")
    elif t.due_date == day:
        out.append("due_today")
    if t.deadline and now <= t.deadline < _midnight(day + timedelta(days=2), tz):
        out.append("deadline_soon")
    if t.status == "in_progress":
        out.append("in_progress")
    if t.priority <= 2:
        out.append("high_priority")
    if t.due_date and day < t.due_date <= day + timedelta(days=7):
        out.append("due_soon")
    return out


def _task_dicts(user, tasks: list[Task]) -> dict:
    ids = [t.id for t in tasks]
    counts, tracked = subtask_counts(ids), tracked_minutes(ids)
    now = utcnow()
    return {t.id: task_to_dict(t, user, now, counts, tracked) for t in tasks}


def _open_tasks(user):
    return select(Task).where(Task.user_id == user.id, Task.status != "done", Task.archived_at.is_(None))


# ---------- plan my day ----------

def day_plan(user, day: date) -> dict:
    tz = user_zone(user)
    now = utcnow()
    today = user_today(user)
    start, end = _midnight(day, tz), _midnight(day + timedelta(days=1), tz)
    occs = occurrences(user, start, end)
    slots = free_slots(user, start, end, MIN_BLOCK, occs)

    horizon = day + timedelta(days=7)
    tasks = db.session.scalars(
        _open_tasks(user).where(or_(
            Task.status == "in_progress", Task.priority <= 2, Task.due_date <= horizon,
            Task.deadline < _midnight(horizon + timedelta(days=1), tz),
        )).order_by(Task.priority, Task.deadline.asc().nulls_last(), Task.due_date.asc().nulls_last(), Task.created_at)
        .limit(MAX_CANDIDATES)
    ).all()
    dicts = _task_dicts(user, tasks)
    blocked = {o.event.task_id for o in occs if o.event.kind == "task_block" and o.event.task_id}

    candidates = []
    for t in tasks:
        reasons = _reasons(t, day, now, tz)
        candidates.append({"task": dicts[t.id], "reasons": reasons, "scheduled": t.id in blocked,
                           "_rank": (min((REASONS.index(r) for r in reasons), default=len(REASONS)), t.priority)})
    candidates.sort(key=lambda c: c["_rank"])
    for c in candidates:
        del c["_rank"]

    fresh = [c for c in candidates if not c["scheduled"]]
    suggested = [c["task"]["id"] for c in fresh if URGENT & set(c["reasons"])][:SUGGESTED]
    suggested += [c["task"]["id"] for c in fresh if c["task"]["id"] not in suggested][: SUGGESTED - len(suggested)]

    habits = []
    if day == today:
        rows = db.session.scalars(select(Habit).where(Habit.user_id == user.id, Habit.archived_at.is_(None)).order_by(Habit.name)).all()
        logs = _logs_since([h.id for h in rows], today - timedelta(days=31))
        for h in rows:
            d = habit_to_dict(h, user, logs[h.id])
            if d["scheduled_today"] and not d["today"]:
                habits.append({"id": d["id"], "name": d["name"]})

    return {
        "date": day.isoformat(),
        "is_today": day == today,
        "events": [occurrence_to_dict(o) for o in occs if o.event.kind != "preference"],
        "free_slots": [slot_to_dict(s) for s in slots],
        "free_minutes": sum(s.minutes for s in slots),
        "candidates": candidates,
        "suggested": suggested,
        "habits": habits,
    }


def _round_up(dt: datetime, minutes: int = 5) -> datetime:
    extra = -(dt.minute % minutes) % minutes
    return (dt + timedelta(minutes=extra)).replace(second=0, microsecond=0) if extra or dt.second or dt.microsecond else dt


def schedule(user, day: date, task_ids: list) -> dict:
    """Place the chosen tasks, in the order given, into the day's free time: each task gets one block sized to its
    estimate, in the earliest gap it fits. Nothing is saved; the app creates the blocks you keep."""
    tz = user_zone(user)
    start, end = _midnight(day, tz), _midnight(day + timedelta(days=1), tz)
    rows = {t.id: t for t in db.session.scalars(_open_tasks(user).where(Task.id.in_(task_ids)))}
    slots = list(free_slots(user, start, end, MIN_BLOCK))
    blocks, unplaced = [], []
    for tid in task_ids:
        t = rows.get(tid)
        if t is None:
            continue
        need = timedelta(minutes=min(max(t.estimate_minutes or DEFAULT_MINUTES, MIN_BLOCK), MAX_BLOCK))
        for i, s in enumerate(slots):
            begin = _round_up(s.start)
            if begin + need <= s.end:
                blocks.append({"task_id": str(t.id), "title": t.title, "starts_at": begin.isoformat(),
                               "ends_at": (begin + need).isoformat(), "minutes": int(need.total_seconds() // 60),
                               "estimated": t.estimate_minutes is not None})
                slots[i] = Interval(begin + need + timedelta(minutes=GAP), s.end)
                break
        else:
            unplaced.append(str(t.id))
    return {"date": day.isoformat(), "blocks": blocks, "unplaced": unplaced}


# ---------- weekly review ----------

def review_to_dict(r: WeeklyReview | None) -> dict | None:
    if r is None:
        return None
    return {
        "id": str(r.id),
        "week_start": r.week_start.isoformat(),
        "went_well": r.went_well,
        "to_improve": r.to_improve,
        "lesson": r.lesson,
        "priorities": r.priorities or [],
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        "updated_at": r.updated_at.isoformat(),
    }


def get_review(user, start: date) -> WeeklyReview | None:
    return db.session.scalar(select(WeeklyReview).where(WeeklyReview.user_id == user.id, WeeklyReview.week_start == start))


def is_week_start(user, d: date) -> bool:
    return week_start(d, user.settings.week_start) == d


def week_review(user, offset: int) -> dict:
    p = metrics.period_for(user, "week", offset)
    m = metrics.compute_period(user, p)
    tz = user_zone(user)
    lo, hi = _midnight(p.start, tz), _midnight(p.end + timedelta(days=1), tz)

    done = db.session.scalars(
        select(Task).where(Task.user_id == user.id, Task.completed_at >= lo, Task.completed_at < hi)
        .order_by(Task.completed_at).limit(50)
    ).all()
    left = db.session.scalars(
        _open_tasks(user).where(Task.parent_task_id.is_(None), or_(Task.due_date <= p.end, Task.deadline < hi))
        .order_by(Task.due_date.asc().nulls_last(), Task.priority).limit(CARRY_OVER_MAX)
    ).all()
    left_dicts = _task_dicts(user, left)

    habit_rows = db.session.scalars(select(Habit).where(Habit.user_id == user.id, Habit.archived_at.is_(None)).order_by(Habit.name)).all()
    logs = _logs_since([h.id for h in habit_rows], min([h.start_date for h in habit_rows], default=p.start))
    habits = []
    for h in habit_rows:
        d = habit_to_dict(h, user, logs[h.id])
        habits.append({"id": d["id"], "name": d["name"], "current_streak": d["stats"]["current_streak"],
                       "unit": d["stats"]["unit"], "consistency": d["stats"]["consistency"]})

    goals = db.session.scalars(
        select(Goal).where(Goal.user_id == user.id, Goal.status == "active", Goal.archived_at.is_(None))
        .order_by(Goal.target_date.asc().nulls_last())
    ).all()
    progress = progress_for(goals)

    previous = get_review(user, p.start - timedelta(days=7))
    w = m["components"]["wellbeing"]
    t = m["components"]["tasks"]
    return {
        "week": {"start": p.start.isoformat(), "end": p.end.isoformat(), "elapsed_days": p.elapsed_days, "offset": offset},
        "score": m["score"]["value"],
        "tasks": {k: t.get(k) for k in ("due", "on_time", "late", "missed", "completed", "created", "rate")},
        "habits_rate": m["components"]["habits"].get("rate"),
        "completed": [{"id": str(x.id), "title": x.title, "completed_at": x.completed_at.isoformat()} for x in done],
        "carry_over": [left_dicts[x.id] for x in left],
        "habits": habits,
        "goals": [{"id": str(g.id), "title": g.title, "progress": progress[g.id].value if g.id in progress else None,
                   "target_date": g.target_date.isoformat() if g.target_date else None} for g in goals],
        "mood": {"average_mood": w.get("average_mood"), "average_energy": w.get("average_energy"),
                 "check_in_days": w.get("check_in_days")},
        "focus": m["focus"],
        "tracked_minutes": m["time"]["total_minutes"],
        "review": review_to_dict(get_review(user, p.start)),
        "last_week_priorities": (previous.priorities or []) if previous else [],
    }


def upsert_review(user, start: date, changes: dict) -> WeeklyReview:
    r = get_review(user, start)
    if r is None:
        r = WeeklyReview(user_id=user.id, week_start=start, priorities=[])
        db.session.add(r)
    complete = changes.pop("completed", None)
    for key, value in changes.items():
        setattr(r, key, (value.strip() or None) if isinstance(value, str) else value)
    if complete is True and r.completed_at is None:
        r.completed_at = utcnow()
    elif complete is False:
        r.completed_at = None
    db.session.commit()
    return r


def list_reviews(user, limit: int) -> list[dict]:
    rows = db.session.scalars(
        select(WeeklyReview).where(WeeklyReview.user_id == user.id).order_by(WeeklyReview.week_start.desc()).limit(limit)
    ).all()
    return [review_to_dict(r) for r in rows]
