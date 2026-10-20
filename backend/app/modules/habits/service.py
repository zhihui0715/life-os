"""Habits: CRUD, schedule history, check-ins, and statistics (rules in streaks.py)."""

import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

from pydantic import Field, model_validator
from sqlalchemy import select

from app.common.errors import ApiError
from app.common.models import utcnow
from app.common.ownership import get_owned_or_404
from app.common.timeutil import user_today
from app.common.validation import InputModel, QueryModel
from app.extensions import db
from app.modules.categories.models import Category
from app.modules.goals.models import Goal
from app.modules.habits.models import ALL_DAYS_MASK, Habit, HabitLog, HabitScheduleChange
from app.modules.habits.streaks import Schedule, compute, is_scheduled, schedule_on

ScheduleType = Literal["daily", "weekdays", "x_per_week"]
HISTORY_DAYS = 84  # 12 weeks shown on the habit page


class _ScheduleFields(InputModel):
    schedule_type: ScheduleType | None = None
    weekday_mask: int | None = Field(default=None, ge=1, le=ALL_DAYS_MASK)
    times_per_week: int | None = Field(default=None, ge=1, le=7)


class HabitCreate(_ScheduleFields):
    id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=5_000)
    category_id: uuid.UUID | None = None
    goal_id: uuid.UUID | None = None
    target_value: Decimal | None = Field(default=None, gt=0, le=100_000)
    target_unit: str | None = Field(default=None, max_length=20)
    start_date: date | None = None  # default: today
    schedule_type: ScheduleType = "daily"

    @model_validator(mode="after")
    def schedule_complete(self):
        if self.schedule_type == "weekdays" and not self.weekday_mask:
            raise ValueError("Choose at least one weekday")
        if self.schedule_type == "x_per_week" and not self.times_per_week:
            raise ValueError("Set how many times per week")
        return self


class HabitPatch(_ScheduleFields):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=5_000)
    category_id: uuid.UUID | None = None
    goal_id: uuid.UUID | None = None
    target_value: Decimal | None = Field(default=None, gt=0, le=100_000)
    target_unit: str | None = Field(default=None, max_length=20)


class LogUpsert(InputModel):
    state: Literal["done", "skipped"]
    value: Decimal | None = Field(default=None, ge=0, le=100_000)
    note: str | None = Field(default=None, max_length=2_000)


class HabitQuery(QueryModel):
    include_archived: bool = False
    archived_only: bool = False


# ---------- helpers ----------

def _schedules(h: Habit) -> list[Schedule]:
    return [Schedule(s.effective_from, s.schedule_type, s.weekday_mask, s.times_per_week) for s in h.schedules]


def _schedule_values(schedule_type, weekday_mask, times_per_week) -> dict:
    """Store unused fields as neutral values so rows always satisfy the CHECK constraints."""
    return {
        "schedule_type": schedule_type,
        "weekday_mask": weekday_mask if schedule_type == "weekdays" else ALL_DAYS_MASK,
        "times_per_week": times_per_week if schedule_type == "x_per_week" else 7,
    }


def _check_links(category_id, goal_id) -> None:
    if category_id is not None:
        get_owned_or_404(Category, category_id, "Category")
    if goal_id is not None:
        goal = get_owned_or_404(Goal, goal_id, "Goal")
        if goal.archived_at is not None:
            raise ApiError(422, "rule_violation", "That goal is archived.")


def _num(v):
    return float(v) if v is not None else None


def _logs_since(habit_ids, since: date) -> dict:
    out: dict = {hid: {} for hid in habit_ids}
    if not habit_ids:
        return out
    for log in db.session.scalars(select(HabitLog).where(HabitLog.habit_id.in_(habit_ids), HabitLog.log_date >= since)):
        out[log.habit_id][log.log_date] = log
    return out


def habit_to_dict(h: Habit, user, logs: dict) -> dict:
    """`logs`: {date: HabitLog} — must cover from the start date (streaks) or at least the last 30 days."""
    today = user_today(user)
    schedules = _schedules(h)
    stats = compute(schedules, {d: lg.state for d, lg in logs.items()}, h.start_date, today, user.settings.week_start)
    current = schedule_on(schedules, today) or schedules[-1]
    today_log = logs.get(today)
    return {
        "id": str(h.id),
        "name": h.name,
        "description": h.description,
        "category_id": str(h.category_id) if h.category_id else None,
        "goal_id": str(h.goal_id) if h.goal_id else None,
        "target_value": _num(h.target_value),
        "target_unit": h.target_unit,
        "start_date": h.start_date.isoformat(),
        "schedule_type": current.schedule_type,
        "weekday_mask": current.weekday_mask,
        "times_per_week": current.times_per_week,
        "scheduled_today": is_scheduled(schedules, today) if current.schedule_type != "x_per_week" else True,
        "today": {"state": today_log.state, "value": _num(today_log.value), "note": today_log.note} if today_log else None,
        "stats": {
            "unit": stats.unit,
            "current_streak": stats.current_streak,
            "best_streak": stats.best_streak,
            "consistency": round(stats.consistency, 4) if stats.consistency is not None else None,
            "eligible": stats.eligible,
            "done_this_week": stats.done_this_week,
            "target_this_week": stats.target_this_week,
        },
        "last7": [
            {"date": (today - timedelta(days=i)).isoformat(),
             "scheduled": is_scheduled(schedules, today - timedelta(days=i)) and today - timedelta(days=i) >= h.start_date,
             "state": logs[today - timedelta(days=i)].state if today - timedelta(days=i) in logs else None}
            for i in range(6, -1, -1)
        ],
        "archived_at": h.archived_at.isoformat() if h.archived_at else None,
        "created_at": h.created_at.isoformat(),
        "updated_at": h.updated_at.isoformat(),
    }


