from flask import Blueprint

from app.common.auth import current_user
from app.common.ownership import get_owned_or_404
from app.common.validation import parse_body, parse_query
from app.modules.tasks import service
from app.modules.tasks.models import Task
from app.modules.tasks.schemas import TaskCreate, TaskPatch, TaskQuery

bp = Blueprint("tasks", __name__, url_prefix="/api/v1/tasks")
tags_bp = Blueprint("tags", __name__, url_prefix="/api/v1/tags")


@tags_bp.get("")
def list_tags():
    return {"items": service.list_tags(current_user())}


def _get(task_id) -> Task:
    return get_owned_or_404(Task, task_id, "Task")


def _out(task: Task) -> dict:
    return service.task_to_dict(task, current_user())


@bp.get("")
def list_tasks():
    return service.list_tasks(current_user(), parse_query(TaskQuery))


@bp.post("")
def create_task():
    task = service.create_task(current_user(), parse_body(TaskCreate))
    return _out(task), 201


@bp.post("/someday")
def move_overdue_to_someday():
    return {"moved": service.move_overdue_to_someday(current_user())}


@bp.post("/tomorrow")
def move_today_to_tomorrow():
    return {"moved": service.move_today_to_tomorrow(current_user())}


@bp.get("/<task_id>")
def get_task(task_id):
    return _out(_get(task_id))


@bp.patch("/<task_id>")
def update_task(task_id):
    task = _get(task_id)
    return _out(service.update_task(current_user(), task, parse_body(TaskPatch)))


@bp.post("/<task_id>/complete")
def complete_task(task_id):
    return _out(service.complete_task(_get(task_id)))


@bp.post("/<task_id>/reopen")
def reopen_task(task_id):
    return _out(service.reopen_task(_get(task_id)))


@bp.post("/<task_id>/archive")
def archive_task(task_id):
    return _out(service.archive_task(_get(task_id)))


@bp.post("/<task_id>/restore")
def restore_task(task_id):
    return _out(service.restore_task(_get(task_id)))


@bp.delete("/<task_id>")
def delete_task(task_id):
    service.delete_task(_get(task_id))
    return "", 204
