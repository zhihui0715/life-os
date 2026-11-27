"""Repeating tasks: a repeat rule on a task, and a link from each next copy back to the task it came from

Revision ID: 0017
Revises: 0016
Create Date: 2026-11-27 16:00:00

Written by hand. Existing tasks don't repeat. The link is checked at commit (DEFERRABLE), so a backup restore can
insert tasks in any order. Downgrading drops both columns: the copies already made stay as ordinary tasks.

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0017'
down_revision = '0016'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.add_column(sa.Column('rrule', sa.String(length=300), nullable=True))
        batch_op.add_column(sa.Column('repeated_from_id', sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            op.f('fk_tasks_repeated_from_id_tasks'), 'tasks', ['repeated_from_id'], ['id'],
            ondelete='SET NULL', deferrable=True, initially='DEFERRED',
        )
        batch_op.create_index(batch_op.f('ix_tasks_repeated_from_id'), ['repeated_from_id'], unique=False)
        batch_op.create_check_constraint(op.f('ck_tasks_repeat_has_due_date'), 'rrule IS NULL OR due_date IS NOT NULL')


def downgrade():
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.drop_constraint(op.f('ck_tasks_repeat_has_due_date'), type_='check')
        batch_op.drop_index(batch_op.f('ix_tasks_repeated_from_id'))
        batch_op.drop_constraint(op.f('fk_tasks_repeated_from_id_tasks'), type_='foreignkey')
        batch_op.drop_column('repeated_from_id')
        batch_op.drop_column('rrule')
