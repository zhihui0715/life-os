from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.common.models import IdMixin, OwnedMixin, TimestampMixin
from app.extensions import db

CATEGORY_KINDS = ("general", "learning")


class Category(IdMixin, OwnedMixin, TimestampMixin, db.Model):
    __tablename__ = "categories"
    __table_args__ = (
        CheckConstraint(f"kind IN {CATEGORY_KINDS}", name="kind"),
        CheckConstraint("color ~ '^#[0-9A-Fa-f]{6}$'", name="color_hex"),
    )

    name: Mapped[str] = mapped_column(String(60), nullable=False)
    # "learning" categories feed the learning-time metrics (Stage 4/5).
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="general", server_default="general")
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#64748B", server_default="#64748B")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# Case-insensitive uniqueness per user: "Reading" and "reading" are the same category.
Index("uq_categories_user_id_lower_name", Category.user_id, func.lower(Category.name), unique=True)
