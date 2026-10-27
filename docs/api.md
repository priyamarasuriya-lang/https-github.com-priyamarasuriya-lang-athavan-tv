# REST API

All endpoints are under `/api`, exchange JSON, and use the session cookie set by `/api/auth/login`.

**Envelope**

```jsonc
// success
{ "data": <payload> }
// failure
{ "error": { "code": "STALE_VERSION", "message": "…", "details": { … } } }
```

**Status codes**: 400 `VALIDATION_ERROR`/`BAD_REQUEST`/`REASON_REQUIRED` · 401 `UNAUTHENTICATED` ·
403 `FORBIDDEN`/`SEPARATION_OF_DUTIES` (also cross-site requests) · 404 `NOT_FOUND` ·
409 `CONFLICT`/`STALE_VERSION`/`INVALID_TRANSITION` · 413 `PAYLOAD_TOO_LARGE` ·
415 `UNSUPPORTED_MEDIA_TYPE` · 422 `SCHEDULE_HAS_CONFLICTS` (details.conflicts) · 423 `LOCKED` ·
429 `RATE_LIMITED` · 500 `INTERNAL` (message includes a reference id that is in the server log).

**CSRF**: POST/PUT/DELETE must carry an `Origin` header equal to `APP_URL` (browsers do this
automatically for same-origin `fetch`).

Durations are integer milliseconds; instants are ISO-8601 UTC; dates are `YYYY-MM-DD`;
minute-of-day fields are 0–1439 (1440 allowed as a window end = midnight).

## Health & auth

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/health` | public | `{ status, database, latencyMs }`; 503 if the database is unreachable |
| POST | `/auth/login` | public | `{ email, password }` → sets cookie; 401 bad credentials; 429 locked/throttled |
| POST | `/auth/logout` | — | deletes the session |
| GET | `/auth/me` | any | id, name, roles, permissions |

## Schedules

| Method | Path | Permission | Body / query |
| --- | --- | --- | --- |
| GET | `/schedules` | schedule.view | `channelId, status, from, to, page, pageSize` |
| POST | `/schedules` | schedule.edit | `{ channelId, broadcastDate, title?, copyFromScheduleId? , templateId? }` → ScheduleView; 409 if one exists |
| GET | `/schedules/:id?version=n` | schedule.view | ScheduleView (timeline, conflicts, actions, history) |
| PUT | `/schedules/:id/items` | schedule.edit | `{ lockVersion, items: ItemInput[] }` → ScheduleView; 409 stale; 423 locked |
| POST | `/schedules/:id/preview` | schedule.view | `{ items }` → ScheduleView computed but **not saved** |
| POST | `/schedules/:id/validate` | schedule.view | re-runs and records validation |
| POST | `/schedules/:id/transition/:action` | per action | `{ lockVersion, reason?, note? }`; action ∈ submit, withdraw, approve, reject, publish, reopen, archive |
| POST | `/schedules/:id/duplicate` | schedule.edit | `{ broadcastDate, channelId? }` |
| GET | `/schedules/:id/export?format=pdf\|xlsx\|csv` | reports.export | file download (audited) |
| GET/POST | `/templates` | view / edit | POST `{ name, description?, fromScheduleId }` |
| POST | `/templates/apply` | schedule.edit | `{ templateId, channelId, from, to, weekdays: [1..7] }` → `{ created, skipped }` |
| GET | `/approvals` | schedule.view | approval queue with validation status and decisions |

`ItemInput`:

```jsonc
{
  "kind": "CONTENT" | "BREAK",
  "contentItemId": "…",            // CONTENT only
  "commercialBreakId": "…",        // BREAK, optional
  "label": "…",
  "timingMode": "SEQUENTIAL" | "FIXED",
  "fixedTime": "19:00[:00]",       // FIXED only; channel-local, broadcast-day relative
  "plannedDurationMs": 1500000,    // optional override (positive, ≤ 24 h)
  "estimatedDurationMs": 1800000,  // live items
  "gapAfterMs": 0,
  "isLive": false,
  "notes": "…",
  "children": [ItemInput]          // BREAK only
}
```

Clients never send start/end times — the server computes them.

## Catalogue & advertising

| Method | Path | Permission |
| --- | --- | --- |
| GET / POST | `/content` (`q, category=A,B, status, channelId, sort, dir, page, pageSize`) | content.view / content.manage (ads.manage for ADVERTISEMENT) |
| PUT / DELETE | `/content/:id` (DELETE archives) | content.manage |
| POST | `/content/:id/approval` `{ state }` | content.approve |
| GET / POST | `/media` (multipart `file`, optional `durationMs`) | content.view / media.upload |
| POST | `/media/verify` | media.upload |
| GET / POST, PUT | `/channels`, `/channels/:id` | — / channel.manage |
| GET / POST, PUT | `/rules`, `/rules/:id` | schedule.view / channel.manage |
| GET / POST, PUT | `/advertisers`, `/advertisers/:id` | ads.view / ads.manage |
| GET / POST, PUT | `/campaigns`, `/campaigns/:id` | ads.view / ads.manage |
| POST | `/campaigns/:id/approval`, `/campaigns/:id/creatives` | ads.manage |
| GET / POST, PUT | `/breaks`, `/breaks/:id` | — / ads.manage |

## Reports

`GET /reports/:key?from&to&channelId&category&status&format=json|pdf|xlsx|csv`

Keys: `daily-log`, `schedules`, `program-airtime`, `ad-delivery`, `campaign-quota`, `conflicts`,
`revisions`, `pending-approvals`, `schedule-audit`, `planned-vs-actual`, `content-usage`.
`reports.view` for JSON; `reports.export` for files (audited).

## Administration

| Method | Path | Permission |
| --- | --- | --- |
| GET / POST | `/users` | users.manage |
| PUT | `/users/:id` `{ name?, isActive?, roleKeys?, password? }` | users.manage |
| POST | `/users/:id/unlock` | users.manage |
| GET | `/roles` | users.manage |
| GET | `/audit` (`entityType, entityId, action, actorId, page, pageSize`) | audit.view |
| GET / PUT | `/settings` | settings.manage |
| GET / POST | `/notifications` (POST `{ ids? }` marks read) | any |
| GET | `/dashboard` | schedule.view |
