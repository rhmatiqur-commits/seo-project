import { NextResponse, type NextRequest } from "next/server";

/**
 * Phase 1 has no per-user login for the internal admin UI — it's gated by a
 * single shared password (Basic Auth) via ADMIN_PASSWORD. Real Supabase-Auth
 * based logins (backed by the memberships/RLS already in the schema) are a
 * future concern for client-facing access — see SECURITY_AUDIT.md for what
 * this single shared credential does and does not protect against.
 *
 * Phase 2D widens this to also cover `/api/**`: every route under it was
 * previously reachable by anyone on the internet with zero credentials (see
 * SECURITY_AUDIT.md). Two routes are deliberately excluded because they
 * can't carry Basic Auth at all and are protected a different way:
 *  - /api/scheduler/run — GitHub Actions/Vercel Cron send a bearer secret
 *    (CRON_SECRET), checked inside the route handler itself.
 *  - /api/auth/google-search-console/callback — Google's OAuth redirect
 *    can't carry any auth header; protected by a signed, expiring `state`
 *    param instead (lib/search-console/state.ts).
 *
 * Named `proxy.ts` per Next.js's current convention (the successor to
 * `middleware.ts`, which is now deprecated).
 */
const UNAUTHENTICATED_API_PATHS = ["/api/scheduler/run", "/api/auth/google-search-console/callback"];

function requiresBasicAuth(pathname: string): boolean {
  if (pathname.startsWith("/admin")) return true;
  if (pathname.startsWith("/api")) return !UNAUTHENTICATED_API_PATHS.some((p) => pathname.startsWith(p));
  return false;
}

export function proxy(req: NextRequest) {
  if (!requiresBasicAuth(req.nextUrl.pathname)) return NextResponse.next();

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return new NextResponse("ADMIN_PASSWORD is not configured on the server.", { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
    const [, password] = decoded.split(":");
    if (password === adminPassword) return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="SEO Platform Admin"' },
  });
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
