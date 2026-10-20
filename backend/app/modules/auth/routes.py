from flask import Blueprint, g, session
from pydantic import Field

from app.common.validation import InputModel, parse_body
from app.extensions import db, limiter
from app.modules.auth.service import authenticate, end_session, start_session
from app.modules.settings.routes import settings_to_dict

bp = Blueprint("auth", __name__, url_prefix="/api/v1/auth")


class LoginIn(InputModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)


def _me_payload():
    user = g.user
    return {
        "user": {"id": str(user.id), "email": user.email, "display_name": user.display_name},
        "settings": settings_to_dict(user.settings),
        "csrf_token": g.auth_session.csrf_token,
    }


@bp.post("/login")
@limiter.limit("5 per minute")
def login():
    data = parse_body(LoginIn)
    user = authenticate(data.email, data.password)
    token, auth_session = start_session(user)
    session.clear()  # drop anything from before login
    session["sid"] = token
    session.permanent = True
    g.user, g.auth_session = user, auth_session
    return _me_payload()


@bp.post("/logout")
def logout():
    end_session(g.auth_session)
    session.clear()
    return {"ok": True}


@bp.get("/me")
def me():
    db.session.refresh(g.user)
    return _me_payload()
