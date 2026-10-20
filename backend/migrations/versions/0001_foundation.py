"""Stage 1 foundation: users, user_settings, auth_sessions, categories, tasks.

Revision ID: 0001
Revises:
Create Date: 2026-10-20
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def _timestamps():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )

    op.create_table(
        "user_settings",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("locale", sa.String(10), server_default="en", nullable=False),
        sa.Column("timezone", sa.String(64), server_default="Asia/Kuala_Lumpur", nullable=False),
        sa.Column("week_start", sa.SmallInteger(), server_default="1", nullable=False),
        sa.Column("theme", sa.String(10), server_default="system", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("locale IN ('en', 'zh-CN')", name="ck_user_settings_locale"),
        sa.CheckConstraint("theme IN ('system', 'light', 'dark')", name="ck_user_settings_theme"),
        sa.CheckConstraint("week_start BETWEEN 1 AND 7", name="ck_user_settings_week_start"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_user_settings_user_id_users", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", name="pk_user_settings"),
    )

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("csrf_token", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_auth_sessions_user_id_users", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_auth_sessions"),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])

    op.create_table(
        "categories",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("kind", sa.String(20), server_default="general", nullable=False),
        sa.Column("color", sa.String(7), server_default="#64748B", nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.CheckConstraint("kind IN ('general', 'learning')", name="ck_categories_kind"),
        sa.CheckConstraint("color ~ '^#[0-9A-Fa-f]{6}$'", name="ck_categories_color_hex"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_categories_user_id_users", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name="pk_categories"),
    )
    op.create_index("ix_categories_user_id", "categories", ["user_id"])
    op.create_index(
        "uq_categories_user_id_lower_name", "categories", ["user_id", sa.text("lower(name)")], unique=True
    )

    op.create_table(
        "tasks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("status", sa.String(12), server_default="inbox", nullable=False),
        sa.Column("priority", sa.SmallInteger(), server_default="3", nullable=False),
        sa.Column("due_date", sa.Date()),
        sa.Column("deadline", sa.DateTime(timezone=True)),
        sa.Column("estimate_minutes", sa.Integer()),
        sa.Column("actual_minutes_manual", sa.Integer()),
        sa.Column("category_id", sa.Uuid()),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.CheckConstraint("status IN ('inbox', 'todo', 'in_progress', 'done')", name="ck_tasks_status"),
        sa.CheckConstraint("priority BETWEEN 1 AND 4", name="ck_tasks_priority"),
        sa.CheckConstraint("estimate_minutes IS NULL OR estimate_minutes >= 0", name="ck_tasks_estimate_non_negative"),
        sa.CheckConstraint(
            "actual_minutes_manual IS NULL OR actual_minutes_manual >= 0", name="ck_tasks_actual_non_negative"
        ),
        sa.CheckConstraint("(status = 'done') = (completed_at IS NOT NULL)", name="ck_tasks_done_has_completed_at"),
        sa.ForeignKeyConstraint(
            ["category_id"], ["categories.id"], name="fk_tasks_category_id_categories", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_tasks_user_id_users", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name="pk_tasks"),
    )
    op.create_index("ix_tasks_user_id", "tasks", ["user_id"])
    op.create_index("ix_tasks_category_id", "tasks", ["category_id"])
    op.create_index("ix_tasks_user_status_due", "tasks", ["user_id", "status", "due_date"])


def downgrade():
    # Reverse order of creation. Only ever run against a database you have backed up.
    op.drop_table("tasks")
    op.drop_table("categories")
    op.drop_table("auth_sessions")
    op.drop_table("user_settings")
    op.drop_table("users")
