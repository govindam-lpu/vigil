import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getContactsById } from "@/lib/api/records";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createTimelineEvent } from "@/lib/api/timeline";
import { createClient } from "@/lib/supabase/server";
import type { HydratedMedication, Medication, MedicationStatus } from "@/lib/types";

const medicationFormEnum = z.enum(["pill", "liquid", "patch", "injection", "inhaler", "other"]);
const medicationStatusEnum = z.enum(["active", "paused", "discontinued"]);

const medicationCreateSchema = z.object({
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  name: z.string().min(1),
  genericName: z.string().nullable().optional(),
  brandName: z.string().nullable().optional(),
  dosage: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  form: medicationFormEnum.nullable().optional(),
  route: z.string().nullable().optional(),
  frequency: z.string().min(1),
  schedule: z.array(z.string()).nullable().optional(),
  prescriberId: z.string().uuid().nullable().optional(),
  pharmacyId: z.string().uuid().nullable().optional(),
  rxNumber: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  refillsRemaining: z.number().int().nullable().optional(),
  nextRefillDate: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
  sideEffectsToWatch: z.string().nullable().optional(),
  interactions: z.string().nullable().optional()
});

const medicationUpdateSchema = medicationCreateSchema.partial().extend({
  id: z.string().uuid(),
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  status: medicationStatusEnum.optional(),
  discontinuedReason: z.string().nullable().optional(),
  statusNote: z.string().nullable().optional(),
  archive: z.boolean().optional()
});

function displayName(medication: Medication): string {
  return medication.dosage ? `${medication.name} ${medication.dosage}` : medication.name;
}

