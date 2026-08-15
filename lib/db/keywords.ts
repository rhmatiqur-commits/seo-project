import { supabaseAdmin } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type KeywordRow = Database["public"]["Tables"]["keywords"]["Row"];

/** Insert-or-fetch a keyword for a website (unique on website_id+keyword). */
export async function upsertKeyword(
  organizationId: string,
  websiteId: string,
  keyword: string,
  intent: string | null,
  source: "ai_suggested" | "manual"
): Promise<KeywordRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("keywords")
    .upsert(
      { organization_id: organizationId, website_id: websiteId, keyword, intent, source },
      { onConflict: "website_id,keyword", ignoreDuplicates: false }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function linkOpportunityKeyword(opportunityId: string, keywordId: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("opportunity_keywords")
    .upsert({ opportunity_id: opportunityId, keyword_id: keywordId });
  if (error) throw error;
}
