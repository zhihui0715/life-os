"""Avatars are book characters only: clear emoji avatars

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-24 22:00:00

Written by hand. Anyone who had picked an emoji goes back to their initial until they pick a book.

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '0013'
down_revision = '0012'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("UPDATE user_settings SET avatar = NULL WHERE avatar IS NOT NULL AND avatar !~ '^book-[1-8]$'")


def downgrade():
    pass  # the emojis that were cleared are not kept
