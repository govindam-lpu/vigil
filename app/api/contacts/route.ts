import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getCapabilityContext, getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import type { Contact } from "@/lib/types";

const contactRoleEnum = z.enum([
  "doctor",
  "specialist",
  "pharmacist",
  "attorney",
  "insurance",
  "caregiver",
  "neighbor",
  "other"
]);

const contactCreateSchema = z.object({
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  name: z.string().min(1),
  organization: z.string().nullable().optional(),
  role: contactRoleEnum.nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  npi: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isPrimary: z.boolean().optional(),
  isEmergencyContact: z.boolean().optional(),
  pinnedInCrisis: z.boolean().optional()
});

const contactUpdateSchema = contactCreateSchema.partial().extend({
  id: z.string().uuid(),
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  archive: z.boolean().optional()
});

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
      .from("contacts")
      .select("*")
      .eq("care_circle_id", careCircleId)
      .eq("person_id", personId)
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ contacts: (data ?? []) as Contact[] });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const parsed = contactCreateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid contact payload" }, { status: 400 });
  }

  const context = await getCapabilityContext(parsed.data.careCircleId, "contacts.write");

  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        care_circle_id: parsed.data.careCircleId,
        person_id: parsed.data.personId,
        name: parsed.data.name,
        organization: parsed.data.organization ?? null,
        role: parsed.data.role ?? null,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email ?? null,
        address: parsed.data.address ?? null,
        npi: parsed.data.npi ?? null,
        notes: parsed.data.notes ?? null,
        is_primary: parsed.data.isPrimary ?? false,
        is_emergency_contact: parsed.data.isEmergencyContact ?? false,
        pinned_in_crisis: parsed.data.pinnedInCrisis ?? false,
        deleted_at: null
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const contact = data as Contact;
    await createAuditLog({
      careCircleId: contact.care_circle_id,
      actorId: context.userId,
      actionType: "created",
      objectType: "contact",
      objectId: contact.id,
      diff: { name: contact.name, role: contact.role, organization: contact.organization }
    });

    return NextResponse.json({ contact });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const parsed = contactUpdateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid contact update payload" }, { status: 400 });
  }

  const context = await getCapabilityContext(parsed.data.careCircleId, "contacts.write");

  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    const updatePayload: Partial<Contact> = {};

    if (parsed.data.name !== undefined) updatePayload.name = parsed.data.name;
    if (parsed.data.organization !== undefined) updatePayload.organization = parsed.data.organization;
    if (parsed.data.role !== undefined) updatePayload.role = parsed.data.role;
    if (parsed.data.phone !== undefined) updatePayload.phone = parsed.data.phone;
    if (parsed.data.email !== undefined) updatePayload.email = parsed.data.email;
    if (parsed.data.address !== undefined) updatePayload.address = parsed.data.address;
    if (parsed.data.npi !== undefined) updatePayload.npi = parsed.data.npi;
    if (parsed.data.notes !== undefined) updatePayload.notes = parsed.data.notes;
    if (parsed.data.isPrimary !== undefined) updatePayload.is_primary = parsed.data.isPrimary;
    if (parsed.data.isEmergencyContact !== undefined) updatePayload.is_emergency_contact = parsed.data.isEmergencyContact;
    if (parsed.data.pinnedInCrisis !== undefined) updatePayload.pinned_in_crisis = parsed.data.pinnedInCrisis;
    if (parsed.data.archive) updatePayload.deleted_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("contacts")
      .update(updatePayload)
      .eq("id", parsed.data.id)
      .eq("care_circle_id", parsed.data.careCircleId)
      .eq("person_id", parsed.data.personId)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const contact = data as Contact;
    await createAuditLog({
      careCircleId: contact.care_circle_id,
      actorId: context.userId,
      actionType: parsed.data.archive ? "archived" : "updated",
      objectType: "contact",
      objectId: contact.id,
      diff: updatePayload
    });

    return NextResponse.json({ contact });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
