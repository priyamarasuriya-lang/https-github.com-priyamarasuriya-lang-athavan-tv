import { NextResponse, type NextRequest } from 'next/server';

/**
 * Cheap edge redirect for signed-out visitors. This only checks that a session cookie exists;
 * the session itself is validated server-side on every page render and API call.
 */
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has('bat_session');
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = req.nextUrl.pathname === '/' ? '' : `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|login|_next|favicon.ico|.*\\.(?:png|svg|ico)$).*)'],
};
