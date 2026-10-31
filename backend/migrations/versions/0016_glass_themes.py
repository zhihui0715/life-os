"""Glass themes: eight palettes become the default look; system/light/dark stay as "Classic"

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-31 12:00:00

Written by hand. The glass look replaces the iOS look as the default, so accounts on a Classic setting move to the
nearest glass palette (dark → Midnight, light/system → Aurora); Academia stays where it is. Downgrade sends every
light palette back to light and every dark one to dark.

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '0016'
down_revision = '0015'
branch_labels = None
depends_on = None

CLASSIC = ("system", "light", "dark", "academia")
LIGHT_GLASS = ("aurora", "sunset", "rose", "mono")
DARK_GLASS = ("midnight", "ocean", "forest", "cyber")


def _themes(allowed, default):
    with op.batch_alter_table('user_settings', schema=None) as batch_op:
        batch_op.drop_constraint(op.f('ck_user_settings_theme'), type_='check')
        batch_op.create_check_constraint(op.f('ck_user_settings_theme'), f'theme IN {allowed}')
        batch_op.alter_column('theme', server_default=default)


def upgrade():
    _themes(CLASSIC + LIGHT_GLASS + DARK_GLASS, 'aurora')
    op.execute("UPDATE user_settings SET theme = 'midnight' WHERE theme = 'dark'")
    op.execute("UPDATE user_settings SET theme = 'aurora' WHERE theme IN ('light', 'system')")


def downgrade():
    op.execute(f"UPDATE user_settings SET theme = 'light' WHERE theme IN {LIGHT_GLASS}")
    op.execute(f"UPDATE user_settings SET theme = 'dark' WHERE theme IN {DARK_GLASS}")
    _themes(CLASSIC, 'system')
