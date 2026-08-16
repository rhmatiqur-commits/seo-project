import { WordPressPublishingProvider } from "@/lib/publishing/wordpress-provider";
import type { PublishingProvider } from "@/lib/publishing/provider";
import type { CmsProvider } from "@/lib/supabase/types";

export interface PublishingConnectionConfig {
  provider: CmsProvider;
  baseUrl: string;
  username: string;
  applicationPassword: string;
}

/**
 * Per-call factory, not a process-wide singleton like lib/ai/get-provider.ts
 * or lib/content/get-provider.ts — credentials are per-website, decrypted
 * fresh by the job handler right before use (see lib/db/cms-connections.ts),
 * never cached in memory across requests. Adding Webflow/Shopify/a custom
 * CMS later is one more branch here, no call-site changes.
 */
export function createPublishingProvider(config: PublishingConnectionConfig): PublishingProvider {
  switch (config.provider) {
    case "wordpress":
    default:
      return new WordPressPublishingProvider(config);
  }
}
