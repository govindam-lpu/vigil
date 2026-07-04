import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getProfilesById } from "@/lib/api/records";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import type { HydratedMedicationAdministration, MedicationAdministrationLog } from "@/lib/types";

const administrationCreateSchema = z.object({
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  medicationId: z.string().uuid(),
  administeredAt: z.string().nullable().optional(),
  notes: z.string().nullable().optional()
});

export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const medicationId = request.nextUrl.searchParams.get("medicationId");
  const context = await getRequestContext(careCircleId, "emergency");

  if (context instanceof NextResponse) {
    return context;
  }

  if (!medicationId) {
    return NextResponse.json({ error: "medicationId is required" }, { status: 400 });
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("medication_administration_logs")
      .select("*")
      .eq("care_circle_id", careCircleId)
      .eq("medication_id", medicationId)
      .order("administered_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const logs = (data ?? []) as MedicationAdministrationLog[];
    const profiles = await getProfilesById(logs.map((log) => log.administered_by));
    const hydrated: HydratedMedicationAdministration[] = logs.map((log) => ({
      ...log,
      administeredByProfile: profiles.get(log.administered_by) ?? null
    }));

    return NextResponse.json({ administrations: hydrated });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const parsed = administrationCreateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid administration payload" }, { status: 400 });
  }

  const context = await getRequestContext(parsed.data.careCircleId, "caregiver");

  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("medication_administration_logs")
      .insert({
        care_circle_id: parsed.data.careCircleId,
        person_id: parsed.data.personId,
        medication_id: parsed.data.medicationId,
        administered_by: context.userId,
        administered_at: parsed.data.administeredAt ?? new Date().toISOString(),
        notes: parsed.data.notes ?? null
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const administration = data as MedicationAdministrationLog;
    await createAuditLog({
      careCircleId: administration.care_circle_id,
      actorId: context.userId,
      actionType: "created",
      objectType: "medication_administration",
      objectId: administration.id,
      diff: { medication_id: administration.medication_id, administered_at: administration.administered_at }
    });

    return NextResponse.json({ administration });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
