import type { KeywordDataProvider } from "@/lib/keywords/provider";
import { NullKeywordProvider } from "@/lib/keywords/null-provider";

let cached: KeywordDataProvider | null = null;

/**
 * Returns the configured KeywordDataProvider. Only NullKeywordProvider exists
 * today (see null-provider.ts) — this factory is the single seam a real
 * provider gets wired into later, mirroring lib/ai/get-provider.ts.
 */
export function getKeywordProvider(): KeywordDataProvider {
  if (!cached) cached = new NullKeywordProvider();
  return cached;
}
