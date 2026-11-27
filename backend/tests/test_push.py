"""Reminders when the app is closed (Web Push). The real sender is replaced: nothing leaves the test."""

import json
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from pywebpush import WebPushException

from app.modules.auth.service import create_user
from app.modules.push import service
from app.modules.push.models import PushSubscription
from tests.conftest import TEST_PASSWORD, ApiClient
from tests.test_calendar import KL, event
from tests.test_tasks import create, kl_today

ENDPOINT = "https://push.example.test/device-1"
SUB = {"endpoint": ENDPOINT, "keys": {"p256dh": "BPkey", "auth": "authkey"}}


@pytest.fixture
def outbox(monkeypatch):
    """Every push 'sent', as (endpoint, payload)."""
    sent = []

    def fake_webpush(subscription_info, data, **kw):
        sent.append((subscription_info["endpoint"], json.loads(data)))

    monkeypatch.setattr(service, "webpush", fake_webpush)
    return sent


def subscribe(api, **prefs):
    res = api.post("/api/v1/push/subscriptions", {**SUB, "prefs": prefs})
    assert res.status_code == 201, res.get_json()


def unsubscribe(client):
    return client.client.delete("/api/v1/push/subscriptions", json={"endpoint": ENDPOINT}, headers=client._headers())


def tick_at(app, when):
    with app.test_request_context("/api/v1/push/tick"):
        return service.tick(now=when)


def at(hh, mm=0, day=None):
    return datetime.combine(day or kl_today(), datetime.min.time(), KL).replace(hour=hh, minute=mm)


def test_config_and_subscriptions(app, api):
    assert api.get("/api/v1/push/config").get_json() == {"enabled": True, "public_key": "test-public-key"}
    subscribe(api, eventLead=5, planAt="")
    subscribe(api, eventLead=15)  # the same device again: updated, not duplicated
    with app.app_context():
        [sub] = PushSubscription.query.all()
        assert sub.prefs["eventLead"] == 15 and sub.prefs["planAt"] == "08:30"
    assert api.post("/api/v1/push/subscriptions", {**SUB, "endpoint": "http://insecure"}).status_code == 422
    assert api.post("/api/v1/push/subscriptions", {**SUB, "prefs": {"planAt": "25:00"}}).status_code == 422

    create_user("other@example.test", TEST_PASSWORD, "Other")
    other = ApiClient(app.test_client())
    other.login("other@example.test")
    unsubscribe(other)  # not theirs: nothing happens
    with app.app_context():
        assert PushSubscription.query.count() == 1
    assert unsubscribe(api).status_code == 204
    with app.app_context():
        assert PushSubscription.query.count() == 0


def test_tick_needs_the_scheduler_key(anon, outbox):
    assert anon.post("/api/v1/push/tick").status_code == 401
    bad = anon.client.post("/api/v1/push/tick", headers={"Authorization": "Bearer wrong"})
    assert bad.status_code == 401
    ok = anon.client.post("/api/v1/push/tick", headers={"Authorization": "Bearer test-cron-secret"})
    assert ok.status_code == 200 and ok.get_json() == {"devices": 0, "sent": 0}


def test_event_and_deadline_reminders_arrive_once_and_never_late(app, api, outbox):
    day = kl_today() + timedelta(days=1)
    event(api, title="Dentist", starts_at=at(10, 0, day).isoformat(), ends_at=at(11, 0, day).isoformat())
    create(api, title="Hand in essay", status="todo", deadline=at(17, 0, day).isoformat())
    subscribe(api, eventLead=10, planAt="", habitsAt="", reviewAt="")

    assert tick_at(app, at(9, 30, day))["sent"] == 0  # 30 min before: not yet
    assert tick_at(app, at(9, 40, day))["sent"] == 1  # within lead + one tick: sent (a little early)
    assert tick_at(app, at(9, 50, day))["sent"] == 0  # once only
    assert outbox[-1][1] == {"title": "Dentist", "body": "Starts at 10:00 AM", "url": "/calendar",
                             "tag": outbox[-1][1]["tag"]}
    assert outbox[-1][1]["tag"].startswith("ev:")

    assert tick_at(app, at(16, 15, day))["sent"] == 1  # 45 min before the deadline (30 + one tick)
    assert outbox[-1][1]["title"] == "Hand in essay" and outbox[-1][1]["body"] == "Deadline at 5:00 PM"


