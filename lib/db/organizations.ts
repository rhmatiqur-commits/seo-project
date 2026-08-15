import { supabaseAdmin } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createOrganization(name: string): Promise<OrganizationRow> {
  const db = supabaseAdmin();
  const baseSlug = slugify(name) || "org";
  let slug = baseSlug;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db
      .from("organizations")
      .insert({ name, slug })
      .select()
      .single();
    if (!error) return data;
    // unique_violation on slug -> retry with a suffix
    if (error.code === "23505") {
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      continue;
    }
    throw error;
  }
  throw new Error(`Could not create organization "${name}": slug collisions exhausted`);
}

export async function listOrganizations(): Promise<OrganizationRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("organizations").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getOrganization(id: string): Promise<OrganizationRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("organizations").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
