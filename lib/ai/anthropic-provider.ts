import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import type {
  AIProvider,
  AIResult,
  GenerateStructuredOutputArgs,
  GenerateTextArgs,
} from "@/lib/ai/provider";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly defaultModel = env.ANTHROPIC_MODEL;
  private client: Anthropic;

  constructor(apiKey: string = env.ANTHROPIC_API_KEY) {
    this.client = new Anthropic({ apiKey });
  }

  async generateText({ system, prompt, maxTokens = 1024 }: GenerateTextArgs): Promise<AIResult<string>> {
    const startedAt = Date.now();
    const response = await this.client.messages.create({
      model: this.defaultModel,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return {
      data: textBlock?.type === "text" ? textBlock.text : "",
      model: response.model,
      usage: {
        promptTokens: response.usage.input_tokens ?? null,
        completionTokens: response.usage.output_tokens ?? null,
        totalTokens: (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0),
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
    const toolName = `emit_${schemaName}`;

    const response = await this.client.messages.create({
      model: this.defaultModel,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          name: toolName,
          description: `Return the ${schemaName} result. Always call this tool exactly once with the final answer.`,
          input_schema: jsonSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: toolName },
    });

    const toolUse = response.content.find((b) => b.type === "tool_use" && b.name === toolName);
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error(`AI provider did not return the expected "${toolName}" tool call.`);
    }

    // Runtime-validate against the zod schema — this is what actually enforces
    // the AI safety constraints (e.g. no search-volume/ranking fields exist on
    // the schema, so they cannot survive this parse even if the model tries).
    const parsed = schema.parse(toolUse.input);

    return {
      data: parsed,
      model: response.model,
      usage: {
        promptTokens: response.usage.input_tokens ?? null,
        completionTokens: response.usage.output_tokens ?? null,
        totalTokens: (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0),
      },
      latencyMs: Date.now() - startedAt,
    };
  }
}

let cached: AnthropicProvider | null = null;

export function getAIProvider(): AIProvider {
  if (!cached) cached = new AnthropicProvider();
  return cached;
}
