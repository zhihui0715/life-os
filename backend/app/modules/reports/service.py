"""Daily, weekly and monthly reports: what happened in one period, read from the same formulas as Insights.

A report covers whole local days [start, end] (the day; your week, by your week start; the calendar month) and is
compared with the period before it. It is read-only. The same dict drives the Reports screen, the PDF and the email.
"""

from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select

from app.common.timeutil import user_today, user_zone
from app.extensions import db
from app.modules.activity.models import FocusSession
from app.modules.calendar.service import occurrences
from app.modules.goals.models import Goal
from app.modules.goals.service import progress_for
from app.modules.habits.models import Habit, HabitLog
from app.modules.habits.streaks import week_start
from app.modules.insights import metrics
from app.modules.journal.models import JournalEntry
from app.modules.tasks.models import Task

KINDS = ("day", "week", "month")


def period(user, kind: str, anchor: date) -> metrics.Period:
    """The period of `kind` that contains `anchor`."""
    today = user_today(user)
    if kind == "day":
        return metrics.Period(anchor, anchor, today)
    if kind == "week":
        start = week_start(anchor, user.settings.week_start)
        return metrics.Period(start, start + timedelta(days=6), today)
    start = anchor.replace(day=1)
    end = (start.replace(year=start.year + (start.month == 12), month=start.month % 12 + 1)) - timedelta(days=1)
    return metrics.Period(start, end, today)


def previous(user, kind: str, p: metrics.Period) -> metrics.Period:
    return period(user, kind, p.start - timedelta(days=1))


def last_complete(user, kind: str) -> metrics.Period:
    """The most recent period of `kind` that has fully ended: yesterday, last week, last month."""
    today = user_today(user)
    return previous(user, kind, period(user, kind, today))


def _bounds(user, p: metrics.Period) -> tuple[datetime, datetime]:
    zone = user_zone(user)
    return datetime.combine(p.start, time.min, zone), datetime.combine(p.end + timedelta(days=1), time.min, zone)


def _completed(user, p: metrics.Period) -> list[Task]:
    lo, hi = _bounds(user, p)
    return list(db.session.scalars(
        select(Task).where(Task.user_id == user.id, Task.status == "done", Task.completed_at >= lo, Task.completed_at < hi)
        .order_by(Task.completed_at)
    ))


def _focus_minutes(user, p: metrics.Period) -> int:
    lo, hi = _bounds(user, p)
    return int(db.session.scalar(
        select(func.coalesce(func.sum(FocusSession.actual_minutes), 0)).where(
            FocusSession.user_id == user.id, FocusSession.started_at >= lo, FocusSession.started_at < hi,
            FocusSession.state.in_(("completed", "interrupted")))
    ) or 0)


def _days(p: metrics.Period) -> list[date]:
    return [p.start + timedelta(days=i) for i in range((p.end - p.start).days + 1)]


