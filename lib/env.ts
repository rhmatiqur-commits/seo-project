import { z } from "zod";

/**
 * Centralised, validated access to environment variables. Import `env` instead
 * of reading `process.env` directly so missing/invalid config fails fast with a
 * clear error instead of surfacing as a confusing runtime bug later.
 */
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-4-5"),
  ADMIN_PASSWORD: z.string().min(1),
  CRAWLER_USER_AGENT: z
    .string()
    .min(1)
    .default("SEOPlatformBot/0.1 (+https://example.com/bot)"),
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
