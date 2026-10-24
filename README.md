# Personal Life OS

A private, bilingual (English / 简体中文) personal management system: tasks, calendar, goals, habits, journal and insights.
Architecture and decisions: [`docs/00-architecture-plan.md`](docs/00-architecture-plan.md).

**Current stage: 9 — Quality & deployment.** All planned features are built: tasks, goals, calendar, habits, journal,
focus timer and activity log, a customizable Home dashboard, Insights, Plan my day and a guided weekly review,
reminders, backup & restore with a readable PDF report, and an installable app that works offline for the essentials. Browser tests, accessibility checks,
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

Settings → **Backup & restore** → *Download PDF report* gives a readable, printable document of your goals, tasks,
habits, schedule, journal and weekly reviews (it can't be restored from). *Download backup file* saves everything you've entered as one `.json` file. Do this
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
lists waiting changes. Journal, goals, insights, planning and editing need a connection, and the journal is never
stored on the device. Logging out removes the offline copy and any unsent changes.

When a new version is built, open pages show *A new version is ready → Reload*.

## Look and feel

Settings → **Appearance** (saved to your account): ten accent colours, a background — plain, five soft gradients,
six public-domain masterpieces (Hokusai, Monet, Van Gogh, Hiroshige, Seurat, Caillebotte; CC0 from the Art Institute
of Chicago, credits in `frontend/public/wallpapers/credits.json` and under the picker) or three paper textures — and
an emoji avatar for your greeting. Milestones get confetti: clearing today's list, a full set of tomatoes, a finished
weekly review, habit streaks of 3, 7, 14, 30… days.

**Tomato clock** (Focus → 🍅 Tomato): 25 min focus → 5 min break, a longer break after every fourth tomato (lengths
adjustable, Pomodoro technique). The tomato ripens from green to red as you focus and sleeps during breaks; a bell
rings at each switch. Each tomato is saved as a focus session.

## Graph view

**Graph** (in the menu) shows everything still to do as a network, like Obsidian's graph view: goals are the big
nodes with their milestones and tasks around them, subtasks hang off their tasks, `#tags` and habits link in, and
four due-date hubs (Overdue, Today, This week, Later) pull work together by time. Colour shows urgency; overdue tasks
glow red and pulse. Drag, pinch or scroll to zoom, tap a dot to light up its neighbours, and open it from the card.
The same tasks are also available as a list under the graph.

## Free local AI (optional)

Two helpers use [Ollama](https://ollama.com), a free open-source AI that runs **on your own computer** — no account,
no API key, no cost, and nothing is sent online:

- **Break it down** (in a task's Subtasks): suggested next steps you tick to add as subtasks.
- **Draft with AI** (Weekly review → Reflect): a first draft from the week's numbers and task titles.

Set up once: install Ollama from ollama.com/download, run `ollama pull qwen2.5:3b` (about 2 GB), and keep Ollama
running. Settings → Local AI shows whether it's connected; the buttons only appear when it is. Only task titles and
counts go to the model, never notes or journal text. `OLLAMA_URL` / `OLLAMA_MODEL` in `.env` change the defaults.
On a laptop without a strong graphics card an answer can take a minute.

## Planning and reminders

Everything here works from your own data by fixed rules (`backend/app/modules/planning/service.py`); nothing is sent
to an outside service.

- **Plan → My day**: your open tasks ranked by urgency (overdue, due today, deadline soon, in progress, high priority,
  due this week), three suggested. *Fit into my day* places the ones you pick into free time within your working hours,
  sized by their estimates (45 min without one). Calendar blocks are created only when you press *Add to calendar*.
- **Plan → Weekly review**: look back (the week's numbers and what you finished), tidy up left-over tasks (next week,
  tomorrow or drop), reflect (went well / to improve / one lesson), and set next week's top 3. Saved per week.
- **Reminders** (Settings → Reminders, per device): notifications before events and deadlines, a habit nudge, a
  morning "Plan your day" and an end-of-week review reminder. They come from the app while it's open (a tab, or the
  installed app on a computer); on a phone they arrive while the app is open.

## Project layout

```
backend/   Flask API — app/modules/<module>/{models,schemas,service,routes}.py, migrations/, tests/
frontend/  React + TypeScript — src/features/<module>/, src/components/ui/, src/locales/{en,zh-CN}/
docs/      Plan, database schema, API conventions, design & i18n
```
