import { NextResponse, type NextRequest } from "next/server";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import type { AnalyticsRange, CareCircleAnalytics } from "@/lib/types";

const RANGE_DAYS: Record<AnalyticsRange, number> = {
  "30d": 30,
  "90d": 90,
  "6m": 180
};

function isRange(value: string | null): value is AnalyticsRange {
  return value === "30d" || value === "90d" || value === "6m";
}

// GET /api/analytics?careCircleId=&range=30d|90d|6m — Coordinator/Owner only.
// Aggregation runs entirely in SQL (get_care_circle_analytics), self-gated too.
export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const rangeParam = request.nextUrl.searchParams.get("range");
  const range: AnalyticsRange = isRange(rangeParam) ? rangeParam : "30d";

  const context = await getRequestContext(careCircleId, "coordinator");
  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    const since = new Date(Date.now() - RANGE_DAYS[range] * 86400000).toISOString();
    const { data, error } = await supabase.rpc("get_care_circle_analytics", {
      target_care_circle_id: careCircleId as string,
      since_ts: since
    });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ analytics: data as unknown as CareCircleAnalytics, range });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
