"""Replace AI assistance with planning: drop ai_runs and the AI settings, add weekly_reviews

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-23 21:00:00

Written by hand. Saved AI runs are deleted (the feature is gone). Downgrade recreates the AI columns with their
defaults and an empty ai_runs table, so 0006's downgrade still works.

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('weekly_reviews',
    sa.Column('week_start', sa.Date(), nullable=False),
    sa.Column('went_well', sa.Text(), nullable=True),
    sa.Column('to_improve', sa.Text(), nullable=True),
    sa.Column('lesson', sa.Text(), nullable=True),
    sa.Column('priorities', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_weekly_reviews_user_id_users'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_weekly_reviews')),
    sa.UniqueConstraint('user_id', 'week_start', name='uq_weekly_reviews_user_week')
    )
    with op.batch_alter_table('weekly_reviews', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_weekly_reviews_user_id'), ['user_id'], unique=False)

    with op.batch_alter_table('ai_runs', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_ai_runs_user_id'))
        batch_op.drop_index('ix_ai_runs_user_created')
    op.drop_table('ai_runs')

    with op.batch_alter_table('user_settings', schema=None) as batch_op:
        batch_op.drop_constraint(op.f('ck_user_settings_ai_budget'), type_='check')
        batch_op.drop_column('ai_monthly_token_budget')
        batch_op.drop_column('ai_enabled')


def downgrade():
    with op.batch_alter_table('user_settings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('ai_enabled', sa.Boolean(), server_default='false', nullable=False))
        batch_op.add_column(sa.Column('ai_monthly_token_budget', sa.Integer(), server_default='300000', nullable=False))
        batch_op.create_check_constraint('ai_budget', 'ai_monthly_token_budget BETWEEN 0 AND 10000000')

    op.create_table('ai_runs',
    sa.Column('kind', sa.String(length=20), nullable=False),
    sa.Column('data_categories_sent', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('provider', sa.String(length=30), nullable=False),
    sa.Column('model', sa.String(length=80), nullable=False),
    sa.Column('input_tokens', sa.Integer(), server_default='0', nullable=False),
    sa.Column('output_tokens', sa.Integer(), server_default='0', nullable=False),
    sa.Column('status', sa.String(length=8), nullable=False),
    sa.Column('error_code', sa.String(length=40), nullable=True),
    sa.Column('response', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.CheckConstraint("kind IN ('daily_plan', 'weekly_review')", name=op.f('ck_ai_runs_kind')),
    sa.CheckConstraint("status IN ('ok', 'error')", name=op.f('ck_ai_runs_status')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_ai_runs_user_id_users'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_ai_runs'))
    )
    with op.batch_alter_table('ai_runs', schema=None) as batch_op:
        batch_op.create_index('ix_ai_runs_user_created', ['user_id', 'created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_ai_runs_user_id'), ['user_id'], unique=False)

    with op.batch_alter_table('weekly_reviews', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_weekly_reviews_user_id'))
    op.drop_table('weekly_reviews')
