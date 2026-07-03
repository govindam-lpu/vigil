import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCircleSummariesForUser } from "@/lib/data/app-data";
import { createClient } from "@/lib/supabase/server";
import type { CareCircle, Folder, Membership, Person } from "@/lib/types";

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

const onboardingResponseSchema = z.object({
  careCircle: z.custom<CareCircle>(),
  person: z.custom<Person>(),
  membership: z.custom<Membership>(),
  folders: z.array(z.custom<Folder>())
});

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

  const { data, error } = await supabase.rpc("create_onboarding_care_circle", {
    care_circle_name: parsed.data.careCircleName,
    person_first_name: parsed.data.person.firstName,
    person_last_name: parsed.data.person.lastName,
    person_date_of_birth: parsed.data.person.dateOfBirth,
    person_preferred_name: parsed.data.person.preferredName || null,
    person_pronouns: parsed.data.person.pronouns || null
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const response = onboardingResponseSchema.safeParse(data);

  if (!response.success) {
    return NextResponse.json({ error: "Onboarding response was invalid." }, { status: 500 });
  }

  return NextResponse.json(response.data);
}
