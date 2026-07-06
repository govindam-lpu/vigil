import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider } from "@/lib/types";
import type { AIProvider, AiCompleteOptions, AiCompleteResult } from "./provider";

// Anthropic implementation. Thinking is disabled: these are cheap single-shot
// extraction/summary/suggestion calls where adaptive thinking would only add cost + latency.
export class AnthropicProvider implements AIProvider {
  readonly provider: AiProvider = "anthropic";
  readonly model: string;
  private readonly client: Anthropic;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(opts: AiCompleteOptions): Promise<AiCompleteResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: opts.maxOutputTokens,
      system: opts.system,
      thinking: { type: "disabled" },
      messages: [{ role: "user", content: opts.prompt }]
    });

    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");

    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens
    };
  }
}
