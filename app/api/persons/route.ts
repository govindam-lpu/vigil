import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { checkMembership, forbiddenResponseFrom } from "@/lib/permissions/checkMembership";
import { createClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/types";

const personUpdateSchema = z.object({
  id: z.string().uuid(),
  careCircleId: z.string().uuid(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  preferredName: z.string().nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  pronouns: z.string().nullable().optional(),
  primaryLanguage: z.string().optional(),
  bloodType: z.string().nullable().optional(),
  primaryDiagnoses: z.array(z.string()).nullable().optional(),
  allergies: z.array(z.string()).nullable().optional(),
  aboutNote: z.string().nullable().optional(),
  expectedUpdatedAt: z.string().optional()
});

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

export async function PATCH(request: NextRequest) {
  const parsed = personUpdateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid person update payload" }, { status: 400 });
  }

  const context = await getRequestContext(parsed.data.careCircleId, "coordinator");

  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();

    // Optimistic-lock conflict detection (DESIGN: conflict resolution on Person profile).
    if (parsed.data.expectedUpdatedAt) {
      const { data: currentRow, error: currentError } = await supabase
        .from("persons")
        .select("*")
        .eq("id", parsed.data.id)
        .eq("care_circle_id", parsed.data.careCircleId)
        .maybeSingle();

      if (currentError) {
        throw new Error(currentError.message);
      }

      if (currentRow && (currentRow as Person).updated_at !== parsed.data.expectedUpdatedAt) {
        return NextResponse.json({ conflict: true, current: currentRow as Person }, { status: 409 });
      }
    }

    const updatePayload: Partial<Person> = {};
    if (parsed.data.firstName !== undefined) updatePayload.first_name = parsed.data.firstName;
    if (parsed.data.lastName !== undefined) updatePayload.last_name = parsed.data.lastName;
    if (parsed.data.preferredName !== undefined) updatePayload.preferred_name = parsed.data.preferredName;
    if (parsed.data.dateOfBirth !== undefined) updatePayload.date_of_birth = parsed.data.dateOfBirth;
    if (parsed.data.pronouns !== undefined) updatePayload.pronouns = parsed.data.pronouns;
    if (parsed.data.primaryLanguage !== undefined) updatePayload.primary_language = parsed.data.primaryLanguage;
    if (parsed.data.bloodType !== undefined) updatePayload.blood_type = parsed.data.bloodType;
    if (parsed.data.primaryDiagnoses !== undefined) updatePayload.primary_diagnoses = parsed.data.primaryDiagnoses;
    if (parsed.data.allergies !== undefined) updatePayload.allergies = parsed.data.allergies;
    if (parsed.data.aboutNote !== undefined) updatePayload.about_note = parsed.data.aboutNote;

    const { data, error } = await supabase
      .from("persons")
      .update(updatePayload)
      .eq("id", parsed.data.id)
      .eq("care_circle_id", parsed.data.careCircleId)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const person = data as Person;
    await createAuditLog({
      careCircleId: parsed.data.careCircleId,
      actorId: context.userId,
      actionType: "updated",
      objectType: "person",
      objectId: person.id,
      diff: updatePayload
    });

    return NextResponse.json({ person });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
