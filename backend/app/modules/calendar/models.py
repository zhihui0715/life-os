import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.common.models import IdMixin, OwnedMixin, TimestampMixin
from app.extensions import db

EVENT_KINDS = ("appointment", "task_block", "preference")


class ScheduleEvent(IdMixin, OwnedMixin, TimestampMixin, db.Model):
    """A calendar entry. kind:
    - appointment: a fixed commitment (hard constraint by default)
    - task_block:  time set aside to work on a task (always linked to a task)
    - preference:  a soft window such as "preferred study hours" — never counts as busy
    Recurring events store an RFC 5545 RRULE plus the timezone they were created in, and are expanded on read."""

    __tablename__ = "schedule_events"
    __table_args__ = (
        CheckConstraint(f"kind IN {EVENT_KINDS}", name="kind"),
        CheckConstraint("ends_at > starts_at", name="ends_after_starts"),
        CheckConstraint("kind <> 'task_block' OR task_id IS NOT NULL", name="task_block_has_task"),
        Index("ix_schedule_events_user_starts", "user_id", "starts_at"),
        Index("ix_schedule_events_user_until", "user_id", "recurrence_until"),
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(12), nullable=False, default="appointment", server_default="appointment")
    is_hard: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    all_day: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    tzid: Mapped[str] = mapped_column(String(64), nullable=False)
    rrule: Mapped[str | None] = mapped_column(String(300))
    # End of the whole series (last occurrence's end); NULL = repeats forever. Lets range queries skip old series.
    recurrence_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    task_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("tasks.id", ondelete="SET NULL"), index=True)
    category_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("categories.id", ondelete="SET NULL"))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    exceptions: Mapped[list["EventException"]] = relationship(
        back_populates="event", cascade="all, delete-orphan", lazy="selectin"
    )


class EventException(IdMixin, db.Model):
    """One changed or cancelled occurrence of a recurring event ("edit only this one")."""

    __tablename__ = "event_exceptions"
    __table_args__ = (
        UniqueConstraint("event_id", "original_start", name="uq_event_exceptions_event_original"),
        CheckConstraint(
            "is_cancelled OR (override_starts_at IS NOT NULL AND override_ends_at IS NOT NULL "
            "AND override_ends_at > override_starts_at)",
            name="override_or_cancelled",
        ),
    )

    # CASCADE: an exception means nothing without its series.
    event_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("schedule_events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    original_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    override_starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    override_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    override_title: Mapped[str | None] = mapped_column(String(200))

    event: Mapped[ScheduleEvent] = relationship(back_populates="exceptions")
