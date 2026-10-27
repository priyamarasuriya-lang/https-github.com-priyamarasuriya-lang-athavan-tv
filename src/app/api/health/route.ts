import { NextResponse } from 'next/server';
import { prisma } from '@/server/db';

export const dynamic = 'force-dynamic';

/** Liveness + database readiness. Public; reveals no configuration. */
export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', database: 'ok', latencyMs: Date.now() - started, time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: 'degraded', database: 'unreachable', time: new Date().toISOString() }, { status: 503 });
  }
}