export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const personId = request.nextUrl.searchParams.get("personId");
  const context = await getRequestContext(careCircleId, "emergency");

  if (context instanceof NextResponse) {
    return context;
  }

  if (!personId) {
    return NextResponse.json({ error: "personId is required" }, { status: 400 });
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("medications")
      .select("*")
      .eq("care_circle_id", careCircleId)
      .eq("person_id", personId)
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const medications = (data ?? []) as Medication[];
    const contactIds = medications
      .flatMap((medication) => [medication.prescriber_id, medication.pharmacy_id])
      .filter((id): id is string => !!id);
    const contacts = await getContactsById(contactIds);

    const hydrated: HydratedMedication[] = medications.map((medication) => ({
      ...medication,
      prescriber: medication.prescriber_id ? contacts.get(medication.prescriber_id) ?? null : null,
      pharmacy: medication.pharmacy_id ? contacts.get(medication.pharmacy_id) ?? null : null
    }));

    return NextResponse.json({ medications: hydrated });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const parsed = medicationCreateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid medication payload" }, { status: 400 });
  }

  const context = await getRequestContext(parsed.data.careCircleId, "contributor");

  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("medications")
      .insert({
        care_circle_id: parsed.data.careCircleId,
        person_id: parsed.data.personId,
        name: parsed.data.name,
        generic_name: parsed.data.genericName ?? null,
        brand_name: parsed.data.brandName ?? null,
        dosage: parsed.data.dosage ?? null,
        unit: parsed.data.unit ?? null,
        form: parsed.data.form ?? null,
        route: parsed.data.route ?? null,
        frequency: parsed.data.frequency,
        schedule: parsed.data.schedule ?? null,
        prescriber_id: parsed.data.prescriberId ?? null,
        pharmacy_id: parsed.data.pharmacyId ?? null,
        rx_number: parsed.data.rxNumber ?? null,
        start_date: parsed.data.startDate ?? null,
        end_date: parsed.data.endDate ?? null,
        is_active: true,
        refills_remaining: parsed.data.refillsRemaining ?? null,
        next_refill_date: parsed.data.nextRefillDate ?? null,
        instructions: parsed.data.instructions ?? null,
        side_effects_to_watch: parsed.data.sideEffectsToWatch ?? null,
        interactions: parsed.data.interactions ?? null,
        status: "active",
        discontinued_reason: null,
        deleted_at: null
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const medication = data as Medication;

    await createAuditLog({
      careCircleId: medication.care_circle_id,
      actorId: context.userId,
      actionType: "created",
      objectType: "medication",
      objectId: medication.id,
      diff: { name: medication.name, dosage: medication.dosage, frequency: medication.frequency }
    });

    await createTimelineEvent({
      careCircleId: medication.care_circle_id,
      personId: medication.person_id,
      eventType: "medication_changed",
      title: `${displayName(medication)} added to medications`,
      body: medication.frequency,
      authorId: context.userId,
      linkedObjectType: "medication",
      linkedObjectId: medication.id
    });

    if (medication.refills_remaining !== null && medication.next_refill_date) {
      await maybeCreateRefillReminder(medication);
    }

    return NextResponse.json({ medication });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const parsed = medicationUpdateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid medication update payload" }, { status: 400 });
  }

  const context = await getRequestContext(parsed.data.careCircleId, "contributor");

  if (context instanceof NextResponse) {
    return context;
  }

  if (parsed.data.status === "discontinued" && !parsed.data.discontinuedReason) {
    return NextResponse.json({ error: "A reason is required to discontinue a medication." }, { status: 400 });
  }

  try {
    const supabase = createClient();
    const updatePayload: Partial<Medication> = {};

    if (parsed.data.name !== undefined) updatePayload.name = parsed.data.name;
    if (parsed.data.genericName !== undefined) updatePayload.generic_name = parsed.data.genericName;
    if (parsed.data.brandName !== undefined) updatePayload.brand_name = parsed.data.brandName;
    if (parsed.data.dosage !== undefined) updatePayload.dosage = parsed.data.dosage;
    if (parsed.data.unit !== undefined) updatePayload.unit = parsed.data.unit;
    if (parsed.data.form !== undefined) updatePayload.form = parsed.data.form;
    if (parsed.data.route !== undefined) updatePayload.route = parsed.data.route;
    if (parsed.data.frequency !== undefined) updatePayload.frequency = parsed.data.frequency;
    if (parsed.data.schedule !== undefined) updatePayload.schedule = parsed.data.schedule;
    if (parsed.data.prescriberId !== undefined) updatePayload.prescriber_id = parsed.data.prescriberId;
    if (parsed.data.pharmacyId !== undefined) updatePayload.pharmacy_id = parsed.data.pharmacyId;
    if (parsed.data.rxNumber !== undefined) updatePayload.rx_number = parsed.data.rxNumber;
    if (parsed.data.startDate !== undefined) updatePayload.start_date = parsed.data.startDate;
    if (parsed.data.endDate !== undefined) updatePayload.end_date = parsed.data.endDate;
    if (parsed.data.refillsRemaining !== undefined) updatePayload.refills_remaining = parsed.data.refillsRemaining;
    if (parsed.data.nextRefillDate !== undefined) updatePayload.next_refill_date = parsed.data.nextRefillDate;
    if (parsed.data.instructions !== undefined) updatePayload.instructions = parsed.data.instructions;
    if (parsed.data.sideEffectsToWatch !== undefined) updatePayload.side_effects_to_watch = parsed.data.sideEffectsToWatch;
    if (parsed.data.interactions !== undefined) updatePayload.interactions = parsed.data.interactions;

    if (parsed.data.status !== undefined) {
      updatePayload.status = parsed.data.status as MedicationStatus;
      updatePayload.is_active = parsed.data.status === "active";
      if (parsed.data.status === "discontinued") {
        updatePayload.discontinued_reason = parsed.data.discontinuedReason ?? null;
      }
    }

    if (parsed.data.archive) updatePayload.deleted_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("medications")
      .update(updatePayload)
      .eq("id", parsed.data.id)
      .eq("care_circle_id", parsed.data.careCircleId)
      .eq("person_id", parsed.data.personId)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const medication = data as Medication;

    await createAuditLog({
      careCircleId: medication.care_circle_id,
      actorId: context.userId,
      actionType: parsed.data.archive ? "archived" : "updated",
      objectType: "medication",
      objectId: medication.id,
      diff: updatePayload
    });

    if (parsed.data.status !== undefined) {
      await createTimelineEvent({
        careCircleId: medication.care_circle_id,
        personId: medication.person_id,
        eventType: "medication_changed",
        title: statusTitle(medication, parsed.data.status),
        body: parsed.data.status === "discontinued" ? medication.discontinued_reason : parsed.data.statusNote ?? null,
        authorId: context.userId,
        linkedObjectType: "medication",
        linkedObjectId: medication.id
      });
    }

    return NextResponse.json({ medication });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

function statusTitle(medication: Medication, status: MedicationStatus): string {
  const name = displayName(medication);
  if (status === "paused") return `${name} paused`;
  if (status === "discontinued") return `${name} discontinued`;
  return `${name} resumed`;
}

async function maybeCreateRefillReminder(medication: Medication) {
  if (!medication.next_refill_date) {
    return;
  }

  const scheduledAt = new Date(`${medication.next_refill_date}T09:00:00`);
  scheduledAt.setDate(scheduledAt.getDate() - 7);
  const supabase = createClient();
  const { error } = await supabase.from("reminders").insert({
    care_circle_id: medication.care_circle_id,
    person_id: medication.person_id,
    linked_object_type: "medication",
    linked_object_id: medication.id,
    reminder_type: "medication_refill",
    scheduled_at: scheduledAt.toISOString(),
    message: `Refill due: ${displayName(medication)}`,
    recipient_ids: null,
    repeat_rule: null,
    acknowledgements: {},
    status: "pending",
    snooze_count: 0,
    snooze_until: null
  });

  if (error) {
    throw new Error(error.message);
  }
}
