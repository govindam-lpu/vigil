import { NextResponse, type NextRequest } from "next/server";
import { getCircleAiConfig } from "@/lib/ai/config";
import { buildProvider } from "@/lib/ai/provider";
import { isUnderAiRateLimit, logAiUsage } from "@/lib/ai/usage";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import type { CareCircleSummary, TimelineEvent } from "@/lib/types";

const AWAY_HOURS_THRESHOLD = 48;
const MIN_EVENTS = 5;

// §4 "Since your last visit" AI prose summary. Only kicks in when the member has been away
// > 48h AND there are > 5 new timeline events AND a provider is configured — otherwise the
// client keeps the Phase 1 bullet list (no degradation).
export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const personId = request.nextUrl.searchParams.get("personId");
  const context = await getRequestContext(careCircleId, "emergency");
  if (context instanceof NextResponse) return context;
  if (!careCircleId) return NextResponse.json({ error: "careCircleId is required" }, { status: 400 });
  if (!personId) return NextResponse.json({ error: "personId is required" }, { status: 400 });

  try {
    const supabase = createClient();
    const lastCaughtUpAt = context.membership.last_caught_up_at ?? context.membership.created_at;
    const hoursAway = (Date.now() - new Date(lastCaughtUpAt).getTime()) / 3_600_000;

    const { data: eventData, error } = await supabase
      .from("timeline_events")
      .select("title, body, occurred_at")
      .eq("care_circle_id", careCircleId)
      .eq("person_id", personId)
      .is("deleted_at", null)
      .gt("occurred_at", lastCaughtUpAt)
      .order("occurred_at", { ascending: true });
    if (error) throw new Error(error.message);

    const events = (eventData ?? []) as Array<Pick<TimelineEvent, "title" | "body" | "occurred_at">>;
    const eligible = hoursAway > AWAY_HOURS_THRESHOLD && events.length > MIN_EVENTS;
    if (!eligible) {
      return NextResponse.json({ eligible: false, summary: null });
    }

    const newestOccurredAt = events[events.length - 1]?.occurred_at ?? lastCaughtUpAt;

    // Cache invalidation: reuse unless newer events arrived after the cached summary.
    const { data: cacheRow } = await supabase
      .from("care_circle_summaries")
      .select("*")
      .eq("care_circle_id", careCircleId)
      .eq("generated_for_user_id", context.userId)
      .maybeSingle();
    const cache = (cacheRow as CareCircleSummary | null) ?? null;
    if (cache && new Date(cache.generated_at).getTime() >= new Date(newestOccurredAt).getTime()) {
      return NextResponse.json({ eligible: true, summary: cache.summary_text, cached: true });
    }

    const config = await getCircleAiConfig(careCircleId);
    if (!config) {
      return NextResponse.json({ eligible: true, summary: cache?.summary_text ?? null, providerConfigured: false });
    }
    if (!(await isUnderAiRateLimit(careCircleId))) {
      return NextResponse.json({ eligible: true, summary: cache?.summary_text ?? null, rateLimited: true });
    }

    const days = Math.max(1, Math.round(hoursAway / 24));
    const eventLines = events
      .slice(0, 40)
      .map((event) => `- ${event.title}${event.body ? `: ${event.body}` : ""}`)
      .join("\n");
    const provider = buildProvider(config, "summary");

    const started = Date.now();
    let summaryText: string | null = null;
    let inputTokens = 0;
    let outputTokens = 0;
    let succeeded = false;
    try {
      const result = await provider.complete({
        system:
          "You summarize care updates for a family caregiver returning after time away. Write 2-4 plain sentences. " +
          "Be specific, not generic. Do not use medical jargon. Focus on what changed, what is pending, and what needs attention.",
        prompt: `The caregiver has been away about ${days} day(s). Summarize these updates:\n${eventLines}`,
        maxOutputTokens: 400
      });
      summaryText = result.text.trim() || null;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      succeeded = summaryText !== null;
    } catch {
      summaryText = null;
    } finally {
      await logAiUsage({
        careCircleId,
        provider: config.provider,
        feature: "summary",
        model: provider.model,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - started,
        succeeded
      });
    }

    if (!summaryText) {
      return NextResponse.json({ eligible: true, summary: cache?.summary_text ?? null, failed: true });
    }

    await supabase.from("care_circle_summaries").upsert(
      {
        care_circle_id: careCircleId,
        generated_for_user_id: context.userId,
        generated_at: new Date().toISOString(),
        summary_text: summaryText,
        events_covered: { count: events.length, newest_occurred_at: newestOccurredAt }
      },
      { onConflict: "care_circle_id,generated_for_user_id" }
    );

    return NextResponse.json({ eligible: true, summary: summaryText });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
