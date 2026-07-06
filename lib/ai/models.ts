import type { AiFeature, AiProvider } from "@/lib/types";

// Model ids + prices live here (config), never hardcoded in feature code. Verified against
// the Anthropic reference (Sonnet 5 = $3/$15 list, $2/$10 intro through 2026-08-31; Haiku
// 4.5 = $1/$5) and Google's Gemini pricing. Sonnet 5 is the extraction/summary default:
// near-Opus quality at Sonnet cost. Haiku handles the low-stakes note->task pass.
// NOTE: re-verify Gemini prices against Google's live pricing page before relying on the
// cost estimate; free-tier Gemini is $0 but may train on submitted health data (see §0a copy).

export type ModelPricing = {
  id: string;
  inputPerMTok: number;
  outputPerMTok: number;
};

export const ANTHROPIC_MODELS: Record<AiFeature, string> = {
  extraction: "claude-sonnet-5",
  summary: "claude-sonnet-5",
  note_task_suggestion: "claude-haiku-4-5"
};

export const GEMINI_MODELS: Record<AiFeature, string> = {
  extraction: "gemini-2.5-flash",
  summary: "gemini-2.5-flash",
  note_task_suggestion: "gemini-2.5-flash"
};

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-5": { id: "claude-sonnet-5", inputPerMTok: 3.0, outputPerMTok: 15.0 },
  "claude-sonnet-4-6": { id: "claude-sonnet-4-6", inputPerMTok: 3.0, outputPerMTok: 15.0 },
  "claude-haiku-4-5": { id: "claude-haiku-4-5", inputPerMTok: 1.0, outputPerMTok: 5.0 },
  "gemini-2.5-flash": { id: "gemini-2.5-flash", inputPerMTok: 0.3, outputPerMTok: 2.5 }
};

// Reference token assumptions for the forward-looking monthly estimate (§0e). Historical
// est_cost is computed from actual logged tokens; these constants only seed the projection.
export const FEATURE_TOKENS: Record<AiFeature, { input: number; output: number }> = {
  extraction: { input: 3000, output: 400 },
  summary: { input: 2000, output: 150 },
  note_task_suggestion: { input: 500, output: 100 }
};

export function resolveModel(
  provider: AiProvider,
  feature: AiFeature,
  overrides?: Record<string, string> | null
): string {
  const override = overrides ? overrides[feature] : undefined;
  if (typeof override === "string" && override.length > 0) {
    return override;
  }
  if (provider === "gemini") {
    return GEMINI_MODELS[feature];
  }
  return ANTHROPIC_MODELS[feature]; // anthropic + managed both run Anthropic models
}

export function estCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    return 0;
  }
  return (inputTokens / 1_000_000) * pricing.inputPerMTok + (outputTokens / 1_000_000) * pricing.outputPerMTok;
}

export function perOpCost(model: string, feature: AiFeature): number {
  const tokens = FEATURE_TOKENS[feature];
  return estCostUsd(model, tokens.input, tokens.output);
}
