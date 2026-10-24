"""A report as a PDF (to download, or attached to the email), built with ReportLab like the backup's readable PDF and
sharing its fonts and table style (app/modules/backup/report.py)."""

import io
from datetime import date

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Spacer

from app.modules.backup.report import MUTED, _p, _styles, _table

TEXT = {
    "en": {
        "title": {"day": "Daily report", "week": "Weekly report", "month": "Monthly report"},
        "score": "Life balance", "done": "Tasks done", "focus": "Focus", "habits": "Habits", "mood": "Mood",
        "before": "before: {n}", "minutes": "{n} min", "none": "—",
        "summary": "Summary", "tasks": "What got done", "added": "{n} added · {o} overdue now",
        "habit_rows": ["Habit", "Done", "Skipped"], "goals": "Goals", "goal_rows": ["Goal", "Progress"],
        "time": "Where the time went", "time_rows": ["Category", "Minutes"], "journal": "Journal",
        "journal_line": "{n} entries · mood {m} · energy {e}", "nothing": "Nothing recorded.",
        "uncategorised": "Other",
    },
    "zh-CN": {
        "title": {"day": "每日报告", "week": "每周报告", "month": "每月报告"},
        "score": "生活平衡", "done": "完成任务", "focus": "专注", "habits": "习惯", "mood": "心情",
        "before": "上期：{n}", "minutes": "{n} 分钟", "none": "—",
        "summary": "概览", "tasks": "完成了什么", "added": "新增 {n} · 当前逾期 {o}",
        "habit_rows": ["习惯", "完成", "跳过"], "goals": "目标", "goal_rows": ["目标", "进度"],
        "time": "时间去哪儿了", "time_rows": ["分类", "分钟"], "journal": "日记",
        "journal_line": "{n} 篇 · 心情 {m} · 精力 {e}", "nothing": "没有记录。",
        "uncategorised": "其他",
    },
}


def label(kind: str, start: date, end: date) -> str:
    if kind == "day":
        return start.strftime("%a %d %b %Y")
    if kind == "month":
        return start.strftime("%B %Y")
    return f"{start.strftime('%d %b')} – {end.strftime('%d %b %Y')}"


def build_pdf(user, r: dict) -> bytes:
    lang = user.settings.locale if user.settings.locale in TEXT else "en"
    t = TEXT[lang]
    s = _styles(lang)
    start, end = date.fromisoformat(r["period"]["start"]), date.fromisoformat(r["period"]["end"])
    pct = lambda v: t["none"] if v is None else f"{round(v)}%"  # noqa: E731
    story = [_p(t["title"][r["kind"]], s["title"]), _p(f"{user.display_name} · {label(r['kind'], start, end)}", s["sub"]), Spacer(1, 10)]

    # summary: the headline numbers next to the period before
    story.append(_p(t["summary"], s["h2"]))
    story.append(_table([
        [t["score"], t["done"], t["focus"], t["habits"], t["mood"]],
        [pct(r["score"]), str(r["tasks"]["done"]), t["minutes"].format(n=r["focus"]["minutes"]), pct(r["habits"]["rate"]),
         t["none"] if r["journal"]["mood"] is None else f"{r['journal']['mood']}/5"],
        ["", t["before"].format(n=r["tasks"]["done_before"]), t["before"].format(n=r["focus"]["minutes_before"]), "", ""],
    ], [34 * mm] * 5, s))

    story.append(_p(t["tasks"], s["h2"]))
    story.append(_p(t["added"].format(n=r["tasks"]["added"], o=r["tasks"]["overdue"]), s["small"]))
    if r["tasks"]["list"]:
        for task in r["tasks"]["list"]:
            story.append(_p(f"✓ {task['title']}" + (f"  ({task['goal']})" if task["goal"] else ""), s["body"]))
    else:
        story.append(_p(t["nothing"], s["small"]))

    if r["habits"]["items"]:
        story.append(_p(t["habits"], s["h2"]))
        story.append(_table([t["habit_rows"]] + [[h["name"], str(h["done"]), str(h["skipped"])] for h in r["habits"]["items"]],
                            [110 * mm, 30 * mm, 30 * mm], s))
    if r["goals"]:
        story.append(_p(t["goals"], s["h2"]))
        story.append(_table([t["goal_rows"]] + [[g["title"], pct(g["progress"])] for g in r["goals"]], [140 * mm, 30 * mm], s))
    if r["time"]["by_category"]:
        story.append(_p(t["time"], s["h2"]))
        story.append(_table([t["time_rows"]] + [[c["name"] or t["uncategorised"], str(c["minutes"])] for c in r["time"]["by_category"]],
                            [140 * mm, 30 * mm], s))

    j = r["journal"]
    story.append(_p(t["journal"], s["h2"]))
    story.append(_p(t["journal_line"].format(n=j["entries"], m=j["mood"] or t["none"], e=j["energy"] or t["none"]), s["small"]))
    for note in j["notes"]:
        story.append(_p(note["text"], s["body"]))

    def page(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(18 * mm, 10 * mm, "Life OS")
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, str(doc.page))
        canvas.restoreState()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm,
                            bottomMargin=18 * mm, title=t["title"][r["kind"]], author=user.display_name)
    doc.build(story, onFirstPage=page, onLaterPages=page)
    return buf.getvalue()

