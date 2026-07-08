import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getProfilesById } from "@/lib/api/records";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { buildEmergencyPacketPdf, type PacketContact, type PacketDocument, type PacketMedication, type PacketTimelineEntry } from "@/lib/pdf/emergency-packet";
import { createClient } from "@/lib/supabase/server";
import type { Contact, Document, Medication, Person, TimelineEvent } from "@/lib/types";

export const runtime = "nodejs";

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24; // 24 hours

const packetSchema = z.object({
  careCircleId: z.string().uuid(),
  personId: z.string().uuid()
});

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const date = new Date(dob);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }
  return age;
}

// POST /api/emergency-packet — Coordinator+ generates a curated PDF, stores it in
// the private emergency-packets bucket, and returns a 24h signed (unauthenticated)
// share URL. Audit-logged as an export.
export async function POST(request: NextRequest) {
  const parsed = packetSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid packet request" }, { status: 400 });
  }

  const context = await getRequestContext(parsed.data.careCircleId, "coordinator");

  if (context instanceof NextResponse) {
    return context;
  }

  const { careCircleId, personId } = parsed.data;

  try {
    const supabase = createClient();

    const { data: personData, error: personError } = await supabase
      .from("persons")
      .select("*")
      .eq("id", personId)
      .eq("care_circle_id", careCircleId)
      .maybeSingle();

    if (personError) {
      throw new Error(personError.message);
    }

    if (!personData) {
      return NextResponse.json({ error: "Person not found in this care circle." }, { status: 404 });
    }

    const person = personData as Person;

    const [medsResult, contactsResult, docsResult, timelineResult] = await Promise.all([
      supabase
        .from("medications")
        .select("*")
        .eq("care_circle_id", careCircleId)
        .eq("person_id", personId)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("contacts")
        .select("*")
        .eq("care_circle_id", careCircleId)
        .eq("person_id", personId)
        .eq("is_emergency_contact", true)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("documents")
        .select("*")
        .eq("care_circle_id", careCircleId)
        .eq("person_id", personId)
        .eq("pinned_in_crisis", true)
        .is("deleted_at", null)
        .order("title", { ascending: true }),
      supabase
        .from("timeline_events")
        .select("*")
        .eq("care_circle_id", careCircleId)
        .eq("person_id", personId)
        .is("deleted_at", null)
        .order("occurred_at", { ascending: false })
        .limit(5)
    ]);

    for (const result of [medsResult, contactsResult, docsResult, timelineResult]) {
      if (result.error) {
        throw new Error(result.error.message);
      }
    }

    const medications = (medsResult.data ?? []) as Medication[];
    const contacts = (contactsResult.data ?? []) as Contact[];
    const documents = (docsResult.data ?? []) as Document[];
    const timeline = (timelineResult.data ?? []) as TimelineEvent[];

    // Sign each pinned document for the same 24h window so the packet reader can open them.
    const packetDocuments: PacketDocument[] = await Promise.all(
      documents.map(async (document): Promise<PacketDocument> => {
        let url: string | null = null;
        if (document.storage_path) {
          const { data: signed } = await supabase.storage
            .from("documents")
            .createSignedUrl(document.storage_path, SIGNED_URL_TTL_SECONDS);
          url = signed?.signedUrl ?? null;
        }
        return { title: document.title, documentType: document.document_type, url };
      })
    );

    const authorIds = timeline
      .map((event) => event.author_id)
      .filter((id): id is string => Boolean(id));
    const authorProfiles = await getProfilesById([...authorIds, context.userId]);

    const packetMedications: PacketMedication[] = medications.map((med) => ({
      name: med.name,
      dose: [med.dosage, med.unit].filter(Boolean).join(" "),
      frequency: med.frequency,
      instructions: med.instructions
    }));

    const packetContacts: PacketContact[] = contacts.map((contact) => ({
      name: contact.name,
      role: contact.role,
      phone: contact.phone,
      organization: contact.organization
    }));

    const packetTimeline: PacketTimelineEntry[] = timeline.map((event) => ({
      occurredAt: event.occurred_at,
      author: event.author_id ? authorProfiles.get(event.author_id)?.display_name ?? "System" : "System",
      title: event.title,
      body: event.body
    }));

    const personName =
      person.preferred_name ?? `${person.first_name} ${person.last_name}`.trim();
    const generatedBy = authorProfiles.get(context.userId)?.display_name ?? "A coordinator";
    const generatedAt = new Date().toISOString();

    const pdfBuffer = await buildEmergencyPacketPdf({
      personName,
      person: {
        dateOfBirth: person.date_of_birth,
        age: ageFromDob(person.date_of_birth),
        bloodType: person.blood_type,
        allergies: person.allergies ?? [],
        diagnoses: person.primary_diagnoses ?? []
      },
      medications: packetMedications,
      contacts: packetContacts,
      documents: packetDocuments,
      timeline: packetTimeline,
      generatedAt,
      generatedBy
    });

    const objectPath = `${careCircleId}/${randomUUID()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("emergency-packets")
      .upload(objectPath, pdfBuffer, { contentType: "application/pdf", upsert: false });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: signed, error: signError } = await supabase.storage
      .from("emergency-packets")
      .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed) {
      throw new Error(signError?.message ?? "Failed to create share link");
    }

    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();

    await createAuditLog({
      careCircleId,
      actorId: context.userId,
      actionType: "export",
      objectType: "emergency_packet",
      objectId: person.id,
      diff: { storage_path: objectPath, expires_at: expiresAt }
    });

    return NextResponse.json({
      url: signed.signedUrl,
      fileName: `emergency-packet-${personName.replace(/\s+/g, "-").toLowerCase()}.pdf`,
      expiresAt
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
