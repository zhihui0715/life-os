"""Reports by email: which reports to send, and which were sent

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-24 20:00:00

Written by hand. Off for everyone until switched on in Settings.

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user_settings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('report_emails', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
        batch_op.add_column(sa.Column('report_emails_sent', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade():
    with op.batch_alter_table('user_settings', schema=None) as batch_op:
        batch_op.drop_column('report_emails_sent')
        batch_op.drop_column('report_emails')
