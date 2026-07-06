import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCircleAiConfig } from "@/lib/ai/config";
import { buildProvider, parseJsonLoose } from "@/lib/ai/provider";
import { isUnderAiRateLimit, logAiUsage } from "@/lib/ai/usage";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import type { Note } from "@/lib/types";

const schema = z.object({
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  noteId: z.string().uuid()
});

// §5 note -> task suggestions. Non-blocking and fail-open: any miss (no provider, rate
// limited, provider error) returns an empty list so the note-save flow is never affected.
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const context = await getRequestContext(parsed.data.careCircleId, "caregiver");
  if (context instanceof NextResponse) return context;

  try {
    const supabase = createClient();
    const { data: noteRow } = await supabase
      .from("notes")
      .select("*")
      .eq("id", parsed.data.noteId)
      .eq("care_circle_id", parsed.data.careCircleId)
      .eq("person_id", parsed.data.personId)
      .is("deleted_at", null)
      .maybeSingle();
    const note = (noteRow as Note | null) ?? null;
    if (!note) return NextResponse.json({ suggestions: [] });

    const config = await getCircleAiConfig(parsed.data.careCircleId);
    if (!config) return NextResponse.json({ suggestions: [] });
    if (!(await isUnderAiRateLimit(parsed.data.careCircleId))) return NextResponse.json({ suggestions: [] });

    const provider = buildProvider(config, "note_task_suggestion");
    const started = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    let succeeded = false;
    let suggestions: string[] = [];
    try {
      const result = await provider.complete({
        system:
          "Read a care note and identify any action items, follow-ups, or tasks implied by the text. " +
          "Return only a JSON array of strings, each a short task title. Maximum 3. If none, return [].",
        prompt: `Note: ${note.content.slice(0, 4000)}`,
        maxOutputTokens: 200,
        expectJson: true
      });
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      const parsedArray = parseJsonLoose<unknown>(result.text);
      if (Array.isArray(parsedArray)) {
        suggestions = parsedArray
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
          .slice(0, 3);
      }
      succeeded = true;
    } catch {
      suggestions = [];
    } finally {
      await logAiUsage({
        careCircleId: parsed.data.careCircleId,
        provider: config.provider,
        feature: "note_task_suggestion",
        model: provider.model,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - started,
        succeeded
      });
    }

    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
