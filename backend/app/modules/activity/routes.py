from datetime import timedelta

from flask import Blueprint

from app.common.auth import current_user
from app.common.ownership import get_owned_or_404
from app.common.timeutil import user_today
from app.common.validation import parse_body, parse_query
from app.modules.activity import service
from app.modules.activity.models import ActivityLog, FocusSession

activity_bp = Blueprint("activity", __name__, url_prefix="/api/v1/activity-logs")
focus_bp = Blueprint("focus", __name__, url_prefix="/api/v1/focus-sessions")


def _log(log_id) -> ActivityLog:
    return get_owned_or_404(ActivityLog, log_id, "Activity")


def _session(session_id) -> FocusSession:
    return get_owned_or_404(FocusSession, session_id, "Focus session")


@activity_bp.get("")
def list_activity():
    return {"items": service.list_activity(current_user(), parse_query(service.ActivityQuery))}


@activity_bp.get("/summary")
def activity_summary():
    q = parse_query(service.SummaryQuery)
    return service.summary(current_user(), q.start, q.end)


@activity_bp.post("")
def create_activity():
    return service.activity_to_dict(service.create_activity(current_user(), parse_body(service.ActivityCreate))), 201


@activity_bp.patch("/<log_id>")
def update_activity(log_id):
    return service.activity_to_dict(service.update_activity(current_user(), _log(log_id), parse_body(service.ActivityPatch)))


@activity_bp.delete("/<log_id>")
def delete_activity(log_id):
    service.delete_activity(_log(log_id))
    return "", 204


@focus_bp.get("/current")
def current_focus():
    s = service.current_focus(current_user())
    return {"session": service.focus_to_dict(s) if s else None}


@focus_bp.get("")
def list_focus():
    """Sessions in ?start=&end= (local dates, inclusive); default the last 7 days."""
    q = parse_query(service.OptionalRange)
    user = current_user()
    end = q.end or user_today(user)
    start = q.start or end - timedelta(days=6)
    return service.list_focus(user, start, end)


@focus_bp.post("")
def start_focus():
    return service.focus_to_dict(service.start_focus(current_user(), parse_body(service.FocusStart))), 201


@focus_bp.post("/<session_id>/pause")
def pause_focus(session_id):
    return service.focus_to_dict(service.pause_focus(_session(session_id)))


@focus_bp.post("/<session_id>/resume")
def resume_focus(session_id):
    return service.focus_to_dict(service.resume_focus(_session(session_id)))


@focus_bp.post("/<session_id>/stop")
def stop_focus(session_id):
    return service.focus_to_dict(service.stop_focus(current_user(), _session(session_id), parse_body(service.FocusStop)))


@focus_bp.patch("/<session_id>")
def correct_focus(session_id):
    return service.focus_to_dict(service.correct_focus(current_user(), _session(session_id), parse_body(service.FocusPatch)))
