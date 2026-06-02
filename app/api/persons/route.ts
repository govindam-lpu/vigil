import { NextResponse, type NextRequest } from "next/server";
import { checkMembership, forbiddenResponseFrom } from "@/lib/permissions/checkMembership";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const careCircleId = request.nextUrl.searchParams.get("careCircleId");

  if (!careCircleId) {
    return NextResponse.json({ error: "careCircleId is required" }, { status: 400 });
  }

  try {
    await checkMembership(user.id, careCircleId, "emergency");
  } catch (error) {
    const forbidden = forbiddenResponseFrom(error);
    if (forbidden) {
      return forbidden;
    }
    throw error;
  }

  const { data, error } = await supabase
    .from("persons")
    .select("*")
    .eq("care_circle_id", careCircleId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ person: data });
}
