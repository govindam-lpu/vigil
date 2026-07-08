import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId, getErrorMessage } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["web", "ios", "android"]).default("web")
});

// POST /api/notifications/device-token — register (upsert) the caller's push token.
// The delivery Edge Function reads these to send FCM push; invalid tokens are pruned
// service-side. Client token acquisition (Firebase Web SDK) is wired at deploy time.
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (userId instanceof NextResponse) {
    return userId;
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  try {
    const supabase = createClient();
    const { error } = await supabase.from("user_device_tokens").upsert(
      { user_id: userId, token: parsed.data.token, platform: parsed.data.platform },
      { onConflict: "user_id,token" }
    );

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
