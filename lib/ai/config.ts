import { createClient } from "@/lib/supabase/server";
import type { AiProvider, Json } from "@/lib/types";
import { decryptSecret } from "./crypto";
import type { ResolvedAiConfig } from "./provider";

type RuntimeConfigRow = {
  provider: string | null;
  encrypted_key: string | null;
  model_overrides: Json | null;
};

// Resolves the circle's AI config for an inference-time call under the acting member's
// session (via the SECURITY DEFINER get_ai_runtime_config accessor — the config table itself
// stays admin-only). Returns null whenever AI should be disabled gracefully: no provider,
// no/invalid key, or the managed path without MANAGED_AI_ENABLED.
export async function getCircleAiConfig(careCircleId: string): Promise<ResolvedAiConfig | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_ai_runtime_config", {
    target_care_circle_id: careCircleId
  });

  if (error) {
    return null;
  }

  const rows = (data ?? []) as RuntimeConfigRow[];
  const row = rows[0];
  if (!row || !row.provider) {
    return null;
  }

  const provider = row.provider as AiProvider;
  let apiKey: string | null = null;

  if (provider === "managed") {
    if (process.env.MANAGED_AI_ENABLED !== "true") {
      return null;
    }
    apiKey = process.env.MANAGED_ANTHROPIC_API_KEY ?? null;
  } else if (row.encrypted_key) {
    try {
      apiKey = decryptSecret(row.encrypted_key);
    } catch {
      return null;
    }
  }

  if (!apiKey) {
    return null;
  }

  const modelOverrides =
    row.model_overrides && typeof row.model_overrides === "object" && !Array.isArray(row.model_overrides)
      ? (row.model_overrides as Record<string, string>)
      : null;

  return { provider, apiKey, modelOverrides };
}
