from app.modules.auth.service import create_user
from tests.conftest import TEST_PASSWORD, ApiClient


def test_health_is_public(anon):
    assert anon.get("/api/v1/health").get_json() == {"status": "ok"}


def test_api_requires_login(anon):
    res = anon.get("/api/v1/tasks")
    assert res.status_code == 401
    assert res.get_json()["error"]["code"] == "unauthenticated"


def test_login_success_returns_user_settings_and_csrf(anon, user):
    res = anon.login(user.email)
    body = res.get_json()
    assert res.status_code == 200
    assert body["user"]["email"] == "me@example.test"
    assert {k: body["settings"][k] for k in ("locale", "timezone", "week_start", "theme")} == {"locale": "en", "timezone": "Asia/Kuala_Lumpur", "week_start": 1, "theme": "system"}
    assert body["settings"]["working_hours"]["mon"] == [["09:00", "18:00"]]  # default until set
    assert len(body["csrf_token"]) == 64
    cookie = res.headers["Set-Cookie"]
    assert "HttpOnly" in cookie and "SameSite=Lax" in cookie


def test_login_email_is_case_insensitive(anon, user):
    assert anon.login("ME@Example.TEST").status_code == 200


def test_wrong_password_and_unknown_email_look_identical(anon, user):
    a = anon.login(user.email, "wrong-password").get_json()["error"]
    b = anon.login("nobody@example.test", "wrong-password").get_json()["error"]
    assert a["code"] == b["code"] == "invalid_credentials"
    assert a["message"] == b["message"]


def test_writes_require_csrf_token(api):
    api.csrf = "not-the-token"
    res = api.post("/api/v1/tasks", {"title": "x"})
    assert res.status_code == 403
    assert res.get_json()["error"]["code"] == "csrf_failed"


def test_logout_revokes_session(api):
    assert api.post("/api/v1/auth/logout").status_code == 200
    assert api.get("/api/v1/auth/me").status_code == 401


def test_password_is_hashed_not_stored(user):
    assert user.password_hash.startswith("$argon2id$")
    assert TEST_PASSWORD not in user.password_hash


def test_update_settings(api):
    res = api.patch("/api/v1/settings", {"locale": "zh-CN", "theme": "dark"})
    assert res.status_code == 200
    assert res.get_json()["locale"] == "zh-CN"
    assert api.get("/api/v1/auth/me").get_json()["settings"]["theme"] == "dark"


def test_invalid_settings_rejected(api):
    res = api.patch("/api/v1/settings", {"timezone": "Mars/Olympus", "locale": "fr"})
    assert res.status_code == 422
    assert set(res.get_json()["error"]["fields"]) == {"timezone", "locale"}


def test_unknown_fields_rejected(api):
    res = api.patch("/api/v1/settings", {"is_admin": True})
    assert res.status_code == 422


def test_default_categories_seeded_in_users_language(app, anon):
    create_user("zh@example.test", TEST_PASSWORD, "中文用户", "zh-CN")
    anon.login("zh@example.test")
    names = {c["name"] for c in anon.get("/api/v1/categories").get_json()["items"]}
    assert {"编程", "网络安全", "阅读"} <= names


def test_category_names_unique_case_insensitive(api):
    assert api.post("/api/v1/categories", {"name": "Guitar"}).status_code == 201
    assert api.post("/api/v1/categories", {"name": "guitar"}).status_code == 409


def test_other_users_records_are_invisible(app, api):
    task_id = api.post("/api/v1/tasks", {"title": "private"}).get_json()["id"]
    create_user("other@example.test", TEST_PASSWORD, "Other")
    other = ApiClient(app.test_client())
    other.login("other@example.test")
    assert other.get(f"/api/v1/tasks/{task_id}").status_code == 404
    assert other.patch(f"/api/v1/tasks/{task_id}", {"title": "hacked"}).status_code == 404
    assert other.get("/api/v1/tasks").get_json()["total"] == 0
