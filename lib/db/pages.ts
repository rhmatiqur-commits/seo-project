import { supabaseAdmin } from "@/lib/supabase/server";
import { jsonb, type Database, type Heading, type RedirectHop, type WebsitePage } from "@/lib/supabase/types";

type PageInsertRaw = Database["public"]["Tables"]["website_pages"]["Insert"];
/** Ergonomic insert shape: jsonb columns take their real TS type, cast to `Json` right before the DB call. */
type PageInsert = Omit<PageInsertRaw, "headings" | "redirect_chain"> & {
  headings?: Heading[];
  redirect_chain?: RedirectHop[] | null;
};
type LinkInsert = Database["public"]["Tables"]["page_links"]["Insert"];

/** Insert-or-update a crawled page, keyed on (website_id, url_hash). */
export async function upsertPage(input: PageInsert): Promise<WebsitePage> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("website_pages")
    .upsert(
      {
        ...input,
        headings: jsonb(input.headings ?? []),
        redirect_chain: jsonb(input.redirect_chain ?? null),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "website_id,url_hash" }
    )
    .select()
    .single();
  if (error) throw error;
  return data as unknown as WebsitePage;
}

export async function insertPageLinks(links: LinkInsert[]): Promise<void> {
  if (links.length === 0) return;
  const db = supabaseAdmin();
  const { error } = await db.from("page_links").insert(links);
  if (error) throw error;
}

export async function listPagesForWebsite(websiteId: string): Promise<WebsitePage[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("website_pages")
    .select("*")
    .eq("website_id", websiteId)
    .order("depth", { ascending: true })
    .order("url", { ascending: true });
  if (error) throw error;
  return data as unknown as WebsitePage[];
}

export async function listLinksForWebsite(websiteId: string) {
  const db = supabaseAdmin();
  const { data, error } = await db.from("page_links").select("*").eq("website_id", websiteId);
  if (error) throw error;
  return data;
}

/** Marks pages with zero inbound internal links (other than the homepage) as orphans. */
export async function recomputeOrphanPages(websiteId: string): Promise<void> {
  const db = supabaseAdmin();
  const [pagesRes, linksRes] = await Promise.all([
    db.from("website_pages").select("id, depth").eq("website_id", websiteId),
    db.from("page_links").select("target_page_id").eq("website_id", websiteId).eq("is_internal", true),
  ]);
  if (pagesRes.error) throw pagesRes.error;
  if (linksRes.error) throw linksRes.error;

  const inboundTargets = new Set(
    linksRes.data.map((l) => l.target_page_id).filter((id): id is string => Boolean(id))
  );

  const updates = pagesRes.data.map((p) => ({
    id: p.id,
    is_orphan: p.depth === 0 ? false : !inboundTargets.has(p.id),
  }));

  await Promise.all(
    updates.map((u) => db.from("website_pages").update({ is_orphan: u.is_orphan }).eq("id", u.id))
  );
}
