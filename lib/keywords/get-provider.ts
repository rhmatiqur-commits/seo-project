import { env } from "@/lib/env";
import type { KeywordDataProvider } from "@/lib/keywords/provider";
import { NullKeywordProvider } from "@/lib/keywords/null-provider";
import { DataForSeoKeywordProvider } from "@/lib/keywords/dataforseo-provider";

let cached: KeywordDataProvider | null = null;

/**
 * Returns the configured KeywordDataProvider — DataForSeoKeywordProvider
 * (Phase 3) when DATAFORSEO_LOGIN/PASSWORD are set, NullKeywordProvider
 * (honest empty results) otherwise. This factory is the single seam a real
 * provider gets wired into, mirroring lib/ai/get-provider.ts.
 */
export function getKeywordProvider(): KeywordDataProvider {
  if (!cached) {
    cached = env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD ? new DataForSeoKeywordProvider() : new NullKeywordProvider();
  }
  return cached;
}
