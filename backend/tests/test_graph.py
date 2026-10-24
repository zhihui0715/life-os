"""The graph view: unfinished work as nodes and links (goals, milestones, tasks, subtasks, tags, habits, time hubs)."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

KL = ZoneInfo("Asia/Kuala_Lumpur")


def ok(res, status=(200, 201)):
    assert res.status_code in ((status,) if isinstance(status, int) else status), res.get_json()
    return res.get_json()


def today():
    return datetime.now(KL).date()


def test_graph_links_goals_tasks_tags_habits_and_time_hubs(api):
    d = today()
    goal = ok(api.post("/api/v1/goals", {"title": "Pass CCNA", "progress_mode": "milestones"}))
    ms = ok(api.post(f"/api/v1/goals/{goal['id']}/milestones", {"title": "Theory"}))
    late = ok(api.post("/api/v1/tasks", {"title": "Read ch 1", "goal_id": goal["id"], "milestone_id": ms["id"],
                                         "due_date": (d - timedelta(days=1)).isoformat(), "tags": ["study"]}))
    sub = ok(api.post("/api/v1/tasks", {"title": "Notes", "parent_task_id": late["id"]}))
    loose = ok(api.post("/api/v1/tasks", {"title": "Loose end", "tags": ["Study"]}))
    done = ok(api.post("/api/v1/tasks", {"title": "Finished", "goal_id": goal["id"], "due_date": d.isoformat()}))
    ok(api.post(f"/api/v1/tasks/{done['id']}/complete"))
    habit = ok(api.post("/api/v1/habits", {"name": "Flashcards", "start_date": d.isoformat(), "goal_id": goal["id"]}))
    ok(api.post("/api/v1/habits", {"name": "Unrelated", "start_date": d.isoformat()}))

    g = ok(api.get("/api/v1/graph"))
    nodes = {n["id"]: n for n in g["nodes"]}
    links = {(l["source"], l["target"], l["kind"]) for l in g["links"]}

    assert nodes[f"task:{late['id']}"]["urgency"] == "overdue"
    assert nodes[f"task:{loose['id']}"]["urgency"] == "none"
    assert f"task:{done['id']}" not in nodes  # finished work isn't shown
    assert (f"milestone:{ms['id']}", f"goal:{goal['id']}", "part_of") in links
    assert (f"task:{late['id']}", f"milestone:{ms['id']}", "part_of") in links
    assert (f"task:{sub['id']}", f"task:{late['id']}", "subtask") in links
    assert (f"task:{late['id']}", "tag:study", "tagged") in links and (f"task:{loose['id']}", "tag:study", "tagged") in links
    assert (f"task:{late['id']}", "hub:overdue", "due") in links
    assert (f"habit:{habit['id']}", f"goal:{goal['id']}", "serves") in links
    assert not any(n["label"] == "Unrelated" for n in g["nodes"])  # only habits that serve a goal
    assert nodes["hub:overdue"]["count"] == 1 and "hub:today" not in nodes
    assert g["summary"]["by_urgency"]["overdue"] == 1 and g["summary"]["tasks"] == 3
    # every link points at a node that exists
    assert all(l["source"] in nodes and l["target"] in nodes for l in g["links"])


def test_graph_is_private(app, api, anon):
    from app.modules.auth.service import create_user
    from tests.conftest import TEST_PASSWORD, ApiClient

    ok(api.post("/api/v1/tasks", {"title": "Mine"}))
    create_user("other@example.test", TEST_PASSWORD, "Other", "en")
    other = ApiClient(app.test_client())
    other.login("other@example.test")
    assert ok(other.get("/api/v1/graph"))["nodes"] == []
    assert anon.get("/api/v1/graph").status_code == 401
