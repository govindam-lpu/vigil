import { NextResponse } from "next/server";
import { getAuthenticatedUserId, getErrorMessage } from "@/lib/api/server";
import { getCircleSummariesForUser } from "@/lib/data/app-data";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceSummary } from "@/lib/types";

// GET /api/workspaces — per-circle summary counts for the workspace picker + person
// switcher. Runs under the user session; RLS scopes every count to circles the user
// belongs to. N is the user's own circle count (small), so per-circle counts are fine.
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (userId instanceof NextResponse) {
    return userId;
  }

  try {
    const circles = await getCircleSummariesForUser(userId);
    const supabase = createClient();

    const workspaces: WorkspaceSummary[] = await Promise.all(
      circles.map(async (circle): Promise<WorkspaceSummary> => {
        const careCircleId = circle.careCircle.id;
        const [members, openTasks, unread, lastActivity] = await Promise.all([
          supabase
            .from("memberships")
            .select("id", { count: "exact", head: true })
            .eq("care_circle_id", careCircleId),
          supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .eq("care_circle_id", careCircleId)
            .in("status", ["open", "in_progress"])
            .is("deleted_at", null),
          supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("care_circle_id", careCircleId)
            .eq("recipient_id", userId)
            .eq("is_read", false),
          supabase
            .from("timeline_events")
            .select("occurred_at")
            .eq("care_circle_id", careCircleId)
            .is("deleted_at", null)
            .order("occurred_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        ]);

        const lastActivityAt = (lastActivity.data as { occurred_at: string } | null)?.occurred_at ?? null;

        return {
          careCircleId,
          careCircleName: circle.careCircle.name,
          role: circle.membership.role,
          person: circle.person
            ? {
                first_name: circle.person.first_name,
                last_name: circle.person.last_name,
                preferred_name: circle.person.preferred_name,
                photo_url: circle.person.photo_url
              }
            : null,
          memberCount: members.count ?? 0,
          openTaskCount: openTasks.count ?? 0,
          unreadCount: unread.count ?? 0,
          lastActivityAt
        };
      })
    );

    return NextResponse.json({ workspaces });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
