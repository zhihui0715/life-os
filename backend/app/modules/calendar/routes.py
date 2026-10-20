from flask import Blueprint

from app.common.auth import current_user
from app.common.ownership import get_owned_or_404
from app.common.validation import parse_body, parse_query
from app.modules.calendar import scheduling, service
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


@bp.get("/occurrences")
def list_occurrences():
    q = parse_query(RangeQuery)
    user = current_user()
    return {
        "items": [service.occurrence_to_dict(o) for o in service.occurrences(user, q.start, q.end)],
        "tasks": service.task_markers(user, q.start, q.end),
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
