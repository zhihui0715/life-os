# Personal Life OS

A private, bilingual (English / 简体中文) personal management system: tasks, calendar, goals, habits, journal and insights.
Architecture and decisions: [`docs/00-architecture-plan.md`](docs/00-architecture-plan.md).

**Current stage: 9 — Quality & deployment.** All planned features are built: tasks, goals, calendar, habits, journal,
focus timer and activity log, a customizable Home dashboard, Insights, backup & restore, optional AI daily plans and
weekly reviews, and an installable app that works offline for the essentials. Browser tests, accessibility checks,
a security review, performance budgets and a production container are in place; CI runs them all. What's left is
choosing a host and deploying: see [`docs/04-deployment.md`](docs/04-deployment.md).

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
cd frontend && npm test                         # unit tests
cd frontend && npm run e2e                      # browser tests on the built app, own lifeos_e2e DB (first time: npx playwright install chromium)
cd frontend && npm run build && npm run check:bundle   # performance budget
python infra/security/secret_scan.py .          # secrets scan over the whole git history
```

Existing local databases need the browser-test database once:
`docker exec lifeos-db psql -U lifeos -d lifeos -c "CREATE DATABASE lifeos_e2e OWNER lifeos;"`

All of these run in CI on every push (`.github/workflows/ci.yml`).

## Useful commands

| Command | What it does |
|---|---|
| `docker compose stop` / `up -d` | Stop / start the database (data is kept) |
| `flask db migrate -m "message"` | Generate a migration after changing models — **review it before applying** |
| `flask db upgrade` | Apply migrations |
| `flask seed-dev-user` | Development only: create the test account defined in `.env` |
| `flask set-password` | Change a password (signs that account out on every device) |
| `docker build -t lifeos .` | Build the production image (API + built app in one container) |

## Backup

Settings → **Backup & restore** → *Download backup* saves everything you've entered as one `.json` file. Do this
regularly (and before applying migrations); keep copies somewhere other than this laptop.

To restore, choose *Restore from file…*: the app checks the file, does a test restore, and shows what will change.
Nothing is replaced until you confirm. A restore replaces the account's data with the backup's. Format details:
[`docs/01-database-schema.md` §5](docs/01-database-schema.md).

⚠️ `docker compose down -v` deletes the database volume — all local data. Don't use it unless you mean to.

## Install it & use it offline

The installable version is the **built** app (the dev server on :5173 deliberately has no service worker):

```bash
cd frontend && npm run build && npm run preview     # http://localhost:4173 (needs the backend running)
```

- **Chrome / Edge (desktop or Android):** the install icon in the address bar, or menu → *Install Life OS*.
- **iPhone / iPad (Safari):** Share → *Add to Home Screen*.
  Installing on a phone needs HTTPS, so it works once the app is deployed (Stage 9); `localhost` only works on the
  computer itself.

**Offline** (no connection, or the server is down): today's and overdue tasks, your habits and today's schedule are
shown as of your last visit; you can complete tasks, check in habits and quick-add tasks. Those changes wait on the
device and are sent automatically when the server is reachable again — each exactly once. A banner says what works and
lists waiting changes. Journal, goals, insights, the assistant and editing need a connection, and the journal is never
stored on the device. Logging out removes the offline copy and any unsent changes.

When a new version is built, open pages show *A new version is ready → Reload*.

## AI assistance (optional)

Off unless you set it up — the rest of the app never needs it.

1. Put an Anthropic API key in `.env`: `ANTHROPIC_API_KEY=...` (restart the backend). Optionally set `AI_MODEL`
   (default `claude-opus-5-5`; `claude-haiku-5-5` costs much less).
2. Settings → **AI assistance** → turn it on, and check the monthly token limit (default 300,000).
3. Open **Assistant**: tick which data to send, press *See exact data* to read precisely what would go out, then
   *Suggest a plan* or *Write my review*. Journal text is never ticked by default — you include it per request.

Suggestions only appear on screen. Calendar blocks and tasks are created only when you select them and confirm.
Each request is logged (what kind, which categories, tokens used) — the text sent is not stored.

## Project layout

```
backend/   Flask API — app/modules/<module>/{models,schemas,service,routes}.py, migrations/, tests/
frontend/  React + TypeScript — src/features/<module>/, src/components/ui/, src/locales/{en,zh-CN}/
docs/      Plan, database schema, API conventions, design & i18n
```
