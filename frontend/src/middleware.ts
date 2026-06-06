import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(_request: NextRequest) {
  // Auth is handled client-side via Privy wallet connect.
  // No server-side auth check needed.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
