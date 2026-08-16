import { env } from "@/lib/env";
import type { ContentProvider } from "@/lib/content/provider";
import { AiContentProvider } from "@/lib/content/ai-content-provider";

let cached: ContentProvider | null = null;

/**
 * Returns the configured ContentProvider (CONTENT_PROVIDER env var, default
 * "ai"). Mirrors lib/ai/get-provider.ts exactly — this is the only place
 * call sites should get a provider instance from, so adding a real
 * CV Central-backed implementation later means adding one branch to this
 * switch, nothing else.
 */
export function getContentProvider(): ContentProvider {
  if (cached) return cached;
  switch (env.CONTENT_PROVIDER) {
    case "ai":
    default:
      cached = new AiContentProvider();
      return cached;
  }
}

/** Test-only: reset the cached singleton so tests can inject a mock. */
export function resetContentProviderCache(): void {
  cached = null;
}
