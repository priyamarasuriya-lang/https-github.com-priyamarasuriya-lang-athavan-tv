# Operations: deployment, backup and restore

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `SESSION_SECRET` | yes | ≥ 32 chars of randomness; HMAC key for session tokens. Rotating it signs everyone out. |
| `APP_URL` | yes | Public origin, e.g. `https://bat.example.com`. Used for the CSRF origin check and to mark cookies `Secure` when https. |
| `TEST_DATABASE_URL` | tests | Separate database whose name contains `test` |
| `STORAGE_DRIVER` | no | `local` (only driver implemented) |
| `STORAGE_LOCAL_DIR` | no | Media directory, outside the web root (default `./storage/uploads`) |
| `MAX_UPLOAD_MB` | no | Upload size limit (default 50) |
| `LOG_LEVEL` | no | `debug` · `info` · `warn` · `error` |
| `SEED_PASSWORD` | seed | Password for development seed users |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

## Single-server deployment

1. Provision PostgreSQL 16 (UTC server time zone recommended) and a database + least-privilege role.
2. Terminate TLS in a reverse proxy (nginx, Caddy, IIS ARR) in front of the app; forward
   `X-Forwarded-For`. Set `APP_URL` to the https origin.
3. Build and start:
   ```bash
   npm ci
   npm run build
   npm run db:migrate          # prisma migrate deploy — safe, only applies pending migrations
   npm start                   # or a process manager (pm2, systemd, NSSM on Windows)
   ```
   or with Docker: `docker compose up -d --build` (the container runs `migrate deploy` on start).
4. **Do not run the seed in production.** Create the first Super Administrator once, e.g. by
   running the seed against an empty staging copy and migrating users, or with a one-off script
   that calls `createUser`. Then remove/disable any development accounts.
5. Monitoring: poll `GET /api/health` (returns 503 when the database is unreachable). Logs are
   one JSON object per line on stdout/stderr (`ts`, `level`, `msg`, `requestId`, error details).
   Unexpected errors return a reference id that matches the log line.

### Upgrades

```bash
git pull && npm ci && npm run build && npm run db:migrate && <restart>
```

Migrations are forward-only. Take a backup before applying migrations in production.

## Backup

Database (logical, consistent snapshot; run from a machine with `pg_dump` 16):

```bash
pg_dump --format=custom --no-owner --file=bat_$(date +%F_%H%M).dump "$DATABASE_URL"
```

Windows with the portable tools:

```powershell
& "$env:USERPROFILE\tools\pgsql\bin\pg_dump.exe" --format=custom --no-owner --file="bat_$(Get-Date -Format yyyy-MM-dd_HHmm).dump" $env:DATABASE_URL
```

Media files: back up `STORAGE_LOCAL_DIR` (or the Docker `media` volume) together with the dump —
`MediaAsset.storageKey` rows refer to file names in that directory.

Recommended: nightly dump + file sync, 30-day retention, at least one off-site copy, and a
quarterly restore test. For point-in-time recovery, enable WAL archiving on the PostgreSQL server.

## Restore

```bash
createdb bat_scheduler_restore
pg_restore --no-owner --dbname=bat_scheduler_restore bat_2026-10-27_0200.dump
# point DATABASE_URL at the restored database, restore the media directory, then:
npm run db:migrate   # applies any migrations newer than the backup
```

After restoring, run **Media library → Verify storage** to mark any asset whose file is missing;
schedules using those assets then show `MISSING_ASSET` errors.

## Local PostgreSQL on this machine

`scripts/pg-local.ps1 start|stop|status` controls the portable server
(`%USERPROFILE%\tools\pgdata`, log at `%USERPROFILE%\tools\pg.log`). It listens on localhost only
and uses SCRAM password authentication; the password is in `.env`.

> The project folder is inside OneDrive. OneDrive syncing of `node_modules` and `.next` can cause
> file-lock errors and uploads thousands of files. Consider moving the project to a non-synced
> folder such as `C:\dev\bat-scheduler`.
