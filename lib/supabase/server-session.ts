import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Phase 7: the anon-key + user-session client `lib/supabase/server.ts`'s own
 * doc comment anticipated back in Phase 1 ("a separate anon-key + user-JWT
 * client that relies on the RLS policies"). Every query made through this
 * client is filtered by Postgres RLS using the signed-in user's own
 * `auth.uid()` — this is the actual multi-tenant enforcement mechanism for
 * `/dashboard/**`, not an app-layer `.eq('organization_id', ...)` filter
 * (which would only be defense in depth, never the real boundary).
 *
 * Request-scoped (built fresh per Server Component/Server Action render —
 * never cached like `supabaseAdmin()`), because it's bound to the current
 * request's cookies. Only ever import this from server-side code (Server
 * Components, Server Actions, Route Handlers) — never from a client
 * component, and the anon key it uses is `NEXT_PUBLIC_*` by Supabase's own
 * convention (safe to ship to the browser) precisely because RLS is what
 * actually protects the data behind it, not secrecy of this key.
 */
export async function createSessionClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, mustGetAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component during rendering, where cookies
          // are read-only — expected and harmless. The session-refresh
          // middleware (proxy.ts) is what actually persists a refreshed
          // token; this catch just stops that from throwing here too.
        }
      },
    },
  });
}

function mustGetAnonKey(): string {
  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured — required for the client portal (Phase 7). See .env.example.");
  }
  return env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
