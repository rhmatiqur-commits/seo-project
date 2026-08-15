import type { ZodType } from "zod";

/**
 * Abstraction around whatever LLM provider is actually doing the work.
 * Call sites depend only on this interface, never on `@anthropic-ai/sdk`
 * directly, so swapping/adding providers later doesn't ripple through the
 * codebase.
 */
export interface GenerateStructuredOutputArgs<T> {
  system: string;
  prompt: string;
  /** Runtime validator — the provider result is always parsed through this before being returned. */
  schema: ZodType<T>;
  /** Wire-format JSON Schema describing the same shape as `schema`, used to constrain the model's output. */
  jsonSchema: Record<string, unknown>;
  /** Human-readable name for the schema/tool, used in provider tracing. */
  schemaName: string;
  maxTokens?: number;
}

export interface GenerateTextArgs {
  system: string;
  prompt: string;
  maxTokens?: number;
}

export interface AIUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface AIResult<T> {
  data: T;
  model: string;
  usage: AIUsage;
  latencyMs: number;
}

export interface AIProvider {
  readonly name: string;
  readonly defaultModel: string;
  generateStructuredOutput<T>(args: GenerateStructuredOutputArgs<T>): Promise<AIResult<T>>;
  generateText(args: GenerateTextArgs): Promise<AIResult<string>>;
  /** Convenience wrapper: generateText with no special framing beyond the prompt. */
  analyse(prompt: string, system?: string): Promise<AIResult<string>>;
}
