from datetime import date

import pytest


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


def test_email_needs_an_smtp_account(api):
    assert api.get("/api/v1/reports/email").get_json()["configured"] is False
    assert api.post("/api/v1/reports/email/test").status_code == 409


def test_report_email_preferences(api):
    s = api.patch("/api/v1/settings", {"report_emails": {"week": True}}).get_json()
    assert s["report_emails"] == {"day": False, "week": True, "month": False}
    s = api.patch("/api/v1/settings", {"report_emails": {"day": True}}).get_json()
    assert s["report_emails"] == {"day": True, "week": True, "month": False}  # merged, not replaced
    assert api.patch("/api/v1/settings", {"report_emails": {"year": True}}).status_code == 422
    assert api.patch("/api/v1/settings", {"report_emails": {"day": "yes"}}).status_code == 422


@pytest.fixture
def mailbox(app, monkeypatch):
    sent = []
    monkeypatch.setitem(app.config, "SMTP_HOST", "smtp.test")
    monkeypatch.setitem(app.config, "SMTP_FROM", "Life OS <reports@lifeos.test>")
    monkeypatch.setattr("app.modules.reports.routes.send_mail", lambda to, subject, text, html, files: sent.append((to, subject, files)))
    return sent


def test_send_reports_sends_each_report_once(app, api, mailbox):
    api.patch("/api/v1/settings", {"report_emails": {"week": True, "month": True}})
    runner = app.test_cli_runner()
    first = runner.invoke(args=["send-reports", "--hour", "0"])
    assert first.exit_code == 0, first.output
    assert sorted(subject.split(" · ")[0] for _, subject, _ in mailbox) == ["Monthly report", "Weekly report"]
    assert all(files[0][2] == "application/pdf" and files[0][1].startswith(b"%PDF") for _, _, files in mailbox)
    again = runner.invoke(args=["send-reports", "--hour", "0"])
    assert again.exit_code == 0 and len(mailbox) == 2  # nothing new to send


def test_test_email_goes_to_the_account(api, mailbox):
    res = api.post("/api/v1/reports/email/test")
    assert res.status_code == 200
    assert mailbox[0][0] == res.get_json()["sent_to"]
