"""Cosmos: a space theme, and the space scenes it draws behind the cards

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-24 12:00:00

Written by hand. Only widens two check constraints; existing accounts keep their look.

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None

THEMES = ("system", "light", "dark")
BACKGROUNDS = ("plain", "sunrise", "ocean", "lavender", "mint", "midnight", "great-wave", "water-lilies", "bedroom",
               "plum-garden", "grande-jatte", "rainy-day", "dots", "grid", "linen")
SCENES = ("nebula", "saturn", "aurora", "deep-field", "eclipse")


# 0001 named the theme check with the prefix twice (the naming convention added it again); it gets the plain name
# the model uses from here on, and the old one back on downgrade.
OLD_THEME_CHECK = 'ck_user_settings_ck_user_settings_theme'
THEME_CHECK = 'ck_user_settings_theme'


def _constraints(themes, backgrounds, drop_theme, create_theme):
    with op.batch_alter_table('user_settings', schema=None) as batch_op:
        batch_op.drop_constraint(op.f(drop_theme), type_='check')
        batch_op.drop_constraint(op.f('ck_user_settings_background'), type_='check')
        batch_op.create_check_constraint(op.f(create_theme), f'theme IN {themes}')
        batch_op.create_check_constraint('background', f'background IN {backgrounds}')


def upgrade():
    _constraints(THEMES + ("cosmos",), BACKGROUNDS + SCENES, OLD_THEME_CHECK, THEME_CHECK)


def downgrade():
    op.execute("UPDATE user_settings SET theme = 'dark' WHERE theme = 'cosmos'")
    op.execute(f"UPDATE user_settings SET background = 'plain' WHERE background IN {SCENES}")
    _constraints(THEMES, BACKGROUNDS, THEME_CHECK, OLD_THEME_CHECK)
