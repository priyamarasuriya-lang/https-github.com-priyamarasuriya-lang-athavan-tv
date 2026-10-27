/**
 * Create the first Super Administrator (or reset one) — for a fresh hosted database where the demo seed
 * must not be used.
 *
 *   npm run admin:create -- --email you@example.com --name "Your Name"
 *   npm run admin:create -- --email you@example.com --reset      # new password, re-activate, unlock, grant SUPER_ADMIN
 *
 * Connects to DATABASE_URL (from the environment, else .env). To target Vercel, pull its env into a file and
 * load it with node --env-file (see docs/vercel.md). The password is typed at a hidden prompt; it is never taken
 * from arguments or the environment, so it does not end up in shell history.
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { passwordPolicyError } from '../src/server/auth/password';
import { prisma } from '../src/server/db';
import { bootstrapSuperAdmin } from '../src/server/services/bootstrap-admin';

const { values: args } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' }, reset: { type: 'boolean', default: false } },
});

/** Read a line without echoing it. Requires an interactive terminal. */
function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) throw new Error('Run this from an interactive terminal: the password is read at a hidden prompt.');
  process.stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const done = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      process.stdout.write('\n');
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          done();
          return resolve(value);
        }
        if (ch === '\u0003') {
          done();
          return reject(new Error('Cancelled.'));
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function ask(question: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const email = args.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Pass a valid --email.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (use node --env-file or a .env file).');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && !args.reset) throw new Error(`${email} already exists. Re-run with --reset to set a new password and make it a Super Administrator.`);
  if (!existing && !args.name?.trim()) throw new Error('Pass --name for a new account.');

  // Show where this is going (host and database only, never credentials) and require confirmation.
  const url = new URL(process.env.DATABASE_URL);
  console.log(`Database: ${url.hostname}${url.pathname}`);
  console.log(existing ? `Resetting ${email} as Super Administrator.` : `Creating ${email} (${args.name!.trim()}) as Super Administrator.`);
  if ((await ask('Type "yes" to continue: ')) !== 'yes') throw new Error('Cancelled.');

  const password = await promptHidden('Password (12+ chars, upper/lower-case and a digit): ');
  const policy = passwordPolicyError(password);
  if (policy) throw new Error(policy);
  if ((await promptHidden('Repeat password: ')) !== password) throw new Error('Passwords do not match.');

  const user = await bootstrapSuperAdmin({ email, name: args.name, password, reset: args.reset });
  console.log(`Done. ${user.email} can now sign in as a Super Administrator.`);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
