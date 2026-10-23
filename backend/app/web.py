"""Production web layer (Stage 9): serve the built frontend from Flask, and set security headers on every response.

In development Vite serves the frontend and forwards /api here, so FRONTEND_DIST is unset and nothing below the
headers applies. In the container, FRONTEND_DIST points at the built app (frontend/dist), and one server answers both:
  /api/...        → the API (never cached: personal data)
  /assets/...     → hashed JS/CSS, cached for a year (a new build gets new file names)
  other files     → index.html, sw.js, manifest… revalidated every time so updates are picked up
  any other path  → index.html (the React router handles /tasks, /settings, …)
"""

from pathlib import Path

from flask import Blueprint, current_app, request, send_from_directory
from werkzeug.exceptions import NotFound

# The app loads nothing from other sites, so the policy can be strict: no inline scripts, no third-party code.
# style-src needs 'unsafe-inline' for style="" attributes set by React components and the calendar library.
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])

bp = Blueprint("web", __name__)


def _dist() -> Path:
    return Path(current_app.config["FRONTEND_DIST"])


@bp.get("/", defaults={"path": ""})
@bp.get("/<path:path>")
def frontend(path: str):
    if path.startswith("api/"):
        raise NotFound()  # unknown API routes get the JSON 404, never the app's HTML
    dist = _dist()
    if path and (dist / path).is_file():
        response = send_from_directory(dist, path)
    else:
        response = send_from_directory(dist, "index.html")
    immutable = path.startswith("assets/")
    response.headers["Cache-Control"] = "public, max-age=31536000, immutable" if immutable else "no-cache"
    return response


def security_headers(response):
    h = response.headers
    h["X-Content-Type-Options"] = "nosniff"
    h["Referrer-Policy"] = "same-origin"
    h["X-Frame-Options"] = "DENY"
    h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"
    h["Cross-Origin-Opener-Policy"] = "same-origin"
    if response.mimetype == "text/html":
        h["Content-Security-Policy"] = CSP
    if current_app.config.get("SESSION_COOKIE_SECURE"):
        h["Strict-Transport-Security"] = "max-age=31536000"  # HTTPS only from now on (production)
    if request.path.startswith("/api/"):
        h["Cache-Control"] = "no-store"  # personal data must not sit in shared caches
    return response


def init_web(app) -> None:
    app.after_request(security_headers)
    if app.config.get("FRONTEND_DIST"):
        if not (Path(app.config["FRONTEND_DIST"]) / "index.html").is_file():
            raise RuntimeError(f"FRONTEND_DIST={app.config['FRONTEND_DIST']} has no index.html. Build the frontend first.")
        app.register_blueprint(bp)
    if app.config.get("TRUST_PROXY"):
        # Behind the host's HTTPS proxy: trust its X-Forwarded-For/Proto (one hop), so the rate limiter sees real
        # client addresses and Flask knows the request was HTTPS.
        from werkzeug.middleware.proxy_fix import ProxyFix

        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
