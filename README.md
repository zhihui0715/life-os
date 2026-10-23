# Personal Life OS

A private, bilingual (English / 简体中文) personal management system: tasks, calendar, goals, habits, journal and insights.
Architecture and decisions: [`docs/00-architecture-plan.md`](docs/00-architecture-plan.md).

**Current stage: 6 — Backup.** The whole P0 plan is working: tasks, goals, calendar, habits, journal, focus timer and
activity log, a customizable Home dashboard, Insights (metrics with written formulas, an experimental Life Balance Score,
trends), and backup & restore. AI assistance (Stage 7) is next.

## Requirements (Windows)

- Python 3.12+ · Node.js 20+ · Git
- Docker Desktop (runs the PostgreSQL database)

## First-time setup

```bash
# 1. Configuration — creates .env from the template (then edit SECRET_KEY etc.)
cp .env.example .env

# 2. Database
docker compose up -d

# 3. Backend
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"
.venv/Scripts/flask db upgrade          # create tables
.venv/Scripts/flask create-user         # your account (asks for email, name, password)

# 4. Frontend
cd ../frontend
npm install
```

## Daily development

Two terminals:

```bash
cd backend && .venv/Scripts/flask run          # API on http://127.0.0.1:5000
cd frontend && npm run dev                      # app on http://localhost:5173
```

Open http://localhost:5173. Vite forwards `/api` calls to Flask, so both look like one site.

## Tests

```bash
cd backend && .venv/Scripts/python -m pytest    # needs the database running; uses the separate lifeos_test DB
cd frontend && npm test
```

## Useful commands

| Command | What it does |
|---|---|
| `docker compose stop` / `up -d` | Stop / start the database (data is kept) |
| `flask db migrate -m "message"` | Generate a migration after changing models — **review it before applying** |
| `flask db upgrade` | Apply migrations |
| `flask seed-dev-user` | Development only: create the test account defined in `.env` |

## Backup

Settings → **Backup & restore** → *Download backup* saves everything you've entered as one `.json` file. Do this
regularly (and before applying migrations); keep copies somewhere other than this laptop.

To restore, choose *Restore from file…*: the app checks the file, does a test restore, and shows what will change.
Nothing is replaced until you confirm. A restore replaces the account's data with the backup's. Format details:
[`docs/01-database-schema.md` §5](docs/01-database-schema.md).

⚠️ `docker compose down -v` deletes the database volume — all local data. Don't use it unless you mean to.

## Project layout

```
backend/   Flask API — app/modules/<module>/{models,schemas,service,routes}.py, migrations/, tests/
frontend/  React + TypeScript — src/features/<module>/, src/components/ui/, src/locales/{en,zh-CN}/
docs/      Plan, database schema, API conventions, design & i18n
```
