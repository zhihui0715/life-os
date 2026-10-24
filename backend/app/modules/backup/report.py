"""A readable PDF of your data — goals, tasks, habits, schedule, journal and weekly reviews — for reading, printing or
keeping. It is a report, not a backup: it can't be restored. The .json backup is the file to restore from.

Built with ReportLab (pure Python). Chinese text uses the built-in STSong font, so no font files are shipped.
"""

import io
from datetime import date, datetime, time, timedelta

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from xml.sax.saxutils import escape

from app.common.timeutil import user_today, user_zone
from app.extensions import db
from app.modules.calendar.service import occurrences
from app.modules.goals.models import Goal
from app.modules.goals.service import progress_for
from app.modules.habits.models import Habit
from app.modules.habits.service import _logs_since, habit_to_dict
from app.modules.insights import metrics
from app.modules.journal.models import TEXT_FIELDS, JournalEntry
from app.modules.planning.models import WeeklyReview
from app.modules.tasks.models import Task

pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
CJK = "STSong-Light"

INK = colors.HexColor("#1c1c1e")
MUTED = colors.HexColor("#6a6a70")
ACCENT = colors.HexColor("#0a66d4")
RULE = colors.HexColor("#e3e3e8")
FILL = colors.HexColor("#f2f2f7")

L = {
    "en": {
        "title": "Life OS report", "for": "Prepared for {name} · {date}",
        "note": "A readable copy of your data. To restore the app, use the .json backup file instead.",
        "summary": "At a glance", "goals": "Goals", "open_tasks": "Open tasks", "done_tasks": "Finished in the last 30 days",
        "habits": "Habits", "schedule": "Schedule — next 14 days", "journal": "Journal", "reviews": "Weekly reviews",
        "last30": "Last 30 days",
        "col": {"title": "Title", "status": "Status", "progress": "Progress", "target": "Target date", "due": "Due",
                "priority": "Priority", "done": "Finished", "habit": "Habit", "schedule": "Schedule",
                "streak": "Streak", "consistency": "Consistency", "when": "When", "event": "Event"},
        "stat": {"open": "Open tasks", "done30": "Tasks finished", "goals": "Active goals", "habits": "Habits",
                 "focus": "Focus minutes", "entries": "Journal entries"},
        "status": {"active": "Active", "paused": "Paused", "completed": "Completed", "abandoned": "Abandoned",
                   "inbox": "Inbox", "todo": "To do", "in_progress": "In progress", "done": "Done"},
        "priority": {1: "Urgent", 2: "High", 3: "Normal", 4: "Low"},
        "sched": {"daily": "Every day", "weekdays": "Chosen days", "x_per_week": "{n}× a week"},
        "streak": {"days": "{n} days", "weeks": "{n} weeks"},
        "fields": {"body": "Notes", "went_well": "Went well", "to_improve": "To improve", "challenges": "Challenges",
                   "lessons": "Lessons", "gratitude": "Grateful for", "tomorrow_priorities": "Tomorrow",
                   "lesson": "Lesson", "priorities": "Next week"},
        "mood": "Mood {m}/5", "energy": "Energy {e}/5", "week_of": "Week of {d}", "none": "Nothing here yet.",
        "all_day": "All day", "page": "Page {n}",
    },
    "zh-CN": {
        "title": "Life OS 报告", "for": "{name} · {date}",
        "note": "这是你的数据的可读副本。要恢复应用，请使用 .json 备份文件。",
        "summary": "概览", "goals": "目标", "open_tasks": "未完成的任务", "done_tasks": "最近 30 天完成",
        "habits": "习惯", "schedule": "日程 — 未来 14 天", "journal": "日记", "reviews": "每周回顾",
        "last30": "最近 30 天",
        "col": {"title": "标题", "status": "状态", "progress": "进度", "target": "目标日期", "due": "到期",
                "priority": "优先级", "done": "完成于", "habit": "习惯", "schedule": "频率",
                "streak": "连续", "consistency": "坚持率", "when": "时间", "event": "事件"},
        "stat": {"open": "未完成任务", "done30": "已完成任务", "goals": "进行中的目标", "habits": "习惯",
                 "focus": "专注分钟", "entries": "日记篇数"},
        "status": {"active": "进行中", "paused": "已暂停", "completed": "已完成", "abandoned": "已放弃",
                   "inbox": "收件箱", "todo": "待办", "in_progress": "进行中", "done": "已完成"},
        "priority": {1: "紧急", 2: "高", 3: "普通", 4: "低"},
        "sched": {"daily": "每天", "weekdays": "指定日期", "x_per_week": "每周 {n} 次"},
        "streak": {"days": "{n} 天", "weeks": "{n} 周"},
        "fields": {"body": "笔记", "went_well": "做得好的", "to_improve": "待改进", "challenges": "挑战",
                   "lessons": "收获", "gratitude": "感恩", "tomorrow_priorities": "明天",
                   "lesson": "收获", "priorities": "下周重点"},
        "mood": "心情 {m}/5", "energy": "精力 {e}/5", "week_of": "{d} 这一周", "none": "暂无内容。",
        "all_day": "全天", "page": "第 {n} 页",
    },
}


