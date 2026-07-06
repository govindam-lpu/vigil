import { GoogleGenAI } from "@google/genai";
import type { AiProvider } from "@/lib/types";
import type { AIProvider, AiCompleteOptions, AiCompleteResult } from "./provider";

// Google Gemini implementation. expectJson uses responseMimeType so Gemini returns raw JSON.
export class GeminiProvider implements AIProvider {
  readonly provider: AiProvider = "gemini";
  readonly model: string;
  private readonly client: GoogleGenAI;

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async complete(opts: AiCompleteOptions): Promise<AiCompleteResult> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: opts.prompt,
      config: {
        systemInstruction: opts.system,
        maxOutputTokens: opts.maxOutputTokens,
        ...(opts.expectJson ? { responseMimeType: "application/json" } : {})
      }
    });

    const usage = response.usageMetadata;
    return {
      text: response.text ?? "",
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0
    };
  }
}
