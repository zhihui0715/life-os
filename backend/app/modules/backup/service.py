"""Backup: export all of a user's data as one JSON file, and restore it (docs/01-database-schema.md §5).

Beginner note: the backup works table by table on raw rows (SQLAlchemy Core), not through the models. That way every
column is included automatically, new columns can't be forgotten, and a restored row is byte-for-byte the row that was
exported — same ids, same timestamps — so links between records (task → goal, log → habit) survive.

Safety rules:
- The file carries a SHA-256 checksum per table. A damaged or edited file is rejected before anything is touched.
- A restore REPLACES the account's data, in one transaction: it either fully succeeds or changes nothing.
- After writing, the restored rows are read back and their checksums compared with the file; any mismatch rolls back.
- Preview runs the complete restore and then rolls it back, so "the preview passed" means "the restore will pass".
- Applying requires the token from a preview of the *current* data, so nothing is overwritten that you haven't seen.
"""

import hashlib
import json
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation

from sqlalchemy import JSON, delete, select, text, update
from sqlalchemy.exc import DataError, IntegrityError

from app.common.errors import ApiError
from app.extensions import db

FORMAT = "life-os-backup"
FORMAT_VERSION = 1

# Insert order: every table comes after the tables it points to. Deleting goes in reverse.
TABLES = (
    "categories",
    "tags",
    "goals",
    "goal_milestones",
    "goal_progress_updates",
    "tasks",
    "task_tags",
    "schedule_events",
    "event_exceptions",
    "habits",
    "habit_schedule_changes",
    "habit_logs",
    "journal_entries",
    "focus_sessions",
    "activity_logs",
    "ai_runs",
    "user_settings",
)
# Tables without user_id belong to the user through their parent row: table → (parent table, link column).
CHILD_TABLES = {
    "task_tags": ("tasks", "task_id"),
    "event_exceptions": ("schedule_events", "event_id"),
    "habit_schedule_changes": ("habits", "habit_id"),
}
# Every new account gets a few default categories; an account holding only those still counts as empty.
SEEDED_TABLES = {"categories", "user_settings"}


def _table(name):
    return db.metadata.tables[name]


def _columns(name):
    """Exported columns: everything except user_id, which is replaced by the restoring account's id."""
    return [c for c in _table(name).columns if c.name != "user_id"]


def _owned(name, user_id):
    t = _table(name)
    if "user_id" in t.c:
        return t.c.user_id == user_id
    parent, link = CHILD_TABLES[name]
    p = _table(parent)
    return t.c[link].in_(select(p.c.id).where(p.c.user_id == user_id))


def _sort_key(name):
    keys = [c.name for c in _table(name).primary_key.columns if c.name != "user_id"]
    return lambda row: tuple(str(row.get(k)) for k in keys)


# ---------- values ⇄ JSON ----------

def _to_json(value):
    if value is None or isinstance(value, (bool, int, float, str, dict, list)):
        return value
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)  # exact: 20.50 stays "20.50", never 20.499999
    raise TypeError(f"Can't export a value of type {type(value).__name__}")


def _from_json(col, value, where):
    """Turn one JSON value back into the column's Python type, or explain exactly what's wrong."""
    if value is None:
        if not col.nullable:
            raise _invalid(f"{where}: {col.name} can't be empty.")
        return None
    py = dict if isinstance(col.type, JSON) else col.type.python_type  # JSONB reports `object`
    try:
        if py is bool:
            ok = isinstance(value, bool)
        elif py is int:
            ok = isinstance(value, int) and not isinstance(value, bool)
        elif py in (dict, list):
            ok = isinstance(value, (dict, list))
        elif py is Decimal:
            ok = isinstance(value, (str, int, float)) and not isinstance(value, bool)
            value = Decimal(str(value)) if ok else value
        else:
            ok = isinstance(value, str)
            if ok and py is uuid.UUID:
                value = uuid.UUID(value)
            elif ok and py is datetime:
                value = datetime.fromisoformat(value)
                ok = value.tzinfo is not None  # every stored instant has an offset
            elif ok and py is date:
                value = date.fromisoformat(value)
    except (ValueError, InvalidOperation):
        ok = False
    if not ok:
        raise _invalid(f"{where}: {col.name} has an invalid value.")
    return value


def _invalid(message):
    return ApiError(422, "backup_invalid", message)


