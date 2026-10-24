"""Academia replaces Cosmos: the theme and its scenes

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-24 18:00:00

Written by hand. Accounts on Cosmos move to Academia in its Library scene (dark, like the space scenes were).

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None

BASE_THEMES = ("system", "light", "dark")
BASE_BACKGROUNDS = ("plain", "sunrise", "ocean", "lavender", "mint", "midnight", "great-wave", "water-lilies", "bedroom",
                    "plum-garden", "grande-jatte", "rainy-day", "dots", "grid", "linen")
SPACE = ("nebula", "saturn", "aurora", "deep-field", "eclipse")
ACADEMIA = ("library", "chalkboard", "observatory", "parchment", "botanical")


def _constraints(theme, scenes):
    with op.batch_alter_table('user_settings', schema=None) as batch_op:
        batch_op.drop_constraint(op.f('ck_user_settings_theme'), type_='check')
        batch_op.drop_constraint(op.f('ck_user_settings_background'), type_='check')
        batch_op.create_check_constraint(op.f('ck_user_settings_theme'), f'theme IN {BASE_THEMES + (theme,)}')
        batch_op.create_check_constraint('background', f'background IN {BASE_BACKGROUNDS + scenes}')


def upgrade():
    # widen first so both old and new values are allowed while the rows move
    _constraints_both()
    op.execute("UPDATE user_settings SET theme = 'academia' WHERE theme = 'cosmos'")
    op.execute(f"UPDATE user_settings SET background = 'library' WHERE background IN {SPACE}")
    _constraints('academia', ACADEMIA)


def downgrade():
    _constraints_both()
    op.execute("UPDATE user_settings SET theme = 'cosmos' WHERE theme = 'academia'")
    op.execute(f"UPDATE user_settings SET background = 'nebula' WHERE background IN {ACADEMIA}")
    _constraints('cosmos', SPACE)


def _constraints_both():
    with op.batch_alter_table('user_settings', schema=None) as batch_op:
        batch_op.drop_constraint(op.f('ck_user_settings_theme'), type_='check')
        batch_op.drop_constraint(op.f('ck_user_settings_background'), type_='check')
        batch_op.create_check_constraint(op.f('ck_user_settings_theme'), f"theme IN {BASE_THEMES + ('cosmos', 'academia')}")
        batch_op.create_check_constraint('background', f'background IN {BASE_BACKGROUNDS + SPACE + ACADEMIA}')
