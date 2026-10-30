"""The daily seal: three small quests a day, built only from what you already log.

- task:  finish at least one task (done that day, in your time zone; archived later still counts).
- habit: check in at least one habit as done. With no active habits, this quest is "write in your journal"
         instead (any text, mood or energy on that day's entry), so everyone can earn a seal.
- focus: focus for FOCUS_MINUTES in total (finished sessions, plus the one running now).

All three on one day stamp that day's seal. Nothing is stored: past seals are worked out from your history, so they
always agree with it (un-ticking a task can un-seal a day, and that's honest).
"""

from datetime import date, datetime, time, timedelta

from sqlalchemy import func, or_, select

from app.common.models import utcnow
from app.common.timeutil import user_today, user_zone
from app.extensions import db
from app.modules.activity.models import FocusSession
from app.modules.activity.service import _focused_seconds
from app.modules.habits.models import Habit, HabitLog
from app.modules.journal.models import TEXT_FIELDS, JournalEntry
from app.modules.tasks.models import Task

FOCUS_MINUTES = 15
MAX_DAYS = 60


def _habit_quest(user) -> str:
    active = db.session.scalar(
        select(func.count()).select_from(Habit).where(Habit.user_id == user.id, Habit.archived_at.is_(None))
    )
    return "habit" if active else "journal"


def seal_days(user, start: date, today: date) -> list[dict]:
    """One row per day from `start` to `today`: the three quests and whether the day is sealed."""
    zone = user_zone(user)
    days = (today - start).days + 1
    lo = datetime.combine(start, time.min, zone)
    hi = datetime.combine(today + timedelta(days=1), time.min, zone)
    local = lambda dt: dt.astimezone(zone).date()  # noqa: E731

    tasks: dict[date, int] = {}
    for done_at in db.session.scalars(
        select(Task.completed_at).where(Task.user_id == user.id, Task.completed_at >= lo, Task.completed_at < hi)
    ):
        d = local(done_at)
        tasks[d] = tasks.get(d, 0) + 1

    second = _habit_quest(user)
    middle: dict[date, int] = {}
    if second == "habit":
        rows = db.session.execute(
            select(HabitLog.log_date, func.count()).where(
                HabitLog.user_id == user.id, HabitLog.state == "done", HabitLog.log_date.between(start, today)
            ).group_by(HabitLog.log_date)
        )
        middle = {d: n for d, n in rows}
    else:
        written = or_(*(getattr(JournalEntry, f).is_not(None) for f in TEXT_FIELDS),
                      JournalEntry.mood.is_not(None), JournalEntry.energy.is_not(None))
        for d in db.session.scalars(
            select(JournalEntry.entry_date).where(
                JournalEntry.user_id == user.id, JournalEntry.entry_date.between(start, today), written
            )
        ):
            middle[d] = 1

    now = utcnow()
    focus: dict[date, int] = {}
    for s in db.session.scalars(
        select(FocusSession).where(FocusSession.user_id == user.id, FocusSession.started_at >= lo,
                                   FocusSession.started_at < hi)
    ):
        minutes = s.actual_minutes if s.ended_at else _focused_seconds(s, now) // 60
        d = local(s.started_at)
        focus[d] = focus.get(d, 0) + (minutes or 0)

    out = []
    for i in range(days):
        d = start + timedelta(days=i)
        done = {"task": tasks.get(d, 0) > 0, "habit": middle.get(d, 0) > 0, "focus": focus.get(d, 0) >= FOCUS_MINUTES}
        out.append({
            "date": d.isoformat(),
            "tasks_done": tasks.get(d, 0),
            "habits_done": middle.get(d, 0),
            "focus_minutes": focus.get(d, 0),
            "done": done,
            "sealed": all(done.values()),
        })
    return out


def daily_seals(user, days: int) -> dict:
    today = user_today(user)
    out = seal_days(user, today - timedelta(days=days - 1), today)

    # Sealed days in a row up to today; today doesn't break it while it's still open.
    streak = 0
    for day in reversed(out):
        if day["sealed"]:
            streak += 1
        elif day["date"] != today.isoformat():
            break
    return {"habit_quest": _habit_quest(user), "focus_minutes_target": FOCUS_MINUTES, "streak": streak, "days": out}
