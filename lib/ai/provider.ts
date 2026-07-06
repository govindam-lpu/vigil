import type { AiFeature, AiProvider } from "@/lib/types";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { resolveModel } from "./models";

export type AiCompleteOptions = {
  system: string;
  prompt: string;
  maxOutputTokens: number;
  // When true, ask the provider for raw JSON (Gemini gets responseMimeType=application/json;
  // Anthropic is instructed via the prompt) and the caller parses with extractJson/Zod.
  expectJson?: boolean;
};

export type AiCompleteResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

// One uniform interface. No feature imports a provider SDK directly — they call this.
export interface AIProvider {
  readonly provider: AiProvider;
  readonly model: string;
  complete(opts: AiCompleteOptions): Promise<AiCompleteResult>;
}

export type ResolvedAiConfig = {
  provider: AiProvider;
  apiKey: string; // decrypted BYOK key, or the app key for the managed path
  modelOverrides: Record<string, string> | null;
};

export function buildProvider(config: ResolvedAiConfig, feature: AiFeature): AIProvider {
  const model = resolveModel(config.provider, feature, config.modelOverrides);
  if (config.provider === "gemini") {
    return new GeminiProvider(config.apiKey, model);
  }
  return new AnthropicProvider(config.apiKey, model); // anthropic + managed
}

// Providers format JSON differently (fences, preamble). Normalize to the first balanced
// JSON value so feature code gets clean parseable text regardless of provider.
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const firstObject = candidate.indexOf("{");
  const firstArray = candidate.indexOf("[");
  const start =
    firstArray === -1 ? firstObject : firstObject === -1 ? firstArray : Math.min(firstObject, firstArray);
  if (start === -1) {
    return candidate;
  }
  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  if (end === -1 || end < start) {
    return candidate;
  }
  return candidate.slice(start, end + 1);
}

export function parseJsonLoose<T>(text: string): T | null {
  try {
    return JSON.parse(extractJson(text)) as T;
  } catch {
    return null;
  }
}
