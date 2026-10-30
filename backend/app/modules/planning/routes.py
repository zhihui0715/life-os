"""Planning: Plan my day (/day, /day/schedule), the daily seal (/seals) and the weekly review (/week, /reviews).
Read-only except saving a review; the calendar blocks a plan proposes are created by the app through the normal calendar endpoint."""

import uuid
from datetime import date, timedelta
from typing import Literal

from flask import Blueprint
from pydantic import Field, field_validator

from app.common.auth import current_user
from app.common.errors import ApiError, not_found
from app.common.timeutil import user_today
from app.common.validation import InputModel, QueryModel, parse_body, parse_query
from app.modules.planning import seals, service

bp = Blueprint("planning", __name__, url_prefix="/api/v1/planning")

TEXT_MAX = 5_000


class DayQuery(QueryModel):
    day: Literal["today", "tomorrow"] = "today"


class ScheduleRequest(InputModel):
    day: Literal["today", "tomorrow"] = "today"
    task_ids: list[uuid.UUID] = Field(min_length=1, max_length=service.MAX_CANDIDATES)


class WeekQuery(QueryModel):
    week: Literal["this", "last"] = "last"


class ReviewUpsert(InputModel):
    """Only the fields sent are changed; send null or "" to clear one."""

    went_well: str | None = Field(default=None, max_length=TEXT_MAX)
    to_improve: str | None = Field(default=None, max_length=TEXT_MAX)
    lesson: str | None = Field(default=None, max_length=TEXT_MAX)
    priorities: list[str] | None = Field(default=None, max_length=service.MAX_PRIORITIES)
    completed: bool | None = None

    @field_validator("priorities")
    @classmethod
    def clean_priorities(cls, v):
        if v is None:
            return v
        items = [p.strip() for p in v if p.strip()]
        if any(len(p) > 200 for p in items):
            raise ValueError("each priority must be 200 characters or fewer")
        return items


class SealsQuery(QueryModel):
    days: int = Field(default=7, ge=1, le=seals.MAX_DAYS)  # how many days back, today included


class ReviewsQuery(QueryModel):
    limit: int = Field(default=12, ge=1, le=104)


def _day(user, which: str) -> date:
    return user_today(user) + timedelta(days=1 if which == "tomorrow" else 0)


@bp.get("/day")
def day_plan():
    user = current_user()
    return service.day_plan(user, _day(user, parse_query(DayQuery).day))


@bp.post("/day/schedule")
def schedule():
    user = current_user()
    data = parse_body(ScheduleRequest)
    return service.schedule(user, _day(user, data.day), data.task_ids)


@bp.get("/seals")
def daily_seals():
    return seals.daily_seals(current_user(), parse_query(SealsQuery).days)


@bp.get("/week")
def week():
    return service.week_review(current_user(), -1 if parse_query(WeekQuery).week == "last" else 0)


@bp.put("/reviews/<week_start>")
def save_review(week_start: str):
    user = current_user()
    try:
        start = date.fromisoformat(week_start)
    except ValueError:
        raise not_found("Week") from None
    if not service.is_week_start(user, start):
        raise ApiError(422, "validation_error", "That date isn't the first day of a week.",
                       fields={"week_start": [{"type": "invalid", "message": "not the first day of a week"}]})
    if start > user_today(user):
        raise ApiError(422, "rule_violation", "You can't review a week that hasn't started.")
    data = parse_body(ReviewUpsert)
    return service.review_to_dict(service.upsert_review(user, start, data.model_dump(exclude_unset=True)))


@bp.get("/reviews")
def reviews():
    return {"items": service.list_reviews(current_user(), parse_query(ReviewsQuery).limit)}
