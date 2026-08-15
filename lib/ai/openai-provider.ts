import OpenAI from "openai";
import { env } from "@/lib/env";
import type {
  AIProvider,
  AIResult,
  GenerateStructuredOutputArgs,
  GenerateTextArgs,
} from "@/lib/ai/provider";

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  readonly defaultModel = env.OPENAI_MODEL;
  private client: OpenAI;

  constructor(apiKey: string | undefined = env.OPENAI_API_KEY) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");
    this.client = new OpenAI({ apiKey });
  }

  async generateText({ system, prompt, maxTokens = 1024 }: GenerateTextArgs): Promise<AIResult<string>> {
    const startedAt = Date.now();
    const response = await this.client.chat.completions.create({
      model: this.defaultModel,
      max_completion_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    });
    return {
      data: response.choices[0]?.message?.content ?? "",
      model: response.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? null,
        completionTokens: response.usage?.completion_tokens ?? null,
        totalTokens: response.usage?.total_tokens ?? null,
      },
      latencyMs: Date.now() - startedAt,
    };
  }

  async analyse(prompt: string, system = "You are a careful SEO analyst."): Promise<AIResult<string>> {
    return this.generateText({ system, prompt });
  }

  async generateStructuredOutput<T>({
    system,
    prompt,
    schema,
    jsonSchema,
    schemaName,
    maxTokens = 4096,
  }: GenerateStructuredOutputArgs<T>): Promise<AIResult<T>> {
    const startedAt = Date.now();

    const response = await this.client.chat.completions.create({
      model: this.defaultModel,
      max_completion_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      // OpenAI's strict structured-output mode: the model is constrained to
      // emit JSON matching this schema exactly (same wire-format schema the
      // Anthropic provider uses as a tool's input_schema).
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          strict: true,
          schema: jsonSchema,
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`AI provider did not return structured content for "${schemaName}".`);
    }

    // Runtime-validate against the zod schema — this is what actually enforces
    // the AI safety constraints (e.g. no search-volume/ranking fields exist on
    // the schema, so they cannot survive this parse even if the model tries).
    const parsed = schema.parse(JSON.parse(content));

    return {
      data: parsed,
      model: response.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? null,
        completionTokens: response.usage?.completion_tokens ?? null,
        totalTokens: response.usage?.total_tokens ?? null,
      },
      latencyMs: Date.now() - startedAt,
    };
  }
}
