# Architecture & scheduling rules

## Layers

```
Browser (React client components)
   │  fetch JSON  ── CSRF: Origin must equal APP_URL for non-GET
   ▼
src/app/api/**/route.ts      thin handlers: api() wrapper → zod parse → service call
   │                         api(): session validation, permission gate, error → HTTP mapping
   ▼
src/server/services/*        business operations, transactions, audit, notifications
   │                         re-check permissions (defence in depth)
   ├── src/server/scheduling  PURE engine (no I/O): timeline + validation
   ├── src/server/workflow    PURE transition rules
   └── src/server/reports     report builders + exporters
   ▼
Prisma → PostgreSQL 16
```

Server components (pages) call services directly with the signed-in `Actor`; client components
call the REST API. Business rules live only in the engine and services — never in route handlers
or React components. The editor shows times returned by the server (`/preview`), never times it
computed itself.

## Time model

- Every stored instant is `timestamptz` in UTC. Durations are integer milliseconds.
- Each channel has an IANA `timeZone` and a `broadcastDayStartMinute` (e.g. 360 = 06:00).
- A schedule's `broadcastDate` is the **operational** day: `[date @ dayStart, date+1 @ dayStart)`
  in the channel zone. It is 23 h or 25 h long across DST changes (`broadcastDayWindow`).
- Wall-clock → instant conversion (`resolveLocalTime`) resolves DST edge cases explicitly:
  - nonexistent times (spring-forward gap) shift forward by the gap (02:30 → 03:30), or can be rejected;
  - ambiguous times (fall-back overlap) resolve to the earlier instant by default, or later/reject.
- Fixed times entered as `HH:mm[:ss]` earlier than the day start belong to the *next* calendar date
  (01:30 on a 06:00 day is the night after).
- All display formatting uses the channel's zone, not the viewer's.

## Timing calculation (`scheduling/timeline.ts`)

```
effective duration  = live estimate ?? override ?? content planned duration      (content)
                    = override ?? break-definition default ?? Σ children          (break)
start(item₀)        = day start (or fixedStartAt when FIXED)
start(itemₙ)        = fixedStartAt when FIXED, otherwise max(end of all prior) + gap(itemₙ₋₁)
end                 = start + effective duration
break children      = back-to-back from the break start
```

Gaps come from the item's `gapAfterMs` or the channel's `defaultGapMs`. The engine never "fixes"
data: overlaps, gaps and mis-filled breaks are reported by the validator. Original media duration,
planned duration (override) and actual duration (as-run) are separate fields.

## Validation (`scheduling/validate.ts`)

`validateSchedule(ctx)` is deterministic: the service layer loads every fact up front (content,
breaks, active rules, campaign usage from *other* published schedules) in a fixed number of
queries, then the engine evaluates:

| Group | Codes (severity) |
| --- | --- |
| Sequence | `OVERLAP`, `FIXED_TIME_CONFLICT`, `OVERRUN` (error); `GAP`, `UNDERRUN`, `EMPTY_SCHEDULE` (warning) |
| Durations | `INVALID_DURATION`, `DURATION_NOT_EDITABLE` (error) |
| Content | `MISSING_CONTENT`, `CONTENT_INACTIVE`, `UNAPPROVED_CONTENT`, `MISSING_ASSET`, `OUTSIDE_AVAILABILITY`, `CHANNEL_INELIGIBLE`, `OUTSIDE_TIME_WINDOW`, `CONTENT_DAILY_LIMIT` (error); `NO_ASSET` (warning) |
| Breaks | `BREAK_OVERFILL`, `BREAK_DURATION_RANGE`, `BREAK_IN_BREAK` (error); `BREAK_UNDERFILL`, `AD_OUTSIDE_BREAK` (warning) |
| Campaigns | `CAMPAIGN_INACTIVE`, `CAMPAIGN_DATES`, `CAMPAIGN_CHANNEL`, `CAMPAIGN_TIME_WINDOW`, `CAMPAIGN_DAILY_LIMIT`, `CAMPAIGN_WEEKLY_LIMIT`, `CAMPAIGN_TOTAL_LIMIT`, `CAMPAIGN_SPACING` (error) |
| Rules (configurable severity) | `RULE_DUPLICATE_CONTENT`, `RULE_RATING_WINDOW`, `RULE_CATEGORY_WINDOW`, `RULE_REQUIRES_APPROVAL`, `RULE_END_DEADLINE`, `RULE_MAX_GAP` |

Each conflict carries `itemKeys`, `startAt`, `endAt`, `message` and `suggestion`. **Errors block**
submit, approve and publish (checked again on the server at each transition); warnings do not.

Validation runs on every save (persisted as a `ScheduleValidationRun` for the approval queue and
conflict report), on every preview, on explicit validate, and inside each transition.

