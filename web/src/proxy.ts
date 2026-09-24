import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "adwise_session";

/**
 * Optimistic auth check: if there's no session cookie at all, skip rendering
 * the app and go straight to /login. Real validation happens client-side via
 * GET /api/v1/auth/me (an expired cookie still gets caught there).
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const url = request.nextUrl.clone();
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app", "/app/:path*", "/onboarding"],
};
