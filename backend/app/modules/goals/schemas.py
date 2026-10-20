import uuid
from datetime import date
from typing import Literal

from pydantic import AwareDatetime, Field, model_validator

from app.common.validation import InputModel, QueryModel

GoalStatus = Literal["active", "paused", "completed", "abandoned"]
Horizon = Literal["short", "long"]
ProgressMode = Literal["milestones", "tasks", "manual"]


class GoalCreate(InputModel):
    id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=20_000)
    success_criteria: str | None = Field(default=None, max_length=5_000)
    category_id: uuid.UUID | None = None
    horizon: Horizon = "short"
    progress_mode: ProgressMode = "tasks"
    manual_progress: int | None = Field(default=None, ge=0, le=100)
    start_date: date | None = None
    target_date: date | None = None

    @model_validator(mode="after")
    def dates_in_order(self):
        if self.start_date and self.target_date and self.target_date < self.start_date:
            raise ValueError("target_date must not be before start_date")
        return self


class GoalPatch(InputModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=20_000)
    success_criteria: str | None = Field(default=None, max_length=5_000)
    category_id: uuid.UUID | None = None
    horizon: Horizon | None = None
    status: GoalStatus | None = None
    progress_mode: ProgressMode | None = None
    manual_progress: int | None = Field(default=None, ge=0, le=100)
    start_date: date | None = None
    target_date: date | None = None
    if_updated_at: AwareDatetime | None = None


class GoalQuery(QueryModel):
    status: GoalStatus | None = None
    include_archived: bool = False
    archived_only: bool = False


class ProgressUpdateCreate(InputModel):
    note: str | None = Field(default=None, max_length=5_000)
    progress: int | None = Field(default=None, ge=0, le=100)  # only for manual-progress goals

    @model_validator(mode="after")
    def something_to_record(self):
        if self.progress is None and not (self.note and self.note.strip()):
            raise ValueError("Provide a note or a progress value")
        return self


class MilestoneCreate(InputModel):
    title: str = Field(min_length=1, max_length=200)
    weight: int = Field(default=1, ge=1, le=100)
    target_date: date | None = None
    position: int | None = None


class MilestonePatch(InputModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    weight: int | None = Field(default=None, ge=1, le=100)
    target_date: date | None = None
    position: int | None = None
