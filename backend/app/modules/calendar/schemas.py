import uuid
from datetime import date, timedelta
from typing import Literal

from pydantic import AwareDatetime, Field, field_validator, model_validator

from app.common.validation import InputModel, QueryModel
from app.modules.calendar.recurrence import normalise_rrule

EventKind = Literal["appointment", "task_block", "preference"]
MAX_TIMED = timedelta(days=7)
MAX_ALL_DAY_DAYS = 31
MAX_RANGE = timedelta(days=100)


def _check_rrule(v):
    if v is None or v == "":
        return None
    return normalise_rrule(v)  # ValueError becomes a 422 field error


class _EventTimes(InputModel):
    all_day: bool | None = None
    starts_at: AwareDatetime | None = None  # timed events
    ends_at: AwareDatetime | None = None
    start_date: date | None = None  # all-day events (end_date is inclusive)
    end_date: date | None = None

    def _check_times(self, all_day: bool, partial: bool):
        timed = (self.starts_at, self.ends_at)
        dates = (self.start_date, self.end_date)
        if all_day:
            if any(timed):
                raise ValueError("All-day events use start_date / end_date, not times")
            if not partial and not all(dates):
                raise ValueError("start_date and end_date are required for all-day events")
            if all(dates):
                if self.end_date < self.start_date:
                    raise ValueError("end_date must not be before start_date")
                if (self.end_date - self.start_date).days >= MAX_ALL_DAY_DAYS:
                    raise ValueError(f"All-day events can span at most {MAX_ALL_DAY_DAYS} days")
        else:
            if any(dates):
                raise ValueError("Timed events use starts_at / ends_at, not dates")
            if not partial and not all(timed):
                raise ValueError("starts_at and ends_at are required")
            if all(timed):
                if self.ends_at <= self.starts_at:
                    raise ValueError("ends_at must be after starts_at")
                if self.ends_at - self.starts_at > MAX_TIMED:
                    raise ValueError("A timed event can last at most 7 days")


class EventCreate(_EventTimes):
    id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5_000)
    kind: EventKind = "appointment"
    is_hard: bool | None = None  # default depends on kind
    rrule: str | None = None
    task_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None

    @field_validator("rrule")
    @classmethod
    def valid_rrule(cls, v):
        return _check_rrule(v)

    @model_validator(mode="after")
    def times(self):
        self._check_times(bool(self.all_day), partial=False)
        if self.kind == "task_block" and not self.task_id:
            raise ValueError("A task block needs task_id")
        return self


class EventPatch(_EventTimes):
    """Edits the whole series. To change one occurrence, use the occurrence endpoint."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5_000)
    kind: EventKind | None = None
    is_hard: bool | None = None
    rrule: str | None = None
    task_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    if_updated_at: AwareDatetime | None = None

    @field_validator("rrule")
    @classmethod
    def valid_rrule(cls, v):
        return _check_rrule(v)

    @model_validator(mode="after")
    def times(self):
        if self.all_day is not None:
            self._check_times(self.all_day, partial=False)
        else:
            self._check_times(bool(self.start_date or self.end_date), partial=True)
        return self


class OccurrenceRef(QueryModel):
    original_start: AwareDatetime


class OccurrencePatch(InputModel):
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    title: str | None = Field(default=None, min_length=1, max_length=200)

    @model_validator(mode="after")
    def order(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        if self.ends_at - self.starts_at > MAX_TIMED:
            raise ValueError("A timed event can last at most 7 days")
        return self


class RangeQuery(QueryModel):
    start: AwareDatetime
    end: AwareDatetime

    @model_validator(mode="after")
    def bounded(self):
        if self.end <= self.start:
            raise ValueError("end must be after start")
        if self.end - self.start > MAX_RANGE:
            raise ValueError("The range can be at most 100 days")
        return self


class FreeSlotQuery(RangeQuery):
    min_minutes: int = Field(default=30, ge=5, le=600)


class SuggestionQuery(QueryModel):
    task_id: uuid.UUID
