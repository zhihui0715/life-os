from datetime import date


def _today(api):
    return api.get("/api/v1/reports/day").get_json()["period"]["start"]


def test_daily_report_counts_what_got_done(api):
    t = api.post("/api/v1/tasks", {"title": "Draft chapter 3", "status": "todo"}).get_json()
    api.post("/api/v1/tasks", {"title": "Still to do", "status": "todo"})
    api.post(f"/api/v1/tasks/{t['id']}/complete")
    api.post("/api/v1/habits", {"name": "Read", "start_date": "2026-01-01"})

    r = api.get("/api/v1/reports/day").get_json()
    assert r["kind"] == "day" and r["period"]["start"] == r["period"]["end"]
    assert r["tasks"]["done"] == 1 and r["tasks"]["added"] == 2
    assert [x["title"] for x in r["tasks"]["list"]] == ["Draft chapter 3"]
    assert sum(d["count"] for d in r["tasks"]["by_day"]) == 1
    assert r["habits"]["items"] == [{"name": "Read", "done": 0, "skipped": 0}]


def test_week_and_month_cover_their_whole_period(api):
    day = _today(api)
    week = api.get(f"/api/v1/reports/week?date={day}").get_json()
    assert len(week["tasks"]["by_day"]) == 7
    assert date.fromisoformat(week["period"]["start"]).isoweekday() == 1  # the test account's week starts Monday
    month = api.get("/api/v1/reports/month?date=2026-02-14").get_json()
    assert (month["period"]["start"], month["period"]["end"]) == ("2026-02-01", "2026-02-28")
    assert month["period"]["previous_start"] == "2026-01-01"


def test_report_pdf(api):
    res = api.get("/api/v1/reports/week.pdf")
    assert res.status_code == 200 and res.mimetype == "application/pdf"
    assert res.data.startswith(b"%PDF")


def test_report_rejects_unknown_kind_and_bad_date(api):
    assert api.get("/api/v1/reports/year").status_code == 404
    assert api.get("/api/v1/reports/day?date=yesterday").status_code == 422
