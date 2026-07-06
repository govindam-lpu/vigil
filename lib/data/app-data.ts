import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CareCircle, CircleSummary, Membership, Person, UserProfile } from "@/lib/types";

export async function getCurrentUser() {
  const supabase = createClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return user;
}

export async function getOrCreateProfile(
  userId: string,
  email: string | null,
  displayName?: string | null,
  avatarUrl?: string | null
): Promise<UserProfile> {
  const supabase = createClient();

  const { data: existingProfile } = await supabase
    .from("users_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (existingProfile) {
    return existingProfile;
  }

  const resolvedName = displayName?.trim() || email?.split("@")[0] || "Vigil User";
  const { data, error } = await supabase
    .from("users_profiles")
    .insert({
      id: userId,
      display_name: resolvedName,
      phone: null,
      avatar_url: avatarUrl ?? null,
      timezone: "UTC",
      notification_preferences: {}
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getCircleSummariesForUser(userId: string): Promise<CircleSummary[]> {
  const supabase = createClient();

  const { data: memberships, error: membershipsError } = await supabase
    .from("memberships")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  if (memberships.length === 0) {
    return [];
  }

  const careCircleIds = memberships.map((membership) => membership.care_circle_id);
  const { data: careCircles, error: circlesError } = await supabase
    .from("care_circles")
    .select("*")
    .in("id", careCircleIds);

  if (circlesError) {
    throw new Error(circlesError.message);
  }

  const { data: persons, error: personsError } = await supabase
    .from("persons")
    .select("*")
    .in("care_circle_id", careCircleIds);

  if (personsError) {
    throw new Error(personsError.message);
  }

  const circleById = new Map<string, CareCircle>(careCircles.map((circle) => [circle.id, circle]));
  const personByCircleId = new Map<string, Person>(persons.map((person) => [person.care_circle_id, person]));

  return memberships
    .map((membership: Membership) => {
      const careCircle = circleById.get(membership.care_circle_id);

      if (!careCircle) {
        return null;
      }

      return {
        membership,
        careCircle,
        person: personByCircleId.get(membership.care_circle_id) ?? null
      };
    })
    .filter((summary): summary is CircleSummary => summary !== null);
}
