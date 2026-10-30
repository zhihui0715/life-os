from flask import Blueprint, Response, url_for
from pydantic import Field

from app.common.auth import current_user
from app.common.ownership import get_owned_or_404
from app.common.errors import not_found
from app.common.validation import InputModel, parse_body, parse_query
from app.extensions import limiter
from app.modules.calendar import links, scheduling, service
from app.modules.calendar.models import ScheduleEvent
from app.modules.calendar.schemas import (
    EventCreate,
    EventPatch,
    FreeSlotQuery,
    OccurrencePatch,
    OccurrenceRef,
    RangeQuery,
    SuggestionQuery,
)
from app.modules.tasks.models import Task

bp = Blueprint("calendar", __name__, url_prefix="/api/v1/calendar")


def _event(event_id) -> ScheduleEvent:
    return get_owned_or_404(ScheduleEvent, event_id, "Event")


# ---------- links with Google Calendar (calendar/links.py) ----------

class GoogleLink(InputModel):
    url: str = Field(min_length=1, max_length=2_000)


def _links(user) -> dict:
    token = user.settings.calendar_feed_token
    return {
        "feed_url": url_for("calendar.feed", token=token, _external=True) if token else None,
        "google": links.google_status(user),
    }


@bp.get("/links")
def get_links():
    return _links(current_user())


@bp.post("/links/feed")
def start_feed():
    """Creates the feed, or replaces its address (the old one stops working at once)."""
    user = current_user()
    links.new_feed_token(user)
    return _links(user)


@bp.delete("/links/feed")
def stop_feed():
    user = current_user()
    links.stop_feed(user)
    return _links(user)


@bp.put("/links/google")
def link_google():
    user = current_user()
    links.set_google_url(user, parse_body(GoogleLink).url)
    return _links(user)


@bp.delete("/links/google")
def unlink_google():
    user = current_user()
    links.set_google_url(user, None)
    return _links(user)


@bp.get("/feed/<token>.ics")
@limiter.limit("60 per hour")
def feed(token: str):
    """Public on purpose (Google fetches it without signing in): the random token is the key."""
    user = links.feed_owner(token)
    if user is None or not user.is_active:
        raise not_found("Feed")
    return Response(links.feed_ics(user), mimetype="text/calendar", headers={"Cache-Control": "private, max-age=300"})


@bp.get("/occurrences")
def list_occurrences():
    q = parse_query(RangeQuery)
    user = current_user()
    return {
        "items": [service.occurrence_to_dict(o) for o in service.occurrences(user, q.start, q.end)],
        "tasks": service.task_markers(user, q.start, q.end),
        "external": links.google_events(user, q.start, q.end),
    }


@bp.post("/events")
def create_event():
    return service.event_to_dict(service.create_event(current_user(), parse_body(EventCreate))), 201


@bp.get("/events/<event_id>")
def get_event(event_id):
    return service.event_to_dict(_event(event_id))


@bp.patch("/events/<event_id>")
def update_event(event_id):
    event, dropped = service.update_event(current_user(), _event(event_id), parse_body(EventPatch))
    return {**service.event_to_dict(event), "dropped_exceptions": dropped}


@bp.post("/events/<event_id>/archive")
def archive_event(event_id):
    return service.event_to_dict(service.archive_event(_event(event_id)))


@bp.post("/events/<event_id>/restore")
def restore_event(event_id):
    return service.event_to_dict(service.restore_event(_event(event_id)))


# One occurrence of a repeating event, identified by its original start time (?original_start=...).

@bp.patch("/events/<event_id>/occurrence")
def edit_occurrence(event_id):
    ref = parse_query(OccurrenceRef)
    occ = service.edit_occurrence(_event(event_id), ref.original_start, parse_body(OccurrencePatch))
    return service.occurrence_to_dict(occ)


@bp.delete("/events/<event_id>/occurrence")
def cancel_occurrence(event_id):
    ref = parse_query(OccurrenceRef)
    service.cancel_occurrence(_event(event_id), ref.original_start)
    return "", 204


@bp.post("/events/<event_id>/occurrence/restore")
def restore_occurrence(event_id):
    ref = parse_query(OccurrenceRef)
    service.restore_occurrence(_event(event_id), ref.original_start)
    return service.event_to_dict(_event(event_id))


# Scheduling help (read-only: nothing is changed until you confirm in the app).

@bp.get("/conflicts")
def conflicts():
    q = parse_query(RangeQuery)
    user = current_user()
    return {"overlaps": scheduling.conflicts(user, q.start, q.end), "workload": scheduling.workload(user)}


@bp.get("/free-slots")
def free_slots():
    q = parse_query(FreeSlotQuery)
    return {"items": [scheduling.slot_to_dict(s) for s in scheduling.free_slots(current_user(), q.start, q.end, q.min_minutes)]}


@bp.get("/suggestions")
def suggestions():
    q = parse_query(SuggestionQuery)
    task = get_owned_or_404(Task, q.task_id, "Task")
    return scheduling.suggestions(current_user(), task)
