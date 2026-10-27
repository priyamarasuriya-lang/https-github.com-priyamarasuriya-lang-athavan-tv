// Prisma CLI configuration (migrate, generate, seed). Prisma 7 no longer reads .env itself;
// dotenv never overrides variables already set, so callers that pass DATABASE_URL explicitly
// (Vercel build, test setup) keep their value.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Read directly rather than with env() so `prisma generate` (e.g. postinstall in Docker) works without a database URL.
    url: process.env.DATABASE_URL ?? '',
  },
});
