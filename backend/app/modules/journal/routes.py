"""Journal / daily review. One entry per local day, addressed by date: /api/v1/journal/2026-10-20."""

from datetime import date, timedelta

from flask import Blueprint
from pydantic import Field, model_validator
from sqlalchemy import func, or_, select

from app.common.auth import current_user
from app.common.errors import ApiError, not_found
from app.common.timeutil import user_today
from app.common.validation import InputModel, QueryModel, parse_body, parse_query
from app.extensions import db
from app.modules.journal.models import TEXT_FIELDS, JournalEntry

bp = Blueprint("journal", __name__, url_prefix="/api/v1/journal")

TEXT_MAX = 20_000
PREVIEW_CHARS = 140


class EntryUpsert(InputModel):
    """Only the fields sent are changed; send null or "" to clear one."""

    body: str | None = Field(default=None, max_length=TEXT_MAX)
    went_well: str | None = Field(default=None, max_length=TEXT_MAX)
    to_improve: str | None = Field(default=None, max_length=TEXT_MAX)
    challenges: str | None = Field(default=None, max_length=TEXT_MAX)
    lessons: str | None = Field(default=None, max_length=TEXT_MAX)
    gratitude: str | None = Field(default=None, max_length=TEXT_MAX)
    tomorrow_priorities: str | None = Field(default=None, max_length=TEXT_MAX)
    mood: int | None = Field(default=None, ge=1, le=5)
    energy: int | None = Field(default=None, ge=1, le=5)


class ListQuery(QueryModel):
    start: date | None = None
    end: date | None = None  # inclusive
    q: str | None = Field(default=None, max_length=200)
    limit: int = Field(default=60, ge=1, le=366)

    @model_validator(mode="after")
    def order(self):
        if self.start and self.end and self.end < self.start:
            raise ValueError("end must not be before start")
        return self


def _day(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise not_found("Day") from None


def _get(user, day: date) -> JournalEntry | None:
    return db.session.scalar(select(JournalEntry).where(JournalEntry.user_id == user.id, JournalEntry.entry_date == day))


def entry_to_dict(e: JournalEntry) -> dict:
    return {
        "id": str(e.id),
        "entry_date": e.entry_date.isoformat(),
        **{f: getattr(e, f) for f in TEXT_FIELDS},
        "mood": e.mood,
        "energy": e.energy,
        "created_at": e.created_at.isoformat(),
        "updated_at": e.updated_at.isoformat(),
    }


def _summary(e: JournalEntry) -> dict:
    first_text = next((getattr(e, f) for f in TEXT_FIELDS if getattr(e, f)), "") or ""
    filled = [f for f in TEXT_FIELDS if getattr(e, f)]
    return {
        "entry_date": e.entry_date.isoformat(),
        "preview": first_text[:PREVIEW_CHARS],
        "filled": filled,
        "mood": e.mood,
        "energy": e.energy,
    }


def _empty(e: JournalEntry) -> bool:
    return all(getattr(e, f) is None for f in (*TEXT_FIELDS, "mood", "energy"))


@bp.get("")
def list_entries():
    q = parse_query(ListQuery)
    user = current_user()
    stmt = select(JournalEntry).where(JournalEntry.user_id == user.id)
    if q.start:
        stmt = stmt.where(JournalEntry.entry_date >= q.start)
    if q.end:
        stmt = stmt.where(JournalEntry.entry_date <= q.end)
    if q.q and q.q.strip():
        text = q.q.strip()
        pattern = "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        stmt = stmt.where(or_(*(getattr(JournalEntry, f).ilike(pattern, escape="\\") for f in TEXT_FIELDS)))
    entries = db.session.scalars(stmt.order_by(JournalEntry.entry_date.desc()).limit(q.limit)).all()
    return {"items": [_summary(e) for e in entries]}


@bp.get("/<day>")
def get_entry(day):
    e = _get(current_user(), _day(day))
    if e is None:
        raise not_found("Journal entry")  # the app shows an empty page ready to write
    return entry_to_dict(e)


@bp.put("/<day>")
def upsert_entry(day):
    user = current_user()
    d = _day(day)
    if d > user_today(user) + timedelta(days=1):
        # Tomorrow is allowed (planning tomorrow's priorities tonight); further ahead is almost certainly a mistake.
        raise ApiError(422, "rule_violation", "You can't write an entry that far in the future.")
    data = parse_body(EntryUpsert)
    e = _get(user, d)
    created = e is None
    if created:
        e = JournalEntry(user_id=user.id, entry_date=d)
        db.session.add(e)
    for field, value in data.model_dump(exclude_unset=True).items():
        if isinstance(value, str):
            value = value if value.strip() else None
        setattr(e, field, value)
    if _empty(e):  # everything cleared: don't keep an empty row
        if not created:
            db.session.delete(e)
        db.session.commit()
        return "", 204
    db.session.commit()
    return entry_to_dict(e), 201 if created else 200


@bp.delete("/<day>")
def delete_entry(day):
    e = _get(current_user(), _day(day))
    if e is not None:
        db.session.delete(e)
        db.session.commit()
    return "", 204


@bp.get("/stats/mood")
def mood_series():
    """Mood and energy per day for a range (used by Home and, later, Insights)."""
    q = parse_query(ListQuery)
    user = current_user()
    end = q.end or user_today(user)
    start = q.start or end - timedelta(days=29)
    rows = db.session.execute(
        select(JournalEntry.entry_date, JournalEntry.mood, JournalEntry.energy)
        .where(JournalEntry.user_id == user.id, JournalEntry.entry_date.between(start, end),
               or_(JournalEntry.mood.is_not(None), JournalEntry.energy.is_not(None)))
        .order_by(JournalEntry.entry_date)
    ).all()
    avg = db.session.execute(
        select(func.avg(JournalEntry.mood), func.avg(JournalEntry.energy), func.count(JournalEntry.mood))
        .where(JournalEntry.user_id == user.id, JournalEntry.entry_date.between(start, end))
    ).one()
    return {
        "start": start.isoformat(), "end": end.isoformat(),
        "items": [{"date": r[0].isoformat(), "mood": r[1], "energy": r[2]} for r in rows],
        "average_mood": round(float(avg[0]), 2) if avg[0] is not None else None,
        "average_energy": round(float(avg[1]), 2) if avg[1] is not None else None,
        "days_with_mood": avg[2],
    }
