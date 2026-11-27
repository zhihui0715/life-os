"""Reminders when the app is closed: the devices that get them (push_subscriptions) and what each was sent (push_sent)

Revision ID: 0018
Revises: 0017
Create Date: 2026-11-27 18:00:00

Written by hand. Device-specific, so neither table is part of a backup. Downgrading drops both: devices stop
getting reminders from the server and keep getting them from the open app.

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0018'
down_revision = '0017'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'push_subscriptions',
        sa.Column('endpoint', sa.Text(), nullable=False),
        sa.Column('p256dh', sa.String(length=200), nullable=False),
        sa.Column('auth', sa.String(length=100), nullable=False),
        sa.Column('prefs', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('last_sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_push_subscriptions_user_id_users'), ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_push_subscriptions')),
        sa.UniqueConstraint('endpoint', name=op.f('uq_push_subscriptions_endpoint')),
    )
    with op.batch_alter_table('push_subscriptions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_push_subscriptions_user_id'), ['user_id'], unique=False)

    op.create_table(
        'push_sent',
        sa.Column('subscription_id', sa.Uuid(), nullable=False),
        sa.Column('key', sa.String(length=160), nullable=False),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['subscription_id'], ['push_subscriptions.id'], name=op.f('fk_push_sent_subscription_id_push_subscriptions'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('subscription_id', 'key', name=op.f('pk_push_sent')),
    )
    with op.batch_alter_table('push_sent', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_push_sent_sent_at'), ['sent_at'], unique=False)


def downgrade():
    with op.batch_alter_table('push_sent', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_push_sent_sent_at'))
    op.drop_table('push_sent')
    with op.batch_alter_table('push_subscriptions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_push_subscriptions_user_id'))
    op.drop_table('push_subscriptions')
