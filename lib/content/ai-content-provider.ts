import { getAIProvider } from "@/lib/ai/get-provider";
import { contentMetadataSchema, contentMetadataJsonSchema } from "@/lib/ai/schemas";
import {
  CONTENT_GENERATION_SYSTEM_PROMPT,
  CONTENT_REVISION_SYSTEM_PROMPT,
  CONTENT_METADATA_SYSTEM_PROMPT,
  buildContentGenerationPrompt,
  buildContentRevisionPrompt,
  buildContentMetadataPrompt,
} from "@/lib/ai/prompts/content";
import { CONTENT_GENERATION_MAX_TOKENS } from "@/lib/content/limits";
import type { ContentBrief } from "@/lib/content/brief-types";
import type { ContentGenerationResult, ContentMetadataResult, ContentProvider, GeneratedContent, RevisionFeedback } from "@/lib/content/provider";

/**
 * Initial ContentProvider implementation, built on the platform's existing
 * AIProvider (Anthropic/OpenAI — same one used for opportunity
 * interpretation elsewhere). generateContent/reviseContent use generateText
 * (the body is unstructured prose); generateMetadata uses
 * generateStructuredOutput (title/meta/URL/H1 are a genuinely small,
 * structured shape). This is a seam, not a permanent choice — see
 * lib/content/get-provider.ts and README's Phase 4 section for why a real
 * CV Central integration isn't built yet.
 */
export class AiContentProvider implements ContentProvider {
  readonly name = "ai";
  get defaultModel(): string {
    return getAIProvider().defaultModel;
  }

  async generateContent(brief: ContentBrief): Promise<ContentGenerationResult> {
    const result = await getAIProvider().generateText({
      system: CONTENT_GENERATION_SYSTEM_PROMPT,
      prompt: buildContentGenerationPrompt(brief),
      maxTokens: CONTENT_GENERATION_MAX_TOKENS,
    });
    return { content: { body: result.data }, usage: result.usage, model: result.model, latencyMs: result.latencyMs };
  }

  async reviseContent(previous: GeneratedContent, feedback: RevisionFeedback, brief: ContentBrief): Promise<ContentGenerationResult> {
    const result = await getAIProvider().generateText({
      system: CONTENT_REVISION_SYSTEM_PROMPT,
      prompt: buildContentRevisionPrompt(brief, previous, feedback),
      maxTokens: CONTENT_GENERATION_MAX_TOKENS,
    });
    return { content: { body: result.data }, usage: result.usage, model: result.model, latencyMs: result.latencyMs };
  }

  async generateMetadata(brief: ContentBrief, content: GeneratedContent): Promise<ContentMetadataResult> {
    const result = await getAIProvider().generateStructuredOutput({
      system: CONTENT_METADATA_SYSTEM_PROMPT,
      prompt: buildContentMetadataPrompt(brief, content),
      schema: contentMetadataSchema,
      jsonSchema: contentMetadataJsonSchema,
      schemaName: "content_metadata",
    });
    return {
      metadata: {
        seoTitle: result.data.seo_title,
        metaDescription: result.data.meta_description,
        suggestedUrl: result.data.suggested_url,
        h1: result.data.h1,
      },
      usage: result.usage,
      model: result.model,
      latencyMs: result.latencyMs,
    };
  }
}
