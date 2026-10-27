# BAT TV Scheduling System

A full-stack broadcast scheduling and traffic system for television stations: content catalogue,
advertising campaigns, a visual schedule editor with server-authoritative timing, conflict
detection, an approval/publishing workflow, audit logging and PDF/XLSX/CSV reporting.

Visual direction follows the Media Nucleus BAT reference (amber / teal / coral / navy tiles) with a
modern, accessible dashboard layout.

> **What this system is not.** It plans *what should air*. It does not transcode or play out
> media, and it is not connected to a playout/automation system, so it has no live on-air status
> and no as-run data. Those are clean integration boundaries — see [Known limitations](#known-limitations).

---

## Contents

- [Quick start (Windows, as set up on this machine)](#quick-start-windows-as-set-up-on-this-machine)
- [Quick start (any OS / Docker)](#quick-start-any-os--docker)
- [Development credentials](#development-credentials)
- [Commands](#commands)
- [Features](#features)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Known limitations](#known-limitations)
- Further docs: [Architecture & scheduling rules](docs/architecture.md) · [API](docs/api.md) · [Operations: deploy, backup, restore](docs/operations.md) · [Deploying to Vercel](docs/vercel.md)

---

## Quick start (Windows, as set up on this machine)

The development machine uses **portable, user-mode** tools (no admin rights required):

| Tool | Location |
| --- | --- |
| Node.js 24.22.1 LTS | `%USERPROFILE%\tools\node` (checksum-verified from nodejs.org) |
| PostgreSQL 16.15 | `%USERPROFILE%\tools\pgsql` (EnterpriseDB binaries), data in `%USERPROFILE%\tools\pgdata`, listening on `localhost:5432` only |

Each new PowerShell session:

```powershell
$env:Path = "$env:USERPROFILE\tools\node;$env:Path"
powershell -File scripts/pg-local.ps1 start     # start | stop | status
npm run dev                                      # http://localhost:3000
```

`.env` already exists (random local database password and session secret). The database is
migrated and seeded.

## Quick start (any OS / Docker)

Requirements: Node.js ≥ 20.18 and PostgreSQL 16 (or Docker).

```bash
cp .env.example .env          # set DATABASE_URL, TEST_DATABASE_URL, SESSION_SECRET
npm install                   # also runs `prisma generate`
npm run db:migrate            # apply migrations
npm run db:seed               # development/demo data (refuses to run with NODE_ENV=production)
npm run dev
```

With Docker (PostgreSQL + app; see [docs/operations.md](docs/operations.md)):

```bash
POSTGRES_PASSWORD=... SESSION_SECRET=... docker compose up --build
```

## Development credentials

`npm run db:seed` creates these **development-only** accounts, all with the password in
`SEED_PASSWORD` (default `BatDemo!2026pass`). Never seed a shared or production environment with
the default — set `SEED_PASSWORD`, or create real users through **User Management**.

| Email | Role |
| --- | --- |
| superadmin@bat.local | Super Administrator |
| admin@bat.local | Administrator |
| chief@bat.local | Chief Scheduler |
| scheduler@bat.local | Scheduler |
| content@bat.local | Content Manager |
| ads@bat.local | Advertising Manager |
| approver@bat.local | Approver |
| viewer@bat.local | Reports Viewer |

The seed builds four days of BAT Television schedules through the real services: yesterday and
today **published**, tomorrow **submitted**, the day after a **draft**, plus a partly built BAT
News 24 draft showing gap/overlap conflicts.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server on :3000 |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm test` | Unit + UI component tests (no database) |
| `npm run test:integration` | API/service tests against `TEST_DATABASE_URL` |
| `npm run test:e2e` | Playwright end-to-end tests (own server on :3100, test database) |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:migrate:dev` | Create a new migration during development |
| `npm run db:seed` | Load demo data (skips if users exist) |
| `npm run admin:create -- --email … --name …` | Create a Super Administrator (password prompted; `--reset` to recover). See docs/vercel.md for hosted databases. |
| `npm run db:reset` | **Destroys all data** in `DATABASE_URL`, re-migrates and re-seeds. Development only. |

## Features

**Scheduling engine** (server-side, pure and unit-tested — `src/server/scheduling`)
- Sequential timing (`end = start + duration`, `next = end + gap`), fixed-time items, live events with estimated durations, per-item and per-channel gaps, commercial breaks containing spots.
- Operational broadcast days per channel (configurable day start, e.g. 06:00–06:00), overnight items, IANA time zones, 23 h / 25 h days at DST transitions, explicit handling of nonexistent and ambiguous local times.
- 35+ conflict types with severity, affected items, times, reason and suggested fix: overlaps, fixed-time clashes, gaps, overrun/underrun, invalid or locked durations, missing/unlinked media, inactive/unapproved content, rights windows, channel eligibility, time windows, daily repeat limits, break over/under-fill and range, campaign dates/channels/hours/status, daily/weekly/total quotas **including airings already booked by other published schedules**, minimum spot spacing, and configurable rules (no duplicates, rating windows, category windows, approval requirements, end-of-day deadline, maximum gap).

**Schedule editor** — content library with search/filter, drag-and-drop (dnd-kit) *and* keyboard alternatives (Alt+↑/↓, move buttons, “move to position”, fixed-time entry), live server-side preview of recalculated times, undo, category filter, zoomable time ruler (full day / 6 h / 3 h / 1 h, 1–60 min ticks), conflicts panel, revisions & activity history, copy to date, save as template.

**Workflow** — Draft → Submitted → Approved → Published → Archived with withdraw, reject (reason required) and reopen (reason required, creates a new revision; the approved revision stays frozen). Server-validated transitions, separation of duties (configurable), approval queue, notifications, idempotent publishing, optimistic concurrency (`lockVersion`) on every write.

**Content & advertising** — unified catalogue (programs, movies, news, live, special events, ads, promos, fillers, slides, station IDs, PSAs) with ratings, rights windows, channel eligibility, time windows; media library with type/magic-byte validation; advertisers, campaigns (flight dates, target channels, hours, priority, daily/weekly/total limits, spacing, budget), creatives, break definitions; planned airings materialised on publish; delivery and remaining-airings tracking.

**Reports** — daily log, schedules overview, program airtime, ad delivery, campaign quota, conflicts, revisions, pending approvals, schedule change audit, planned vs actual (needs as-run data), content usage — on screen and as PDF (page numbers, station branding), XLSX and CSV (formula-injection safe). Exports require `reports.export` and are audited.

**Security** — Argon2id password hashing, opaque session tokens stored only as HMAC digests, HttpOnly + SameSite cookies (Secure when `APP_URL` is https), server-side session validation with sliding expiry, login throttling per account and per IP, generic login errors, Origin-checked CSRF protection for all state-changing API calls, role-based permissions enforced in route wrappers *and* services, session revocation on role change/deactivation, security headers (CSP, frame-ancestors none, nosniff, referrer policy), upload allow-list with content sniffing and storage outside the web root.

## Testing

Results on the development machine (27 Oct 2026):

| Suite | Result |
| --- | --- |
| Unit + UI (`npm test`) | 67 / 67 passed |
| Integration (`npm run test:integration`) | 40 / 40 passed, PostgreSQL 16 |
| End-to-end (`npm run test:e2e`) | 3 / 3 passed, Microsoft Edge, against a production build |
| `npm run typecheck`, `npm run lint`, `npm run build` | passing |

The E2E run builds the app into `.next-e2e`, starts it on port 3100 and seeds the test database.
Integration and E2E tests only touch `TEST_DATABASE_URL`; the helpers refuse to run if it equals
`DATABASE_URL` or its database name does not contain `test`. They apply migrations with
`prisma migrate deploy` and truncate the test database between tests.

The E2E suite covers: admin creates a channel and content → scheduler builds a day with programs,
a break with ads and a filler → reorders and checks server-recalculated times → introduces an
overlap and sees it reported → submission refused by the server → resolves it → submits →
approver approves and publishes → PDF/XLSX downloads verified → scheduler's direct API edit of the
published schedule rejected (423) → read-only user blocked from restricted pages and APIs →
bad login, cross-site login, stale save (409) and invalid duration (400).

E2E uses the installed Microsoft Edge (`PW_CHANNEL=msedge`, default). On machines without Edge:
`npx playwright install chromium` and run with `PW_CHANNEL=chromium`.

## Project structure

```
prisma/              schema.prisma, migrations (incl. raw-SQL invariants), seed.ts
src/app/(app)/       authenticated pages (dashboard, schedules, catalogues, ads, reports, admin…)
src/app/api/         REST endpoints (thin: validate → service)
src/components/      ui primitives, layout shell, schedule editor, content catalogue
src/lib/             shared DTOs, time-zone & duration maths, client helpers
src/server/
  auth/              sessions, passwords, permissions, login throttling
  scheduling/        pure engine: timeline, validation, context loading
  workflow/          pure transition rules
  services/          schedules, workflow, content, catalog, media, users, dashboard, audit, settings
  reports/           report builders and PDF/XLSX/CSV exporters
  validators/        zod request schemas
tests/unit · tests/integration · tests/e2e
scripts/pg-local.ps1 start/stop the portable PostgreSQL
```

## Known limitations

Recorded honestly — none of these are presented as working in the UI.

- **No playout integration.** “Now/next” on the dashboard is derived from the schedule plan and labelled as such. Actual airings (`AIRED`, as-run times) and the planned-vs-actual report stay empty until an automation system writes `actualStartAt`/`actualDurationMs` and airing status.
- **No email service.** Password resets are done by administrators in User Management; there is no self-service reset email.
- **Media storage** uses the local filesystem (`STORAGE_DRIVER=local`) or private Vercel Blob storage (`vercel-blob`, default on Vercel, uploads limited to ~4 MB there). An S3-compatible driver is not implemented. No thumbnails, transcoding, duration probing or preview playback.
- **Ad placement is manual** (with full rule enforcement on validation). There is no automatic spot-placement/optimisation algorithm.
- **Docker / CI files are written but were not executed here** — Docker was not installed on the development machine and the GitHub workflow has not run yet.
- **Campaign daily/weekly quotas across channels** bucket other channels' airings by the *current* channel's local date; this is exact for stations whose channels share a time zone.
- Report exports load up to 50,000 rows into memory per request; very large date ranges should be split.
- The schedule editor is fully usable at desktop/tablet widths; on phones it is read-friendly but drag-and-drop editing is not optimised.
- Prisma 7 with the `@prisma/adapter-pg` driver adapter. CLI settings (schema, migrations, seed, database URL) are in `prisma.config.ts`; the client is generated into `src/generated/prisma` (git-ignored) by `npm install` / `npm run db:generate`.
