# Deployment, backups and security (Stage 9)

How Life OS runs in production, how to deploy it, how backups work, and what was checked before going live.

## 1. What runs where

```
Phone / laptop ──HTTPS──▶  Host's proxy (TLS)  ──▶  Container: gunicorn + Flask  ──▶  Managed PostgreSQL
                                                     ├─ /api/…   the API                (automatic backups)
                                                     └─ /…       the built app (PWA)
```

- **One container** (`Dockerfile` at the repo root). It builds the frontend, then serves both the API and the built
  app from one address, so cookies, CSRF and the service worker work with no CORS setup. On start it applies database
  migrations (`backend/docker-entrypoint.sh`), then runs gunicorn (1 process, 8 threads, enough for one person and
  it keeps the in-memory rate limiter accurate).
- **The database is not in the container.** Use a managed PostgreSQL 16 with automatic daily backups and
  point-in-time recovery (§4).
- **HTTPS is required.** Phones only install a PWA from an HTTPS site, and session cookies are HTTPS-only in
  production. Render (§3.1) and the other usual container hosts provide HTTPS automatically.

## 2. Settings (environment variables)

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | from the database provider | `postgres://…` is accepted as given |
| `SECRET_KEY` | 64 random hex characters | `python -c "import secrets; print(secrets.token_hex(32))"`. Never reuse the development one. Changing it signs everyone out. |
| `TRUST_PROXY` | `true` | The host's HTTPS proxy sits in front: needed for real client IPs (rate limiting) and HTTPS detection |
| `PORT` | set by most hosts | default 8000 |

`APP_ENV=production` and `FRONTEND_DIST` are already set inside the image.

## 3. Deploying (any container host)

1. Create the PostgreSQL database; turn on its backups (§4). Copy its connection string.
2. Create a web service from this GitHub repository using the `Dockerfile`; set the variables in §2.
   Health check path: `/api/v1/health`.
3. Deploy. The first start creates all tables.
4. Create your account: open the address and choose *Create account* (anyone can sign up; per address it allows
   5 tries a minute and 5 new accounts a day, and 100 new accounts a day for the whole site). Or, in the host's
   shell/console, `flask --app wsgi create-user` (asks for email, name and a password, at least 10 characters).
5. Open the HTTPS address, sign in, then on your phone:
   **Android (Chrome):** menu → *Install app*. **iPhone (Safari):** Share → *Add to Home Screen*.
   Check: the app opens full-screen; turn on airplane mode → it still opens and shows today; tick a task; turn
   airplane mode off → the change syncs (banner disappears).
6. Optional: move your existing local data across. In the local app, Settings → *Download backup*; in the
   deployed app, Settings → *Restore from file…* (§4.2).

### 3.1 Free: Render + Neon (what `render.yaml` sets up)

