/**
 * Seeds the first test client: CV Central. The platform treats it as an
 * ordinary client website — nothing here is CV-Central-specific logic, it's
 * just seed data using the same createOrganization/createWebsite helpers any
 * client onboarding flow would call.
 *
 * Usage: npm run seed
 */
import { createOrganization } from "../lib/db/organizations";
import { createWebsite } from "../lib/db/websites";
import { supabaseAdmin } from "../lib/supabase/server";

const CV_CENTRAL_BASE_URL = "https://cvcentral.io";

async function main() {
  const db = supabaseAdmin();

  const { data: existingOrg } = await db.from("organizations").select("*").eq("slug", "cv-central").maybeSingle();
  const organization = existingOrg ?? (await createOrganization("CV Central"));
  console.log(`Organization: ${organization.name} (${organization.id})`);

  const { data: existingWebsite } = await db
    .from("websites")
    .select("*")
    .eq("organization_id", organization.id)
    .eq("base_url", CV_CENTRAL_BASE_URL)
    .maybeSingle();

  const website =
    existingWebsite ??
    (await createWebsite({
      organization_id: organization.id,
      name: "CV Central",
      base_url: CV_CENTRAL_BASE_URL,
      crawl_max_pages: 50,
      crawl_max_depth: 4,
    }));
  console.log(`Website: ${website.name} (${website.id}) -> ${website.base_url}`);

  console.log("\nSeed complete. Next steps:");
  console.log(`  1. Open the admin UI at /admin/websites/${website.id}`);
  console.log('  2. Click "Crawl website", then "Run SEO audit", then "Generate AI opportunities".');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
