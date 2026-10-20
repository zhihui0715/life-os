"""Activity logs and focus sessions.

Focus rules (shown in the app):
- Focused time = (stop − start) − time spent paused, rounded down to whole minutes.
- A session is "completed" when focused time ≥ 80% of the planned time, or when you mark it complete yourself.
  Otherwise it's "interrupted": its minutes still count as time spent, just not as a completed session.
- Stopping a session with ≥ 1 focused minute creates one activity log (linked to the session, so it's never counted twice).
- You can correct a session's minutes later; its activity log follows.
- Only one session can be running or paused at a time.
"""

import uuid
from datetime import date, datetime, timedelta
from typing import Literal

from pydantic import AwareDatetime, Field, model_validator
from sqlalchemy import func, select

from app.common.errors import ApiError
from app.common.models import utcnow
from app.common.ownership import get_owned_or_404
from app.common.timeutil import user_today, user_zone
from app.common.validation import InputModel, QueryModel
from app.extensions import db
from app.modules.activity.models import ActivityLog, FocusSession
from app.modules.categories.models import Category
from app.modules.goals.models import Goal
from app.modules.tasks.models import Task

COMPLETE_RATIO = 0.8
MAX_DAY_MINUTES = 1440


def _rule(message: str) -> ApiError:
    return ApiError(422, "rule_violation", message)


def _iso(v):
    return v.isoformat() if v else None


def _uuid_str(v):
    return str(v) if v else None


# ---------- schemas ----------

class ActivityCreate(InputModel):
    id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=200)
    category_id: uuid.UUID | None = None
    log_date: date | None = None  # default: the local day of started_at, else today
    started_at: AwareDatetime | None = None
    ended_at: AwareDatetime | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=MAX_DAY_MINUTES)
    notes: str | None = Field(default=None, max_length=5_000)
    outcome: str | None = Field(default=None, max_length=2_000)
    goal_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def times(self):
        if self.started_at and self.ended_at:
            if self.ended_at <= self.started_at:
                raise ValueError("ended_at must be after started_at")
            if (self.ended_at - self.started_at) > timedelta(minutes=MAX_DAY_MINUTES):
                raise ValueError("An activity can last at most 24 hours")
        elif self.duration_minutes is None:
            raise ValueError("Give a duration, or both a start and an end time")
        return self


class ActivityPatch(InputModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    category_id: uuid.UUID | None = None
    log_date: date | None = None
    started_at: AwareDatetime | None = None
    ended_at: AwareDatetime | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=MAX_DAY_MINUTES)
    notes: str | None = Field(default=None, max_length=5_000)
    outcome: str | None = Field(default=None, max_length=2_000)
    goal_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None


class ActivityQuery(QueryModel):
    start: date | None = None
    end: date | None = None  # inclusive
    category_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    goal_id: uuid.UUID | None = None
    limit: int = Field(default=100, ge=1, le=500)


class SummaryQuery(QueryModel):
    start: date
    end: date  # inclusive

    @model_validator(mode="after")
    def order(self):
        if self.end < self.start:
            raise ValueError("end must not be before start")
        if (self.end - self.start).days > 366:
            raise ValueError("The range can be at most one year")
        return self


class OptionalRange(QueryModel):
    start: date | None = None
    end: date | None = None


class FocusStart(InputModel):
    planned_minutes: int = Field(default=25, ge=1, le=240)
    break_minutes: int = Field(default=5, ge=0, le=60)
    task_id: uuid.UUID | None = None
    label: str | None = Field(default=None, max_length=200)


class FocusStop(InputModel):
    mark_complete: bool = False  # count it as completed even if under 80% of the plan


class FocusPatch(InputModel):
    actual_minutes: int = Field(ge=0, le=MAX_DAY_MINUTES)
    state: Literal["completed", "interrupted"] | None = None


# ---------- activity logs ----------

