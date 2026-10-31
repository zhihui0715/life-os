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
    assert {k: body["settings"][k] for k in ("locale", "timezone", "week_start", "theme")} == {"locale": "en", "timezone": "Asia/Kuala_Lumpur", "week_start": 1, "theme": "aurora"}
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


def test_set_password_signs_out_everywhere(app, api, user):
    from app.modules.auth.service import set_password
    from tests.conftest import ApiClient

    other_device = ApiClient(app.test_client())
    assert other_device.login(user.email).status_code == 200
    set_password(user.email, "a-brand-new-password")
    assert api.get("/api/v1/tasks").status_code == 401
    assert other_device.get("/api/v1/tasks").status_code == 401
    assert ApiClient(app.test_client()).login(user.email).status_code == 401  # old password
    assert ApiClient(app.test_client()).login(user.email, "a-brand-new-password").status_code == 200


def test_set_password_rejects_short_or_unknown(app, user):
    import pytest

    from app.modules.auth.service import set_password

    with pytest.raises(ValueError):
        set_password(user.email, "short")
    with pytest.raises(ValueError):
        set_password("nobody@example.test", "long-enough-password")


def test_appearance_settings(api):
    s = api.get("/api/v1/settings").get_json()
    assert (s["accent"], s["background"], s["avatar"]) == ("blue", "plain", None)
    res = api.patch("/api/v1/settings", {"accent": "purple", "background": "great-wave", "avatar": "book-2"})
    assert res.status_code == 200, res.get_json()
    assert (res.get_json()["accent"], res.get_json()["background"], res.get_json()["avatar"]) == ("purple", "great-wave", "book-2")
    assert api.patch("/api/v1/settings", {"avatar": ""}).get_json()["avatar"] is None
    assert api.patch("/api/v1/settings", {"accent": "neon"}).status_code == 422
    assert api.patch("/api/v1/settings", {"background": "space"}).status_code == 422
    assert api.patch("/api/v1/settings", {"avatar": "Bob"}).status_code == 422


def test_academia_theme_and_scenes(api):
    res = api.patch("/api/v1/settings", {"theme": "academia", "background": "library"})
    assert res.status_code == 200, res.get_json()
    assert (res.get_json()["theme"], res.get_json()["background"]) == ("academia", "library")
    assert api.patch("/api/v1/settings", {"theme": "cosmos"}).status_code == 422
    assert api.patch("/api/v1/settings", {"background": "saturn"}).status_code == 422


def test_glass_themes(api):
    for theme in ("aurora", "midnight", "sunset", "ocean", "forest", "rose", "mono", "cyber", "light"):
        res = api.patch("/api/v1/settings", {"theme": theme})
        assert res.status_code == 200 and res.get_json()["theme"] == theme, res.get_json()
    assert api.patch("/api/v1/settings", {"theme": "glass"}).status_code == 422


def test_book_avatars(api):
    assert api.patch("/api/v1/settings", {"avatar": "book-3"}).get_json()["avatar"] == "book-3"
    assert api.patch("/api/v1/settings", {"avatar": "book-9"}).status_code == 422
    assert api.patch("/api/v1/settings", {"avatar": "book"}).status_code == 422
    assert api.patch("/api/v1/settings", {"avatar": "🦊"}).status_code == 422  # emoji avatars are gone


def test_change_password_keeps_this_device_and_signs_out_others(app, api, user):
    other = ApiClient(app.test_client())
    assert other.login(user.email).status_code == 200

    wrong = api.post("/api/v1/auth/password", {"current_password": "nope", "new_password": "a-brand-new-password"})
    assert wrong.status_code == 400 and wrong.get_json()["error"]["code"] == "wrong_password"
    short = api.post("/api/v1/auth/password", {"current_password": TEST_PASSWORD, "new_password": "short"})
    assert short.status_code == 422 and "new_password" in short.get_json()["error"]["fields"]

    assert api.post("/api/v1/auth/password", {"current_password": TEST_PASSWORD, "new_password": "a-brand-new-password"}).status_code == 200
    assert api.get("/api/v1/auth/me").status_code == 200  # this device stays signed in
    assert other.get("/api/v1/auth/me").status_code == 401  # the other one is signed out
    assert ApiClient(app.test_client()).login(user.email).status_code == 401  # old password no longer works
    assert ApiClient(app.test_client()).login(user.email, "a-brand-new-password").status_code == 200


def _signup(anon, **overrides):
    body = {"email": "new@example.test", "password": TEST_PASSWORD, "display_name": "New Person", **overrides}
    res = anon.client.post("/api/v1/auth/signup", json=body)
    if res.status_code == 201:
        anon.csrf = res.get_json()["csrf_token"]
    return res


def test_signup_creates_account_and_signs_in(anon):
    res = _signup(anon, email=" New@Example.TEST ", locale="zh-CN", timezone="Europe/London")
    assert res.status_code == 201
    body = res.get_json()
    assert body["user"]["email"] == "new@example.test"
    assert body["user"]["display_name"] == "New Person"
    assert body["settings"]["locale"] == "zh-CN"
    assert body["settings"]["timezone"] == "Europe/London"
    assert anon.get("/api/v1/auth/me").status_code == 200
    names = {c["name"] for c in anon.get("/api/v1/categories").get_json()["items"]}
    assert "阅读" in names  # default categories in the chosen language


def test_signup_unknown_timezone_falls_back_to_default(anon):
    res = _signup(anon, timezone="Mars/Olympus")
    assert res.get_json()["settings"]["timezone"] == "Asia/Kuala_Lumpur"


def test_signup_rejects_taken_email(anon, user):
    res = _signup(anon, email="ME@example.test")
    assert res.status_code == 409
    assert res.get_json()["error"]["fields"]["email"][0]["type"] == "email_taken"


def test_signup_rejects_short_password_and_bad_email(anon):
    short = _signup(anon, password="short")
    assert short.status_code == 422
    assert short.get_json()["error"]["fields"]["password"][0]["type"] == "password_too_short"
    assert _signup(anon, email="not-an-email").get_json()["error"]["fields"]["email"][0]["type"] == "email"
    assert _signup(anon, display_name="   ").status_code == 422


def test_signup_cannot_set_other_fields(anon):
    assert _signup(anon, is_active=False).status_code == 422


def test_new_account_sees_none_of_another_users_data(api, app):
    api.post("/api/v1/tasks", {"title": "Mine only"})
    other = ApiClient(app.test_client())
    assert _signup(other).status_code == 201
    assert other.get("/api/v1/tasks").get_json()["items"] == []
