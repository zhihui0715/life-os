"""Search everything at once (the Ctrl+K box): tasks, goals, habits, journal entries and calendar events.

Substring matching (ILIKE), like the task search, so it works for Chinese without word splitting. Each group returns
its best few matches; the client shows them grouped and opens the one you pick. Only your own rows are ever read.
"""

from sqlalchemy import case, func, or_, select

from app.common.timeutil import user_zone
from app.extensions import db
from app.modules.calendar.models import ScheduleEvent
from app.modules.goals.models import Goal
from app.modules.habits.models import Habit
from app.modules.journal.models import JournalEntry
from app.modules.tasks.models import Task
from app.modules.tasks.service import _like_pattern

SNIPPET = 90  # characters of context shown under a result

JOURNAL_FIELDS = ("body", "went_well", "to_improve", "challenges", "lessons", "gratitude", "tomorrow_priorities")


def snippet(text: str | None, q: str) -> str | None:
    """The part of `text` around the first match, on one line, with … where it was cut. None if it doesn't match."""
    if not text:
        return None
    flat = " ".join(text.split())
    at = flat.lower().find(q.lower())
    if at < 0:
        return None
    start = max(0, at - SNIPPET // 3)
    end = min(len(flat), start + SNIPPET)
    start = max(0, end - SNIPPET)
    return ("…" if start else "") + flat[start:end] + ("…" if end < len(flat) else "")


def _first_snippet(q: str, *texts) -> str | None:
    return next((s for s in (snippet(t, q) for t in texts) if s), None)


def search(user, q: str, limit: int) -> dict:
    q = q.strip()
    like = _like_pattern(q)

    def hit(col):
        return col.ilike(like, escape="\\")

    tasks = db.session.scalars(
        select(Task)
        .where(Task.user_id == user.id, Task.archived_at.is_(None), or_(hit(Task.title), hit(Task.notes)))
        # open before done, then title matches before notes-only matches, then the most recent
        .order_by((Task.status == "done").asc(), case((hit(Task.title), 0), else_=1), Task.updated_at.desc())
        .limit(limit)
    ).all()
    goals = db.session.scalars(
        select(Goal)
        .where(Goal.user_id == user.id, or_(hit(Goal.title), hit(Goal.description), hit(Goal.success_criteria)))
        .order_by(Goal.archived_at.is_not(None), case((hit(Goal.title), 0), else_=1), Goal.updated_at.desc())
        .limit(limit)
    ).all()
    habits = db.session.scalars(
        select(Habit)
        .where(Habit.user_id == user.id, or_(hit(Habit.name), hit(Habit.description)))
        .order_by(Habit.archived_at.is_not(None), func.lower(Habit.name))
        .limit(limit)
    ).all()
    entries = db.session.scalars(
        select(JournalEntry)
        .where(JournalEntry.user_id == user.id, or_(*(hit(getattr(JournalEntry, f)) for f in JOURNAL_FIELDS)))
        .order_by(JournalEntry.entry_date.desc())
        .limit(limit)
    ).all()
    events = db.session.scalars(
        select(ScheduleEvent)
        .where(ScheduleEvent.user_id == user.id, ScheduleEvent.archived_at.is_(None),
               or_(hit(ScheduleEvent.title), hit(ScheduleEvent.description)))
        .order_by(ScheduleEvent.starts_at.desc())
        .limit(limit)
    ).all()

    zone = user_zone(user)
    return {
        "query": q,
        "tasks": [
            {"id": str(t.id), "title": t.title, "status": t.status, "due_date": t.due_date.isoformat() if t.due_date else None,
             "is_subtask": t.parent_task_id is not None, "snippet": _first_snippet(q, t.notes) if not snippet(t.title, q) else None}
            for t in tasks
        ],
        "goals": [
            {"id": str(g.id), "title": g.title, "status": g.status, "archived": g.archived_at is not None,
             "snippet": None if snippet(g.title, q) else _first_snippet(q, g.description, g.success_criteria)}
            for g in goals
        ],
        "habits": [
            {"id": str(h.id), "name": h.name, "archived": h.archived_at is not None,
             "snippet": None if snippet(h.name, q) else _first_snippet(q, h.description)}
            for h in habits
        ],
        "journal": [
            {"entry_date": e.entry_date.isoformat(),
             "snippet": _first_snippet(q, *(getattr(e, f) for f in JOURNAL_FIELDS))}
            for e in entries
        ],
        "events": [
            {"id": str(ev.id), "title": ev.title, "date": ev.starts_at.astimezone(zone).date().isoformat(),
             "repeats": ev.rrule is not None,
             "snippet": None if snippet(ev.title, q) else _first_snippet(q, ev.description)}
            for ev in events
        ],
    }
