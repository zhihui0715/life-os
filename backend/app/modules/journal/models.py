from datetime import date

from sqlalchemy import CheckConstraint, Date, SmallInteger, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.common.models import IdMixin, OwnedMixin, TimestampMixin
from app.extensions import db

TEXT_FIELDS = ("body", "went_well", "to_improve", "challenges", "lessons", "gratitude", "tomorrow_priorities")


class JournalEntry(IdMixin, OwnedMixin, TimestampMixin, db.Model):
    """One entry per local day: free writing plus optional daily-review prompts and mood/energy (1–5).
    Every field is optional. Private: its text is never written to logs."""

    __tablename__ = "journal_entries"
    __table_args__ = (
        UniqueConstraint("user_id", "entry_date", name="uq_journal_entries_user_date"),
        CheckConstraint("mood IS NULL OR mood BETWEEN 1 AND 5", name="mood"),
        CheckConstraint("energy IS NULL OR energy BETWEEN 1 AND 5", name="energy"),
    )

    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    went_well: Mapped[str | None] = mapped_column(Text)
    to_improve: Mapped[str | None] = mapped_column(Text)
    challenges: Mapped[str | None] = mapped_column(Text)
    lessons: Mapped[str | None] = mapped_column(Text)
    gratitude: Mapped[str | None] = mapped_column(Text)
    tomorrow_priorities: Mapped[str | None] = mapped_column(Text)
    mood: Mapped[int | None] = mapped_column(SmallInteger)
    energy: Mapped[int | None] = mapped_column(SmallInteger)
