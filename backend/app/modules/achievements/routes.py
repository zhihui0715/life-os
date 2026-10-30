from flask import Blueprint

from app.common.auth import current_user
from app.modules.achievements import service

bp = Blueprint("achievements", __name__, url_prefix="/api/v1/achievements")


@bp.get("")
def list_achievements():
    return service.achievements(current_user())
