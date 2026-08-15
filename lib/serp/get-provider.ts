import { env } from "@/lib/env";
import type { SerpDataProvider } from "@/lib/serp/provider";
import { NullSerpProvider } from "@/lib/serp/null-serp-provider";
import { DataForSeoSerpProvider } from "@/lib/serp/dataforseo-serp-provider";

let cached: SerpDataProvider | null = null;

/**
 * Returns the configured SerpDataProvider — DataForSeoSerpProvider when
 * DATAFORSEO_LOGIN/PASSWORD are set, NullSerpProvider (honest empty results)
 * otherwise. Mirrors lib/keywords/get-provider.ts exactly; this is the
 * single seam a different SERP provider gets wired into later.
 */
export function getSerpProvider(): SerpDataProvider {
  if (!cached) {
    cached = env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD ? new DataForSeoSerpProvider() : new NullSerpProvider();
  }
  return cached;
}
