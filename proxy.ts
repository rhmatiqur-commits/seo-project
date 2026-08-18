import { createServerClient } from "@supabase/ssr";
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
 * Phase 7 adds a *separate* auth model for `/dashboard/**` — real Supabase
 * Auth sessions (client login), not the shared ADMIN_PASSWORD. This is a
 * different trust boundary entirely, not a widening of the admin one:
 * `/admin/**`/`/api/**` are completely untouched below (same Basic Auth
 * check, same exact code path, admin access keeps working exactly as
 * before). `/dashboard/**` gets its own branch that refreshes/validates a
 * Supabase session cookie and redirects to /login when there isn't one —
 * *authentication* only. *Authorisation* (which organisation, which role)
 * is never decided here — every dashboard page/action re-derives that from
 * `auth.uid()` via `lib/auth/session.ts`, checked server-side and enforced
 * again by Postgres RLS, never trusted from a URL segment or client input.
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

/** Public within /dashboard/** — everything else under it requires a session. */
const DASHBOARD_PUBLIC_PATHS = ["/dashboard/login", "/dashboard/forgot-password", "/dashboard/reset-password", "/dashboard/accept-invite"];

/**
 * Refreshes the Supabase session cookie (required so a long-lived browser
 * session doesn't silently expire mid-visit — the standard @supabase/ssr
 * middleware pattern) and redirects to the login page when there's no valid
 * user. Uses `getUser()`, never `getSession()` — the former revalidates the
 * JWT against the Auth server; the latter only reads the (possibly stale or
 * tampered-with-cookie) local session without verification, which is not
 * safe to gate access on.
 */
async function handleDashboardAuth(req: NextRequest): Promise<NextResponse> {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!anonKey || !supabaseUrl) {
    return new NextResponse("NEXT_PUBLIC_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_URL are not configured — the client portal is unavailable.", { status: 500 });
  }

  let response = NextResponse.next({ request: req });
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) req.cookies.set(name, value);
        response = NextResponse.next({ request: req });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicDashboardPath = DASHBOARD_PUBLIC_PATHS.some((p) => req.nextUrl.pathname.startsWith(p));
  if (!user && !isPublicDashboardPath) {
    const loginUrl = new URL("/dashboard/login", req.url);
    loginUrl.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  if (user && req.nextUrl.pathname === "/dashboard/login") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return response;
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  if (req.nextUrl.pathname.startsWith("/dashboard")) {
    return handleDashboardAuth(req);
  }

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
  matcher: ["/admin/:path*", "/api/:path*", "/dashboard/:path*"],
};
