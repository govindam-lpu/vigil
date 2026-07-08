import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedUserId, getErrorMessage } from "@/lib/api/server";
import { mergeNotificationPreferences } from "@/lib/notifications/preferences";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types";

// GET /api/notifications/preferences — the current user's per-category/channel
// notification preferences (merged onto defaults).
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (userId instanceof NextResponse) {
    return userId;
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("users_profiles")
    .select("notification_preferences")
    .eq("id", userId)
    .maybeSingle();

  return NextResponse.json({ preferences: mergeNotificationPreferences(data?.notification_preferences) });
}

// PUT /api/notifications/preferences — replace the current user's preferences.
export async function PUT(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (userId instanceof NextResponse) {
    return userId;
  }

  try {
    const body: unknown = await request.json();
    const preferences = mergeNotificationPreferences(body);
    const supabase = createClient();
    const { error } = await supabase
      .from("users_profiles")
      .update({ notification_preferences: preferences as unknown as Json })
      .eq("id", userId);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ preferences });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
