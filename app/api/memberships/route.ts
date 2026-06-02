import { NextResponse, type NextRequest } from "next/server";
import { checkMembership, forbiddenResponseFrom } from "@/lib/permissions/checkMembership";
import { createClient } from "@/lib/supabase/server";
import type { MemberSummary, UserProfile } from "@/lib/types";

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

  const { data: memberships, error: membershipError } = await supabase
    .from("memberships")
    .select("*")
    .eq("care_circle_id", careCircleId)
    .order("created_at", { ascending: true });

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  const userIds = memberships.map((membership) => membership.user_id);
  const { data: profiles, error: profileError } = await supabase
    .from("users_profiles")
    .select("*")
    .in("id", userIds);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const profileById = new Map<string, UserProfile>(profiles.map((profile) => [profile.id, profile]));
  const members: MemberSummary[] = memberships.map((membership) => ({
    membership,
    profile: profileById.get(membership.user_id) ?? null
  }));

  return NextResponse.json({ members });
}