### Configurable rules (`ScheduleRule`)

| Type | Params | Meaning |
| --- | --- | --- |
| `NO_DUPLICATE_CONTENT` | `withinMinutes?`, `categories?` | Same content may not repeat (within N minutes) |
| `RATING_TIME_WINDOW` | `ratings[]`, `startMinute`, `endMinute` | Rated content only inside the window (may wrap midnight) |
| `CATEGORY_TIME_WINDOW` | `categories[]`, `startMinute`, `endMinute` | Category only inside the window |
| `CATEGORY_REQUIRES_APPROVAL` | `categories[]` | New content in these categories starts `PENDING`; approved items without reviewed media are flagged |
| `SCHEDULE_END_DEADLINE` | `endMinute` | Schedule must finish by this local time |
| `MAX_GAP` | `maxGapMs` | Gaps longer than this are escalated |

Rules may be global or per channel; parameters are validated per type with zod before storage.

## Workflow (`workflow/transitions.ts`, `services/workflow.ts`)

| Action | From | To | Permission | Extra checks |
| --- | --- | --- | --- | --- |
| submit | DRAFT | SUBMITTED | schedule.submit | no blocking conflicts |
| withdraw | SUBMITTED | DRAFT | schedule.submit | submitter (or an approver) |
| approve | SUBMITTED | APPROVED | schedule.approve | no blocking conflicts; separation of duties |
| reject | SUBMITTED | DRAFT | schedule.approve | reason required |
| publish | APPROVED | PUBLISHED | schedule.publish | no blocking conflicts; idempotent if already published |
| reopen | APPROVED, PUBLISHED | DRAFT (new revision) | schedule.reopen | reason required |
| archive | DRAFT, APPROVED, PUBLISHED | ARCHIVED | schedule.archive | — |

Each transition runs in one **serializable** transaction: concurrency claim → state change →
approval request/decision → version freeze or new revision → ad airings (publish materialises one
`AdAiring` per spot; reopen deletes planned ones; archive cancels them) → notifications → audit.

Only `DRAFT` schedules accept item changes. Approval freezes the revision (`frozenAt`); reopening
copies it into revision *n+1* with fresh item ids so the approved history is immutable.

## Concurrency

Every write presents the `lockVersion` it read. `claimForWrite` performs
`UPDATE … WHERE id = ? AND lockVersion = ? AND status IN (…)` and increments it; zero rows updated
→ re-read to return **409 STALE_VERSION** (someone else saved), **423 LOCKED** (status forbids
edits) or 404. Two simultaneous saves therefore cannot both succeed (covered by an integration test).
Serializable transaction conflicts (Prisma `P2034`) are also reported as 409 for the client to retry.

## Database invariants

Enforced by PostgreSQL (see the `init` migration's raw SQL):

- one non-archived schedule per (channel, broadcast date) — partial unique index;
- unique item position per (version, parent) — `NULLS NOT DISTINCT` unique index;
- positive durations, valid minute-of-day ranges, ordered availability and campaign dates, break `min ≤ default ≤ max`, non-negative limits;
- coherent computed timing (`endAt ≥ startAt`), fixed items have a time, content items reference content and breaks do not.

Enforced in transactional application logic (cannot be expressed as constraints without blocking
legitimate drafts): overlaps and gaps (drafts must be able to *hold* conflicts so users can see and
fix them — they are blocked at submit/approve/publish instead), campaign quotas across schedules,
and workflow state rules.

## Security model

- Passwords: Argon2id (19 MiB, t=2). Policy ≥ 12 chars with mixed case and a digit.
- Sessions: 256-bit random token in an HttpOnly, SameSite=Lax cookie (Secure on https). Only
  `HMAC-SHA256(SESSION_SECRET, token)` is stored, so a database leak does not yield usable sessions.
  Sliding expiry (`sessionTtlHours`, default 12). Deactivation, role changes and password resets
  delete the user's sessions.
- Login: generic error messages, constant-time path for unknown emails, per-account lockout after
  `loginMaxAttempts` failures for `loginLockMinutes`, per-IP ceiling at 5× that.
- CSRF: all non-GET API calls require an `Origin` (or `Referer`) equal to `APP_URL`.
- Authorisation: the `api()` wrapper checks the route's permission; services check again. Every
  record is single-tenant (one station), so object-level checks are permission + existence.
- Only a Super Administrator can grant `SUPER_ADMIN` or modify a super administrator. Administrators
  do not hold `schedule.approve` by default.
- Uploads: MIME allow-list, magic-byte check, size limit, random file names outside the web root,
  SHA-256 checksum recorded.
- Headers: CSP (`default-src 'self'`, `frame-ancestors 'none'`), `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`; `X-Powered-By` disabled.
- CSV exports neutralise formula injection.
