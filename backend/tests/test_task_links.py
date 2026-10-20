from tests.test_goals import create_goal, create_task


def ids(res):
    return [t["title"] for t in res.get_json()["items"]]


# ---------- goal & milestone links ----------

def test_milestone_implies_goal(api):
    g = create_goal(api, progress_mode="milestones")
    m = api.post(f"/api/v1/goals/{g['id']}/milestones", {"title": "M"}).get_json()
    t = create_task(api, milestone_id=m["id"])
    assert t["goal_id"] == g["id"]


def test_milestone_from_other_goal_rejected(api):
    g1, g2 = create_goal(api, title="1"), create_goal(api, title="2")
    m = api.post(f"/api/v1/goals/{g1['id']}/milestones", {"title": "M"}).get_json()
    res = api.post("/api/v1/tasks", {"title": "x", "goal_id": g2["id"], "milestone_id": m["id"]})
    assert res.get_json()["error"]["code"] == "rule_violation"


def test_changing_goal_clears_old_milestone_and_updates_both_goals(api):
    g1, g2 = create_goal(api, title="1"), create_goal(api, title="2")
    m = api.post(f"/api/v1/goals/{g1['id']}/milestones", {"title": "M"}).get_json()
    t = create_task(api, milestone_id=m["id"])
    api.post(f"/api/v1/tasks/{t['id']}/complete")
    assert api.get(f"/api/v1/goals/{g1['id']}").get_json()["progress"] == 100

    moved = api.patch(f"/api/v1/tasks/{t['id']}", {"goal_id": g2["id"]}).get_json()
    assert moved["goal_id"] == g2["id"] and moved["milestone_id"] is None
    assert api.get(f"/api/v1/goals/{g1['id']}").get_json()["progress"] is None
    assert api.get(f"/api/v1/goals/{g2['id']}").get_json()["progress"] == 100


def test_filter_tasks_by_goal(api):
    g = create_goal(api)
    create_task(api, title="linked", goal_id=g["id"])
    create_task(api, title="other")
    assert ids(api.get(f"/api/v1/tasks?goal_id={g['id']}")) == ["linked"]


# ---------- subtasks ----------

def test_subtasks_live_inside_parent(api):
    parent = create_task(api, title="Write report")
    create_task(api, title="Outline", parent_task_id=parent["id"])
    s2 = create_task(api, title="Draft", parent_task_id=parent["id"])
    api.post(f"/api/v1/tasks/{s2['id']}/complete")

    top = api.get("/api/v1/tasks").get_json()["items"]
    assert [t["title"] for t in top] == ["Write report"]  # subtasks hidden from main lists
    assert (top[0]["subtasks_done"], top[0]["subtasks_total"]) == (1, 2)
    assert ids(api.get(f"/api/v1/tasks?parent_id={parent['id']}")) == ["Outline", "Draft"]


def test_subtasks_one_level_only(api):
    parent = create_task(api)
    child = create_task(api, parent_task_id=parent["id"])
    res = api.post("/api/v1/tasks", {"title": "grandchild", "parent_task_id": child["id"]})
    assert res.get_json()["error"]["code"] == "rule_violation"
    # a task with subtasks can't itself become a subtask
    other = create_task(api)
    res = api.patch(f"/api/v1/tasks/{parent['id']}", {"parent_task_id": other["id"]})
    assert res.get_json()["error"]["code"] == "rule_violation"
    # and a task can't be its own parent
    assert api.patch(f"/api/v1/tasks/{other['id']}", {"parent_task_id": other["id"]}).status_code == 422


def test_subtasks_cannot_link_to_goals(api):
    g = create_goal(api)
    parent = create_task(api, goal_id=g["id"])
    res = api.post("/api/v1/tasks", {"title": "s", "parent_task_id": parent["id"], "goal_id": g["id"]})
    assert res.get_json()["error"]["code"] == "rule_violation"


def test_parent_with_subtasks_cannot_be_deleted(api):
    parent = create_task(api)
    create_task(api, parent_task_id=parent["id"])
    res = api.delete(f"/api/v1/tasks/{parent['id']}")
    assert res.status_code == 422


# ---------- tags ----------

def test_tags_are_created_reused_and_case_insensitive(api):
    a = create_task(api, title="a", tags=["Exam", "networking"])
    b = create_task(api, title="b", tags=["exam", "EXAM"])
    assert a["tags"] == ["Exam", "networking"]
    assert b["tags"] == ["Exam"]  # reused existing tag, duplicates collapsed
    tags = api.get("/api/v1/tags").get_json()["items"]
    assert tags == [{"name": "Exam", "task_count": 2}, {"name": "networking", "task_count": 1}]
    assert set(ids(api.get("/api/v1/tasks?tag=EXAM"))) == {"a", "b"}  # tag filter is case-insensitive too


def test_replace_and_clear_tags(api):
    t = create_task(api, tags=["one", "two"])
    assert api.patch(f"/api/v1/tasks/{t['id']}", {"tags": ["two", "three"]}).get_json()["tags"] == ["three", "two"]
    assert api.patch(f"/api/v1/tasks/{t['id']}", {"tags": []}).get_json()["tags"] == []
    assert api.patch(f"/api/v1/tasks/{t['id']}", {"tags": None}).status_code == 422


def test_tag_validation(api):
    res = api.post("/api/v1/tasks", {"title": "x", "tags": ["", "a" * 41]})
    assert res.status_code == 422


# ---------- search ----------

def test_search_title_notes_and_subtasks(api):
    parent = create_task(api, title="Router lab", notes="configure OSPF")
    create_task(api, title="Read about OSPF areas", parent_task_id=parent["id"])
    create_task(api, title="复习网络安全笔记", notes="防火墙规则")
    create_task(api, title="Groceries")

    assert set(ids(api.get("/api/v1/tasks?q=ospf"))) == {"Router lab", "Read about OSPF areas"}
    assert ids(api.get("/api/v1/tasks?q=防火墙")) == ["复习网络安全笔记"]
    assert ids(api.get("/api/v1/tasks?q=网络")) == ["复习网络安全笔记"]


def test_search_treats_wildcards_literally(api):
    create_task(api, title="Save 50% on course")
    create_task(api, title="Save 50 dollars")
    assert ids(api.get("/api/v1/tasks?q=50%25")) == ["Save 50% on course"]
    assert ids(api.get("/api/v1/tasks?q=_")) == []
