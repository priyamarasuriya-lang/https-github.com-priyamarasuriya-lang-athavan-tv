import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clientIp } from '@/server/auth/actor';
import { login } from '@/server/auth/login';
import { SESSION_COOKIE, sessionCookieOptions } from '@/server/auth/session';
import { api, parseJson } from '@/server/http';

const schema = z.object({ email: z.string().trim().min(1).max(200), password: z.string().min(1).max(256) });

export const POST = api({ public: true }, async ({ req }) => {
  const body = await parseJson(req, schema);
  const result = await login(body.email, body.password, { ip: clientIp(req.headers), userAgent: req.headers.get('user-agent') });
  const res = NextResponse.json({ data: { id: result.user.id, name: result.user.name, email: result.user.email } });
  res.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt));
  return res;
});
