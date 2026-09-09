import { type NextRequest, NextResponse } from "next/server";

/**
 * Records the requested path (pathname + query string) on an internal request
 * header so server components — specifically `requireAuth()` — can send a
 * logged-out user to `/login?next=…` and back to where they started.
 *
 * This is the whole job: no session checks, no Prisma, no redirects. Middleware
 * runs on the Edge runtime where the real auth check (Prisma) can't run, so that
 * decision stays in `requireAuth()` / `requireUnauth()`.
 */
export const middleware = (request: NextRequest) => {
  const headers = new Headers(request.headers);
  headers.set(
    "x-viper-request-path",
    request.nextUrl.pathname + request.nextUrl.search,
  );
  return NextResponse.next({ request: { headers } });
};

export const config = {
  // Skip API routes, Next internals, the Sentry tunnel (`/monitoring`), and any
  // request for a file with an extension (static assets).
  matcher: ["/((?!api|_next|monitoring|.*\\.[^/]+$).*)"],
};
