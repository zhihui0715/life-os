from typing import Literal

from flask import Blueprint, g, session
from pydantic import Field

from app.common.validation import InputModel, parse_body
from app.extensions import db, limiter
from app.modules.auth.service import authenticate, change_password, end_session, sign_up, start_session
from app.modules.settings.routes import settings_to_dict

bp = Blueprint("auth", __name__, url_prefix="/api/v1/auth")


class LoginIn(InputModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class SignupIn(InputModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)
    display_name: str = Field(min_length=1, max_length=100)
    locale: Literal["en", "zh-CN"] = "en"
    timezone: str | None = Field(default=None, max_length=64)


class PasswordIn(InputModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=1, max_length=256)


def _me_payload():
    user = g.user
    return {
        "user": {"id": str(user.id), "email": user.email, "display_name": user.display_name},
        "settings": settings_to_dict(user.settings),
        "csrf_token": g.auth_session.csrf_token,
    }


def _sign_in(user):
    token, auth_session = start_session(user)
    session.clear()  # drop anything from before login
    session["sid"] = token
    session.permanent = True
    g.user, g.auth_session = user, auth_session
    return _me_payload()


@bp.post("/login")
@limiter.limit("5 per minute")
def login():
    data = parse_body(LoginIn)
    return _sign_in(authenticate(data.email, data.password))


def _created(response) -> bool:
    return response.status_code == 201


# Anyone can sign up. Per address: a few tries a minute and a handful of new accounts a day; plus a cap on new
# accounts for the whole site each day, so a script hopping between addresses can't fill the free database.
# The daily caps count only accounts actually created, so mistyped forms don't use them up.
@bp.post("/signup")
@limiter.limit("5 per minute")
@limiter.limit("5 per day", deduct_when=_created)
@limiter.limit("100 per day", key_func=lambda: "signup-all", deduct_when=_created)
def signup():
    data = parse_body(SignupIn)
    user = sign_up(data.email, data.password, data.display_name, data.locale, data.timezone)
    return _sign_in(user), 201


@bp.post("/logout")
def logout():
    end_session(g.auth_session)
    session.clear()
    return {"ok": True}


@bp.post("/password")
@limiter.limit("5 per minute")
def password():
    data = parse_body(PasswordIn)
    change_password(g.user, data.current_password, data.new_password, keep=g.auth_session)
    return {"ok": True}


@bp.get("/me")
def me():
    db.session.refresh(g.user)
    return _me_payload()
