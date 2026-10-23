"""Stage 8: Idempotency-Key — a replayed offline write is answered from storage, never applied twice."""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import update

from app.common.models_idempotency import IdempotencyKey
from app.extensions import db


def send(api, method, url, json=None, key=None):
    headers = {"X-CSRF-Token": api.csrf}
    if key:
        headers["Idempotency-Key"] = key
    return api.client.open(url, method=method, json=json, headers=headers)


def test_replayed_quick_capture_creates_one_task(api):
    key = str(uuid.uuid4())
    body = {"id": str(uuid.uuid4()), "title": "Buy milk"}
    first = send(api, "POST", "/api/v1/tasks", body, key)
    again = send(api, "POST", "/api/v1/tasks", body, key)
    assert first.status_code == again.status_code == 201
    assert again.get_json() == first.get_json() and again.headers["Idempotent-Replay"] == "true"
    assert len(api.get("/api/v1/tasks?view=inbox").get_json()["items"]) == 1


def test_replayed_complete_returns_the_first_success(api):
    task = api.post("/api/v1/tasks", {"title": "Essay", "status": "todo"}).get_json()
    key = str(uuid.uuid4())
    first = send(api, "POST", f"/api/v1/tasks/{task['id']}/complete", key=key)
    again = send(api, "POST", f"/api/v1/tasks/{task['id']}/complete", key=key)
    assert first.status_code == again.status_code == 200
    assert again.get_json() == first.get_json() and again.headers["Idempotent-Replay"] == "true"


def test_replayed_habit_check_in(api):
    habit = api.post("/api/v1/habits", {"name": "Read"}).get_json()
    today = habit["last7"][-1]["date"]
    key = str(uuid.uuid4())
    for _ in range(3):
        res = send(api, "PUT", f"/api/v1/habits/{habit['id']}/logs/{today}", {"state": "done"}, key)
        assert res.status_code == 200
    assert res.get_json()["stats"]["current_streak"] == 1


def test_key_reused_for_a_different_request_is_refused(api):
    key = str(uuid.uuid4())
    send(api, "POST", "/api/v1/tasks", {"title": "A"}, key)
    res = send(api, "POST", "/api/v1/categories", {"name": "B"}, key)
    assert res.status_code == 422 and res.get_json()["error"]["code"] == "idempotency_key_reused"


def test_refusals_are_remembered_but_server_errors_are_not(api, monkeypatch):
    key = str(uuid.uuid4())
    bad = send(api, "POST", "/api/v1/tasks", {"title": ""}, key)
    assert bad.status_code == 422
    assert send(api, "POST", "/api/v1/tasks", {"title": ""}, key).headers.get("Idempotent-Replay") == "true"

    from app.modules.tasks import service

    def boom(*a, **kw):
        raise RuntimeError("database hiccup")

    key2 = str(uuid.uuid4())
    monkeypatch.setattr(service, "create_task", boom)
    assert send(api, "POST", "/api/v1/tasks", {"title": "Later"}, key2).status_code == 500
    monkeypatch.undo()
    retry = send(api, "POST", "/api/v1/tasks", {"title": "Later"}, key2)
    assert retry.status_code == 201 and "Idempotent-Replay" not in retry.headers  # really retried


def test_keys_expire_after_24_hours(api):
    key = str(uuid.uuid4())
    send(api, "POST", "/api/v1/tasks", {"title": "Old"}, key)
    db.session.execute(update(IdempotencyKey).values(created_at=datetime.now(timezone.utc) - timedelta(hours=25)))
    db.session.commit()
    res = send(api, "POST", "/api/v1/tasks", {"title": "Old"}, key)
    assert res.status_code == 201 and "Idempotent-Replay" not in res.headers


def test_keys_are_per_user(app, api, anon):
    from app.modules.auth.service import create_user
    from tests.conftest import TEST_PASSWORD

    key = str(uuid.uuid4())
    send(api, "POST", "/api/v1/tasks", {"title": "Mine"}, key)
    create_user("other@example.test", TEST_PASSWORD, "Other", "en")
    anon.login("other@example.test")
    res = send(anon, "POST", "/api/v1/tasks", {"title": "Theirs"}, key)
    assert res.status_code == 201 and res.get_json()["title"] == "Theirs"


def test_malformed_key_is_rejected(api):
    res = send(api, "POST", "/api/v1/tasks", {"title": "x"}, "bad key!")
    assert res.status_code == 400
