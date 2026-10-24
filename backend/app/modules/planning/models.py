from datetime import date, datetime

from sqlalchemy import Date, DateTime, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.common.models import IdMixin, OwnedMixin, TimestampMixin
from app.extensions import db


class WeeklyReview(IdMixin, OwnedMixin, TimestampMixin, db.Model):
    """One review per week (keyed by the week's first day in your week-start setting): what went well, what to
    improve, one lesson, and up to three priorities for the next week. Private: its text is never logged."""

    __tablename__ = "weekly_reviews"
    __table_args__ = (UniqueConstraint("user_id", "week_start", name="uq_weekly_reviews_user_week"),)

    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    went_well: Mapped[str | None] = mapped_column(Text)
    to_improve: Mapped[str | None] = mapped_column(Text)
    lesson: Mapped[str | None] = mapped_column(Text)
    priorities: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
