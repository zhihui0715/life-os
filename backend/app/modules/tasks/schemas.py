import uuid
from datetime import date
from typing import Literal

from pydantic import AwareDatetime, Field

from app.common.validation import InputModel, QueryModel

# "done" is reached only through POST /complete, so the completion rules always run.
OpenStatus = Literal["inbox", "todo", "in_progress"]
TaskView = Literal["all", "inbox", "today", "upcoming", "overdue", "unscheduled", "completed", "archived"]


class TaskCreate(InputModel):
    id: uuid.UUID | None = None  # optional client-generated id (offline support later)
    title: str = Field(min_length=1, max_length=200)
    notes: str | None = Field(default=None, max_length=20_000)
    status: OpenStatus = "inbox"
    priority: int = Field(default=3, ge=1, le=4)
    due_date: date | None = None
    deadline: AwareDatetime | None = None  # must include a timezone offset
    estimate_minutes: int | None = Field(default=None, ge=0, le=10_000)
    category_id: uuid.UUID | None = None


class TaskPatch(InputModel):
    """Only the fields sent are changed. Sending null clears an optional field."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    notes: str | None = Field(default=None, max_length=20_000)
    status: OpenStatus | None = None
    priority: int | None = Field(default=None, ge=1, le=4)
    due_date: date | None = None
    deadline: AwareDatetime | None = None
    estimate_minutes: int | None = Field(default=None, ge=0, le=10_000)
    actual_minutes_manual: int | None = Field(default=None, ge=0, le=100_000)
    category_id: uuid.UUID | None = None
    position: int | None = None
    # Optimistic concurrency: the updated_at the client last saw (docs/02-api-conventions.md §6).
    if_updated_at: AwareDatetime | None = None


class TaskQuery(QueryModel):
    view: TaskView = "all"
    category_id: uuid.UUID | None = None
    limit: int = Field(default=50, ge=1, le=200)
    cursor: str | None = None
