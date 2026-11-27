"""Search everything (GET /api/v1/search): one query across tasks, goals, habits, journal and events."""

from datetime import timedelta

from app.modules.auth.service import create_user
from app.modules.search.service import snippet
from tests.conftest import TEST_PASSWORD, ApiClient
from tests.test_calendar import at, event
from tests.test_tasks import create, kl_today


def search(api, q, **params):
    res = api.get("/api/v1/search", query_string={"q": q, **params})
    assert res.status_code == 200, res.get_json()
    return res.get_json()


def test_finds_matches_in_every_section(api):
    day = kl_today()
    create(api, title="Study OSPF routing", status="todo")
    create(api, title="Buy milk", notes="and ask about the OSPF book")
    api.post("/api/v1/goals", {"title": "Pass CCNA", "description": "Learn OSPF well"})
    api.post("/api/v1/habits", {"name": "OSPF flashcards"})
    api.put(f"/api/v1/journal/{day.isoformat()}", {"lessons": "OSPF areas finally clicked today."})
    event(api, title="OSPF lab", starts_at=at(day, 9), ends_at=at(day, 10))

    r = search(api, "ospf")
    assert [t["title"] for t in r["tasks"]] == ["Study OSPF routing", "Buy milk"]  # title matches first
    assert r["tasks"][0]["snippet"] is None and "OSPF book" in r["tasks"][1]["snippet"]
    assert [g["title"] for g in r["goals"]] == ["Pass CCNA"] and "OSPF" in r["goals"][0]["snippet"]
    assert [h["name"] for h in r["habits"]] == ["OSPF flashcards"]
    assert r["journal"] == [{"entry_date": day.isoformat(), "snippet": "OSPF areas finally clicked today."}]
    assert [(e["title"], e["date"]) for e in r["events"]] == [("OSPF lab", day.isoformat())]


def test_chinese_and_literal_wildcards(api):
    create(api, title="复习网络考试")
    create(api, title="Save 50% more")
    create(api, title="Save 500 more")
    assert [t["title"] for t in search(api, "网络")["tasks"]] == ["复习网络考试"]
    assert [t["title"] for t in search(api, "50%")["tasks"]] == ["Save 50% more"]


def test_open_tasks_before_done_and_archived_left_out(api):
    done = create(api, title="Report draft", status="todo")
    api.post(f"/api/v1/tasks/{done['id']}/complete")
    create(api, title="Report final", status="todo")
    gone = create(api, title="Report old")
    api.post(f"/api/v1/tasks/{gone['id']}/archive")
    assert [t["title"] for t in search(api, "report")["tasks"]] == ["Report final", "Report draft"]


def test_limit_per_group_and_validation(api):
    for i in range(5):
        create(api, title=f"Note {i}")
    assert len(search(api, "note", limit=3)["tasks"]) == 3
    assert api.get("/api/v1/search?q=").status_code == 422
    assert api.get("/api/v1/search?q=" + "x" * 201).status_code == 422


def test_only_your_own_data(app, api):
    create(api, title="My secret plan")
    create_user("other@example.test", TEST_PASSWORD, "Other")
    other = ApiClient(app.test_client())
    assert other.login("other@example.test").status_code == 200
    r = search(other, "secret")
    assert all(r[k] == [] for k in ("tasks", "goals", "habits", "journal", "events"))


def test_needs_sign_in(anon):
    assert anon.get("/api/v1/search?q=x").status_code == 401


def test_events_are_dated_in_your_time_zone(api):
    day = kl_today() + timedelta(days=2)
    event(api, title="Late call", starts_at=at(day, 23, 30), ends_at=at(day + timedelta(days=1), 0, 30))
    assert search(api, "late call")["events"][0]["date"] == day.isoformat()


def test_snippet_shows_the_match_in_context():
    text = "Lorem ipsum " * 20 + "the NEEDLE is here " + "dolor sit " * 20
    s = snippet(text, "needle")
    assert "NEEDLE" in s and s.startswith("…") and s.endswith("…") and len(s) <= 92
    assert snippet("Short note", "short") == "Short note"
    assert snippet("one\n\ntwo   three", "two") == "one two three"
    assert snippet("nothing", "else") is None and snippet(None, "x") is None
