"""Task business rules. Routes call these functions; nothing else writes to the tasks table.

Subtasks: one level deep. They live inside their parent (list views show top-level tasks only, with subtask
counts; search shows everything). Subtasks are not linked to goals — the parent is — so goal progress never
counts the same work twice.
"""

import base64
import binascii
import json
from datetime import datetime, time, timedelta

from sqlalchemy import and_, false, func, not_, or_, select

from app.common.errors import ApiError
from app.common.models import utcnow
from app.common.ownership import get_owned_or_404
from app.common.timeutil import user_today, user_zone
from app.extensions import db
from app.modules.activity.service import tracked_minutes
from app.modules.calendar.models import ScheduleEvent
from app.modules.categories.models import Category
from app.modules.goals.models import Goal, GoalMilestone
from app.modules.goals.service import sync_progress
from app.modules.tasks.models import Tag, Task
from app.modules.tasks.schemas import TaskCreate, TaskPatch, TaskQuery


def _rule(message: str) -> ApiError:
    return ApiError(422, "rule_violation", message)


# ---------- serialisation ----------

def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def subtask_counts(task_ids) -> dict:
    """{parent_id: (done, total)} for the given tasks, in one query."""
    if not task_ids:
        return {}
    rows = db.session.execute(
        select(Task.parent_task_id, func.count().filter(Task.status == "done"), func.count())
        .where(Task.parent_task_id.in_(task_ids), Task.archived_at.is_(None))
        .group_by(Task.parent_task_id)
    ).all()
    return {r[0]: (r[1], r[2]) for r in rows}


def task_to_dict(t: Task, user, now: datetime | None = None, counts: dict | None = None, tracked: dict | None = None) -> dict:
    now = now or utcnow()
    today = user_today(user, now)
    is_open = t.status != "done" and t.archived_at is None
    overdue = is_open and ((t.due_date is not None and t.due_date < today) or (t.deadline is not None and t.deadline < now))
    if counts is None:
        counts = subtask_counts([t.id])
    sub_done, sub_total = counts.get(t.id, (0, 0))
    if tracked is None:
        tracked = tracked_minutes([t.id])
    return {
        "id": str(t.id),
        "title": t.title,
        "notes": t.notes,
        "status": t.status,
        "priority": t.priority,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "deadline": _iso(t.deadline),
        "estimate_minutes": t.estimate_minutes,
        "actual_minutes_manual": t.actual_minutes_manual,
        # Logged time (activity logs + stopped focus sessions). The manual value, if set, overrides it for display.
        "tracked_minutes": tracked.get(t.id, 0),
        "category_id": str(t.category_id) if t.category_id else None,
        "goal_id": str(t.goal_id) if t.goal_id else None,
        "milestone_id": str(t.milestone_id) if t.milestone_id else None,
        "parent_task_id": str(t.parent_task_id) if t.parent_task_id else None,
        "tags": [tag.name for tag in t.tags],
        "subtasks_done": sub_done,
        "subtasks_total": sub_total,
        "position": t.position,
        "is_overdue": overdue,
        "completed_at": _iso(t.completed_at),
        "archived_at": _iso(t.archived_at),
        "created_at": _iso(t.created_at),
        "updated_at": _iso(t.updated_at),
    }


# ---------- listing ----------

def _encode_cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(json.dumps({"o": offset}).encode()).decode()


def _decode_cursor(cursor: str | None) -> int:
    """Opaque to clients; currently an offset. Can switch to keyset pagination without changing the API."""
    if not cursor:
        return 0
    try:
        offset = int(json.loads(base64.urlsafe_b64decode(cursor.encode()))["o"])
    except (ValueError, KeyError, TypeError, binascii.Error, json.JSONDecodeError):
        raise ApiError(422, "validation_error", "Invalid cursor.", fields={"cursor": [{"type": "invalid", "message": "Invalid cursor"}]}) from None
    return max(offset, 0)


def _view_filters(view: str, user, now: datetime):
    """Each view's rule in one place. Overdue/today/upcoming are mutually exclusive."""
    today = user_today(user, now)
    zone = user_zone(user)
    start_today = datetime.combine(today, time.min, zone)
    start_tomorrow = datetime.combine(today + timedelta(days=1), time.min, zone)

    # SQL comparisons with an empty (NULL) date give "unknown", and NOT(unknown) is still unknown — which would
    # silently drop rows. coalesce(..., false) turns "unknown" into a plain false.
    def known(expr):
        return func.coalesce(expr, false())

    is_open = and_(Task.status != "done", Task.archived_at.is_(None))
    overdue = known(or_(Task.due_date < today, Task.deadline < now))
    due_today = known(or_(Task.due_date == today, and_(Task.deadline >= start_today, Task.deadline < start_tomorrow)))
    later = known(or_(Task.due_date > today, Task.deadline >= start_tomorrow))

    match view:
        case "all":
            return [Task.archived_at.is_(None)]
        case "inbox":
            return [Task.archived_at.is_(None), Task.status == "inbox"]
        case "overdue":
            return [is_open, overdue]
        case "today":
            return [is_open, due_today, not_(overdue)]
        case "upcoming":
            return [is_open, later, not_(overdue), not_(due_today)]
        case "unscheduled":
            # Stage 1 meaning: no due date and no deadline. Stage 3 will also require "no calendar block".
            return [is_open, Task.status != "inbox", Task.due_date.is_(None), Task.deadline.is_(None)]
        case "completed":
            return [Task.archived_at.is_(None), Task.status == "done"]
        case "archived":
            return [Task.archived_at.is_not(None)]
    raise ValueError(view)


