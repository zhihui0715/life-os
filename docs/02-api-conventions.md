# API Conventions

Status: **Draft for Stage 1**. Every endpoint follows these rules; per-module endpoint lists are added to `docs/api/` as each stage is built (and an OpenAPI file is generated from the Pydantic schemas).

## 1. Basics

- Base path: `/api/v1`. All requests and responses are JSON (`Content-Type: application/json`), UTF-8 (Chinese text is fine everywhere).
- Field names: `snake_case` in JSON (matches Python and the database; the frontend API client converts nothing).
- IDs: UUID strings. The client **may** send its own `id` on create (for offline support); the server rejects duplicates with `409`.
- Instants: ISO 8601 **with** offset. Input without an offset is rejected (`422`). Output is always UTC — `"2026-10-20T01:30:00+00:00"`. The frontend displays them in the user's timezone.
- Local days: `"2026-10-20"` (no time, no zone) — interpreted in the user's timezone.
- Durations: integer minutes, field names end in `_minutes`.

## 2. Methods

| Action | Method & path | Success |
|---|---|---|
| List | `GET /api/v1/tasks?status=todo&limit=50&cursor=…` | `200` |
| Read one | `GET /api/v1/tasks/{id}` | `200` |
| Create | `POST /api/v1/tasks` | `201` + body |
| Partial update | `PATCH /api/v1/tasks/{id}` (only changed fields) | `200` + body |
| Domain actions | `POST /api/v1/tasks/{id}/complete`, `/reopen`, `/archive`, `/restore` | `200` + body |
| Delete (where allowed) | `DELETE /api/v1/habit-logs/{id}` | `204` |

Domain actions are separate endpoints (rather than "PATCH status") because they carry rules — e.g. completing sets `completed_at` and may update goal progress in one transaction.

## 3. Lists & pagination

```json
{ "items": [ … ], "next_cursor": "eyJ…", "total": 128 }
```
- Cursor pagination (stable while new items are added). Default `limit` 50, max 200.
- Filters as query params; sorting via `sort=due_date,-priority` (minus = descending), only on whitelisted fields.
- Archived records are excluded unless `include_archived=true`.

## 4. Errors — one shape everywhere

```json
{
  "error": {
    "code": "validation_error",
    "message": "Some fields are invalid.",
    "fields": { "title": [{ "type": "missing", "message": "Field required" }] },
    "request_id": "c1f…"
  }
}
```
| HTTP | `code` | When |
|---|---|---|
| 400 | `bad_request` | Malformed JSON |
| 401 | `unauthenticated` | Not logged in |
| 403 | `forbidden` / `csrf_failed` | Not allowed / missing CSRF token |
| 404 | `not_found` | Missing **or belongs to another user** (never reveal which) |
| 409 | `conflict` | Duplicate id, stale `updated_at` (see §6), unique constraint |
| 422 | `validation_error` | Field-level problems (`fields` filled) |
| 422 | `rule_violation` | Business rule, e.g. "milestone belongs to a different goal" |
| 429 | `rate_limited` | Too many requests |
| 500 | `internal_error` | Generic message only; details go to server logs with `request_id` |

`message` is English for developers. The frontend shows a translated message keyed by `code` (and by each field error's `type`), so the UI is fully bilingual without the server translating. A `409 stale_update` response also includes `current` — the record as it is now.

## 5. Authentication & security

- `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
- Session cookie: `HttpOnly`, `Secure` (production), `SameSite=Lax`, 14-day expiry, rotated on login.
- CSRF: every non-GET request must send header `X-CSRF-Token` (value from `/auth/me`).
- Every query is filtered by the logged-in `user_id` in the service layer — a shared helper makes forgetting it hard.
- Rate limits: login 5/min per IP; AI endpoints by user budget; general 300/min.
- Request bodies limited to 1 MB (backup import has its own higher limit).
- Logs record method, path, status, duration, `request_id` — **never request bodies**.

## 6. Concurrency & offline (prepared now, used in Stage 8)

- `PATCH` may include `"if_updated_at": "<timestamp the client last saw>"`. If the record changed since, the server returns `409 conflict` with the current version, and the UI shows "changed elsewhere — keep mine / keep theirs".
- Header `Idempotency-Key: <uuid>` on `POST` actions: the server remembers the result for 24 h, so a replayed offline request doesn't create duplicates.

## 7. Planned endpoint groups

| Group | Stage | Main resources |
|---|---|---|
| `/auth`, `/settings` | 1 | session, user settings (incl. `locale`, `timezone`) |
| `/categories`, `/tags`, `/tasks` | 1–2 ✅ | `/tasks` filters: `view`, `q` (search), `tag`, `goal_id`, `milestone_id`, `category_id`, `parent_id` (subtasks). Body fields `goal_id`, `milestone_id`, `parent_task_id`, `tags` (list of names; PATCH replaces the list) |
| `/goals` (`?status=`, `?archived_only=true`), `/goals/{id}` (+ `/archive`, `/restore`), `/goals/{id}/updates`, `/goals/{id}/milestones`, `/milestones/{id}` (+ `/complete`, `/reopen`, DELETE) | 2 ✅ | goal responses include `progress` (`null` = no data) and `progress_detail`; detail adds `milestones` and `updates` |
| `/calendar/events`, `/calendar/occurrences?from=&to=`, `/calendar/conflicts`, `/calendar/free-slots`, `/calendar/suggestions` (+ `/apply`) | 3 | suggestions are never applied without a separate confirm call |
| `/habits`, `/habits/{id}/logs`, `/activity-logs`, `/focus-sessions`, `/journal` | 4 | |
| `/dashboard/today`, `/analytics/*`, `/analytics/life-balance` | 5 | every metric response includes `formula_key` and `coverage` |
| `/backup/export`, `/backup/import/preview`, `/backup/import/apply` | 6 | |
| `/ai/daily-plan`, `/ai/weekly-review`, `/ai/preview-data` | 7 | |
| `/health` | 1 | unauthenticated liveness check (no data) |
