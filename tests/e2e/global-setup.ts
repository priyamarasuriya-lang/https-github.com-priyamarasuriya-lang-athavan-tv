import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { configureTestDatabase } from '../setup/env';

/** Prepare the isolated test database: apply migrations, clear it, and load the demo seed. */
export default async function globalSetup() {
  const url = configureTestDatabase();
  const env = { ...process.env, DATABASE_URL: url };
  execFileSync(process.execPath, [path.resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { env, stdio: 'pipe' });
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await prisma.$disconnect();
  execFileSync(process.execPath, [path.resolve('node_modules/tsx/dist/cli.mjs'), 'prisma/seed.ts'], { env, stdio: 'pipe' });
}