def _view_order(view: str):
    if view == "completed":
        return [Task.completed_at.desc()]
    if view == "archived":
        return [Task.archived_at.desc()]
    if view == "upcoming":
        return [func.coalesce(Task.due_date, func.date(Task.deadline)).asc(), Task.priority.asc()]
    # Open work first, then most urgent, then soonest.
    return [
        (Task.status == "done").asc(),
        Task.priority.asc(),
        Task.due_date.asc().nulls_last(),
        Task.created_at.desc(),
    ]


def _like_pattern(text: str) -> str:
    """Escape SQL wildcard characters so a search for "50%" means the literal text."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def list_tasks(user, query: TaskQuery) -> dict:
    now = utcnow()
    filters = [Task.user_id == user.id]
    order = _view_order(query.view)

    if query.parent_id:
        # Subtasks of one task, in their own order.
        filters += [Task.parent_task_id == query.parent_id, Task.archived_at.is_(None)]
        order = [Task.position.asc(), Task.created_at.asc()]
    else:
        filters += _view_filters(query.view, user, now)
        if query.q and query.q.strip():
            # ILIKE matches substrings, which also works for Chinese (no word splitting needed).
            pattern = _like_pattern(query.q.strip())
            filters.append(or_(Task.title.ilike(pattern, escape="\\"), Task.notes.ilike(pattern, escape="\\")))
        else:
            filters.append(Task.parent_task_id.is_(None))

    if query.category_id:
        filters.append(Task.category_id == query.category_id)
    if query.goal_id:
        filters.append(Task.goal_id == query.goal_id)
    if query.milestone_id:
        filters.append(Task.milestone_id == query.milestone_id)
    if query.tag:
        filters.append(Task.tags.any(func.lower(Tag.name) == query.tag.strip().lower()))
    if query.needs_scheduling:
        has_block = select(ScheduleEvent.id).where(
            ScheduleEvent.task_id == Task.id, ScheduleEvent.kind == "task_block", ScheduleEvent.archived_at.is_(None)
        ).exists()
        filters += [Task.status != "done", Task.archived_at.is_(None), Task.status != "inbox", not_(has_block)]

    offset = _decode_cursor(query.cursor)
    total = db.session.scalar(select(func.count()).select_from(Task).where(*filters))
    rows = db.session.scalars(
        select(Task).where(*filters).order_by(*order, Task.id).offset(offset).limit(query.limit)
    ).all()
    counts = subtask_counts([t.id for t in rows])
    tracked = tracked_minutes([t.id for t in rows])
    next_offset = offset + len(rows)
    return {
        "items": [task_to_dict(t, user, now, counts, tracked) for t in rows],
        "next_cursor": _encode_cursor(next_offset) if next_offset < total else None,
        "total": total,
    }


def list_tags(user) -> list[dict]:
    """Tags in use, with how many open (not archived) tasks carry each one."""
    from app.modules.tasks.models import task_tags

    rows = db.session.execute(
        select(Tag.name, func.count(Task.id))
        .select_from(Tag)
        .outerjoin(task_tags, task_tags.c.tag_id == Tag.id)
        .outerjoin(Task, and_(Task.id == task_tags.c.task_id, Task.archived_at.is_(None)))
        .where(Tag.user_id == user.id)
        .group_by(Tag.id, Tag.name)
        .order_by(func.lower(Tag.name))
    ).all()
    return [{"name": r[0], "task_count": r[1]} for r in rows]


# ---------- link validation ----------

def _check_category(category_id) -> None:
    if category_id is not None:
        get_owned_or_404(Category, category_id, "Category")


def _apply_links(user, task: Task, changes: dict) -> None:
    """Validate and apply goal / milestone / parent changes. `changes` holds only the fields being set."""
    if "parent_task_id" in changes:
        parent_id = changes["parent_task_id"]
        if parent_id is not None:
            parent = get_owned_or_404(Task, parent_id, "Parent task")
            if parent.id == task.id:
                raise _rule("A task can't be its own subtask.")
            if parent.parent_task_id is not None:
                raise _rule("Subtasks can only be one level deep.")
            if task.id and subtask_counts([task.id]).get(task.id, (0, 0))[1]:
                raise _rule("A task that has subtasks can't become a subtask.")
        task.parent_task_id = parent_id

    goal_id = changes.get("goal_id", task.goal_id)
    milestone_id = changes.get("milestone_id", task.milestone_id)

    if milestone_id is not None:
        milestone = get_owned_or_404(GoalMilestone, milestone_id, "Milestone")
        if "milestone_id" in changes and "goal_id" not in changes:
            goal_id = milestone.goal_id  # picking a milestone implies its goal
        if goal_id != milestone.goal_id:
            if "milestone_id" in changes:
                raise _rule("That milestone belongs to a different goal.")
            milestone_id = None  # goal changed: the old milestone no longer applies
    if goal_id is not None and ("goal_id" in changes or "milestone_id" in changes):
        goal = get_owned_or_404(Goal, goal_id, "Goal")
        if goal.archived_at is not None:
            raise _rule("That goal is archived.")

    if task.parent_task_id is not None and (goal_id is not None or milestone_id is not None):
        raise _rule("Link the parent task to a goal instead of the subtask.")

    task.goal_id = goal_id
    task.milestone_id = milestone_id


def _set_tags(user, task: Task, names: list[str]) -> None:
    unique: dict[str, str] = {}
    for name in names:
        unique.setdefault(name.lower(), name)  # case-insensitive: "Exam" and "exam" are one tag
    existing = {
        t.name.lower(): t
        for t in db.session.scalars(
            select(Tag).where(Tag.user_id == user.id, func.lower(Tag.name).in_(list(unique)))
        )
    }
    tags = []
    for key, name in unique.items():
        tag = existing.get(key)
        if tag is None:
            tag = Tag(user_id=user.id, name=name)
            db.session.add(tag)
        tags.append(tag)
    task.tags = tags


# ---------- writes ----------

def create_task(user, data: TaskCreate) -> Task:
    if data.id and db.session.get(Task, data.id):
        raise ApiError(409, "conflict", "A task with this id already exists.")
    _check_category(data.category_id)
    values = data.model_dump(exclude_none=True, exclude={"goal_id", "milestone_id", "parent_task_id", "tags"})
    task = Task(user_id=user.id, **values)
    _apply_links(user, task, data.model_dump(include={"goal_id", "milestone_id", "parent_task_id"}, exclude_none=True))
    _set_tags(user, task, data.tags)
    db.session.add(task)
    sync_progress(task.goal_id)
    db.session.commit()
    return task


def update_task(user, task: Task, data: TaskPatch) -> Task:
    changes = data.model_dump(exclude_unset=True)
    expected = changes.pop("if_updated_at", None)
    if expected is not None and task.updated_at != expected:
        raise ApiError(
            409, "stale_update", "This task was changed elsewhere since you opened it.",
            extra={"current": task_to_dict(task, user)},
        )
    for required in ("title", "status", "priority", "position", "tags"):
        if required in changes and changes[required] is None:
            raise ApiError(422, "validation_error", "Some fields are invalid.", fields={required: [{"type": "missing", "message": "Cannot be null"}]})
    if "status" in changes and task.status == "done":
        raise _rule("Reopen a completed task before changing its status.")
    if "category_id" in changes:
        _check_category(changes["category_id"])

    old_goal = task.goal_id
    links = {k: changes.pop(k) for k in ("goal_id", "milestone_id", "parent_task_id") if k in changes}
    if links:
        _apply_links(user, task, links)
    if "tags" in changes:
        _set_tags(user, task, changes.pop("tags"))
    for field, value in changes.items():
        setattr(task, field, value)
    sync_progress(old_goal, task.goal_id)
    db.session.commit()
    return task


def complete_task(task: Task) -> Task:
    if task.status != "done":
        task.status = "done"
        task.completed_at = utcnow()
        sync_progress(task.goal_id)
        db.session.commit()
    return task


def reopen_task(task: Task) -> Task:
    if task.status == "done":
        task.status = "todo"
        task.completed_at = None
        sync_progress(task.goal_id)
        db.session.commit()
    return task


def archive_task(task: Task) -> Task:
    if task.archived_at is None:
        task.archived_at = utcnow()
        sync_progress(task.goal_id)
        db.session.commit()
    return task


def restore_task(task: Task) -> Task:
    if task.archived_at is not None:
        task.archived_at = None
        sync_progress(task.goal_id)
        db.session.commit()
    return task


def delete_task(task: Task) -> None:
    """Hard delete only for tasks with no history; anything completed must be archived instead."""
    if task.status == "done":
        raise _rule("Completed tasks are part of your history. Archive it instead.")
    if db.session.scalar(select(func.count()).select_from(Task).where(Task.parent_task_id == task.id)):
        raise _rule("This task has subtasks. Delete or move them first, or archive the task.")
    goal_id = task.goal_id
    db.session.delete(task)
    sync_progress(goal_id)
    db.session.commit()
