import { decryptSecret } from "../../lib/ai/crypto";
import { estCostUsd } from "../../lib/ai/models";
import { buildProvider, parseJsonLoose, type ResolvedAiConfig } from "../../lib/ai/provider";
import type { AiProvider, DocumentAiSuggestions } from "../../lib/types";
import { serviceClient } from "./supabase";

const MAX_AI_CALLS_PER_HOUR = 20;

const EXTRACTION_SYSTEM =
  "You are a medical document parser. Extract structured data from the following document text. " +
  'Return only valid JSON matching this schema: { "appointments": [{"date", "provider", "location", "notes"}], ' +
  '"medications": [{"name", "dosage", "frequency", "instructions"}], "follow_up_tasks": [string], ' +
  '"expiry_date": string|null }. If a field has no data, return an empty array or null. Use ISO dates ' +
  "(YYYY-MM-DD) when possible. Do not infer — only extract what is explicitly present.";

// Worker-side config resolution: reads ai_provider_configs directly via the service role
// (bypasses RLS) and decrypts the BYOK key. Mirrors lib/ai/config.ts, which can't run here
// because it uses the cookie-based Next server client.
async function resolveWorkerAiConfig(careCircleId: string): Promise<ResolvedAiConfig | null> {
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from("ai_provider_configs")
    .select("provider, encrypted_key, model_overrides")
    .eq("care_circle_id", careCircleId)
    .maybeSingle();
  if (error || !data || !data.provider) return null;

  const provider = data.provider as AiProvider;
  let apiKey: string | null = null;
  if (provider === "managed") {
    if (process.env.MANAGED_AI_ENABLED !== "true") return null;
    apiKey = process.env.MANAGED_ANTHROPIC_API_KEY ?? null;
  } else if (data.encrypted_key) {
    try {
      apiKey = decryptSecret(data.encrypted_key as string);
    } catch {
      return null;
    }
  }
  if (!apiKey) return null;

  const rawOverrides = data.model_overrides as unknown;
  const modelOverrides =
    rawOverrides && typeof rawOverrides === "object" && !Array.isArray(rawOverrides)
      ? (rawOverrides as Record<string, string>)
      : null;
  return { provider, apiKey, modelOverrides };
}

async function underRateLimit(careCircleId: string): Promise<boolean> {
  const supabase = serviceClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("ai_usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("care_circle_id", careCircleId)
    .gte("created_at", since);
  if (error) return false;
  return (count ?? 0) < MAX_AI_CALLS_PER_HOUR;
}

// §2 structured extraction. Returns null (skip suggestions) whenever AI is unconfigured,
// rate-limited, or the provider errors — never throws into the OCR pipeline.
export async function runExtraction(careCircleId: string, text: string): Promise<DocumentAiSuggestions | null> {
  const config = await resolveWorkerAiConfig(careCircleId);
  if (!config) return null;
  if (!(await underRateLimit(careCircleId))) return null;

  const provider = buildProvider(config, "extraction");
  const started = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let succeeded = false;

  try {
    const result = await provider.complete({
      system: EXTRACTION_SYSTEM,
      prompt: `Document text:\n${text.slice(0, 20000)}`,
      maxOutputTokens: 1024,
      expectJson: true
    });
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
    const parsed = parseJsonLoose<Partial<DocumentAiSuggestions>>(result.text);
    if (!parsed) return null;
    succeeded = true;
    return normalizeSuggestions(parsed);
  } catch {
    return null;
  } finally {
    await logUsage(careCircleId, config.provider, provider.model, inputTokens, outputTokens, Date.now() - started, succeeded);
  }
}

async function logUsage(
  careCircleId: string,
  provider: AiProvider,
  model: string,
  inputTokens: number,
  outputTokens: number,
  latencyMs: number,
  succeeded: boolean
): Promise<void> {
  const supabase = serviceClient();
  await supabase.from("ai_usage_logs").insert({
    care_circle_id: careCircleId,
    provider,
    feature: "extraction",
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    est_cost: estCostUsd(model, inputTokens, outputTokens),
    latency_ms: latencyMs,
    succeeded
  });
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeSuggestions(raw: Partial<DocumentAiSuggestions>): DocumentAiSuggestions {
  const appointments = Array.isArray(raw.appointments)
    ? raw.appointments
        .map((item) => {
          const value = record(item);
          return {
            date: cleanString(value.date),
            provider: cleanString(value.provider),
            location: cleanString(value.location),
            notes: cleanString(value.notes)
          };
        })
        .filter((item) => item.date || item.provider || item.location || item.notes)
    : [];

  const medications = Array.isArray(raw.medications)
    ? raw.medications
        .map((item) => {
          const value = record(item);
          return {
            name: cleanString(value.name),
            dosage: cleanString(value.dosage),
            frequency: cleanString(value.frequency),
            instructions: cleanString(value.instructions)
          };
        })
        .filter((item) => item.name)
    : [];

  const followUpTasks = Array.isArray(raw.follow_up_tasks)
    ? raw.follow_up_tasks
        .map((task) => cleanString(task))
        .filter((task): task is string => task !== null)
        .slice(0, 20)
    : [];

  return {
    appointments,
    medications,
    follow_up_tasks: followUpTasks,
    expiry_date: cleanString(raw.expiry_date)
  };
}