def test_daily_reminders_in_your_time_zone_and_language(app, api, outbox):
    api.patch("/api/v1/settings", {"locale": "zh-CN"})
    api.post("/api/v1/habits", {"name": "Read", "start_date": kl_today().isoformat()})
    subscribe(api, eventLead=0, planAt="08:30", habitsAt="20:00", reviewAt="")
    assert tick_at(app, at(8, 15))["sent"] == 0
    assert tick_at(app, at(8, 40))["sent"] == 1
    assert outbox[-1][1]["title"] == "计划今天"
    assert tick_at(app, at(20, 5))["sent"] == 1
    assert outbox[-1][1]["title"] == "今天还有 1 个习惯" and outbox[-1][1]["body"] == "Read"
    assert tick_at(app, at(20, 20))["sent"] == 0
    assert tick_at(app, at(8, 30) + timedelta(hours=4))["sent"] == 0  # hours late: skipped, not sent


def test_no_habit_nudge_when_all_done(app, api, outbox):
    habit = api.post("/api/v1/habits", {"name": "Walk", "start_date": kl_today().isoformat()}).get_json()
    api.put(f"/api/v1/habits/{habit['id']}/logs/{kl_today().isoformat()}", {"state": "done"})
    subscribe(api, eventLead=0, planAt="", habitsAt="20:00", reviewAt="")
    assert tick_at(app, at(20, 5))["sent"] == 0


def test_a_device_that_unsubscribed_is_removed(app, api, monkeypatch):
    def gone(**kw):
        raise WebPushException("gone", response=SimpleNamespace(status_code=410))

    monkeypatch.setattr(service, "webpush", lambda *a, **kw: gone())
    subscribe(api, eventLead=0, planAt="08:30", habitsAt="", reviewAt="")
    assert tick_at(app, at(8, 40)) == {"devices": 0, "sent": 0}
    with app.app_context():
        assert PushSubscription.query.count() == 0


def test_an_unreachable_push_service_doesnt_stop_the_others(app, api, monkeypatch):
    from requests import ConnectionError as Unreachable

    def offline(*a, **kw):
        raise Unreachable("no route")

    monkeypatch.setattr(service, "webpush", offline)
    subscribe(api, eventLead=0, planAt="08:30", habitsAt="", reviewAt="")
    assert tick_at(app, at(8, 40)) == {"devices": 1, "sent": 0}  # not sent; the device is kept
    with app.app_context():
        assert PushSubscription.query.count() == 1
    sent = []
    monkeypatch.setattr(service, "webpush", lambda subscription_info, data, **kw: sent.append(json.loads(data)))
    assert tick_at(app, at(8, 55))["sent"] == 1  # back: the reminder still due goes out now
    assert sent[0]["title"] == "Plan your day"


def test_send_a_test_reminder(api, outbox):
    assert api.post("/api/v1/push/test", {"endpoint": ENDPOINT}).status_code == 404  # not subscribed
    subscribe(api)
    assert api.post("/api/v1/push/test", {"endpoint": ENDPOINT}).status_code == 200
    assert outbox[-1][1]["title"] == "Reminders are on"


def test_generated_keys_can_sign(app):
    from py_vapid import Vapid01

    out = app.test_cli_runner().invoke(args=["push-keys"]).output
    keys = dict(line.split("=", 1) for line in out.strip().splitlines())
    assert len(keys["VAPID_PUBLIC_KEY"]) == 87  # 65-byte uncompressed P-256 point, base64url
    signed = Vapid01.from_string(keys["VAPID_PRIVATE_KEY"]).sign({"aud": "https://push.example.test", "sub": "mailto:a@b.test"})
    assert "eyJ" in signed["Authorization"]  # a signed token (JWT)
