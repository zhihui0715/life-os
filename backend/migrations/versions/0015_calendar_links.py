"""Calendar links: a private feed to subscribe to from Google, and a Google calendar address to show

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-30 21:00:00

Written by hand. Both columns start empty (nothing linked); downgrading drops them.

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0015'
down_revision = '0014'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user_settings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('calendar_feed_token', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('google_ics_url', sa.Text(), nullable=True))
        batch_op.create_unique_constraint('uq_user_settings_calendar_feed_token', ['calendar_feed_token'])


def downgrade():
    with op.batch_alter_table('user_settings', schema=None) as batch_op:
        batch_op.drop_constraint('uq_user_settings_calendar_feed_token', type_='unique')
        batch_op.drop_column('google_ics_url')
        batch_op.drop_column('calendar_feed_token')
