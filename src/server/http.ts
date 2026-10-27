import { randomUUID } from 'node:crypto';
import { Prisma } from '@/generated/prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type z, type ZodTypeAny } from 'zod';
import { clientIp, toActor, type Actor } from '@/server/auth/actor';
import type { Permission } from '@/server/auth/permissions';
import { SESSION_COOKIE, validateSessionToken } from '@/server/auth/session';
import { env } from '@/server/env';
import { AppError } from '@/server/errors';
import { logger } from '@/server/logger';

/**
 * API route wrapper. Every protected endpoint goes through here, which guarantees:
 *  - server-side session validation (401 when missing/expired);
 *  - permission check (403) before the handler runs — services re-check for defence in depth;
 *  - CSRF protection for state-changing methods: the Origin (or Referer) must match APP_URL;
 *  - consistent JSON envelopes: { data, meta? } on success, { error: { code, message, details? } } on failure.
 */

type Params = Record<string, string>;
interface Ctx<P extends Params> {
  req: NextRequest;
  actor: Actor;
  params: P;
}

interface Options {
  permission?: Permission;
  /** Public endpoints (login, health). */
  public?: boolean;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function api<P extends Params = Params>(opts: Options, fn: (ctx: Ctx<P>) => Promise<Response | unknown>) {
  return async (req: NextRequest, route: { params: Promise<P> }): Promise<Response> => {
    const requestId = randomUUID();
    try {
      if (!SAFE_METHODS.has(req.method)) assertSameOrigin(req);
      const params = (await route?.params) ?? ({} as P);
      let actor: Actor | null = null;
      if (!opts.public) {
        const user = await validateSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
        if (!user) throw new AppError('UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
        actor = toActor(user, clientIp(req.headers));
        if (opts.permission && !actor.permissions.has(opts.permission)) {
          throw new AppError('FORBIDDEN', 'You do not have permission to perform this action.');
        }
      }
      const result = await fn({ req, actor: actor as Actor, params });
      if (result instanceof Response) return result;
      return NextResponse.json({ data: result ?? null });
    } catch (err) {
      return errorResponse(err, requestId, req);
    }
  };
}

export function errorResponse(err: unknown, requestId: string, req?: NextRequest): Response {
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error('app error', { requestId, err });
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details ?? undefined } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Some fields are invalid.', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } },
      { status: 400 },
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return NextResponse.json({ error: { code: 'CONFLICT', message: 'A record with these values already exists.', details: err.meta } }, { status: 409 });
    }
    if (err.code === 'P2034') {
      return NextResponse.json({ error: { code: 'STALE_VERSION', message: 'Another change was being saved at the same time. Reload and try again.' } }, { status: 409 });
    }
    if (err.code === 'P2025') return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Record not found.' } }, { status: 404 });
    if (err.code === 'P2003') return NextResponse.json({ error: { code: 'CONFLICT', message: 'This record is referenced by other data and cannot be changed that way.' } }, { status: 409 });
  }
  // Raw-SQL CHECK invariants. Prisma 7's pg adapter reports a violation as a known error (P2039, Postgres 23514);
  // older engines used an unknown error. Both carry Postgres's message.
  if (
    (err instanceof Prisma.PrismaClientKnownRequestError || err instanceof Prisma.PrismaClientUnknownRequestError) &&
    /violates check constraint/.test(err.message)
  ) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'A value is out of the permitted range.' } }, { status: 400 });
  }
  logger.error('unhandled error', { requestId, path: req?.nextUrl.pathname, err });
  return NextResponse.json({ error: { code: 'INTERNAL', message: `Something went wrong. Reference: ${requestId}` } }, { status: 500 });
}

function assertSameOrigin(req: NextRequest) {
  const expected = new URL(env().APP_URL).origin;
  const origin = req.headers.get('origin') ?? (req.headers.get('referer') ? new URL(req.headers.get('referer')!).origin : null);
  // Requests without Origin/Referer are rejected: browsers always send Origin on cross-site POSTs.
  if (origin !== expected && origin !== req.nextUrl.origin) {
    throw new AppError('FORBIDDEN', 'Cross-site request blocked.');
  }
}

export async function parseJson<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError('BAD_REQUEST', 'Request body must be valid JSON.');
  }
  return schema.parse(body);
}

export function parseQuery<S extends ZodTypeAny>(req: NextRequest, schema: S): z.output<S> {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}
