"""Stage 7: AI assistance, tested with a fake provider (no network, no API key, no cost).

Acceptance: works with no API key (hidden + explained); every request shows which data categories are sent; journal
text excluded unless explicitly included in that request; the AI never writes — proposals are applied by normal calls.
"""

import json
import logging
import types
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.modules.ai.provider import AiProviderError, AiResult, AnthropicProvider

KL = ZoneInfo("Asia/Kuala_Lumpur")
SECRET = "Journal line that must stay private"
ALL_DAY_HOURS = {d: [["00:00", "23:59"]] for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}


class FakeProvider:
    name = "fake"
    model = "fake-model"

    def __init__(self):
        self.calls = []
        self.reply = None
        self.error = None

    def generate(self, system, user, schema, max_tokens):
        self.calls.append({"system": system, "user": user, "schema": schema})
        if self.error:
            raise AiProviderError(self.error)
        return AiResult(self.reply, self.model, 1200, 300)


@pytest.fixture
def fake(app):
    provider = FakeProvider()
    app.extensions["ai_provider"] = provider
    yield provider
    del app.extensions["ai_provider"]


@pytest.fixture
def no_key(app, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    app.extensions.pop("_anthropic_provider", None)


def ok(res, status=(200, 201)):
    assert res.status_code in ((status,) if isinstance(status, int) else status), res.get_json()
    return res.get_json()


def tomorrow():
    return datetime.now(KL).date() + timedelta(days=1)


def at(d, hh, mm=0):
    return datetime.combine(d, time(hh, mm), KL).isoformat()


def enable(api, **extra):
    ok(api.patch("/api/v1/settings", {"ai_enabled": True, "working_hours": ALL_DAY_HOURS, **extra}))


def setup_day(api):
    d = tomorrow()
    task = ok(api.post("/api/v1/tasks", {"title": "Write essay", "status": "todo", "priority": 1, "due_date": d.isoformat(),
                                          "estimate_minutes": 90, "notes": "private task notes"}))
    ok(api.post("/api/v1/calendar/events", {"title": "Dentist", "starts_at": at(d, 10), "ends_at": at(d, 11)}))
    ok(api.put(f"/api/v1/journal/{datetime.now(KL).date().isoformat()}", {"body": SECRET, "mood": 4}))
    return d, task


PLAN_CATS = ["tasks", "calendar", "goals", "habits"]


# ---------- availability ----------

def test_without_api_key_ai_is_hidden_and_explained(api, no_key):
    s = ok(api.get("/api/v1/ai/status"))
    assert s["configured"] is False and s["enabled"] is False
    res = api.post("/api/v1/ai/daily-plan", {"categories": PLAN_CATS})
    assert res.status_code == 503 and res.get_json()["error"]["code"] == "ai_unavailable"
    # Everything else keeps working
    assert api.get("/api/v1/tasks").status_code == 200


def test_ai_is_off_until_the_user_opts_in(api, fake):
    assert ok(api.get("/api/v1/ai/status"))["configured"] is True
    res = api.post("/api/v1/ai/daily-plan", {"categories": PLAN_CATS})
    assert res.status_code == 403 and res.get_json()["error"]["code"] == "ai_disabled"
    assert fake.calls == []


# ---------- what is sent ----------

def test_preview_shows_exactly_what_is_sent_and_sends_nothing(api, fake):
    enable(api)
    d, _ = setup_day(api)
    p = ok(api.post("/api/v1/ai/preview", {"kind": "daily_plan", "categories": PLAN_CATS, "day": "tomorrow"}))
    assert p["categories"] == PLAN_CATS
    assert "Write essay" in p["payload"] and "Dentist" in p["payload"]
    assert "private task notes" not in p["payload"]  # notes never leave the server
    assert fake.calls == []

    fake.reply = {"summary": "s", "blocks": [], "notes": []}
    ok(api.post("/api/v1/ai/daily-plan", {"categories": PLAN_CATS, "day": "tomorrow"}))
    assert fake.calls[0]["user"] == p["payload"]  # the preview was the real thing


def test_categories_left_out_are_not_sent(api, fake):
    enable(api)
    setup_day(api)
    fake.reply = {"summary": "s", "wins": [], "challenges": [], "suggestions": [], "reflection_question": "q"}
    res = ok(api.post("/api/v1/ai/weekly-review", {"categories": ["tasks"], "week": "this"}))
    assert res["categories_sent"] == ["tasks"]
    sent = json.loads(fake.calls[0]["user"])
    assert set(sent) == {"week", "tasks"}


def test_journal_text_only_when_explicitly_included(api, fake):
    enable(api)
    setup_day(api)
    fake.reply = {"summary": "s", "wins": [], "challenges": [], "suggestions": [], "reflection_question": "q"}
    ok(api.post("/api/v1/ai/weekly-review", {"categories": ["tasks", "habits", "activity", "mood"], "week": "this"}))
    assert SECRET not in fake.calls[-1]["user"]
    ok(api.post("/api/v1/ai/weekly-review", {"categories": ["mood", "journal_text"], "week": "this"}))
    assert SECRET in fake.calls[-1]["user"]
    # The next request goes back to excluding it: there's no sticky "include journal" setting
    ok(api.post("/api/v1/ai/weekly-review", {"categories": ["mood"], "week": "this"}))
    assert SECRET not in fake.calls[-1]["user"]
    runs = ok(api.get("/api/v1/ai/runs"))["items"]
    assert [r["categories"] for r in runs] == [["mood"], ["mood", "journal_text"], ["tasks", "habits", "activity", "mood"]]


def test_category_rules_are_enforced(api, fake):
    enable(api)
    bad = api.post("/api/v1/ai/daily-plan", {"categories": ["tasks"]})  # calendar is required to plan a day
    assert bad.status_code == 422
    bad = api.post("/api/v1/ai/daily-plan", {"categories": ["tasks", "calendar", "mood"]})  # not offered for plans
    assert bad.status_code == 422
    assert fake.calls == []


# ---------- proposals ----------

def test_daily_plan_is_validated_and_writes_nothing(api, fake):
    enable(api)
    d, task = setup_day(api)
    fake.reply = {
        "summary": "Essay first, before the dentist.",
        "blocks": [
            {"task_ref": "t1", "title": "ignored", "start": "08:30", "end": "10:00", "reason": "Due tomorrow"},
            {"task_ref": None, "title": "Read", "start": "10:30", "end": "11:00", "reason": "Habit"},  # clashes
            {"task_ref": "t99", "title": "Unknown ref", "start": "13:00", "end": "13:30", "reason": "x"},
            {"task_ref": None, "title": "Bad", "start": "25:00", "end": "26:00", "reason": "x"},
            {"task_ref": None, "title": "Backwards", "start": "15:00", "end": "14:00", "reason": "x"},
        ],
        "notes": ["Keep it light."],
    }
    events_before = api.get(f"/api/v1/calendar/occurrences?start={at(d, 0).replace('+', '%2B')}&end={at(d, 23).replace('+', '%2B')}").get_json()
    res = ok(api.post("/api/v1/ai/daily-plan", {"categories": PLAN_CATS, "day": "tomorrow"}))
    plan = res["plan"]
    assert plan["date"] == d.isoformat() and plan["skipped"] == 2
    first, clash, unknown = plan["blocks"]
    assert first["task_id"] == task["id"] and first["title"] == "Write essay" and first["issues"] == []
    assert clash["issues"] == ["conflict"]
    assert unknown["task_id"] is None  # unknown refs never become links to other records
    assert res["tokens"] == 1500
    events_after = api.get(f"/api/v1/calendar/occurrences?start={at(d, 0).replace('+', '%2B')}&end={at(d, 23).replace('+', '%2B')}").get_json()
    assert events_after == events_before  # nothing was scheduled by the AI

    # Applying a block is an ordinary, user-confirmed calendar call
    created = api.post("/api/v1/calendar/events", {"title": first["title"], "kind": "task_block", "task_id": first["task_id"],
                                                    "starts_at": first["starts_at"], "ends_at": first["ends_at"]})
    assert created.status_code == 201


def test_weekly_review_trims_and_cleans_the_reply(api, fake):
    enable(api)
    fake.reply = {"summary": " Good week ", "wins": ["a", "", "b", "c", "d", "e"], "challenges": [],
                  "suggestions": [{"text": "Plan Monday", "task_title": "Plan Monday"}, {"text": "", "task_title": "x"},
                                  {"text": "Rest more", "task_title": None}],
                  "reflection_question": "What helped?"}
    review = ok(api.post("/api/v1/ai/weekly-review", {"categories": ["tasks"]}))["review"]
    assert review["summary"] == "Good week" and review["wins"] == ["a", "b", "c", "d"]
    assert review["suggestions"] == [{"text": "Plan Monday", "task_title": "Plan Monday"},
                                     {"text": "Rest more", "task_title": None}]


def test_reply_language_follows_the_user(api, fake):
    enable(api, locale="zh-CN")
    fake.reply = {"summary": "s", "wins": [], "challenges": [], "suggestions": [], "reflection_question": "q"}
    ok(api.post("/api/v1/ai/weekly-review", {"categories": ["tasks"]}))
    assert "Simplified Chinese" in fake.calls[0]["system"]


# ---------- cost & failures ----------

def test_monthly_budget_stops_requests(api, fake):
    enable(api, ai_monthly_token_budget=2000)
    fake.reply = {"summary": "s", "wins": [], "challenges": [], "suggestions": [], "reflection_question": "q"}
    ok(api.post("/api/v1/ai/weekly-review", {"categories": ["tasks"]}))  # uses 1500
    ok(api.post("/api/v1/ai/weekly-review", {"categories": ["tasks"]}))  # 1500 < 2000: allowed, ends at 3000
    res = api.post("/api/v1/ai/weekly-review", {"categories": ["tasks"]})
    assert res.status_code == 429 and res.get_json()["error"]["code"] == "ai_budget_exhausted"
    assert len(fake.calls) == 2
    assert ok(api.get("/api/v1/ai/status"))["used_this_month"] == 3000


def test_provider_failures_are_recorded_without_content(api, fake, caplog):
    enable(api)
    setup_day(api)
    fake.error = "ai_refused"
    with caplog.at_level(logging.DEBUG):
        res = api.post("/api/v1/ai/weekly-review", {"categories": ["mood", "journal_text"], "week": "this"})
    assert res.status_code == 422 and res.get_json()["error"]["code"] == "ai_refused"
    run = ok(api.get("/api/v1/ai/runs"))["items"][0]
    assert run["status"] == "error" and run["error_code"] == "ai_refused" and run["tokens"] == 0
    assert SECRET not in caplog.text


def test_journal_text_never_logged_on_success(api, fake, caplog):
    enable(api)
    setup_day(api)
    fake.reply = {"summary": "s", "wins": [], "challenges": [], "suggestions": [], "reflection_question": "q"}
    with caplog.at_level(logging.DEBUG):
        ok(api.post("/api/v1/ai/preview", {"kind": "weekly_review", "categories": ["journal_text"], "week": "this"}))
        ok(api.post("/api/v1/ai/weekly-review", {"categories": ["journal_text"], "week": "this"}))
    assert SECRET not in caplog.text


def test_ai_settings_validation(api):
    assert api.patch("/api/v1/settings", {"ai_monthly_token_budget": -1}).status_code == 422
    s = ok(api.patch("/api/v1/settings", {"ai_enabled": True, "ai_monthly_token_budget": 50_000}))
    assert s["ai_enabled"] is True and s["ai_monthly_token_budget"] == 50_000


def test_ai_requires_login(anon):
    assert anon.get("/api/v1/ai/status").status_code == 401
    assert anon.post("/api/v1/ai/daily-plan", {"categories": PLAN_CATS}).status_code == 401


# ---------- the Anthropic adapter, with the SDK client replaced ----------

def _response(stop_reason="end_turn", text='{"summary": "ok"}'):
    return types.SimpleNamespace(
        stop_reason=stop_reason, model="claude-opus-5-5",
        content=[types.SimpleNamespace(type="thinking", thinking=""), types.SimpleNamespace(type="text", text=text)],
        usage=types.SimpleNamespace(input_tokens=10, output_tokens=5),
    )


def _adapter(response):
    p = AnthropicProvider("test-key", "claude-opus-5-5")
    sent = {}

    def create(**kw):
        sent.update(kw)
        return response

    p._client = types.SimpleNamespace(beta=types.SimpleNamespace(messages=types.SimpleNamespace(create=create)))
    return p, sent


def test_anthropic_adapter_requests_structured_json_and_reads_usage():
    p, sent = _adapter(_response())
    result = p.generate("sys", "data", {"type": "object"}, 8000)
    assert result.data == {"summary": "ok"} and (result.input_tokens, result.output_tokens) == (10, 5)
    assert sent["output_config"]["format"] == {"type": "json_schema", "schema": {"type": "object"}}
    assert sent["fallbacks"] == "default" and sent["model"] == "claude-opus-5-5"


@pytest.mark.parametrize("response, code", [
    (_response(stop_reason="refusal", text=""), "ai_refused"),
    (_response(stop_reason="max_tokens"), "ai_failed"),
    (_response(text="not json"), "ai_failed"),
])
def test_anthropic_adapter_turns_bad_replies_into_errors(response, code):
    p, _ = _adapter(response)
    with pytest.raises(AiProviderError) as e:
        p.generate("sys", "data", {}, 100)
    assert e.value.code == code
