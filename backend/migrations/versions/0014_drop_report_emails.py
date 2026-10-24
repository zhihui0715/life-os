"""Reports by email removed: drop its two settings columns

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-24 23:00:00

Written by hand. Reports are still on screen and as a PDF download; only the emailing is gone.
Downgrading brings the columns back empty (everyone's email choices start switched off).

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0014'
down_revision = '0013'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user_settings', schema=None) as batch_op:
        batch_op.drop_column('report_emails_sent')
        batch_op.drop_column('report_emails')


def downgrade():
    with op.batch_alter_table('user_settings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('report_emails', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
        batch_op.add_column(sa.Column('report_emails_sent', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
