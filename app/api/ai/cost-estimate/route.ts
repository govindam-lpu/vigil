import { NextResponse, type NextRequest } from "next/server";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { perOpCost, resolveModel } from "@/lib/ai/models";
import { createClient } from "@/lib/supabase/server";
import type { AiProvider, AiProviderConfig } from "@/lib/types";

// Estimated monthly AI cost from the circle's own last-30-day activity (§0e). Uses the
// configured provider's model prices (or the Anthropic defaults as a preview when unconfigured).
export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const context = await getRequestContext(careCircleId, "coordinator");
  if (context instanceof NextResponse) return context;

  try {
    const supabase = createClient();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: configRow } = await supabase
      .from("ai_provider_configs")
      .select("provider, model_overrides")
      .eq("care_circle_id", careCircleId)
      .maybeSingle();
    const config = configRow as Pick<AiProviderConfig, "provider" | "model_overrides"> | null;
    const provider: AiProvider = config?.provider ?? "anthropic";
    const overrides =
      config?.model_overrides && typeof config.model_overrides === "object" && !Array.isArray(config.model_overrides)
        ? (config.model_overrides as Record<string, string>)
        : null;

    const [documents, notes, members, usage] = await Promise.all([
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("care_circle_id", careCircleId)
        .is("deleted_at", null)
        .gte("created_at", since),
      supabase
        .from("notes")
        .select("id", { count: "exact", head: true })
        .eq("care_circle_id", careCircleId)
        .is("deleted_at", null)
        .gte("created_at", since),
      supabase.from("memberships").select("id", { count: "exact", head: true }).eq("care_circle_id", careCircleId),
      supabase.from("ai_usage_logs").select("est_cost").eq("care_circle_id", careCircleId).gte("created_at", since)
    ]);

    const documents30d = documents.count ?? 0;
    const notes30d = notes.count ?? 0;
    const memberCount = members.count ?? 0;
    // "Since last visit" summaries are per returning member, roughly weekly — a rough projection.
    const summaries30d = memberCount * 4;

    const extractionCost = perOpCost(resolveModel(provider, "extraction", overrides), "extraction");
    const noteCost = perOpCost(resolveModel(provider, "note_task_suggestion", overrides), "note_task_suggestion");
    const summaryCost = perOpCost(resolveModel(provider, "summary", overrides), "summary");

    const estimatedMonthlyUsd = documents30d * extractionCost + notes30d * noteCost + summaries30d * summaryCost;

    const usageRows = (usage.data ?? []) as Array<{ est_cost: number | string | null }>;
    const actualSpend30dUsd = usageRows.reduce((sum, row) => sum + Number(row.est_cost ?? 0), 0);

    return NextResponse.json({
      estimate: {
        provider,
        configured: Boolean(config?.provider),
        documents30d,
        notes30d,
        summaries30d,
        perOp: { extraction: extractionCost, noteSuggestion: noteCost, summary: summaryCost },
        estimatedMonthlyUsd,
        actualSpend30dUsd
      }
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
