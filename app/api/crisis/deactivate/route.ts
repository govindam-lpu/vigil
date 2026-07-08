import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getCapabilityContext, getErrorMessage } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import type { CrisisModeSession } from "@/lib/types";

const deactivateSchema = z.object({
  careCircleId: z.string().uuid(),
  summary: z.string().max(5000).optional()
});

// POST /api/crisis/deactivate — Owner/Coordinator only. Closes the open session,
// records duration + a continuity handoff note (in the SECURITY DEFINER function),
// then audit-logs.
export async function POST(request: NextRequest) {
  const parsed = deactivateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid deactivation payload" }, { status: 400 });
  }

  const context = await getCapabilityContext(parsed.data.careCircleId, "circle.crisis");

  if (context instanceof NextResponse) {
    return context;
  }

  const { careCircleId, summary } = parsed.data;

  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("deactivate_crisis_mode", {
      target_care_circle_id: careCircleId,
      deactivation_summary: summary ?? ""
    });

    if (error) {
      throw new Error(error.message);
    }

    const session = (data as CrisisModeSession | null) ?? null;

    await createAuditLog({
      careCircleId,
      actorId: context.userId,
      actionType: "crisis_deactivated",
      objectType: "crisis_mode_session",
      objectId: session?.id ?? careCircleId,
      diff: { summary: summary ?? null }
    });

    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
