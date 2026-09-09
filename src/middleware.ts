import { type NextRequest, NextResponse } from "next/server";

/**
 * Records the requested path on an internal header so `requireAuth()` can bounce
 * a logged-out user to `/login?next=…` and back. No session/Prisma/redirect
 * logic here — that stays in `requireAuth()`, which the Edge runtime can't run.
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
  // Skip API routes, Next internals, and the Sentry tunnel; static assets can
  // pass through harmlessly (the header is just ignored).
  matcher: ["/((?!api/|_next/|monitoring$).*)"],
};
