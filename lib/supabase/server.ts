import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Server-only Supabase client using the service-role key. Never import this
 * from a client component — it has full access, bypassing Row Level Security.
 *
 * Phase 1's admin app is a trusted internal backend, so this is the only
 * client used for now. Phase 2 (client-facing access) should introduce a
 * separate anon-key + user-JWT client that relies on the RLS policies in
 * supabase/migrations/0001_init.sql.
 */
let cached: SupabaseClient<Database> | null = null;

export function supabaseAdmin(): SupabaseClient<Database> {
  if (cached) return cached;
  cached = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
