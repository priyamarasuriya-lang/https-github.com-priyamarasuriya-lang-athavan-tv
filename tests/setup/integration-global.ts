import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { configureTestDatabase } from './env';

/**
 * Once per integration run: apply pending migrations to the dedicated test database
 * (non-destructive `migrate deploy`). Each test then truncates the test database's tables itself.
 */
export default function setup() {
  const url = configureTestDatabase();
  const prismaBin = path.resolve('node_modules/prisma/build/index.js');
  execFileSync(process.execPath, [prismaBin, 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
}
