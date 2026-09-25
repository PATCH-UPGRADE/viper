import { type NextRequest, NextResponse } from "next/server";

/**
 * Puts the requested path on `x-viper-request-path` so `requireAuth()` can build
 * `/login?next=…`. No auth logic here — Prisma can't run on the Edge runtime.
 */
export const middleware = (request: NextRequest) => {
  const { pathname, search } = request.nextUrl;
  const headers = new Headers(request.headers);
  headers.set("x-viper-request-path", pathname + search);
  return NextResponse.next({ request: { headers } });
};

export const config = {
  // Everything except API routes, Next internals, and the Sentry tunnel.
  matcher: ["/((?!api/|_next/|monitoring$).*)"],
};
