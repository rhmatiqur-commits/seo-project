import { z } from "zod";

/**
 * Centralised, validated access to environment variables. Import `env` instead
 * of reading `process.env` directly so missing/invalid config fails fast with a
 * clear error instead of surfacing as a confusing runtime bug later.
 */
const envSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),

    // Which AIProvider implementation lib/ai/get-provider.ts hands back.
    // Only the selected provider's key is required — see the refine() below.
    AI_PROVIDER: z.enum(["anthropic", "openai"]).default("anthropic"),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-4-5"),
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_MODEL: z.string().min(1).default("gpt-4o"),

    ADMIN_PASSWORD: z.string().min(1),
    CRAWLER_USER_AGENT: z
      .string()
      .min(1)
      .default("SEOPlatformBot/0.1 (+https://example.com/bot)"),

    // Gates POST/GET /api/scheduler/run. Named to match Vercel Cron's own
    // convention (it auto-sends `Authorization: Bearer $CRON_SECRET`), so
    // deploying there later needs zero extra auth code.
    CRON_SECRET: z.string().min(1),

    // Google Search Console integration (Phase 2C) — opt-in, not required at
    // boot. Without these, the "Connect Search Console" admin action fails
    // with a clear error instead of the whole app refusing to start; every
    // other feature keeps working with zero GSC setup.
    GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),

    // DataForSEO SERP/keyword provider (Phase 3) — opt-in, not required at
    // boot, same pattern as the Google OAuth vars above. Without these,
    // getSerpProvider()/the keyword-provider factory fall back to null
    // implementations that honestly return nothing; every other feature
    // keeps working with zero DataForSEO setup.
    DATAFORSEO_LOGIN: z.string().min(1).optional(),
    DATAFORSEO_PASSWORD: z.string().min(1).optional(),

    // Which ContentProvider implementation lib/content/get-provider.ts hands
    // back (Phase 4). Only "ai" is implemented today (built on the existing
    // AIProvider) — this env var exists so a future CvCentralContentProvider
    // has a seam to plug into without touching call sites, same pattern as
    // AI_PROVIDER above. Not "cvcentral" yet: that integration doesn't exist
    // anywhere accessible from this repo (see README's Phase 4 section).
    CONTENT_PROVIDER: z.enum(["ai"]).default("ai"),
  })
  .refine((val) => (val.AI_PROVIDER === "anthropic" ? Boolean(val.ANTHROPIC_API_KEY) : Boolean(val.OPENAI_API_KEY)), {
    message: "Set ANTHROPIC_API_KEY (when AI_PROVIDER=anthropic) or OPENAI_API_KEY (when AI_PROVIDER=openai).",
    path: ["AI_PROVIDER"],
  });

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid/missing environment variables. Copy .env.example to .env.local and fill it in.\n${issues}`
    );
  }
  return parsed.data;
}

export const env = loadEnv();
