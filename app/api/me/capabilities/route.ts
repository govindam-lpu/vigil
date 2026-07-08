import { NextResponse, type NextRequest } from "next/server";
import { getEffectiveCapabilitiesForMembership, getRequestContext } from "@/lib/api/server";

// GET /api/me/capabilities?careCircleId= — the caller's own effective capabilities for
// a circle (role defaults ± their overrides). Lets the client gate UI (e.g. the export
// buttons) accurately, including granted overrides.
export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const context = await getRequestContext(careCircleId, "emergency");
  if (context instanceof NextResponse) {
    return context;
  }

  const capabilities = await getEffectiveCapabilitiesForMembership(context.membership);
  return NextResponse.json({ capabilities: Array.from(capabilities) });
}
