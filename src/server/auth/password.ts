import { hash, verify } from '@node-rs/argon2';

// Argon2id with OWASP-recommended baseline parameters (19 MiB, 2 iterations).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(hashValue: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashValue, plain);
  } catch {
    return false;
  }
}

/** Server-side password policy. Returns a message for the first unmet requirement, or null. */
export function passwordPolicyError(pw: string): string | null {
  if (pw.length < 12) return 'Password must be at least 12 characters.';
  if (pw.length > 256) return 'Password is too long.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) return 'Password must include upper-case, lower-case and a digit.';
  return null;
}

// A constant dummy hash used to equalise timing when the email does not exist.
let dummy: Promise<string> | null = null;
export function dummyHash(): Promise<string> {
  return (dummy ??= hashPassword('timing-equaliser-not-a-real-password'));
}