def _check_links(category_id=None, goal_id=None, task_id=None) -> None:
    if category_id is not None:
        get_owned_or_404(Category, category_id, "Category")
    if goal_id is not None:
        get_owned_or_404(Goal, goal_id, "Goal")
    if task_id is not None:
        get_owned_or_404(Task, task_id, "Task")


def activity_to_dict(a: ActivityLog) -> dict:
    return {
        "id": str(a.id),
        "title": a.title,
        "category_id": _uuid_str(a.category_id),
        "log_date": a.log_date.isoformat(),
        "started_at": _iso(a.started_at),
        "ended_at": _iso(a.ended_at),
        "duration_minutes": a.duration_minutes,
        "notes": a.notes,
        "outcome": a.outcome,
        "goal_id": _uuid_str(a.goal_id),
        "task_id": _uuid_str(a.task_id),
        "focus_session_id": _uuid_str(a.focus_session_id),
        "created_at": _iso(a.created_at),
        "updated_at": _iso(a.updated_at),
    }


def _minutes_between(start: datetime, end: datetime) -> int:
    return int((end - start).total_seconds() // 60)


def _apply_times(user, a: ActivityLog, started_at, ended_at, duration, log_date) -> None:
    if started_at and ended_at:
        computed = _minutes_between(started_at, ended_at)
        if computed < 1:
            raise _rule("An activity must last at least one minute.")
        if duration is not None and abs(duration - computed) > 1:
            raise ApiError(422, "validation_error", "Some fields are invalid.",
                           fields={"duration_minutes": [{"type": "mismatch", "message": "Doesn't match the start and end times"}]})
        duration = computed
    a.started_at, a.ended_at, a.duration_minutes = started_at, ended_at, duration
    a.log_date = log_date or (started_at.astimezone(user_zone(user)).date() if started_at else user_today(user))


def create_activity(user, data: ActivityCreate) -> ActivityLog:
    if data.id and db.session.get(ActivityLog, data.id):
        raise ApiError(409, "conflict", "An activity with this id already exists.")
    _check_links(data.category_id, data.goal_id, data.task_id)
    a = ActivityLog(id=data.id or uuid.uuid4(), user_id=user.id, title=data.title, category_id=data.category_id,
                    notes=data.notes, outcome=data.outcome, goal_id=data.goal_id, task_id=data.task_id)
    _apply_times(user, a, data.started_at, data.ended_at, data.duration_minutes, data.log_date)
    db.session.add(a)
    db.session.commit()
    return a


def update_activity(user, a: ActivityLog, data: ActivityPatch) -> ActivityLog:
    changes = data.model_dump(exclude_unset=True)
    for required in ("title", "log_date"):
        if required in changes and changes[required] is None:
            raise ApiError(422, "validation_error", "Some fields are invalid.",
                           fields={required: [{"type": "missing", "message": "Cannot be null"}]})
    _check_links(changes.get("category_id"), changes.get("goal_id"), changes.get("task_id"))
    for f in ("title", "category_id", "notes", "outcome", "goal_id", "task_id"):
        if f in changes:
            setattr(a, f, changes[f])
    if {"started_at", "ended_at", "duration_minutes", "log_date"} & changes.keys():
        started = changes.get("started_at", a.started_at)
        ended = changes.get("ended_at", a.ended_at)
        duration = changes.get("duration_minutes")
        if duration is None and not (started and ended):
            duration = a.duration_minutes
        if started and ended and ended <= started:
            raise ApiError(422, "validation_error", "Some fields are invalid.",
                           fields={"ended_at": [{"type": "invalid", "message": "Must be after the start"}]})
        _apply_times(user, a, started, ended, duration, changes.get("log_date", a.log_date))
    db.session.commit()
    return a


def delete_activity(a: ActivityLog) -> None:
    db.session.delete(a)
    db.session.commit()


def list_activity(user, q: ActivityQuery) -> list[dict]:
    stmt = select(ActivityLog).where(ActivityLog.user_id == user.id)
    if q.start:
        stmt = stmt.where(ActivityLog.log_date >= q.start)
    if q.end:
        stmt = stmt.where(ActivityLog.log_date <= q.end)
    for field in ("category_id", "task_id", "goal_id"):
        if getattr(q, field):
            stmt = stmt.where(getattr(ActivityLog, field) == getattr(q, field))
    rows = db.session.scalars(
        stmt.order_by(ActivityLog.log_date.desc(), ActivityLog.started_at.desc().nulls_last(), ActivityLog.created_at.desc())
        .limit(q.limit)
    ).all()
    return [activity_to_dict(a) for a in rows]


def summary(user, start: date, end: date) -> dict:
    """Minutes per category and per day, plus learning minutes (categories of kind "learning")."""
    rows = db.session.execute(
        select(ActivityLog.category_id, Category.name, Category.kind, Category.color, func.sum(ActivityLog.duration_minutes))
        .outerjoin(Category, Category.id == ActivityLog.category_id)
        .where(ActivityLog.user_id == user.id, ActivityLog.log_date.between(start, end))
        .group_by(ActivityLog.category_id, Category.name, Category.kind, Category.color)
    ).all()
    per_day = db.session.execute(
        select(ActivityLog.log_date, func.sum(ActivityLog.duration_minutes))
        .where(ActivityLog.user_id == user.id, ActivityLog.log_date.between(start, end))
        .group_by(ActivityLog.log_date).order_by(ActivityLog.log_date)
    ).all()
    by_category = sorted(
        ({"category_id": _uuid_str(r[0]), "name": r[1], "kind": r[2], "color": r[3], "minutes": int(r[4])} for r in rows),
        key=lambda x: -x["minutes"],
    )
    return {
        "start": start.isoformat(), "end": end.isoformat(),
        "total_minutes": sum(c["minutes"] for c in by_category),
        "learning_minutes": sum(c["minutes"] for c in by_category if c["kind"] == "learning"),
        "by_category": by_category,
        "by_day": [{"date": r[0].isoformat(), "minutes": int(r[1])} for r in per_day],
    }


def tracked_minutes(task_ids) -> dict:
    """Total logged minutes per task (activity logs, which include stopped focus sessions)."""
    if not task_ids:
        return {}
    rows = db.session.execute(
        select(ActivityLog.task_id, func.sum(ActivityLog.duration_minutes))
        .where(ActivityLog.task_id.in_(task_ids)).group_by(ActivityLog.task_id)
    ).all()
    return {r[0]: int(r[1]) for r in rows}


# ---------- focus sessions ----------

def _focused_seconds(s: FocusSession, now: datetime) -> int:
    end = s.ended_at or (s.paused_at if s.state == "paused" else now)
    return max(int((end - s.started_at).total_seconds()) - s.paused_seconds, 0)


def focus_to_dict(s: FocusSession, now: datetime | None = None) -> dict:
    now = now or utcnow()
    task = db.session.get(Task, s.task_id) if s.task_id else None
    return {
        "id": str(s.id),
        "task_id": _uuid_str(s.task_id),
        "task_title": task.title if task else None,
        "label": s.label,
        "planned_minutes": s.planned_minutes,
        "break_minutes": s.break_minutes,
        "state": s.state,
        "started_at": _iso(s.started_at),
        "paused_at": _iso(s.paused_at),
        "ended_at": _iso(s.ended_at),
        "paused_seconds": s.paused_seconds,
        "focused_seconds": _focused_seconds(s, now),
        "actual_minutes": s.actual_minutes,
        "server_time": _iso(now),  # lets the app correct for a wrong device clock
    }


def current_focus(user) -> FocusSession | None:
    return db.session.scalar(
        select(FocusSession).where(FocusSession.user_id == user.id, FocusSession.state.in_(("running", "paused")))
    )


def start_focus(user, data: FocusStart) -> FocusSession:
    if current_focus(user) is not None:
        raise ApiError(409, "conflict", "A focus session is already running. Stop it first.")
    if data.task_id is not None:
        task = get_owned_or_404(Task, data.task_id, "Task")
        if task.status == "done":
            raise _rule("That task is already done.")
    s = FocusSession(user_id=user.id, task_id=data.task_id, label=(data.label or "").strip() or None,
                     planned_minutes=data.planned_minutes, break_minutes=data.break_minutes,
                     started_at=utcnow(), state="running")
    db.session.add(s)
    db.session.commit()
    return s


def pause_focus(s: FocusSession) -> FocusSession:
    if s.state != "running":
        raise _rule("Only a running session can be paused.")
    s.state, s.paused_at = "paused", utcnow()
    db.session.commit()
    return s


def resume_focus(s: FocusSession) -> FocusSession:
    if s.state != "paused":
        raise _rule("Only a paused session can be resumed.")
    s.paused_seconds += int((utcnow() - s.paused_at).total_seconds())
    s.state, s.paused_at = "running", None
    db.session.commit()
    return s


def _activity_title(user, s: FocusSession) -> str:
    if s.task_id:
        task = db.session.get(Task, s.task_id)
        if task:
            return task.title
    return s.label or "Focus session"


def _sync_activity(user, s: FocusSession) -> None:
    """Keep exactly one activity log for a session with ≥ 1 minute, and none for 0 minutes."""
    # Work everything out before touching the session: any query can flush pending objects, so a half-filled
    # activity log must never be added early.
    minutes = s.actual_minutes or 0
    log_date = s.started_at.astimezone(user_zone(user)).date()
    task = db.session.get(Task, s.task_id) if s.task_id else None
    log = db.session.scalar(select(ActivityLog).where(ActivityLog.focus_session_id == s.id))
    if minutes < 1:
        if log is not None:
            db.session.delete(log)
        return
    if log is None:
        log = ActivityLog(user_id=user.id, title=_activity_title(user, s), focus_session_id=s.id, task_id=s.task_id,
                          category_id=task.category_id if task else None, goal_id=task.goal_id if task else None,
                          log_date=log_date, duration_minutes=minutes)
        db.session.add(log)
    log.started_at = s.started_at
    log.ended_at = None  # pauses make wall-clock end ≠ start + duration; the duration is what counts
    log.duration_minutes = minutes
    log.log_date = log_date


def stop_focus(user, s: FocusSession, data: FocusStop) -> FocusSession:
    if s.state not in ("running", "paused"):
        raise _rule("This session has already ended.")
    now = utcnow()
    if s.state == "paused":
        s.paused_seconds += int((now - s.paused_at).total_seconds())
        s.paused_at = None
    s.ended_at = now
    s.actual_minutes = min(_focused_seconds(s, now) // 60, MAX_DAY_MINUTES)
    reached = s.actual_minutes >= COMPLETE_RATIO * s.planned_minutes
    s.state = "completed" if reached or data.mark_complete else "interrupted"
    _sync_activity(user, s)
    db.session.commit()
    return s


def correct_focus(user, s: FocusSession, data: FocusPatch) -> FocusSession:
    if s.state in ("running", "paused"):
        raise _rule("Stop the session before correcting it.")
    s.actual_minutes = data.actual_minutes
    if data.state:
        s.state = data.state
    _sync_activity(user, s)
    db.session.commit()
    return s


def list_focus(user, start: date, end: date) -> dict:
    zone = user_zone(user)
    lo = datetime.combine(start, datetime.min.time(), zone)
    hi = datetime.combine(end + timedelta(days=1), datetime.min.time(), zone)
    sessions = db.session.scalars(
        select(FocusSession).where(FocusSession.user_id == user.id, FocusSession.started_at >= lo,
                                   FocusSession.started_at < hi).order_by(FocusSession.started_at.desc())
    ).all()
    now = utcnow()
    ended = [s for s in sessions if s.state in ("completed", "interrupted")]
    return {
        "items": [focus_to_dict(s, now) for s in sessions],
        "completed_count": sum(1 for s in ended if s.state == "completed"),
        "interrupted_count": sum(1 for s in ended if s.state == "interrupted"),
        "focused_minutes": sum(s.actual_minutes or 0 for s in ended),
    }
