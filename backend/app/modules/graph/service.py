"""The graph view: your unfinished work as a network, Obsidian-style.

Nodes: active goals, their open milestones, open tasks (and subtasks), the tags those tasks use, habits that serve a
goal, and four time hubs (Overdue, Today, This week, Later). Links say what each task belongs to: its milestone or
goal, its parent task, its tags and when it's due. Every task carries an `urgency` the app colours by.
"""

from datetime import date, datetime, time, timedelta

from sqlalchemy import select

from app.common.models import utcnow
from app.common.timeutil import user_today, user_zone
from app.extensions import db
from app.modules.goals.models import Goal, GoalMilestone
from app.modules.goals.service import progress_for
from app.modules.habits.models import Habit
from app.modules.tasks.models import Task

MAX_TASKS = 400
HUBS = ("overdue", "today", "week", "later")  # tasks with no date join no hub


def urgency(t: Task, today: date, now: datetime, tz) -> str:
    """overdue · today · week · later · none (no date at all)."""
    if (t.due_date and t.due_date < today) or (t.deadline and t.deadline < now):
        return "overdue"
    day = t.due_date or (t.deadline.astimezone(tz).date() if t.deadline else None)
    if day is None:
        return "none"
    if day == today:
        return "today"
    return "week" if day <= today + timedelta(days=6) else "later"


def build(user) -> dict:
    tz = user_zone(user)
    today = user_today(user)
    now = utcnow()

    goals = db.session.scalars(
        select(Goal).where(Goal.user_id == user.id, Goal.status.in_(("active", "paused")), Goal.archived_at.is_(None))
    ).all()
    progress = progress_for(goals)
    goal_ids = {g.id for g in goals}
    milestones = db.session.scalars(
        select(GoalMilestone).where(GoalMilestone.goal_id.in_(goal_ids), GoalMilestone.completed_at.is_(None))
    ).all() if goal_ids else []
    tasks = db.session.scalars(
        select(Task).where(Task.user_id == user.id, Task.status != "done", Task.archived_at.is_(None))
        .order_by(Task.priority, Task.due_date.asc().nulls_last()).limit(MAX_TASKS)
    ).all()
    habits = db.session.scalars(
        select(Habit).where(Habit.user_id == user.id, Habit.archived_at.is_(None), Habit.goal_id.in_(goal_ids))
    ).all() if goal_ids else []

    nodes, links = [], []
    task_ids = {t.id for t in tasks}
    milestone_ids = {m.id for m in milestones}

    for g in goals:
        p = progress.get(g.id)
        nodes.append({"id": f"goal:{g.id}", "kind": "goal", "label": g.title, "ref": str(g.id), "status": g.status,
                      "progress": p.value if p else None})
    for m in milestones:
        nodes.append({"id": f"milestone:{m.id}", "kind": "milestone", "label": m.title, "ref": str(m.goal_id)})
        links.append({"source": f"milestone:{m.id}", "target": f"goal:{m.goal_id}", "kind": "part_of"})

    tag_counts: dict[str, int] = {}
    hub_counts = dict.fromkeys(HUBS, 0)
    for t in tasks:
        u = urgency(t, today, now, tz)
        nid = f"task:{t.id}"
        nodes.append({"id": nid, "kind": "task", "label": t.title, "ref": str(t.id), "priority": t.priority,
                      "urgency": u, "status": t.status, "subtask": t.parent_task_id is not None,
                      "due_date": t.due_date.isoformat() if t.due_date else None})
        if t.parent_task_id in task_ids:
            links.append({"source": nid, "target": f"task:{t.parent_task_id}", "kind": "subtask"})
        elif t.milestone_id in milestone_ids:
            links.append({"source": nid, "target": f"milestone:{t.milestone_id}", "kind": "part_of"})
        elif t.goal_id in goal_ids:
            links.append({"source": nid, "target": f"goal:{t.goal_id}", "kind": "part_of"})
        for tag in t.tags:
            tag_counts[tag.name] = tag_counts.get(tag.name, 0) + 1
            links.append({"source": nid, "target": f"tag:{tag.name.lower()}", "kind": "tagged"})
        if u in hub_counts and t.parent_task_id is None:
            hub_counts[u] += 1
            links.append({"source": nid, "target": f"hub:{u}", "kind": "due"})

    seen_tags = set()
    for t in tasks:
        for tag in t.tags:
            key = tag.name.lower()
            if key not in seen_tags:
                seen_tags.add(key)
                nodes.append({"id": f"tag:{key}", "kind": "tag", "label": tag.name, "ref": tag.name, "count": tag_counts[tag.name]})
    for h in habits:
        nodes.append({"id": f"habit:{h.id}", "kind": "habit", "label": h.name, "ref": str(h.id)})
        links.append({"source": f"habit:{h.id}", "target": f"goal:{h.goal_id}", "kind": "serves"})
    for hub, count in hub_counts.items():
        if count:
            nodes.append({"id": f"hub:{hub}", "kind": "hub", "label": hub, "ref": hub, "count": count})

    by_urgency = dict.fromkeys(("overdue", "today", "week", "later", "none"), 0)
    for n in nodes:
        if n["kind"] == "task":
            by_urgency[n["urgency"]] += 1
    return {
        "nodes": nodes,
        "links": links,
        "summary": {"tasks": len(tasks), "truncated": len(tasks) == MAX_TASKS, "by_urgency": by_urgency,
                    "goals": len(goals), "tags": len(seen_tags), "habits": len(habits)},
        "generated_at": datetime.combine(today, time.min, tz).isoformat(),
    }
