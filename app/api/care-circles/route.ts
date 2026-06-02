import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCircleSummariesForUser } from "@/lib/data/app-data";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types";

const createCareCircleSchema = z.object({
  careCircleName: z.string().min(1),
  person: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    dateOfBirth: z.string().min(1),
    preferredName: z.string().optional(),
    pronouns: z.string().optional()
  })
});

type AuditDiff = {
  [key: string]: Json;
};

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const circles = await getCircleSummariesForUser(user.id);
  return NextResponse.json({ careCircles: circles });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createCareCircleSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid onboarding payload" }, { status: 400 });
  }

  const displayName = user.email?.split("@")[0] ?? "Vigil User";
  await supabase.from("users_profiles").upsert(
    {
      id: user.id,
      display_name: displayName,
      phone: null,
      avatar_url: null,
      timezone: "UTC",
      notification_preferences: {}
    },
    { onConflict: "id", ignoreDuplicates: true }
  );

  const { data: careCircle, error: circleError } = await supabase
    .from("care_circles")
    .insert({
      name: parsed.data.careCircleName,
      owner_id: user.id,
      person_id: null,
      settings: {},
      crisis_mode: false,
      crisis_mode_activated_at: null,
      crisis_mode_activated_by: null
    })
    .select("*")
    .single();

  if (circleError) {
    return NextResponse.json({ error: circleError.message }, { status: 500 });
  }

  await insertAuditLog(user.id, careCircle.id, "created", "care_circle", careCircle.id, {
    name: careCircle.name
  });

  const { data: person, error: personError } = await supabase
    .from("persons")
    .insert({
      care_circle_id: careCircle.id,
      first_name: parsed.data.person.firstName,
      last_name: parsed.data.person.lastName,
      preferred_name: parsed.data.person.preferredName || null,
      date_of_birth: parsed.data.person.dateOfBirth,
      pronouns: parsed.data.person.pronouns || null,
      primary_language: "English",
      photo_url: null,
      primary_diagnoses: null,
      allergies: null,
      blood_type: null,
      insurance_summary: {},
      medical_record_numbers: {},
      current_care_mode: "normal",
      about_note: null
    })
    .select("*")
    .single();

  if (personError) {
    return NextResponse.json({ error: personError.message }, { status: 500 });
  }

  await insertAuditLog(user.id, careCircle.id, "created", "person", person.id, {
    first_name: person.first_name,
    last_name: person.last_name
  });

  const { error: updateCircleError } = await supabase
    .from("care_circles")
    .update({ person_id: person.id })
    .eq("id", careCircle.id);

  if (updateCircleError) {
    return NextResponse.json({ error: updateCircleError.message }, { status: 500 });
  }

  await insertAuditLog(user.id, careCircle.id, "updated", "care_circle", careCircle.id, {
    person_id: person.id
  });

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .insert({
      care_circle_id: careCircle.id,
      user_id: user.id,
      role: "owner",
      relationship_label: null,
      expires_at: null
    })
    .select("*")
    .single();

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  await insertAuditLog(user.id, careCircle.id, "created", "membership", membership.id, {
    user_id: user.id,
    role: "owner"
  });

  const { data: folders, error: foldersError } = await supabase
    .from("folders")
    .select("*")
    .eq("care_circle_id", careCircle.id)
    .eq("person_id", person.id)
    .order("created_at", { ascending: true });

  if (foldersError) {
    return NextResponse.json({ error: foldersError.message }, { status: 500 });
  }

  return NextResponse.json({
    careCircle: { ...careCircle, person_id: person.id },
    person,
    membership,
    folders
  });
}

async function insertAuditLog(
  actorId: string,
  careCircleId: string,
  actionType: string,
  objectType: string,
  objectId: string,
  diff: AuditDiff
) {
  const supabase = createClient();
  const { error } = await supabase.from("audit_logs").insert({
    care_circle_id: careCircleId,
    actor_id: actorId,
    action_type: actionType,
    object_type: objectType,
    object_id: objectId,
    diff,
    ip_address: null,
    user_agent: null
  });

  if (error) {
    throw new Error(error.message);
  }
}
