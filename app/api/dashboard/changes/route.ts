import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import type { DashboardChanges, TimelineEvent } from "@/lib/types";

const catchUpSchema = z.object({
  careCircleId: z.string().uuid()
});

export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const personId = request.nextUrl.searchParams.get("personId");
  const context = await getRequestContext(careCircleId, "emergency");

  if (context instanceof NextResponse) return context;
  if (!personId) return NextResponse.json({ error: "personId is required" }, { status: 400 });

  try {
    const supabase = createClient();
    const lastCaughtUpAt = context.membership.last_caught_up_at ?? context.membership.created_at;
    const { data, error } = await supabase
      .from("timeline_events")
      .select("*")
      .eq("care_circle_id", careCircleId)
      .eq("person_id", personId)
      .gt("occurred_at", lastCaughtUpAt);

    if (error) throw new Error(error.message);

    const events = (data ?? []) as TimelineEvent[];
    const changes: DashboardChanges = {
      lastCaughtUpAt,
      totalTimelineEntries: events.length,
      tasksCompleted: events.filter((event) => event.event_type === "task_completed").length,
      tasksMissed: events.filter((event) => event.event_type === "task_missed").length,
      newDocuments: events.filter((event) => event.event_type === "document_uploaded").length,
      notesAdded: events.filter((event) => event.event_type === "note_created").length
    };

    return NextResponse.json({ changes });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const parsed = catchUpSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid catch-up payload" }, { status: 400 });

  const context = await getRequestContext(parsed.data.careCircleId, "emergency");
  if (context instanceof NextResponse) return context;

  try {
    const supabase = createClient();
    const { error } = await supabase.rpc("mark_membership_caught_up", {
      target_care_circle_id: parsed.data.careCircleId
    });

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