def habit_detail(h: Habit, user) -> dict:
    logs = _logs_since([h.id], h.start_date)[h.id]
    out = habit_to_dict(h, user, logs)
    today = user_today(user)
    schedules = _schedules(h)
    first = max(h.start_date, today - timedelta(days=HISTORY_DAYS - 1))
    history = []
    d = first
    while d <= today:
        lg = logs.get(d)
        scheduled = is_scheduled(schedules, d)
        if lg:
            status = lg.state
        elif scheduled and d < today:
            status = "missed"
        else:
            status = "open" if scheduled else "rest"
        history.append({"date": d.isoformat(), "status": status, "scheduled": scheduled,
                        "value": _num(lg.value) if lg else None, "note": lg.note if lg else None})
        d += timedelta(days=1)
    out["history"] = history
    out["schedule_changes"] = [
        {"effective_from": s.effective_from.isoformat(), "schedule_type": s.schedule_type,
         "weekday_mask": s.weekday_mask, "times_per_week": s.times_per_week}
        for s in h.schedules
    ]
    return out


# ---------- reads ----------

def list_habits(user, q: HabitQuery) -> list[dict]:
    stmt = select(Habit).where(Habit.user_id == user.id)
    if q.archived_only:
        stmt = stmt.where(Habit.archived_at.is_not(None))
    elif not q.include_archived:
        stmt = stmt.where(Habit.archived_at.is_(None))
    habits = db.session.scalars(stmt.order_by(Habit.created_at)).all()
    earliest = min((h.start_date for h in habits), default=user_today(user))
    logs = _logs_since([h.id for h in habits], earliest)
    return [habit_to_dict(h, user, logs[h.id]) for h in habits]


# ---------- writes ----------

def create_habit(user, data: HabitCreate) -> Habit:
    if data.id and db.session.get(Habit, data.id):
        raise ApiError(409, "conflict", "A habit with this id already exists.")
    _check_links(data.category_id, data.goal_id)
    start = data.start_date or user_today(user)
    if start > user_today(user) + timedelta(days=365):
        raise ApiError(422, "validation_error", "Some fields are invalid.",
                       fields={"start_date": [{"type": "invalid", "message": "Too far in the future"}]})
    h = Habit(id=data.id or uuid.uuid4(), user_id=user.id, name=data.name, description=data.description,
              category_id=data.category_id, goal_id=data.goal_id, target_value=data.target_value,
              target_unit=data.target_unit, start_date=start)
    h.schedules.append(HabitScheduleChange(effective_from=start, **_schedule_values(
        data.schedule_type, data.weekday_mask, data.times_per_week)))
    db.session.add(h)
    db.session.commit()
    return h


def update_habit(user, h: Habit, data: HabitPatch) -> Habit:
    changes = data.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] is None:
        raise ApiError(422, "validation_error", "Some fields are invalid.",
                       fields={"name": [{"type": "missing", "message": "Cannot be null"}]})
    _check_links(changes.get("category_id"), changes.get("goal_id"))
    for f in ("name", "description", "category_id", "goal_id", "target_value", "target_unit"):
        if f in changes:
            setattr(h, f, changes[f])

    sched_keys = {"schedule_type", "weekday_mask", "times_per_week"}
    if sched_keys & changes.keys():
        today = user_today(user)
        current = schedule_on(_schedules(h), today) or _schedules(h)[-1]
        new_type = changes.get("schedule_type") or current.schedule_type
        new = _schedule_values(new_type, changes.get("weekday_mask") or current.weekday_mask,
                               changes.get("times_per_week") or current.times_per_week)
        if new_type == "weekdays" and not new["weekday_mask"]:
            raise ApiError(422, "validation_error", "Some fields are invalid.",
                           fields={"weekday_mask": [{"type": "missing", "message": "Choose at least one weekday"}]})
        # A new schedule starts today (or on the start date if the habit hasn't started); the past keeps its rules.
        effective = max(today, h.start_date)
        row = next((s for s in h.schedules if s.effective_from == effective), None)
        if row is None:
            h.schedules.append(HabitScheduleChange(effective_from=effective, **new))
        else:
            for k, v in new.items():
                setattr(row, k, v)
    db.session.commit()
    return h


def set_archived(h: Habit, archived: bool) -> Habit:
    h.archived_at = utcnow() if archived else None
    db.session.commit()
    return h


def upsert_log(user, h: Habit, day: date, data: LogUpsert) -> HabitLog:
    today = user_today(user)
    if day > today:
        raise ApiError(422, "rule_violation", "You can't check in for a future day.")
    if day < h.start_date:
        raise ApiError(422, "rule_violation", "That day is before the habit started.")
    log = db.session.scalar(select(HabitLog).where(HabitLog.habit_id == h.id, HabitLog.log_date == day))
    if log is None:
        log = HabitLog(user_id=user.id, habit_id=h.id, log_date=day, state=data.state)
        db.session.add(log)
    log.state, log.value = data.state, data.value
    log.note = data.note.strip() if data.note and data.note.strip() else None
    db.session.commit()
    return log


def delete_log(h: Habit, day: date) -> None:
    log = db.session.scalar(select(HabitLog).where(HabitLog.habit_id == h.id, HabitLog.log_date == day))
    if log is not None:
        db.session.delete(log)
        db.session.commit()