def build(user, kind: str, anchor: date) -> dict:
    p = period(user, kind, anchor)
    prev = previous(user, kind, p)
    zone = user_zone(user)
    lo, hi = _bounds(user, p)
    days = _days(p)
    score = metrics.compute_period(user, p, full=True)

    # tasks: what got done (by day), what was added, what is overdue as of the end of the period
    done = _completed(user, p)
    done_by_day = {d: 0 for d in days}
    for t in done:
        d = t.completed_at.astimezone(zone).date()
        if d in done_by_day:
            done_by_day[d] += 1
    added = db.session.scalar(select(func.count()).select_from(Task).where(
        Task.user_id == user.id, Task.created_at >= lo, Task.created_at < hi)) or 0
    overdue = db.session.scalar(select(func.count()).select_from(Task).where(
        Task.user_id == user.id, Task.status != "done", Task.archived_at.is_(None),
        Task.parent_task_id.is_(None), Task.due_date < min(p.end, p.today))) or 0
    goals = {g.id: g for g in db.session.scalars(select(Goal).where(Goal.user_id == user.id))}

    # focus minutes per day
    focus_by_day = {d: 0 for d in days}
    for started, minutes in db.session.execute(
        select(FocusSession.started_at, FocusSession.actual_minutes).where(
            FocusSession.user_id == user.id, FocusSession.started_at >= lo, FocusSession.started_at < hi,
            FocusSession.state.in_(("completed", "interrupted")))
    ):
        d = started.astimezone(zone).date()
        if d in focus_by_day:
            focus_by_day[d] += int(minutes or 0)

    # habits: check-ins per habit over the period
    habits = list(db.session.scalars(select(Habit).where(Habit.user_id == user.id, Habit.archived_at.is_(None)).order_by(Habit.name)))
    logs: dict = {}
    if habits:
        for h_id, state, n in db.session.execute(
            select(HabitLog.habit_id, HabitLog.state, func.count()).where(
                HabitLog.habit_id.in_([h.id for h in habits]), HabitLog.log_date >= p.start, HabitLog.log_date <= p.end)
            .group_by(HabitLog.habit_id, HabitLog.state)
        ):
            logs.setdefault(h_id, {})[state] = n

    # journal: entries, average mood and energy, and the day's own words for a daily report
    entries = list(db.session.scalars(select(JournalEntry).where(
        JournalEntry.user_id == user.id, JournalEntry.entry_date >= p.start, JournalEntry.entry_date <= p.end)
        .order_by(JournalEntry.entry_date)))
    moods = [e.mood for e in entries if e.mood]
    energies = [e.energy for e in entries if e.energy]

    events = occurrences(user, lo, hi)
    active_goals = sorted((g for g in goals.values() if g.status == "active"), key=lambda g: g.title.lower())
    progress = progress_for(active_goals)
    prev_done = len(_completed(user, prev))
    prev_focus = _focus_minutes(user, prev)

    return {
        "kind": kind,
        "period": {"start": p.start.isoformat(), "end": p.end.isoformat(), "complete": p.end < p.today,
                   "previous_start": prev.start.isoformat()},
        "score": score["score"]["value"],
        "components": {k: v.get("score") for k, v in score["components"].items()},
        "tasks": {
            "done": len(done),
            "done_before": prev_done,
            "added": added,
            "overdue": overdue,
            "on_time_rate": score["components"]["tasks"].get("score"),
            "by_day": [{"date": d.isoformat(), "count": n} for d, n in done_by_day.items()],
            "list": [{"title": t.title, "completed_at": t.completed_at.isoformat(),
                      "goal": goals[t.goal_id].title if t.goal_id in goals else None} for t in done[:50]],
        },
        "focus": {
            "minutes": sum(focus_by_day.values()),
            "minutes_before": prev_focus,
            "sessions": score["focus"]["completed"],
            "by_day": [{"date": d.isoformat(), "minutes": m} for d, m in focus_by_day.items()],
        },
        "habits": {
            "rate": score["components"]["habits"].get("score"),
            "items": [{"name": h.name, "done": logs.get(h.id, {}).get("done", 0), "skipped": logs.get(h.id, {}).get("skipped", 0)}
                      for h in habits],
        },
        "goals": [{"title": g.title, "progress": progress[g.id].value if g.id in progress else None} for g in active_goals],
        "journal": {
            "entries": len(entries),
            "mood": round(sum(moods) / len(moods), 1) if moods else None,
            "energy": round(sum(energies) / len(energies), 1) if energies else None,
            "by_day": [{"date": e.entry_date.isoformat(), "mood": e.mood, "energy": e.energy} for e in entries],
            "notes": [{"date": e.entry_date.isoformat(), "text": (e.body or e.went_well or "").strip()[:600]}
                      for e in entries if (e.body or e.went_well)][: 1 if kind == "day" else 0],
        },
        "time": score["time"],
        "events": len(events),
    }
