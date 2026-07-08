import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import type { Notification } from "@/lib/types";

const patchSchema = z.object({
  careCircleId: z.string().uuid(),
  notificationId: z.string().uuid().optional(),
  markAllRead: z.boolean().optional()
});

// GET /api/notifications?careCircleId=... — the current user's notifications for
// the active circle (RLS also restricts to recipient_id = auth.uid()), plus an
// accurate unread count for the bell badge.
export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const context = await getRequestContext(careCircleId, "emergency");

  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("care_circle_id", careCircleId as string)
      .eq("recipient_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(error.message);
    }

    const { count, error: countError } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("care_circle_id", careCircleId as string)
      .eq("recipient_id", context.userId)
      .eq("is_read", false);

    if (countError) {
      throw new Error(countError.message);
    }

    return NextResponse.json({
      notifications: (data ?? []) as Notification[],
      unreadCount: count ?? 0
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

// PATCH /api/notifications — mark one notification (notificationId) or all unread
// (markAllRead) as read. RLS restricts updates to the recipient's own rows.
export async function PATCH(request: NextRequest) {
  const parsed = patchSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const context = await getRequestContext(parsed.data.careCircleId, "emergency");

  if (context instanceof NextResponse) {
    return context;
  }

  const { careCircleId, notificationId, markAllRead } = parsed.data;

  if (!markAllRead && !notificationId) {
    return NextResponse.json({ error: "Provide notificationId or markAllRead." }, { status: 400 });
  }

  try {
    const supabase = createClient();

    let query = supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("care_circle_id", careCircleId)
      .eq("recipient_id", context.userId)
      .eq("is_read", false);

    if (!markAllRead && notificationId) {
      query = query.eq("id", notificationId);
    }

    const { error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
