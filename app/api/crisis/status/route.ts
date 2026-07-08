import { NextResponse, type NextRequest } from "next/server";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import type { CrisisModeSession } from "@/lib/types";

export type CrisisStatus = {
  crisisMode: boolean;
  session: CrisisModeSession | null;
  activatedByName: string | null;
};

// GET /api/crisis/status?careCircleId=... — polled by CrisisModeProvider (30s).
// Any member (incl. emergency role) may read crisis status.
export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const context = await getRequestContext(careCircleId, "emergency");

  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    const { data: circle, error } = await supabase
      .from("care_circles")
      .select("id, crisis_mode, crisis_mode_activated_by")
      .eq("id", careCircleId as string)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!circle) {
      return NextResponse.json({ error: "Care circle not found" }, { status: 404 });
    }

    let session: CrisisModeSession | null = null;
    let activatedByName: string | null = null;

    if (circle.crisis_mode) {
      const { data: sessionData } = await supabase
        .from("crisis_mode_sessions")
        .select("*")
        .eq("care_circle_id", careCircleId as string)
        .is("deactivated_at", null)
        .order("activated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      session = (sessionData as CrisisModeSession | null) ?? null;

      const activatorId = session?.activated_by ?? circle.crisis_mode_activated_by;
      if (activatorId) {
        const { data: profile } = await supabase
          .from("users_profiles")
          .select("display_name")
          .eq("id", activatorId)
          .maybeSingle();
        activatedByName = profile?.display_name ?? null;
      }
    }

    const status: CrisisStatus = { crisisMode: circle.crisis_mode, session, activatedByName };
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
