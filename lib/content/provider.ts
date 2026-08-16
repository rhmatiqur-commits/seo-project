import type { AIUsage } from "@/lib/ai/provider";
import type { ContentBrief } from "@/lib/content/brief-types";

/**
 * Abstraction around whatever actually writes the page content. Call sites
 * (lib/jobs/handlers/{generate,qa,revise}-content.ts) depend only on this
 * interface, never on a specific provider — same reasoning as lib/ai/
 * provider.ts. The initial implementation (AiContentProvider) is built on
 * the platform's own existing AIProvider (Anthropic/OpenAI); a real
 * CV Central content-engine implementation can be added later behind this
 * same interface once it's actually reachable (see README's Phase 4 section
 * for why it isn't built now).
 */

export interface GeneratedContent {
  /** Markdown/plain-text body — never includes the SEO title/meta/H1, which live in ContentMetadata instead. */
  body: string;
}

export interface ContentMetadata {
  seoTitle: string;
  metaDescription: string;
  suggestedUrl: string;
  h1: string;
}

export interface RevisionFeedback {
  /** Deterministic + AI QA issues from the failed version, in priority order. */
  issues: string[];
  /** Optional free-text instructions a human added when manually requesting a revision. */
  additionalInstructions: string | null;
}

export interface ContentGenerationResult {
  content: GeneratedContent;
  usage: AIUsage;
  model: string;
  latencyMs: number;
}

export interface ContentMetadataResult {
  metadata: ContentMetadata;
  usage: AIUsage;
  model: string;
  latencyMs: number;
}

export interface ContentProvider {
  readonly name: string;
  readonly defaultModel: string;
  generateContent(brief: ContentBrief): Promise<ContentGenerationResult>;
  reviseContent(previous: GeneratedContent, feedback: RevisionFeedback, brief: ContentBrief): Promise<ContentGenerationResult>;
  generateMetadata(brief: ContentBrief, content: GeneratedContent): Promise<ContentMetadataResult>;
}
