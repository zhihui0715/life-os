def create_goal(api, **fields):
    res = api.post("/api/v1/goals", {"title": "Pass CCNA", **fields})
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def create_task(api, **fields):
    res = api.post("/api/v1/tasks", {"title": "t", "status": "todo", **fields})
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def goal(api, gid):
    return api.get(f"/api/v1/goals/{gid}").get_json()


def test_create_goal_defaults(api):
    g = create_goal(api)
    assert g["status"] == "active" and g["progress_mode"] == "tasks"
    assert g["progress"] is None  # no linked tasks yet = no data, not 0%
    assert g["milestones"] == [] and g["updates"] == []


def test_goal_validation(api):
    res = api.post("/api/v1/goals", {"title": "", "start_date": "2026-12-01", "target_date": "2026-11-01"})
    assert res.status_code == 422


def test_task_based_progress(api):
    g = create_goal(api)
    a = create_task(api, goal_id=g["id"])
    create_task(api, goal_id=g["id"])
    create_task(api, goal_id=g["id"])
    create_task(api, goal_id=g["id"])
    assert goal(api, g["id"])["progress"] == 0

    api.post(f"/api/v1/tasks/{a['id']}/complete")
    detail = goal(api, g["id"])
    assert detail["progress"] == 25
    assert detail["progress_detail"]["tasks_done"] == 1 and detail["progress_detail"]["tasks_total"] == 4
    # the change was recorded on the goal's timeline automatically
    assert [u["progress"] for u in detail["updates"] if u["kind"] == "auto"][:2] == [25, 0]


def test_archived_unfinished_tasks_do_not_count(api):
    g = create_goal(api)
    done = create_task(api, goal_id=g["id"])
    dropped = create_task(api, goal_id=g["id"])
    api.post(f"/api/v1/tasks/{done['id']}/complete")
    assert goal(api, g["id"])["progress"] == 50
    api.post(f"/api/v1/tasks/{dropped['id']}/archive")
    assert goal(api, g["id"])["progress"] == 100
    # but archiving a completed task keeps it counted
    api.post(f"/api/v1/tasks/{done['id']}/archive")
    assert goal(api, g["id"])["progress"] == 100


def test_milestone_weighted_progress(api):
    g = create_goal(api, progress_mode="milestones")
    m1 = api.post(f"/api/v1/goals/{g['id']}/milestones", {"title": "Theory", "weight": 3}).get_json()
    api.post(f"/api/v1/goals/{g['id']}/milestones", {"title": "Labs", "weight": 1})
    assert goal(api, g["id"])["progress"] == 0
    api.post(f"/api/v1/milestones/{m1['id']}/complete")
    assert goal(api, g["id"])["progress"] == 75
    api.post(f"/api/v1/milestones/{m1['id']}/reopen")
    assert goal(api, g["id"])["progress"] == 0
    titles = [m["title"] for m in goal(api, g["id"])["milestones"]]
    assert titles == ["Theory", "Labs"]


def test_manual_progress_and_notes(api):
    g = create_goal(api, progress_mode="manual")
    assert goal(api, g["id"])["progress"] is None
    assert api.post(f"/api/v1/goals/{g['id']}/updates", {"progress": 40, "note": "Halfway through book"}).status_code == 201
    detail = goal(api, g["id"])
    assert detail["progress"] == 40
    assert detail["updates"][0]["note"] == "Halfway through book"
    # notes without progress are fine; empty updates are not
    assert api.post(f"/api/v1/goals/{g['id']}/updates", {"note": "Felt good"}).status_code == 201
    assert api.post(f"/api/v1/goals/{g['id']}/updates", {"note": "  "}).status_code == 422


def test_cannot_set_progress_on_calculated_goal(api):
    g = create_goal(api)
    res = api.post(f"/api/v1/goals/{g['id']}/updates", {"progress": 50})
    assert res.get_json()["error"]["code"] == "rule_violation"


def test_status_changes_are_recorded(api):
    g = create_goal(api)
    done = api.patch(f"/api/v1/goals/{g['id']}", {"status": "completed"}).get_json()
    assert done["completed_at"] is not None
    reopened = api.patch(f"/api/v1/goals/{g['id']}", {"status": "active"}).get_json()
    assert reopened["completed_at"] is None
    assert [u["status"] for u in reopened["updates"] if u["kind"] == "status"] == ["active", "completed"]


def test_goal_list_filter_and_archive(api):
    a = create_goal(api, title="A")
    create_goal(api, title="B")
    api.patch(f"/api/v1/goals/{a['id']}", {"status": "paused"})
    assert [g["title"] for g in api.get("/api/v1/goals?status=paused").get_json()["items"]] == ["A"]
    api.post(f"/api/v1/goals/{a['id']}/archive")
    assert [g["title"] for g in api.get("/api/v1/goals").get_json()["items"]] == ["B"]
    assert [g["title"] for g in api.get("/api/v1/goals?archived_only=true").get_json()["items"]] == ["A"]
    # archived goal keeps its history and can't receive new task links
    res = api.post("/api/v1/tasks", {"title": "x", "goal_id": a["id"]})
    assert res.get_json()["error"]["code"] == "rule_violation"
    api.post(f"/api/v1/goals/{a['id']}/restore")
    assert len(api.get("/api/v1/goals").get_json()["items"]) == 2


def test_milestone_delete_rules(api):
    g = create_goal(api, progress_mode="milestones")
    m = api.post(f"/api/v1/goals/{g['id']}/milestones", {"title": "M"}).get_json()
    create_task(api, milestone_id=m["id"])
    assert api.delete(f"/api/v1/milestones/{m['id']}").status_code == 422
    empty = api.post(f"/api/v1/goals/{g['id']}/milestones", {"title": "Empty"}).get_json()
    assert api.delete(f"/api/v1/milestones/{empty['id']}").status_code == 204


def test_goals_are_private(app, api):
    from app.modules.auth.service import create_user
    from tests.conftest import ApiClient

    g = create_goal(api)
    create_user("other@example.test", "correct-horse-battery", "Other")
    other = ApiClient(app.test_client())
    other.login("other@example.test")
    assert other.get(f"/api/v1/goals/{g['id']}").status_code == 404
    assert other.get("/api/v1/goals").get_json()["items"] == []
    res = other.post("/api/v1/tasks", {"title": "x", "goal_id": g["id"]})
    assert res.status_code == 404