def _needs_cjk(text: str) -> bool:
    return any(ord(ch) > 0x2FFF for ch in text)


def _p(text, style) -> Paragraph:
    """A paragraph whose CJK runs switch to the CJK font (Helvetica has no Chinese glyphs)."""
    text = "" if text is None else str(text)
    if not _needs_cjk(text):
        return Paragraph(escape(text).replace("\n", "<br/>"), style)
    out, run, cjk = [], "", None
    for ch in text:
        is_cjk = ord(ch) > 0x2FFF
        if cjk is not None and is_cjk != cjk:
            out.append((run, cjk))
            run = ""
        run, cjk = run + ch, is_cjk
    out.append((run, cjk))
    html = "".join(f'<font name="{CJK}">{escape(r)}</font>' if c else escape(r) for r, c in out)
    return Paragraph(html.replace("\n", "<br/>"), style)


def _styles(lang: str) -> dict:
    base = CJK if lang == "zh-CN" else "Helvetica"
    bold = CJK if lang == "zh-CN" else "Helvetica-Bold"
    return {
        "title": ParagraphStyle("title", fontName=bold, fontSize=28, leading=32, textColor=INK, spaceAfter=4),
        "sub": ParagraphStyle("sub", fontName=base, fontSize=10.5, leading=14, textColor=MUTED),
        "h2": ParagraphStyle("h2", fontName=bold, fontSize=16, leading=20, textColor=INK, spaceBefore=16, spaceAfter=6),
        "h3": ParagraphStyle("h3", fontName=bold, fontSize=11.5, leading=15, textColor=INK, spaceBefore=6, spaceAfter=2),
        "body": ParagraphStyle("body", fontName=base, fontSize=10, leading=14, textColor=INK, alignment=TA_LEFT),
        "small": ParagraphStyle("small", fontName=base, fontSize=8.5, leading=11, textColor=MUTED),
        "cell": ParagraphStyle("cell", fontName=base, fontSize=9, leading=12, textColor=INK),
        "head": ParagraphStyle("head", fontName=bold, fontSize=8.5, leading=11, textColor=MUTED),
        "stat": ParagraphStyle("stat", fontName=bold, fontSize=20, leading=24, textColor=ACCENT),
    }


def _table(rows: list[list], widths: list[float], s: dict) -> Table:
    data = [[_p(c, s["head"]) for c in rows[0]]] + [[_p(c, s["cell"]) for c in r] for r in rows[1:]]
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, INK),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def _fmt_day(d: date | None) -> str:
    return d.isoformat() if d else "—"


