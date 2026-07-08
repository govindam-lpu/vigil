import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getContactsById } from "@/lib/api/records";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { roleMeetsMinimum } from "@/lib/permissions/roles";
import { createClient } from "@/lib/supabase/server";
import type { Contact, Household, HouseholdAccessNote, HydratedHousehold } from "@/lib/types";

const householdTypeEnum = z.enum([
  "primary_residence",
  "secondary_residence",
  "facility",
  "clinic",
  "hospital",
  "other"
]);

const householdCreateSchema = z.object({
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  name: z.string().min(1),
  type: householdTypeEnum,
  address: z.string().nullable().optional(),
  linkedContactIds: z.array(z.string().uuid()).optional(),
  accessNotes: z.string().nullable().optional()
});

const householdUpdateSchema = z.object({
  id: z.string().uuid(),
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  name: z.string().min(1).optional(),
  type: householdTypeEnum.optional(),
  address: z.string().nullable().optional(),
  linkedContactIds: z.array(z.string().uuid()).optional(),
  accessNotes: z.string().nullable().optional(),
  archive: z.boolean().optional()
});

export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const personId = request.nextUrl.searchParams.get("personId");
  const context = await getRequestContext(careCircleId, "emergency");

  if (context instanceof NextResponse) return context;
  if (!personId) return NextResponse.json({ error: "personId is required" }, { status: 400 });

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("households")
      .select("*")
      .eq("care_circle_id", careCircleId)
      .eq("person_id", personId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    const households = (data ?? []) as Household[];
    const canReadAccessNotes = roleMeetsMinimum(context.membership.role, "coordinator");

    // Access notes live in a coordinator-only companion table (DB-enforced). Lower
    // roles never receive them and are flagged access_restricted.
    const notesByHousehold = new Map<string, string | null>();
    if (canReadAccessNotes && households.length > 0) {
      const { data: notes } = await supabase
        .from("household_access_notes")
        .select("*")
        .in(
          "household_id",
          households.map((household) => household.id)
        );
      for (const note of (notes ?? []) as HouseholdAccessNote[]) {
        notesByHousehold.set(note.household_id, note.notes);
      }
    }

    const contactIds = households.flatMap((household) => household.linked_contact_ids ?? []);
    const contactsById: Map<string, Contact> = await getContactsById(contactIds);

    const hydrated: HydratedHousehold[] = households.map((household) => ({
      ...household,
      access_notes: canReadAccessNotes ? notesByHousehold.get(household.id) ?? null : null,
      access_restricted: !canReadAccessNotes,
      linked_contacts: (household.linked_contact_ids ?? [])
        .map((id) => contactsById.get(id))
        .filter((contact): contact is Contact => Boolean(contact))
    }));

    return NextResponse.json({ households: hydrated });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const parsed = householdCreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid household payload" }, { status: 400 });

  const context = await getRequestContext(parsed.data.careCircleId, "contributor");
  if (context instanceof NextResponse) return context;

  if (parsed.data.accessNotes !== undefined && !roleMeetsMinimum(context.membership.role, "coordinator")) {
    return NextResponse.json({ error: "Only coordinators can set access notes." }, { status: 403 });
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("households")
      .insert({
        care_circle_id: parsed.data.careCircleId,
        person_id: parsed.data.personId,
        name: parsed.data.name,
        type: parsed.data.type,
        address: parsed.data.address ?? null,
        linked_contact_ids: parsed.data.linkedContactIds ?? [],
        deleted_at: null
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    const household = data as Household;

    if (parsed.data.accessNotes !== undefined) {
      const { error: notesError } = await supabase.from("household_access_notes").upsert(
        {
          household_id: household.id,
          care_circle_id: household.care_circle_id,
          notes: parsed.data.accessNotes
        },
        { onConflict: "household_id" }
      );
      if (notesError) throw new Error(notesError.message);
    }

    await createAuditLog({
      careCircleId: household.care_circle_id,
      actorId: context.userId,
      actionType: "created",
      objectType: "household",
      objectId: household.id,
      diff: { name: household.name, type: household.type }
    });

    return NextResponse.json({ household });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const parsed = householdUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid household update payload" }, { status: 400 });

  const context = await getRequestContext(parsed.data.careCircleId, "contributor");
  if (context instanceof NextResponse) return context;

  if (parsed.data.accessNotes !== undefined && !roleMeetsMinimum(context.membership.role, "coordinator")) {
    return NextResponse.json({ error: "Only coordinators can set access notes." }, { status: 403 });
  }

  try {
    const supabase = createClient();
    const updatePayload: Partial<Household> = {};
    if (parsed.data.name !== undefined) updatePayload.name = parsed.data.name;
    if (parsed.data.type !== undefined) updatePayload.type = parsed.data.type;
    if (parsed.data.address !== undefined) updatePayload.address = parsed.data.address;
    if (parsed.data.linkedContactIds !== undefined) updatePayload.linked_contact_ids = parsed.data.linkedContactIds;
    if (parsed.data.archive) updatePayload.deleted_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("households")
      .update(updatePayload)
      .eq("id", parsed.data.id)
      .eq("care_circle_id", parsed.data.careCircleId)
      .eq("person_id", parsed.data.personId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    const household = data as Household;

    if (parsed.data.accessNotes !== undefined) {
      const { error: notesError } = await supabase.from("household_access_notes").upsert(
        {
          household_id: household.id,
          care_circle_id: household.care_circle_id,
          notes: parsed.data.accessNotes
        },
        { onConflict: "household_id" }
      );
      if (notesError) throw new Error(notesError.message);
    }

    await createAuditLog({
      careCircleId: household.care_circle_id,
      actorId: context.userId,
      actionType: parsed.data.archive ? "archived" : "updated",
      objectType: "household",
      objectId: household.id,
      diff: updatePayload
    });

    return NextResponse.json({ household });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
