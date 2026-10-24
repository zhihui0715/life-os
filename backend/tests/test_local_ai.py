"""Free local AI through Ollama, tested with a fake Ollama (no model, no network)."""

import json

import pytest

from app.modules.ai import provider


class FakeOllama:
    def __init__(self, installed=True, reply=None, down=False):
        self.installed, self.reply, self.down = installed, reply or {}, down
        self.chats = []

    def __call__(self, path, body=None, timeout=3):
        if self.down:
            raise provider.urllib.error.URLError("connection refused")
        if path == "/api/tags":
            return {"models": [{"name": "qwen2.5:3b"}] if self.installed else [{"name": "llama3.2:1b"}]}
        self.chats.append(body)
        return {"message": {"content": json.dumps(self.reply)}}


@pytest.fixture
def ollama(monkeypatch):
    def install(**kw):
        fake = FakeOllama(**kw)
        monkeypatch.setattr(provider, "_request", fake)
        monkeypatch.setattr(provider, "_status_cache", None)
        return fake
    return install


def test_status_says_when_ollama_isnt_running(api, ollama):
    ollama(down=True)
    s = api.get("/api/v1/ai/status").get_json()
    assert s["running"] is False and s["installed"] is False
    t = api.post("/api/v1/tasks", {"title": "Plan trip"}).get_json()
    res = api.post("/api/v1/ai/breakdown", {"task_id": t["id"]})
    assert res.status_code == 503 and res.get_json()["error"]["code"] == "ai_unavailable"


def test_missing_model_is_explained(api, ollama):
    ollama(installed=False)
    t = api.post("/api/v1/tasks", {"title": "Plan trip"}).get_json()
    res = api.post("/api/v1/ai/breakdown", {"task_id": t["id"]})
    assert res.status_code == 503 and res.get_json()["error"]["code"] == "ai_model_missing"


def test_breakdown_suggests_new_steps_only(api, ollama):
    fake = ollama(reply={"steps": ["Pick dates", "  Book   flights ", "Pick dates", "Pack bag", "x" * 500]})
    t = api.post("/api/v1/tasks", {"title": "Plan trip", "notes": "PRIVATE NOTE"}).get_json()
    api.post("/api/v1/tasks", {"title": "Pack bag", "parent_task_id": t["id"]})
    res = api.post("/api/v1/ai/breakdown", {"task_id": t["id"]}).get_json()
    assert res["steps"][:2] == ["Pick dates", "Book flights"]
    assert "Pack bag" not in res["steps"]  # already a subtask
    assert all(len(s) <= 200 for s in res["steps"])
    sent = json.dumps(fake.chats[-1], ensure_ascii=False)
    assert "Plan trip" in sent and "PRIVATE NOTE" not in sent  # titles only, never notes
    assert fake.chats[-1]["format"]["required"] == ["steps"]
    # nothing was written: still exactly one subtask
    assert api.get(f"/api/v1/tasks/{t['id']}").get_json()["subtasks_total"] == 1


def test_breakdown_only_for_your_own_tasks(app, api, ollama):
    from app.modules.auth.service import create_user
    from tests.conftest import TEST_PASSWORD, ApiClient

    ollama(reply={"steps": ["a", "b"]})
    t = api.post("/api/v1/tasks", {"title": "Mine"}).get_json()
    create_user("other@example.test", TEST_PASSWORD, "Other", "en")
    other = ApiClient(app.test_client())
    other.login("other@example.test")
    assert other.post("/api/v1/ai/breakdown", {"task_id": t["id"]}).status_code == 404


def test_review_draft_uses_the_weeks_facts(api, ollama):
    fake = ollama(reply={"went_well": "I finished the report.", "to_improve": "Late starts.", "lesson": "Plan Mondays."})
    t = api.post("/api/v1/tasks", {"title": "Finish report"}).get_json()
    api.post(f"/api/v1/tasks/{t['id']}/complete")
    api.put("/api/v1/journal/2026-01-05", {"body": "SECRET JOURNAL"})
    res = api.post("/api/v1/ai/review-draft", {"week": "this"}).get_json()
    assert res["went_well"] == "I finished the report." and res["lesson"] == "Plan Mondays."
    sent = json.dumps(fake.chats[-1], ensure_ascii=False)
    assert "Finish report" in sent and "SECRET JOURNAL" not in sent


def test_garbled_reply_is_a_clean_error(api, ollama):
    fake = ollama()
    fake.reply = None
    t = api.post("/api/v1/tasks", {"title": "Plan trip"}).get_json()

    def broken(path, body=None, timeout=3):
        if path == "/api/tags":
            return {"models": [{"name": "qwen2.5:3b"}]}
        return {"message": {"content": "not json"}}

    provider._request = broken  # monkeypatch restores it after the test
    res = api.post("/api/v1/ai/breakdown", {"task_id": t["id"]})
    assert res.status_code == 502 and res.get_json()["error"]["code"] == "ai_failed"


def test_ai_requires_login(anon):
    assert anon.get("/api/v1/ai/status").status_code == 401
