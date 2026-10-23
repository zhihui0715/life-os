"""What the AI is allowed to see. Each request names the data categories it sends; this file turns those categories
into the exact text sent to the provider — the same text the app shows you before you press "Generate".

Data minimisation: titles, times, counts and scores only. No ids leave the server (tasks are "t1", "t2"…), no notes
or descriptions, and journal text only when the request explicitly includes the "journal_text" category.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from sqlalchemy import or_, select

from app.common.errors import ApiError
from app.common.timeutil import user_today, user_zone
from app.extensions import db
from app.modules.calendar.scheduling import free_slots, working_hours
from app.modules.calendar.service import occurrences
from app.modules.goals.models import Goal
from app.modules.goals.service import progress_for
from app.modules.habits.models import Habit
from app.modules.habits.service import _logs_since, habit_to_dict
from app.modules.insights import metrics
from app.modules.journal.models import TEXT_FIELDS, JournalEntry
from app.modules.tasks.models import Task

CATEGORIES = ("tasks", "calendar", "goals", "habits", "activity", "mood", "journal_text")
KINDS = {
    # allowed, sent by default, required
    "daily_plan": {"allowed": ("tasks", "calendar", "goals", "habits", "journal_text"),
                   "default": ("tasks", "calendar", "goals", "habits"), "required": ("tasks", "calendar")},
    "weekly_review": {"allowed": CATEGORIES,
                      "default": ("tasks", "calendar", "goals", "habits", "activity", "mood"), "required": ()},
}
MAX_TASKS = 40
WEEKDAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


@dataclass
class Context:
    kind: str
    categories: list[str]
    data: dict
    task_refs: dict[str, Task] = field(default_factory=dict)  # "t1" → Task, to map the reply back
    day: date | None = None


def check_categories(kind: str, requested: list[str]) -> list[str]:
    rules = KINDS[kind]
    unknown = [c for c in requested if c not in rules["allowed"]]
    if unknown:
        raise ApiError(422, "validation_error", f"Category not allowed here: {unknown[0]}",
                       fields={"categories": [{"type": "invalid", "message": f"{unknown[0]} can't be sent for this"}]})
    missing = [c for c in rules["required"] if c not in requested]
    if missing:
        raise ApiError(422, "validation_error", f"{missing[0]} is needed for this",
                       fields={"categories": [{"type": "missing", "message": f"{missing[0]} is required"}]})
    return [c for c in CATEGORIES if c in requested]  # stable order, no duplicates


def _hm(dt: datetime, tz) -> str:
    return dt.astimezone(tz).strftime("%H:%M")


def _local(dt: datetime | None, tz) -> str | None:
    return dt.astimezone(tz).strftime("%Y-%m-%d %H:%M") if dt else None


def _task_rows(user, day: date, refs: dict) -> list[dict]:
    """Open tasks worth planning: in progress, overdue, due/deadline within two weeks, or high priority."""
    tz = user_zone(user)
    soon = day + timedelta(days=14)
    soon_instant = datetime.combine(soon, time.max, tz)
    tasks = db.session.scalars(
        select(Task).where(
            Task.user_id == user.id, Task.status != "done", Task.archived_at.is_(None),
            or_(Task.status == "in_progress", Task.priority <= 2, Task.due_date <= soon, Task.deadline <= soon_instant),
        ).order_by(Task.priority, Task.deadline.asc().nulls_last(), Task.due_date.asc().nulls_last(), Task.created_at)
        .limit(MAX_TASKS)
    ).all()
    goals = {g.id: g.title for g in db.session.scalars(select(Goal).where(Goal.user_id == user.id))}
    rows = []
    for i, t in enumerate(tasks, 1):
        ref = f"t{i}"
        refs[ref] = t
        row = {"ref": ref, "title": t.title, "priority": t.priority, "status": t.status}
        if t.due_date:
            row["due_date"] = t.due_date.isoformat()
        if t.deadline:
            row["deadline"] = _local(t.deadline, tz)
        if t.estimate_minutes:
            row["estimate_minutes"] = t.estimate_minutes
        if t.goal_id:
            row["goal"] = goals.get(t.goal_id)
        if t.parent_task_id:
            row["is_subtask"] = True
        rows.append(row)
    return rows


def _active_goals(user) -> list[dict]:
    goals = db.session.scalars(
        select(Goal).where(Goal.user_id == user.id, Goal.status == "active", Goal.archived_at.is_(None))
        .order_by(Goal.target_date.asc().nulls_last())
    ).all()
    progress = progress_for(goals)
    return [
        {"title": g.title, "target_date": g.target_date.isoformat() if g.target_date else None,
         "progress_percent": progress[g.id].value if g.id in progress else None}
        for g in goals
    ]


def _habits(user, since: date) -> list[dict]:
    habits = db.session.scalars(
        select(Habit).where(Habit.user_id == user.id, Habit.archived_at.is_(None)).order_by(Habit.name)
    ).all()
    logs = _logs_since([h.id for h in habits], min([h.start_date for h in habits], default=since))
    out = []
    for h in habits:
        d = habit_to_dict(h, user, logs[h.id])
        row = {"name": h.name, "current_streak": d["stats"]["current_streak"], "consistency": d["stats"]["consistency"],
               "scheduled_today": d["scheduled_today"], "done_today": bool(d["today"] and d["today"]["state"] == "done")}
        if d["target_value"] is not None:
            row["target"] = f'{d["target_value"]:g} {d["target_unit"] or ""}'.strip()
        out.append(row)
    return out


def _journal(user, start: date, end: date) -> list[dict]:
    entries = db.session.scalars(
        select(JournalEntry).where(JournalEntry.user_id == user.id, JournalEntry.entry_date.between(start, end))
        .order_by(JournalEntry.entry_date)
    ).all()
    return [{"date": e.entry_date.isoformat(), **{f: getattr(e, f) for f in TEXT_FIELDS if getattr(e, f)}} for e in entries]


def _without_daily(component: dict) -> dict:
    return {k: v for k, v in component.items() if k != "daily"}


def daily_plan_context(user, categories: list[str], day: date) -> Context:
    tz = user_zone(user)
    today = user_today(user)
    start, end = datetime.combine(day, time.min, tz), datetime.combine(day + timedelta(days=1), time.min, tz)
    ctx = Context("daily_plan", categories, {}, day=day)
    meta = {"date": day.isoformat(), "weekday": day.strftime("%A"),
            "working_hours": working_hours(user).get(WEEKDAY_KEYS[day.weekday()], [])}
    if day == today:
        meta["current_time"] = datetime.now(tz).strftime("%H:%M")
    ctx.data["day"] = meta
    if "tasks" in categories:
        ctx.data["tasks"] = _task_rows(user, day, ctx.task_refs)
    if "calendar" in categories:
        occs = occurrences(user, start, end)
        ctx.data["calendar"] = {
            "events": [
                {"title": o.title, "start": "all day" if o.event.all_day else _hm(o.starts_at, tz),
                 "end": "" if o.event.all_day else _hm(o.ends_at, tz),
                 "type": {"appointment": "fixed" if o.event.is_hard else "flexible", "task_block": "planned work",
                          "preference": "preferred time window"}[o.event.kind]}
                for o in occs
            ],
            "free_slots": [{"start": _hm(s.start, tz), "end": _hm(s.end, tz)} for s in free_slots(user, start, end, 15, occs)],
        }
    if "goals" in categories:
        ctx.data["goals"] = _active_goals(user)
    if "habits" in categories:
        ctx.data["habits"] = [h for h in _habits(user, day) if h["scheduled_today"] and not h["done_today"]] \
            if day == today else [{"name": h["name"], **({"target": h["target"]} if "target" in h else {})} for h in _habits(user, day)]
    if "journal_text" in categories:
        ctx.data["journal"] = _journal(user, day - timedelta(days=1), day)
    return ctx


def weekly_review_context(user, categories: list[str], week_offset: int) -> Context:
    p = metrics.period_for(user, "week", week_offset)
    m = metrics.compute_period(user, p)
    tz = user_zone(user)
    ctx = Context("weekly_review", categories, {})
    ctx.data["week"] = {"start": p.start.isoformat(), "end": p.end.isoformat(), "days_so_far": p.elapsed_days}
    start = datetime.combine(p.start, time.min, tz)
    end = datetime.combine(p.end + timedelta(days=1), time.min, tz)
    if "tasks" in categories:
        done = db.session.scalars(
            select(Task).where(Task.user_id == user.id, Task.completed_at >= start, Task.completed_at < end)
            .order_by(Task.completed_at).limit(50)
        ).all()
        ctx.data["tasks"] = {"completed": [t.title for t in done], "metrics": _without_daily(m["components"]["tasks"]),
                             "estimates": m["estimates"]}
    if "calendar" in categories:
        occs = [o for o in occurrences(user, start, end) if o.busy]
        ctx.data["calendar"] = {"busy_hours": round(sum((o.ends_at - o.starts_at).total_seconds() for o in occs) / 3600, 1),
                                "events": len(occs)}
    if "goals" in categories:
        ctx.data["goals"] = {"active": _active_goals(user), "metrics": _without_daily(m["components"]["goals_learning"])}
    if "habits" in categories:
        ctx.data["habits"] = {"habits": [{k: h[k] for k in ("name", "current_streak", "consistency")} for h in _habits(user, p.start)],
                              "metrics": _without_daily(m["components"]["habits"])}
    if "activity" in categories:
        ctx.data["activity"] = {"focus": m["focus"], "time": m["time"]}
    if "mood" in categories:
        w = m["components"]["wellbeing"]
        ctx.data["mood"] = {"average_mood": w.get("average_mood"), "average_energy": w.get("average_energy"),
                            "check_in_days": w.get("check_in_days"), "scale": "1 (low) to 5 (high)"}
    if "journal_text" in categories:
        ctx.data["journal"] = _journal(user, p.start, p.last)
    return ctx
