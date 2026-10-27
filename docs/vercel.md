# Deploying to Vercel

The app is ready for Vercel: `vercel.json` runs database migrations on each deploy, the app detects
Vercel and switches media storage to **Vercel Blob** (private access), and `APP_URL` defaults to the
project's production domain.

## One-time setup (in the Vercel dashboard)

1. **Import the GitHub repository**: *Add New → Project → Import* the repository. Vercel detects
   Next.js and uses the build settings from `vercel.json`. Don't deploy yet; first add storage and
   variables (or let the first deploy fail and redeploy after step 4).
2. **Database**: *Project → Storage → Create → Neon (Postgres)*, region **Singapore** (closest to
   Asia/Colombo; matches `regions: ["sin1"]` in `vercel.json`). Connect it to the project for
   Production and Preview. This adds `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct,
   used for migrations).
3. **Media storage**: *Project → Storage → Create → Blob*, connect it to the project. This adds
   `BLOB_READ_WRITE_TOKEN`.
4. **Environment variables** (*Project → Settings → Environment Variables*, Production + Preview):

   | Name | Value |
   | --- | --- |
   | `SESSION_SECRET` | 32+ random bytes, e.g. output of `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
   | `APP_URL` | Optional. Your custom domain (e.g. `https://schedule.example.com`). Defaults to the Vercel production domain. |
   | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The first Super Administrator, created by the next deploy while none exists (password: 12+ chars, upper/lower-case, digit). Optional `ADMIN_NAME`. Remove `ADMIN_PASSWORD` after the first sign-in. |
   | `SEED_PASSWORD` | Only if you will load demo data: a strong password of your choice (12+ chars, upper/lower-case, digit). |

5. **Deploy** (*Deployments → Redeploy*). The build runs `prisma migrate deploy` against the Neon
   database, creates the first Super Administrator from `ADMIN_EMAIL` / `ADMIN_PASSWORD` if none exists
   yet (`scripts/bootstrap-admin-env.ts`; later deploys never change accounts), then `next build`.

## Loading data

The hosted database starts empty: without `ADMIN_EMAIL` / `ADMIN_PASSWORD` nobody can sign in. From this project folder, with the Vercel CLI signed in
and linked to the project:

```bash
npx vercel link
npx vercel env pull .env.vercel --environment=production
```

Then load the demo data (uses `SEED_PASSWORD` from the pulled file and writes placeholder media to Blob):

```bash
node --env-file=.env.vercel node_modules/tsx/dist/cli.mjs prisma/seed.ts
```

`.env.vercel` contains secrets: it is git-ignored; delete it when done. For real station use, skip the
demo seed and instead create one Super Administrator, then remove or deactivate the demo accounts.

### Create the first Super Administrator

`scripts/create-admin.ts` creates a Super Administrator in whichever database `DATABASE_URL` points at.
On an empty database it also creates the permissions and system roles. It shows the target host and
database name, asks you to type `yes`, then asks for the password twice at a hidden prompt (12+
characters, upper- and lower-case and a digit). The password is never passed on the command line.

```bash
npx vercel env pull .env.vercel --environment=production
node --env-file=.env.vercel node_modules/tsx/dist/cli.mjs scripts/create-admin.ts --email you@example.com --name "Your Name"
```

Run it in a real terminal (PowerShell, Windows Terminal, or the VS Code terminal); it refuses to run
without one. Check that the `Database:` line shows the Neon host before typing `yes`. If it shows
`localhost`, `.env.vercel` has no `DATABASE_URL` (Vercel leaves variables marked **Sensitive** empty
when pulled): copy the connection string from the Neon dashboard into `.env.vercel` instead.

If you forget the password or the account gets locked, re-run with `--reset` (no `--name` needed). That sets
a new password, re-activates and unlocks the account, makes sure it is a Super Administrator and signs
out its existing sessions. Delete `.env.vercel` when done. Against a local database the shorter form works:
`npm run admin:create -- --email you@example.com --name "Your Name"`.

## Vercel-specific limits

- **Uploads are limited to ~4 MB** per file: Vercel functions accept request bodies up to 4.5 MB.
  Larger broadcast media needs direct-to-Blob client uploads, which are not implemented yet.
- **Preview deployments share the production database** unless Neon branching is enabled for previews
  in the Neon integration settings. Each preview build also runs `migrate deploy`.
- Login throttling and settings are stored in PostgreSQL, so they work across serverless instances.
- Function duration is capped at 60 s (`vercel.json`); very large report exports should be split by date range.