Costs nothing. The trade-offs: the free server sleeps after ~15 minutes without visits and takes 30–60 s to wake
(the installed app still opens at once from the phone and shows today's offline copy while it wakes), and Neon's free
plan keeps only a short restore history, so download a JSON backup regularly (§4.2). Free plans change; check both
sites' current limits.

1. **Neon** (neon.tech): sign up, create a project in **Asia Pacific (Singapore)** with PostgreSQL 16. Copy the
   **direct** connection string (turn *Connection pooling* off before copying; the pooled `-pooler` address doesn't
   suit this app's database driver). It looks like `postgresql://…@ep-….ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.
2. **Render** (render.com): sign up with GitHub and allow access to this repository. *New → Blueprint*, pick this
   repository; Render reads `render.yaml` (a free web service in Singapore, built from the `Dockerfile`, deploying
   `main`). Paste the Neon string when it asks for `DATABASE_URL`. `SECRET_KEY` is generated for you and
   `TRUST_PROXY` is already set.
3. Wait for the first deploy (a few minutes). The log shows the migrations, then `Listening at: http://0.0.0.0:10000`.
   Open `https://life-os-….onrender.com/api/v1/health` → `{"status":"ok"}`.
4. **Create your account from this computer** (the free plan has no shell). In PowerShell, from the repository folder:
   ```powershell
   $env:DATABASE_URL = "<the Neon connection string>"
   backend\.venv\Scripts\python.exe -m flask --app backend/wsgi.py create-user
   Remove-Item Env:DATABASE_URL
   ```
   It asks for email, name and a password (at least 10 characters). The variable overrides `.env` for that window
   only; the last line puts it back so later commands use your local database again. `flask set-password` works the
   same way.
5. Continue with steps 5–6 above (sign in, install on the phone, move your data across).

**Updates:** push to `main` → CI must be green (§6) → redeploy. Migrations run automatically on start. Open apps
show *A new version is ready → Reload*.

**Rollback:** redeploy the previous image or commit. If a migration has to be undone, restore the database from
the backup taken before the deploy (§4.1).

## 4. Backups

Two independent layers:

| | What | Protects against | Where |
|---|---|---|---|
| Database backups | the whole database, daily + point-in-time | losing the server or the database | the database provider (automatic) |
| JSON export | one account's data, one file | your own mistakes; moving to another host | Settings → *Download backup*, keep copies off the device |

### 4.1 Database backups: turning them on and proving they work

1. In the provider's dashboard, enable daily backups with at least 7 days retention, and point-in-time recovery if offered.
2. **Restore drill**: do it once at go-live, then every 3 months. A backup that has never been restored is a hope, not a backup.
   - In the provider's dashboard, restore the latest backup **into a new database** (never over the live one).
   - From any machine with this repo's backend installed:
     ```bash
     flask --app wsgi verify-restore --source "<live DATABASE_URL>" --target "<restored database URL>"
     ```
     It compares the schema version, the row count of every table and each account's data checksums, and
     only reads both databases. "Restore verified" = the backup is good. Writes made to the live database
     after the backup was taken show up as differences, so run it soon after the restore.
   - Delete the restored copy.
3. Before risky changes (big migrations): take a manual backup or `pg_dump` first.

**Tested here:** the drill was run on the local database (`pg_dump` → `pg_restore` into a scratch database →
`verify-restore`: all 20 tables and the account checksums matched; deleting one row in the copy was correctly reported).

### 4.2 JSON export and restore

See the README *Backup* section. Restoring checks the file's checksums, does a full trial restore, shows what will
change, and replaces nothing without confirmation.

## 5. Security checklist (reviewed in Stage 9)

| Area | Status |
|---|---|
| Authentication | Argon2id password hashes; same error and same timing for unknown email vs wrong password; login limited to 5/min per IP; server-side sessions (revocable), token stored hashed |
| Sessions | Cookie `HttpOnly`, `SameSite=Lax`, `Secure` in production; 14-day lifetime; logout deletes the session; `flask set-password` signs out every device |
| CSRF | Token required on every write (except login) |
| Access control | Every `/api` route requires login unless explicitly public (login, health); every record is filtered by owner; idempotency keys are per user |
| Injection | SQLAlchemy parameters only (no SQL built from strings); React escapes all text (no raw HTML anywhere) |
| Browser hardening | Strict Content-Security-Policy (no inline or third-party scripts), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS in production |
| Caching | API responses `no-store`; offline copy limited to today's tasks/habits/schedule and settings; the journal is never stored on the device; logout clears it |
| Abuse limits | 300 requests/min per IP overall; PDF report 6/min; backup import 6/min, 50 MB max; other bodies 1 MB |
| Privacy in logs | Request shape only (method, path, status, time); never bodies or journal text (tested) |
| Secrets | `.env` git-ignored and never committed; full-history secrets scan clean (`infra/security/secret_scan.py`, runs in CI) |
| Dependencies | `pip-audit`: no known vulnerabilities; `npm audit` for shipped code: none. The test runner (Vitest) has advisories that don't ship; its upgrade is a separate task |
| Container | Non-root user; no secrets baked in; health check |

Known limits, accepted for a single-person app: one account (created from the command line); no two-factor login;
no password-reset email (use `flask set-password`).

## 6. Quality gates (CI: `.github/workflows/ci.yml`)

Every push runs: backend tests (migrations up/down, backup round trip, idempotency, security headers, API
performance budget with a year of data) · `pip-audit` · type check · lint · unit tests · build · **bundle budget**
(`npm run check:bundle`) · `npm audit` (shipped code) · **browser tests** (`npm run e2e`: every page on desktop and
phone, the main flows, real airplane mode, installability, **axe accessibility in light and dark: no critical or
serious issues**) · secrets scan over the full history · production image build.

### Performance budget

| Measure | Budget | Now |
|---|---|---|
| First-load JavaScript (gzip) | 240 kB | ~204 kB |
| First-load CSS (gzip) | 15 kB | ~7 kB |
| Largest on-demand page (gzip) | 130 kB | ~110 kB (Insights charts) |
| Everything cached for offline (gzip) | 1.2 MB | ~0.5 MB |
| Daily API screens with a year of data | 0.4–1.5 s each | well under (tests/test_performance.py) |
