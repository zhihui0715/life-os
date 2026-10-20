"""Request-level security: who is logged in, default-deny for /api, CSRF check.

Beginner note: instead of remembering to add a "@login_required" decorator to every route (easy to forget),
every /api route requires login unless it is explicitly listed in PUBLIC_ENDPOINTS.
"""

import hmac

from flask import g, request, session

from app.common.errors import ApiError
from app.modules.auth.service import find_session

PUBLIC_ENDPOINTS = {"auth.login", "health.health"}
CSRF_EXEMPT_ENDPOINTS = {"auth.login"}  # no session exists yet; SameSite + JSON-only also protect it
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def current_user():
    return g.user


def load_and_enforce_auth():
    g.user = None
    g.auth_session = None
    if not request.path.startswith("/api/"):
        return

    token = session.get("sid")
    if token:
        auth_session = find_session(token)
        if auth_session:
            g.auth_session = auth_session
            g.user = auth_session.user
        else:
            session.clear()

    endpoint = request.endpoint or ""
    if g.user is None and endpoint not in PUBLIC_ENDPOINTS:
        raise ApiError(401, "unauthenticated", "Please log in.")

    if request.method not in SAFE_METHODS and endpoint not in CSRF_EXEMPT_ENDPOINTS:
        sent = request.headers.get("X-CSRF-Token", "")
        expected = g.auth_session.csrf_token if g.auth_session else ""
        if not expected or not hmac.compare_digest(sent, expected):
            raise ApiError(403, "csrf_failed", "Missing or invalid CSRF token. Reload the page and try again.")
