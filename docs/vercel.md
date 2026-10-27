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
   | `SEED_PASSWORD` | Only if you will load demo data: a strong password of your choice (12+ chars, upper/lower-case, digit). |

5. **Deploy** (*Deployments → Redeploy*). The build runs `prisma migrate deploy` against the Neon
   database, then `next build`.

## Loading data

The hosted database starts empty (no users). From this project folder, with the Vercel CLI signed in
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

## Vercel-specific limits

- **Uploads are limited to ~4 MB** per file: Vercel functions accept request bodies up to 4.5 MB.
  Larger broadcast media needs direct-to-Blob client uploads, which are not implemented yet.
- **Preview deployments share the production database** unless Neon branching is enabled for previews
  in the Neon integration settings. Each preview build also runs `migrate deploy`.
- Login throttling and settings are stored in PostgreSQL, so they work across serverless instances.
- Function duration is capped at 60 s (`vercel.json`); very large report exports should be split by date range.
