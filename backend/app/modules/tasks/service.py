"""Task business rules. Routes call these functions; nothing else writes to the tasks table."""

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
from app.modules.categories.models import Category
from app.modules.tasks.models import Task
from app.modules.tasks.schemas import TaskCreate, TaskPatch, TaskQuery


# ---------- serialisation ----------

def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def task_to_dict(t: Task, user, now: datetime | None = None) -> dict:
    now = now or utcnow()
    today = user_today(user, now)
    is_open = t.status != "done" and t.archived_at is None
    overdue = is_open and ((t.due_date is not None and t.due_date < today) or (t.deadline is not None and t.deadline < now))
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
        "category_id": str(t.category_id) if t.category_id else None,
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


def list_tasks(user, query: TaskQuery) -> dict:
    now = utcnow()
    filters = [Task.user_id == user.id, *_view_filters(query.view, user, now)]
    if query.category_id:
        filters.append(Task.category_id == query.category_id)

    offset = _decode_cursor(query.cursor)
    total = db.session.scalar(select(func.count()).select_from(Task).where(*filters))
    rows = db.session.scalars(
        select(Task).where(*filters).order_by(*_view_order(query.view), Task.id).offset(offset).limit(query.limit)
    ).all()
    next_offset = offset + len(rows)
    return {
        "items": [task_to_dict(t, user, now) for t in rows],
        "next_cursor": _encode_cursor(next_offset) if next_offset < total else None,
        "total": total,
    }


# ---------- writes ----------

def _check_category(user, category_id) -> None:
    if category_id is not None:
        get_owned_or_404(Category, category_id, "Category")


def create_task(user, data: TaskCreate) -> Task:
    if data.id and db.session.get(Task, data.id):
        raise ApiError(409, "conflict", "A task with this id already exists.")
    _check_category(user, data.category_id)
    values = data.model_dump(exclude_none=True)
    task = Task(user_id=user.id, **values)
    db.session.add(task)
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
    for required in ("title", "status", "priority", "position"):
        if required in changes and changes[required] is None:
            raise ApiError(422, "validation_error", "Some fields are invalid.", fields={required: [{"type": "missing", "message": "Cannot be null"}]})
    if "status" in changes and task.status == "done":
        raise ApiError(422, "rule_violation", "Reopen a completed task before changing its status.")
    if "category_id" in changes:
        _check_category(user, changes["category_id"])
    for field, value in changes.items():
        setattr(task, field, value)
    db.session.commit()
    return task


def complete_task(task: Task) -> Task:
    if task.status != "done":
        task.status = "done"
        task.completed_at = utcnow()
        db.session.commit()
    return task


def reopen_task(task: Task) -> Task:
    if task.status == "done":
        task.status = "todo"
        task.completed_at = None
        db.session.commit()
    return task


def archive_task(task: Task) -> Task:
    if task.archived_at is None:
        task.archived_at = utcnow()
        db.session.commit()
    return task


def restore_task(task: Task) -> Task:
    if task.archived_at is not None:
        task.archived_at = None
        db.session.commit()
    return task


def delete_task(task: Task) -> None:
    """Hard delete only for tasks with no history; anything completed must be archived instead."""
    if task.status == "done":
        raise ApiError(422, "rule_violation", "Completed tasks are part of your history. Archive it instead.")
    db.session.delete(task)
    db.session.commit()
