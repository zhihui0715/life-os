"""Stage 5: score weights, learning target, dashboard layout

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-20 19:45:22.656902

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade():

    with op.batch_alter_table('user_settings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('score_weights', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
        batch_op.add_column(sa.Column('weekly_learning_target_min', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('dashboard_layout', postgresql.JSONB(astext_type=sa.Text()), nullable=True))




def downgrade():

    with op.batch_alter_table('user_settings', schema=None) as batch_op:
        batch_op.drop_column('dashboard_layout')
        batch_op.drop_column('weekly_learning_target_min')
        batch_op.drop_column('score_weights')


