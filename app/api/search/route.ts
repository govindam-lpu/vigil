import { NextResponse, type NextRequest } from "next/server";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import type { SearchResult } from "@/lib/types";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const personId = request.nextUrl.searchParams.get("personId");
  const all = request.nextUrl.searchParams.get("all") === "true";
  const context = await getRequestContext(careCircleId, "emergency");

  if (context instanceof NextResponse) return context;
  if (!personId) return NextResponse.json({ error: "personId is required" }, { status: 400 });
  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("search_phase1", {
      search_query: q,
      target_person_id: personId,
      target_care_circle_id: careCircleId,
      search_all_circles: all
    });

    if (error) throw new Error(error.message);
    return NextResponse.json({ results: (data ?? []) as SearchResult[] });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