def build_report(user) -> bytes:
    lang = user.settings.locale if user.settings.locale in L else "en"
    t, s = L[lang], _styles(lang)
    tz = user_zone(user)
    today = user_today(user)
    width = A4[0] - 36 * mm
    story = []

    # ----- data
    goals = db.session.scalars(select(Goal).where(Goal.user_id == user.id, Goal.archived_at.is_(None))
                               .order_by(Goal.status, Goal.target_date.asc().nulls_last())).all()
    progress = progress_for(goals)
    open_tasks = db.session.scalars(select(Task).where(Task.user_id == user.id, Task.status != "done", Task.archived_at.is_(None),
                                                       Task.parent_task_id.is_(None))
                                    .order_by(Task.due_date.asc().nulls_last(), Task.priority)).all()
    since = datetime.combine(today - timedelta(days=30), time.min, tz)
    done_tasks = db.session.scalars(select(Task).where(Task.user_id == user.id, Task.completed_at >= since)
                                    .order_by(Task.completed_at.desc())).all()
    habit_rows = db.session.scalars(select(Habit).where(Habit.user_id == user.id, Habit.archived_at.is_(None)).order_by(Habit.name)).all()
    logs = _logs_since([h.id for h in habit_rows], min([h.start_date for h in habit_rows], default=today))
    habits = [habit_to_dict(h, user, logs[h.id]) for h in habit_rows]
    start = datetime.combine(today, time.min, tz)
    events = [o for o in occurrences(user, start, start + timedelta(days=14)) if o.event.kind != "preference"]
    entries = db.session.scalars(select(JournalEntry).where(JournalEntry.user_id == user.id).order_by(JournalEntry.entry_date.desc())).all()
    reviews = db.session.scalars(select(WeeklyReview).where(WeeklyReview.user_id == user.id).order_by(WeeklyReview.week_start.desc())).all()
    p30 = metrics.Period(today - timedelta(days=29), today, today)
    focus = metrics.focus_metric(user, p30)

    # ----- cover
    story += [_p(t["title"], s["title"]), _p(t["for"].format(name=user.display_name, date=today.isoformat()), s["sub"]),
              Spacer(1, 3), _p(t["note"], s["small"]), Spacer(1, 10)]

    stats = [(len(open_tasks), t["stat"]["open"]), (len(done_tasks), t["stat"]["done30"]),
             (sum(1 for g in goals if g.status == "active"), t["stat"]["goals"]), (len(habits), t["stat"]["habits"]),
             (focus["minutes"], t["stat"]["focus"]), (len(entries), t["stat"]["entries"])]
    tiles = Table([[_p(str(v), s["stat"]) for v, _ in stats], [_p(k, s["small"]) for _, k in stats]],
                  colWidths=[width / len(stats)] * len(stats))
    tiles.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), FILL), ("TOPPADDING", (0, 0), (-1, 0), 10),
                               ("BOTTOMPADDING", (0, -1), (-1, -1), 10), ("LEFTPADDING", (0, 0), (-1, -1), 10)]))
    story += [_p(t["summary"], s["h2"]), _p(t["last30"], s["small"]), Spacer(1, 4), tiles]

    # ----- goals
    story.append(_p(t["goals"], s["h2"]))
    if goals:
        c = t["col"]
        rows = [[c["title"], c["status"], c["progress"], c["target"]]]
        for g in goals:
            pr = progress[g.id].value if g.id in progress else None
            rows.append([g.title, t["status"].get(g.status, g.status), "—" if pr is None else f"{pr}%", _fmt_day(g.target_date)])
        story.append(_table(rows, [width * 0.5, width * 0.17, width * 0.13, width * 0.2], s))
    else:
        story.append(_p(t["none"], s["small"]))

    # ----- tasks
    c = t["col"]
    story.append(_p(t["open_tasks"], s["h2"]))
    if open_tasks:
        rows = [[c["title"], c["due"], c["priority"], c["status"]]]
        rows += [[x.title, _fmt_day(x.due_date), t["priority"].get(x.priority, ""), t["status"].get(x.status, x.status)] for x in open_tasks]
        story.append(_table(rows, [width * 0.55, width * 0.17, width * 0.13, width * 0.15], s))
    else:
        story.append(_p(t["none"], s["small"]))
    story.append(_p(t["done_tasks"], s["h2"]))
    if done_tasks:
        rows = [[c["title"], c["done"]]] + [[x.title, x.completed_at.astimezone(tz).strftime("%Y-%m-%d %H:%M")] for x in done_tasks]
        story.append(_table(rows, [width * 0.75, width * 0.25], s))
    else:
        story.append(_p(t["none"], s["small"]))

    # ----- habits
    story.append(_p(t["habits"], s["h2"]))
    if habits:
        rows = [[c["habit"], c["schedule"], c["streak"], c["consistency"]]]
        for h in habits:
            st = h["stats"]
            rows.append([h["name"], t["sched"][h["schedule_type"]].format(n=h["times_per_week"]),
                         t["streak"][st["unit"]].format(n=st["current_streak"]),
                         "—" if st["consistency"] is None else f"{round(st['consistency'] * 100)}%"])
        story.append(_table(rows, [width * 0.4, width * 0.25, width * 0.17, width * 0.18], s))
    else:
        story.append(_p(t["none"], s["small"]))

    # ----- schedule
    story.append(_p(t["schedule"], s["h2"]))
    if events:
        rows = [[c["when"], c["event"]]]
        for o in events:
            local = o.starts_at.astimezone(tz)
            when = f'{local:%a %Y-%m-%d} · {t["all_day"]}' if o.event.all_day else \
                f'{local:%a %Y-%m-%d %H:%M}–{o.ends_at.astimezone(tz):%H:%M}'
            rows.append([when, o.title])
        story.append(_table(rows, [width * 0.38, width * 0.62], s))
    else:
        story.append(_p(t["none"], s["small"]))

    # ----- weekly reviews
    story.append(_p(t["reviews"], s["h2"]))
    if reviews:
        for r in reviews:
            block = [_p(t["week_of"].format(d=r.week_start.isoformat()), s["h3"])]
            for key in ("went_well", "to_improve", "lesson"):
                if getattr(r, key):
                    block += [_p(t["fields"][key], s["small"]), _p(getattr(r, key), s["body"])]
            if r.priorities:
                block += [_p(t["fields"]["priorities"], s["small"]), _p("\n".join(f"• {x}" for x in r.priorities), s["body"])]
            story.append(KeepTogether(block + [Spacer(1, 6)]))
    else:
        story.append(_p(t["none"], s["small"]))

    # ----- journal
    story.append(_p(t["journal"], s["h2"]))
    if entries:
        for e in entries:
            meta = [e.entry_date.strftime("%A %Y-%m-%d")]
            if e.mood:
                meta.append(t["mood"].format(m=e.mood))
            if e.energy:
                meta.append(t["energy"].format(e=e.energy))
            block = [_p(" · ".join(meta), s["h3"])]
            for f in TEXT_FIELDS:
                v = getattr(e, f)
                if v:
                    block += [_p(t["fields"][f], s["small"]), _p(v, s["body"])]
            story += block + [Spacer(1, 6)]
    else:
        story.append(_p(t["none"], s["small"]))

    def page(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(18 * mm, 10 * mm, "Life OS")
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, str(doc.page))
        canvas.restoreState()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm,
                            bottomMargin=18 * mm, title=t["title"], author=user.display_name)
    doc.build(story, onFirstPage=page, onLaterPages=page)
    return buf.getvalue()
