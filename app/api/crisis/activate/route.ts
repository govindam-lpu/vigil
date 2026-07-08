import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getCapabilityContext, getErrorMessage } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import type { CrisisModeSession } from "@/lib/types";

const activateSchema = z.object({
  careCircleId: z.string().uuid(),
  reason: z.string().max(2000).optional()
});

// POST /api/crisis/activate — Owner/Coordinator only. Delegates the atomic
// activate (care-circle flags + session + timeline + immediate notifications)
// to the activate_crisis_mode SECURITY DEFINER function, then audit-logs.
export async function POST(request: NextRequest) {
  const parsed = activateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid activation payload" }, { status: 400 });
  }

  const context = await getCapabilityContext(parsed.data.careCircleId, "circle.crisis");

  if (context instanceof NextResponse) {
    return context;
  }

  const { careCircleId, reason } = parsed.data;

  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("activate_crisis_mode", {
      target_care_circle_id: careCircleId,
      activation_reason: reason ?? ""
    });

    if (error) {
      throw new Error(error.message);
    }

    const session = data as CrisisModeSession;

    await createAuditLog({
      careCircleId,
      actorId: context.userId,
      actionType: "crisis_activated",
      objectType: "crisis_mode_session",
      objectId: session.id,
      diff: { reason: reason ?? null }
    });

    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
