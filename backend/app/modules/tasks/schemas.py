import uuid
from datetime import date
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, StringConstraints

from app.common.validation import InputModel, QueryModel

# "done" is reached only through POST /complete, so the completion rules always run.
OpenStatus = Literal["inbox", "todo", "in_progress"]
TaskView = Literal["all", "inbox", "today", "upcoming", "overdue", "unscheduled", "completed", "archived"]
TagName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


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
    goal_id: uuid.UUID | None = None
    milestone_id: uuid.UUID | None = None  # the goal is filled in from the milestone if not given
    parent_task_id: uuid.UUID | None = None  # makes this a subtask (one level only)
    tags: list[TagName] = Field(default_factory=list, max_length=10)


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
    goal_id: uuid.UUID | None = None
    milestone_id: uuid.UUID | None = None
    parent_task_id: uuid.UUID | None = None
    tags: list[TagName] | None = Field(default=None, max_length=10)  # replaces the whole tag list
    position: int | None = None
    # Optimistic concurrency: the updated_at the client last saw (docs/02-api-conventions.md §6).
    if_updated_at: AwareDatetime | None = None


class TaskQuery(QueryModel):
    view: TaskView = "all"
    category_id: uuid.UUID | None = None
    goal_id: uuid.UUID | None = None
    milestone_id: uuid.UUID | None = None
    tag: str | None = Field(default=None, max_length=40)
    q: str | None = Field(default=None, max_length=200)  # search title + notes; includes subtasks
    parent_id: uuid.UUID | None = None  # list the subtasks of one task
    limit: int = Field(default=50, ge=1, le=200)
    cursor: str | None = None
