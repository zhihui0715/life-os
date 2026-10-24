"""Appearance: accent colour, background style and avatar on user_settings

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-23 22:00:00

Written by hand. Existing accounts keep today's look (blue, plain background, no avatar).

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None

ACCENTS = ("blue", "indigo", "purple", "pink", "red", "orange", "yellow", "green", "teal", "graphite")
BACKGROUNDS = ("plain", "sunrise", "ocean", "lavender", "mint", "midnight", "great-wave", "water-lilies", "bedroom",
               "plum-garden", "grande-jatte", "rainy-day", "dots", "grid", "linen")


def upgrade():
    with op.batch_alter_table('user_settings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('accent', sa.String(length=12), server_default='blue', nullable=False))
        batch_op.add_column(sa.Column('background', sa.String(length=20), server_default='plain', nullable=False))
        batch_op.add_column(sa.Column('avatar', sa.String(length=16), nullable=True))
        batch_op.create_check_constraint('accent', f'accent IN {ACCENTS}')
        batch_op.create_check_constraint('background', f'background IN {BACKGROUNDS}')


def downgrade():
    with op.batch_alter_table('user_settings', schema=None) as batch_op:
        batch_op.drop_constraint(op.f('ck_user_settings_background'), type_='check')
        batch_op.drop_constraint(op.f('ck_user_settings_accent'), type_='check')
        batch_op.drop_column('avatar')
        batch_op.drop_column('background')
        batch_op.drop_column('accent')
