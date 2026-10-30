"""Achievements: milestones you unlock just by using the app (your 100th task, 10 hours of focus, a week of seals…).

Like the daily seal, nothing is stored: each one is worked out from your history, with the day you crossed the line
where that can be known. The list of milestones is fixed and written down here, so every rule is easy to check.
"""

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import or_, select

from app.common.timeutil import user_today, user_zone
from app.extensions import db
from app.modules.activity.models import FocusSession
from app.modules.goals.models import Goal
from app.modules.habits.models import Habit
from app.modules.habits.service import _logs_since, _schedules
from app.modules.habits.streaks import compute
from app.modules.journal.models import TEXT_FIELDS, JournalEntry
from app.modules.planning.seals import seal_days
from app.modules.tasks.models import Task

SEAL_HISTORY_DAYS = 366  # how far back sealed-day runs are looked for


@dataclass(frozen=True)
class Milestone:
    key: str
    group: str  # tasks | seals | focus | habits | goals | journal
    target: int


MILESTONES = (
    Milestone("first_task", "tasks", 1),
    Milestone("tasks_10", "tasks", 10),
    Milestone("tasks_50", "tasks", 50),
    Milestone("tasks_100", "tasks", 100),
    Milestone("tasks_500", "tasks", 500),
    Milestone("first_seal", "seals", 1),
    Milestone("seals_3", "seals", 3),
    Milestone("seals_7", "seals", 7),
    Milestone("seals_30", "seals", 30),
    Milestone("focus_1h", "focus", 60),
    Milestone("focus_10h", "focus", 600),
    Milestone("focus_50h", "focus", 3_000),
    Milestone("focus_100h", "focus", 6_000),
    Milestone("habit_7", "habits", 7),
    Milestone("habit_30", "habits", 30),
    Milestone("habit_100", "habits", 100),
    Milestone("first_goal", "goals", 1),
    Milestone("goals_5", "goals", 5),
    Milestone("journal_7", "journal", 7),
    Milestone("journal_30", "journal", 30),
)


def _nth_dates(dates: list[date]) -> tuple[int, dict[int, date]]:
    """Sorted dates of things done → (how many, {n: the day the n-th happened})."""
    dates = sorted(dates)
    return len(dates), {i + 1: d for i, d in enumerate(dates)}


def _tasks(user):
    zone = user_zone(user)
    rows = db.session.scalars(select(Task.completed_at).where(Task.user_id == user.id, Task.completed_at.is_not(None)))
    return _nth_dates([dt.astimezone(zone).date() for dt in rows])


def _goals(user):
    zone = user_zone(user)
    rows = db.session.scalars(select(Goal.completed_at).where(Goal.user_id == user.id, Goal.completed_at.is_not(None)))
    return _nth_dates([dt.astimezone(zone).date() for dt in rows])


def _journal(user):
    written = or_(*(getattr(JournalEntry, f).is_not(None) for f in TEXT_FIELDS),
                  JournalEntry.mood.is_not(None), JournalEntry.energy.is_not(None))
    return _nth_dates(list(db.session.scalars(
        select(JournalEntry.entry_date).where(JournalEntry.user_id == user.id, written))))


def _focus(user):
    """Total focused minutes, and the day the running total first reached each milestone."""
    zone = user_zone(user)
    rows = db.session.execute(
        select(FocusSession.ended_at, FocusSession.actual_minutes)
        .where(FocusSession.user_id == user.id, FocusSession.ended_at.is_not(None))
        .order_by(FocusSession.ended_at)
    ).all()
    total, reached = 0, {}
    targets = sorted(m.target for m in MILESTONES if m.group == "focus")
    for ended_at, minutes in rows:
        total += minutes or 0
        for t in targets:
            if total >= t and t not in reached:
                reached[t] = ended_at.astimezone(zone).date()
    return total, reached


def _seals(user, today: date):
    """Longest run of sealed days in the last year, and the day each run length was first reached."""
    run = best = 0
    reached: dict[int, date] = {}
    for day in seal_days(user, today - timedelta(days=SEAL_HISTORY_DAYS - 1), today):
        run = run + 1 if day["sealed"] else 0
        best = max(best, run)
        if run and run not in reached:
            reached[run] = date.fromisoformat(day["date"])
    return best, reached


def _habits(user, today: date):
    """Best streak of any day-based habit (with the app's streak rules, rest days included). No date: a streak's
    history isn't kept day by day."""
    habits = db.session.scalars(select(Habit).where(Habit.user_id == user.id)).all()
    if not habits:
        return 0, {}
    logs = _logs_since([h.id for h in habits], min(h.start_date for h in habits))
    best = 0
    for h in habits:
        stats = compute(_schedules(h), {d: lg.state for d, lg in logs[h.id].items()}, h.start_date, today,
                        user.settings.week_start)
        if stats.unit == "days":
            best = max(best, stats.best_streak)
    return best, {}


def achievements(user) -> dict:
    today = user_today(user)
    progress = {
        "tasks": _tasks(user),
        "goals": _goals(user),
        "journal": _journal(user),
        "focus": _focus(user),
        "seals": _seals(user, today),
        "habits": _habits(user, today),
    }
    items = []
    for m in MILESTONES:
        value, reached = progress[m.group]
        unlocked = value >= m.target
        on = reached.get(m.target) if unlocked else None
        items.append({
            "key": m.key,
            "group": m.group,
            "target": m.target,
            "progress": min(value, m.target),
            "unlocked": unlocked,
            "unlocked_on": on.isoformat() if on else None,
        })
    return {"unlocked": sum(i["unlocked"] for i in items), "total": len(items), "items": items}
