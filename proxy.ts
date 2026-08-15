import { NextResponse, type NextRequest } from "next/server";

/**
 * Phase 1 has no per-user login for the internal admin UI — it's gated by a
 * single shared password (Basic Auth) via ADMIN_PASSWORD. Real Supabase-Auth
 * based logins (backed by the memberships/RLS already in the schema) are a
 * Phase 2 concern for client-facing access.
 *
 * Named `proxy.ts` per Next.js's current convention (the successor to
 * `middleware.ts`, which is now deprecated).
 */
export function proxy(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/admin")) return NextResponse.next();

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
  matcher: "/admin/:path*",
};
