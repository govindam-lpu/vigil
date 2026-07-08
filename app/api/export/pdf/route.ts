import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getProfilesById } from "@/lib/api/records";
import { getCapabilityContext, getErrorMessage } from "@/lib/api/server";
import { buildCareSummaryPdf, type CareSummaryInput } from "@/lib/pdf/care-summary";
import { createClient } from "@/lib/supabase/server";
import { calculateAge, formatPersonName, toArrayBuffer } from "@/lib/utils";
import type { Appointment, Contact, Medication, Person, Task, TimelineEvent, UserProfile } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({ careCircleId: z.string().uuid() });

// POST /api/export/pdf — human-readable Care Summary PDF (Owner or export.all).
// Profile, active meds, upcoming appts (90d), open tasks, last-30-day activity, contacts.
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "careCircleId is required" }, { status: 400 });
  }

  const { careCircleId } = parsed.data;
  const context = await getCapabilityContext(careCircleId, "export.all");
  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 86400000).toISOString();
    const last30Days = new Date(now.getTime() - 30 * 86400000).toISOString();

    const [personResult, medsResult, apptResult, taskResult, contactResult, timelineResult, actorResult] =
      await Promise.all([
        supabase.from("persons").select("*").eq("care_circle_id", careCircleId).limit(1).maybeSingle(),
        supabase
          .from("medications")
          .select("*")
          .eq("care_circle_id", careCircleId)
          .eq("status", "active")
          .is("deleted_at", null),
        supabase
          .from("appointments")
          .select("*")
          .eq("care_circle_id", careCircleId)
          .eq("status", "scheduled")
          .gte("scheduled_at", now.toISOString())
          .lte("scheduled_at", in90Days)
          .is("deleted_at", null)
          .order("scheduled_at", { ascending: true }),
        supabase
          .from("tasks")
          .select("*")
          .eq("care_circle_id", careCircleId)
          .in("status", ["open", "in_progress"])
          .is("deleted_at", null),
        supabase.from("contacts").select("*").eq("care_circle_id", careCircleId).is("deleted_at", null),
        supabase
          .from("timeline_events")
          .select("*")
          .eq("care_circle_id", careCircleId)
          .gte("occurred_at", last30Days)
          .is("deleted_at", null)
          .order("occurred_at", { ascending: false })
          .limit(100),
        supabase.from("users_profiles").select("*").eq("id", context.userId).maybeSingle()
      ]);

    const person = personResult.data as Person | null;
    if (!person) {
      return NextResponse.json({ error: "No person found for this care circle." }, { status: 404 });
    }

    const medications = (medsResult.data ?? []) as Medication[];
    const appointments = (apptResult.data ?? []) as Appointment[];
    const tasks = (taskResult.data ?? []) as Task[];
    const contacts = (contactResult.data ?? []) as Contact[];
    const timeline = (timelineResult.data ?? []) as TimelineEvent[];
    const actor = actorResult.data as UserProfile | null;

    const profileIds = [
      ...tasks.map((task) => task.assignee_id),
      ...timeline.map((entry) => entry.author_id)
    ].filter((id): id is string => Boolean(id));
    const profiles = await getProfilesById(profileIds);

    const input: CareSummaryInput = {
      personName: formatPersonName(person.first_name, person.last_name, person.preferred_name),
      person: {
        dateOfBirth: person.date_of_birth,
        age: calculateAge(person.date_of_birth),
        bloodType: person.blood_type,
        primaryLanguage: person.primary_language,
        allergies: person.allergies ?? [],
        diagnoses: person.primary_diagnoses ?? [],
        about: person.about_note
      },
      medications: medications.map((med) => ({
        name: med.name,
        dose: [med.dosage, med.unit].filter(Boolean).join(" "),
        frequency: med.frequency,
        instructions: med.instructions
      })),
      appointments: appointments.map((appointment) => ({
        title: appointment.title,
        provider: appointment.provider_name,
        scheduledAt: appointment.scheduled_at,
        location: appointment.location
      })),
      tasks: tasks.map((task) => ({
        title: task.title,
        assignee: task.assignee_id ? profiles.get(task.assignee_id)?.display_name ?? "Unknown" : "Unassigned",
        dueDate: task.due_date,
        priority: task.priority,
        status: task.status
      })),
      contacts: contacts.map((contact) => ({
        name: contact.name,
        role: contact.role,
        phone: contact.phone,
        organization: contact.organization
      })),
      timeline: timeline.map((entry) => ({
        occurredAt: entry.occurred_at,
        author: entry.author_id ? profiles.get(entry.author_id)?.display_name ?? "System" : "System",
        title: entry.title,
        body: entry.body
      })),
      generatedAt: now.toISOString(),
      generatedBy: actor?.display_name ?? "A care circle member"
    };

    const pdf = await buildCareSummaryPdf(input);

    await createAuditLog({
      careCircleId,
      actorId: context.userId,
      actionType: "export",
      objectType: "care_circle",
      objectId: careCircleId,
      diff: { format: "pdf" }
    });

    const filename = `vigil-care-summary-${careCircleId}.pdf`;
    return new NextResponse(toArrayBuffer(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
