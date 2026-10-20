from datetime import date

from flask import Blueprint

from app.common.auth import current_user
from app.common.errors import not_found
from app.common.ownership import get_owned_or_404
from app.common.validation import parse_body, parse_query
from app.modules.habits import service
from app.modules.habits.models import Habit

bp = Blueprint("habits", __name__, url_prefix="/api/v1/habits")


def _habit(habit_id) -> Habit:
    return get_owned_or_404(Habit, habit_id, "Habit")


def _day(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise not_found("Day") from None


@bp.get("")
def list_habits():
    return {"items": service.list_habits(current_user(), parse_query(service.HabitQuery))}


@bp.post("")
def create_habit():
    return service.habit_detail(service.create_habit(current_user(), parse_body(service.HabitCreate)), current_user()), 201


@bp.get("/<habit_id>")
def get_habit(habit_id):
    return service.habit_detail(_habit(habit_id), current_user())


@bp.patch("/<habit_id>")
def update_habit(habit_id):
    h = service.update_habit(current_user(), _habit(habit_id), parse_body(service.HabitPatch))
    return service.habit_detail(h, current_user())


@bp.post("/<habit_id>/archive")
def archive_habit(habit_id):
    return service.habit_detail(service.set_archived(_habit(habit_id), True), current_user())


@bp.post("/<habit_id>/restore")
def restore_habit(habit_id):
    return service.habit_detail(service.set_archived(_habit(habit_id), False), current_user())


@bp.put("/<habit_id>/logs/<day>")
def upsert_log(habit_id, day):
    h = _habit(habit_id)
    service.upsert_log(current_user(), h, _day(day), parse_body(service.LogUpsert))
    return service.habit_detail(h, current_user())


@bp.delete("/<habit_id>/logs/<day>")
def delete_log(habit_id, day):
    h = _habit(habit_id)
    service.delete_log(h, _day(day))
    return service.habit_detail(h, current_user())
