import { createClient } from "@/lib/supabase/server";
import type { AiFeature, AiProvider } from "@/lib/types";
import { estCostUsd } from "./models";

// Per-circle rate limit protects the user's own key/budget from runaway usage (guardrail).
export const MAX_AI_CALLS_PER_HOUR = 20;

// Fail-closed: if the count can't be read we skip the AI call rather than risk the user's
// budget. AI features degrade gracefully, so skipping a call never blocks a core action.
export async function isUnderAiRateLimit(careCircleId: string): Promise<boolean> {
  const supabase = createClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("ai_usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("care_circle_id", careCircleId)
    .gte("created_at", since);

  if (error) {
    return false;
  }
  return (count ?? 0) < MAX_AI_CALLS_PER_HOUR;
}

export async function logAiUsage(params: {
  careCircleId: string;
  provider: AiProvider | string;
  feature: AiFeature;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number | null;
  succeeded: boolean;
}): Promise<void> {
  const supabase = createClient();
  // Never logs the key or any document/note content — only call metadata.
  await supabase.from("ai_usage_logs").insert({
    care_circle_id: params.careCircleId,
    provider: params.provider,
    feature: params.feature,
    model: params.model,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    est_cost: estCostUsd(params.model, params.inputTokens, params.outputTokens),
    latency_ms: params.latencyMs,
    succeeded: params.succeeded
  });
}
