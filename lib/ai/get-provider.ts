import { env } from "@/lib/env";
import type { AIProvider } from "@/lib/ai/provider";
import { AnthropicProvider } from "@/lib/ai/anthropic-provider";
import { OpenAIProvider } from "@/lib/ai/openai-provider";

let cached: AIProvider | null = null;

/**
 * Returns the configured AIProvider (AI_PROVIDER env var, default "anthropic").
 * This is the only place call sites should get a provider instance from —
 * lib/ai/seo-analysis.ts and everything downstream depends on the AIProvider
 * interface only, so adding a third provider means adding one file here and
 * one case in this switch, nothing else.
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;
  cached = env.AI_PROVIDER === "openai" ? new OpenAIProvider() : new AnthropicProvider();
  return cached;
}
