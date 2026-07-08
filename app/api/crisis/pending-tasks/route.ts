import { NextResponse, type NextRequest } from "next/server";
import { getProfilesById } from "@/lib/api/records";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import type { Task } from "@/lib/types";

export type PendingCrisisTask = Task & { assigneeName: string | null };

// GET /api/crisis/pending-tasks?careCircleId=... — open tasks created during the
// active crisis session, for the continuity checklist shown at deactivation.
// Coordinator+ only (deactivation is coordinator-gated).
export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const context = await getRequestContext(careCircleId, "coordinator");

  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();

    const { data: session } = await supabase
      .from("crisis_mode_sessions")
      .select("activated_at")
      .eq("care_circle_id", careCircleId as string)
      .is("deactivated_at", null)
      .order("activated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ tasks: [] });
    }

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("care_circle_id", careCircleId as string)
      .is("deleted_at", null)
      .in("status", ["open", "in_progress"])
      .gte("created_at", session.activated_at)
      .order("due_date", { ascending: true, nullsFirst: false });

    if (error) {
      throw new Error(error.message);
    }

    const tasks = (data ?? []) as Task[];
    const assigneeIds = Array.from(
      new Set(tasks.map((task) => task.assignee_id).filter((id): id is string => Boolean(id)))
    );
    const profiles = await getProfilesById(assigneeIds);

    const hydrated: PendingCrisisTask[] = tasks.map((task) => ({
      ...task,
      assigneeName: task.assignee_id ? profiles.get(task.assignee_id)?.display_name ?? null : null
    }));

    return NextResponse.json({ tasks: hydrated });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
