"""Stage 9: production serving of the built frontend, and security headers."""

import pytest

from app import create_app
from app.config import TestingConfig, _db_url


@pytest.fixture
def web(tmp_path, monkeypatch):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><div id=root></div>")
    (tmp_path / "assets" / "index-abc123.js").write_text("console.log(1)")
    (tmp_path / "sw.js").write_text("// sw")
    monkeypatch.setattr(TestingConfig, "FRONTEND_DIST", str(tmp_path))
    return create_app("testing").test_client()


def test_spa_routes_get_index_with_strict_csp(web):
    for path in ("/", "/tasks", "/goals/123", "/settings"):
        res = web.get(path)
        assert res.status_code == 200 and b"id=root" in res.data, path
        csp = res.headers["Content-Security-Policy"]
        assert "script-src 'self'" in csp and "frame-ancestors 'none'" in csp
        assert res.headers["Cache-Control"] == "no-cache"


def test_hashed_assets_are_cached_and_the_service_worker_is_not(web):
    asset = web.get("/assets/index-abc123.js")
    assert asset.status_code == 200 and "immutable" in asset.headers["Cache-Control"]
    assert "Content-Security-Policy" not in asset.headers
    assert web.get("/sw.js").headers["Cache-Control"] == "no-cache"


def test_unknown_api_route_is_json_404_not_the_app(web):
    res = web.get("/api/v1/nope")  # not logged in: the API's own JSON error, never the app's HTML
    assert res.status_code == 401 and res.is_json and b"id=root" not in res.data


def test_api_responses_are_never_cached(api):
    res = api.get("/api/v1/tasks")
    assert res.headers["Cache-Control"] == "no-store"
    assert res.headers["X-Frame-Options"] == "DENY" and res.headers["X-Content-Type-Options"] == "nosniff"
    assert "Strict-Transport-Security" not in res.headers  # only when cookies are HTTPS-only (production)


def test_missing_build_fails_fast(tmp_path, monkeypatch):
    monkeypatch.setattr(TestingConfig, "FRONTEND_DIST", str(tmp_path / "missing"))
    with pytest.raises(RuntimeError, match="Build the frontend"):
        create_app("testing")


def test_host_database_urls_are_normalised():
    assert _db_url("postgres://u:p@h:5432/db") == "postgresql+psycopg://u:p@h:5432/db"
    assert _db_url("postgresql://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert _db_url("postgresql+psycopg://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
