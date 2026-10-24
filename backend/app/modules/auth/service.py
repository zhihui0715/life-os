import hashlib
import secrets
from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from flask import current_app
from sqlalchemy import delete, select

from app.common.errors import ApiError
from app.common.models import utcnow
from app.extensions import db
from app.modules.auth.models import LOCALES, AuthSession, User, UserSettings
from app.modules.categories.service import seed_default_categories

_hasher = PasswordHasher()  # Argon2id with library-recommended parameters
# Used when the email is unknown, so a failed login takes the same time either way.
_DUMMY_HASH = _hasher.hash("timing-equaliser")

MIN_PASSWORD_LENGTH = 10


def normalise_email(email: str) -> str:
    return email.strip().lower()


def create_user(email: str, password: str, display_name: str, locale: str = "en") -> User:
    email = normalise_email(email)
    if "@" not in email:
        raise ValueError("Invalid email address.")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    if locale not in LOCALES:
        raise ValueError(f"Locale must be one of {LOCALES}.")
    if db.session.scalar(select(User).where(User.email == email)):
        raise ValueError("A user with this email already exists.")

    user = User(email=email, password_hash=_hasher.hash(password), display_name=display_name.strip())
    user.settings = UserSettings(locale=locale)
    db.session.add(user)
    db.session.flush()  # assigns user.id inside this transaction
    seed_default_categories(user.id, locale)
    db.session.commit()
    return user


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def authenticate(email: str, password: str) -> User:
    user = db.session.scalar(select(User).where(User.email == normalise_email(email)))
    try:
        _hasher.verify(user.password_hash if user else _DUMMY_HASH, password)
    except (VerificationError, InvalidHashError):
        user = None
    if not user or not user.is_active:
        # Same message whether the email or the password was wrong.
        raise ApiError(401, "invalid_credentials", "Email or password is incorrect.")
    if _hasher.check_needs_rehash(user.password_hash):
        user.password_hash = _hasher.hash(password)
    return user


def start_session(user: User) -> tuple[str, AuthSession]:
    """Returns (raw token for the cookie, stored session row)."""
    token = secrets.token_urlsafe(32)
    now = utcnow()
    auth_session = AuthSession(
        id=_hash_token(token),
        user_id=user.id,
        csrf_token=secrets.token_hex(32),
        created_at=now,
        last_seen_at=now,
        expires_at=now + current_app.permanent_session_lifetime,
    )
    user.last_login_at = now
    db.session.add(auth_session)
    # Opportunistic cleanup of this user's expired sessions.
    db.session.execute(delete(AuthSession).where(AuthSession.user_id == user.id, AuthSession.expires_at < now))
    db.session.commit()
    return token, auth_session


def find_session(token: str) -> AuthSession | None:
    auth_session = db.session.get(AuthSession, _hash_token(token))
    if not auth_session or auth_session.expires_at <= utcnow() or not auth_session.user.is_active:
        return None
    # Avoid a database write on every request: refresh "last seen" at most every 10 minutes.
    if utcnow() - auth_session.last_seen_at > timedelta(minutes=10):
        auth_session.last_seen_at = utcnow()
        db.session.commit()
    return auth_session


def end_session(auth_session: AuthSession) -> None:
    db.session.delete(auth_session)
    db.session.commit()


def change_password(user: User, current: str, new: str, keep: AuthSession) -> None:
    """Change your own password from Settings. Every other device is signed out; this one stays signed in."""
    try:
        _hasher.verify(user.password_hash, current)
    except (VerificationError, InvalidHashError):
        raise ApiError(400, "wrong_password", "Current password is incorrect.",
                       fields={"current_password": [{"type": "wrong_password", "message": "Incorrect"}]})
    if len(new) < MIN_PASSWORD_LENGTH:
        raise ApiError(422, "validation_error", "Password is too short.",
                       fields={"new_password": [{"type": "password_too_short", "message": f"At least {MIN_PASSWORD_LENGTH} characters"}]})
    user.password_hash = _hasher.hash(new)
    db.session.execute(delete(AuthSession).where(AuthSession.user_id == user.id, AuthSession.id != keep.id))
    db.session.commit()


def set_password(email: str, password: str) -> User:
    """Change a password (CLI only) and sign every device out, so an old or leaked password stops working at once."""
    user = db.session.scalar(select(User).where(User.email == normalise_email(email)))
    if user is None:
        raise ValueError("No user with this email.")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    user.password_hash = _hasher.hash(password)
    db.session.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    db.session.commit()
    return user