def _checksum(rows):
    canonical = json.dumps(rows, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


# ---------- reading the account ----------

def _read_rows(name, user_id):
    cols = _columns(name)
    result = db.session.execute(select(*cols).where(_owned(name, user_id)))
    return sorted(({c.name: _to_json(v) for c, v in zip(cols, r)} for r in result), key=_sort_key(name))


def snapshot(user_id) -> dict[str, list[dict]]:
    return {name: _read_rows(name, user_id) for name in TABLES}


def _summary(data):
    return {name: len(data[name]) for name in TABLES}, {name: _checksum(data[name]) for name in TABLES}


def _schema_revision():
    return db.session.scalar(text("SELECT version_num FROM alembic_version"))


def export(user) -> dict:
    data = snapshot(user.id)
    counts, checksums = _summary(data)
    return {
        "format": FORMAT,
        "format_version": FORMAT_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "schema_revision": _schema_revision(),
        "account": {"email": user.email, "display_name": user.display_name},
        "counts": counts,
        "checksums": checksums,
        "data": data,
    }


# ---------- validating a file ----------

def validate(backup) -> tuple[dict[str, list[dict]], dict[str, list[dict]]]:
    """Check the file is a complete, undamaged Life OS backup.
    Returns (rows as JSON, rows converted for the database)."""
    if not isinstance(backup, dict) or backup.get("format") != FORMAT:
        raise _invalid("This isn't a Life OS backup file.")
    version = backup.get("format_version")
    if not isinstance(version, int) or isinstance(version, bool) or version > FORMAT_VERSION or version < 1:
        raise _invalid("This backup was made by a newer version of Life OS. Update the app first.")
    data, checksums = backup.get("data"), backup.get("checksums")
    if not isinstance(data, dict) or not isinstance(checksums, dict):
        raise _invalid("The backup file is incomplete.")
    unknown = set(data) - set(TABLES)
    if unknown:
        raise _invalid(f"The backup contains unknown sections: {', '.join(sorted(unknown))}.")

    json_rows, db_rows = {}, {}
    for name in TABLES:
        if name not in data and name not in checksums and name != "user_settings":
            data, checksums = {**data, name: []}, {**checksums, name: _checksum([])}  # table added after the file was made
        rows = data.get(name)
        if not isinstance(rows, list) or not all(isinstance(r, dict) for r in rows):
            raise _invalid(f"The backup is missing the {name} section.")
        if checksums.get(name) != _checksum(sorted(rows, key=_sort_key(name))):
            raise _invalid(f"The {name} section doesn't match its checksum: the file was edited or damaged.")
        cols = {c.name: c for c in _columns(name)}
        converted = []
        for i, row in enumerate(rows):
            where = f"{name} #{i + 1}"
            extra = set(row) - set(cols)
            if extra:
                raise _invalid(f"{where}: unknown field {sorted(extra)[0]}.")
            out = {}
            for col_name, col in cols.items():
                if col_name in row:
                    out[col_name] = _from_json(col, row[col_name], where)
                elif not (col.nullable or col.default is not None or col.server_default is not None):
                    raise _invalid(f"{where}: {col_name} is missing.")
            converted.append(out)
        if name == "user_settings" and len(converted) > 1:
            raise _invalid("The backup has more than one settings record.")
        json_rows[name], db_rows[name] = rows, converted
    return json_rows, db_rows


# ---------- comparing and restoring ----------

def _row_id(name, row):
    return tuple(str(row.get(c.name)) for c in _table(name).primary_key.columns if c.name != "user_id") or ("settings",)


def diff(current, incoming) -> dict:
    """Per table: how many rows exist now, how many the backup has, and what the restore changes."""
    tables = {}
    for name in TABLES:
        now = {_row_id(name, r): r for r in current[name]}
        new = {_row_id(name, r): r for r in incoming[name]}
        same = sum(1 for k, r in new.items() if k in now and now[k] == r)
        changed = sum(1 for k, r in new.items() if k in now and now[k] != r)
        tables[name] = {
            "current": len(now),
            "in_backup": len(new),
            "added": sum(1 for k in new if k not in now),
            "changed": changed,
            "unchanged": same,
            "removed": sum(1 for k in now if k not in new),
        }
    return tables


def account_is_empty(current) -> bool:
    return all(not current[name] for name in TABLES if name not in SEEDED_TABLES)


def preview_token(current, backup_checksums) -> str:
    """Fingerprint of (the account as it is now, the file). Changes if either changes after the preview."""
    _, now = _summary(current)
    return _checksum({"current": now, "backup": {n: backup_checksums.get(n) for n in TABLES}})


def _wipe(user_id):
    tasks = _table("tasks")
    # Subtasks point at their parent with RESTRICT; unlink them first so the whole table can go at once.
    db.session.execute(update(tasks).where(tasks.c.user_id == user_id).values(parent_task_id=None))
    for name in reversed(TABLES):
        if name != "user_settings":
            db.session.execute(delete(_table(name)).where(_owned(name, user_id)))


def _insert(user_id, db_rows):
    for name in TABLES:
        rows = db_rows[name]
        t = _table(name)
        if name == "user_settings":
            if rows:
                db.session.execute(update(t).where(t.c.user_id == user_id).values(**rows[0]))
            continue
        if name == "tasks":
            rows = sorted(rows, key=lambda r: r.get("parent_task_id") is not None)  # parents before subtasks
        if rows:
            owned = "user_id" in t.c
            db.session.execute(t.insert(), [{**r, "user_id": user_id} if owned else r for r in rows])


def restore(user_id, json_rows, db_rows):
    """Replace the account's data with the backup and verify it. The caller commits or rolls back."""
    try:
        _wipe(user_id)
        _insert(user_id, db_rows)
        db.session.flush()
    except IntegrityError as e:
        db.session.rollback()
        name = getattr(getattr(e.orig, "diag", None), "table_name", None) or "a table"
        if (getattr(e.orig, "sqlstate", None) or getattr(e.orig, "pgcode", None)) == "23505":  # unique violation
            raise ApiError(409, "backup_conflict", f"Some records in {name} already exist in another account on this "
                           "server, so this backup can't be restored here.") from None
        raise _invalid(f"Records in {name} break the app's rules (e.g. a link to a missing record).") from None
    except DataError:
        db.session.rollback()
        raise _invalid("Some values in the backup are out of range or too long.") from None

    restored = snapshot(user_id)
    for name in TABLES:
        expected = sorted(json_rows[name], key=_sort_key(name))
        if name == "user_settings" and not expected:
            continue  # an empty settings section keeps the account's own settings
        # Compare only the fields the file has: columns added after it was made just take their defaults.
        fields = {k for r in expected for k in r}
        actual = [{k: v for k, v in r.items() if k in fields} for r in restored[name]]
        if _checksum(actual) != _checksum(expected):
            db.session.rollback()
            raise ApiError(500, "backup_verify_failed", f"Restored {name} didn't match the backup; nothing was changed.")
    return restored
