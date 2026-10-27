import { existsSync } from 'node:fs';
import path from 'node:path';

/** Load .env and point the app at the isolated test database. Refuses to run against the main database. */
export function configureTestDatabase() {
  const file = path.resolve(process.cwd(), '.env');
  if (existsSync(file)) process.loadEnvFile(file);
  const test = process.env.TEST_DATABASE_URL;
  if (!test) throw new Error('TEST_DATABASE_URL is not set — integration tests need a separate database.');
  // Remember the real application database the first time, since workers inherit the swapped value.
  process.env.BAT_MAIN_DATABASE_URL ??= process.env.DATABASE_URL ?? '';
  if (test === process.env.BAT_MAIN_DATABASE_URL || !/test/i.test(new URL(test).pathname)) {
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL and its database name must contain "test".');
  }
  process.env.DATABASE_URL = test;
  process.env.STORAGE_LOCAL_DIR = path.resolve(process.cwd(), 'storage/test-uploads');
  process.env.VITEST_SILENT_LOGS = '1';
  return test;
}
