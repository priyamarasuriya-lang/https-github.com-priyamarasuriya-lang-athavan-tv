import { NextResponse } from 'next/server';
import { SESSION_COOKIE, invalidateSession } from '@/server/auth/session';
import { api } from '@/server/http';

export const POST = api({ public: true }, async ({ req }) => {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await invalidateSession(token);
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
});
