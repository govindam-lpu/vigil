import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getProfilesById } from "@/lib/api/records";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createTimelineEvent } from "@/lib/api/timeline";
import { createClient } from "@/lib/supabase/server";
import type { Appointment, AppointmentStatus, AppointmentType, HydratedAppointment, Task } from "@/lib/types";

const appointmentCreateSchema = z.object({
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  title: z.string().min(1),
  providerName: z.string().nullable().optional(),
  providerContactId: z.string().uuid().nullable().optional(),
  scheduledAt: z.string().min(1),
  durationMinutes: z.number().int().nullable().optional(),
  appointmentType: z.enum(["medical", "legal", "financial", "home_service", "other"]).nullable().optional(),
  location: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  prepNotes: z.string().nullable().optional(),
  attendeeIds: z.array(z.string().uuid()).optional(),
  createReminder: z.boolean().default(true)
});

const appointmentUpdateSchema = appointmentCreateSchema.partial().extend({
  id: z.string().uuid(),
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  status: z.enum(["scheduled", "completed", "cancelled", "missed"]).optional(),
  outcome: z.string().nullable().optional(),
  followUpTasks: z.array(z.string()).optional(),
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
      .from("appointments")
      .select("*")
      .eq("care_circle_id", careCircleId)
      .eq("person_id", personId)
      .is("deleted_at", null)
      .order("scheduled_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const appointments = (data ?? []) as Appointment[];
    const attendeeIds = appointments.flatMap((appointment) => appointment.attendee_ids ?? []);
    const profiles = await getProfilesById(attendeeIds);
    const hydrated: HydratedAppointment[] = appointments.map((appointment) => ({
      ...appointment,
      attendees: (appointment.attendee_ids ?? []).map((id) => profiles.get(id)).filter((profile): profile is NonNullable<typeof profile> => !!profile)
    }));

    return NextResponse.json({ appointments: hydrated });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const parsed = appointmentCreateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid appointment payload" }, { status: 400 });
  }

  const context = await getRequestContext(parsed.data.careCircleId, "contributor");

  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("appointments")
      .insert({
        care_circle_id: parsed.data.careCircleId,
        person_id: parsed.data.personId,
        title: parsed.data.title,
        provider_name: parsed.data.providerName ?? null,
        provider_contact_id: parsed.data.providerContactId ?? null,
        location: parsed.data.location ?? null,
        address: parsed.data.address ?? null,
        appointment_type: parsed.data.appointmentType ?? "medical",
        scheduled_at: parsed.data.scheduledAt,
        duration_minutes: parsed.data.durationMinutes ?? null,
        status: "scheduled",
        prep_notes: parsed.data.prepNotes ?? null,
        outcome: null,
        attendee_ids: parsed.data.attendeeIds ?? [],
        deleted_at: null
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const appointment = data as Appointment;
    await createAuditLog({
      careCircleId: appointment.care_circle_id,
      actorId: context.userId,
      actionType: "created",
      objectType: "appointment",
      objectId: appointment.id,
      diff: { title: appointment.title, scheduled_at: appointment.scheduled_at }
    });
    await createTimelineEvent({
      careCircleId: appointment.care_circle_id,
      personId: appointment.person_id,
      eventType: "appointment_created",
      title: `Appointment added: ${appointment.title}`,
      body: appointment.provider_name,
      authorId: context.userId,
      linkedObjectType: "appointment",
      linkedObjectId: appointment.id
    });

    if (parsed.data.createReminder) {
      await maybeCreateAppointmentReminder(appointment);
    }

    return NextResponse.json({ appointment });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const parsed = appointmentUpdateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid appointment update payload" }, { status: 400 });
  }

  const context = await getRequestContext(parsed.data.careCircleId, "contributor");

  if (context instanceof NextResponse) {
    return context;
  }

  if (parsed.data.status === "completed" && !parsed.data.outcome) {
    return NextResponse.json({ error: "Outcome is required before completing an appointment." }, { status: 400 });
  }

  try {
    const supabase = createClient();
    const updatePayload: Partial<Appointment> = {};

    if (parsed.data.title !== undefined) updatePayload.title = parsed.data.title;
    if (parsed.data.providerName !== undefined) updatePayload.provider_name = parsed.data.providerName;
    if (parsed.data.providerContactId !== undefined) updatePayload.provider_contact_id = parsed.data.providerContactId;
    if (parsed.data.location !== undefined) updatePayload.location = parsed.data.location;
    if (parsed.data.address !== undefined) updatePayload.address = parsed.data.address;
    if (parsed.data.appointmentType !== undefined) updatePayload.appointment_type = parsed.data.appointmentType as AppointmentType | null;
    if (parsed.data.scheduledAt !== undefined) updatePayload.scheduled_at = parsed.data.scheduledAt;
    if (parsed.data.durationMinutes !== undefined) updatePayload.duration_minutes = parsed.data.durationMinutes;
    if (parsed.data.prepNotes !== undefined) updatePayload.prep_notes = parsed.data.prepNotes;
    if (parsed.data.outcome !== undefined) updatePayload.outcome = parsed.data.outcome;
    if (parsed.data.attendeeIds !== undefined) updatePayload.attendee_ids = parsed.data.attendeeIds;
    if (parsed.data.status !== undefined) updatePayload.status = parsed.data.status as AppointmentStatus;
    if (parsed.data.archive) updatePayload.deleted_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("appointments")
      .update(updatePayload)
      .eq("id", parsed.data.id)
      .eq("care_circle_id", parsed.data.careCircleId)
      .eq("person_id", parsed.data.personId)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const appointment = data as Appointment;
    await createAuditLog({
      careCircleId: appointment.care_circle_id,
      actorId: context.userId,
      actionType: parsed.data.archive ? "archived" : "updated",
      objectType: "appointment",
      objectId: appointment.id,
      diff: updatePayload
    });

    if (parsed.data.status === "completed") {
      await createTimelineEvent({
        careCircleId: appointment.care_circle_id,
        personId: appointment.person_id,
        eventType: "appointment_completed",
        title: `Appointment completed: ${appointment.title}`,
        body: appointment.outcome,
        authorId: context.userId,
        linkedObjectType: "appointment",
        linkedObjectId: appointment.id
      });
    }

    if (parsed.data.followUpTasks && parsed.data.followUpTasks.length > 0) {
      await createFollowUpTasks(appointment, parsed.data.followUpTasks, context.userId);
    }

    return NextResponse.json({ appointment });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

async function maybeCreateAppointmentReminder(appointment: Appointment) {
  const recipients = appointment.attendee_ids ?? [];

  if (recipients.length === 0) {
    return;
  }

  const scheduledAt = new Date(appointment.scheduled_at);
  scheduledAt.setHours(scheduledAt.getHours() - 48);
  const supabase = createClient();
  const { error } = await supabase.from("reminders").insert({
    care_circle_id: appointment.care_circle_id,
    person_id: appointment.person_id,
    linked_object_type: "appointment",
    linked_object_id: appointment.id,
    reminder_type: "appointment_upcoming",
    scheduled_at: scheduledAt.toISOString(),
    message: `Upcoming appointment: ${appointment.title}`,
    recipient_ids: recipients,
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

async function createFollowUpTasks(appointment: Appointment, lines: string[], actorId: string) {
  const titles = lines.map((line) => line.trim()).filter(Boolean);

  if (titles.length === 0) {
    return;
  }

  const supabase = createClient();
  for (const title of titles) {
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        care_circle_id: appointment.care_circle_id,
        person_id: appointment.person_id,
        title,
        description: null,
        assignee_id: null,
        assigned_by: actorId,
        due_date: null,
        due_time: null,
        priority: "normal",
        status: "open",
        recurrence: null,
        linked_object_type: "appointment",
        linked_object_id: appointment.id,
        tags: null,
        completed_at: null,
        completed_by: null,
        missed_at: null,
        deleted_at: null
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const task = data as Task;
    await createAuditLog({
      careCircleId: appointment.care_circle_id,
      actorId,
      actionType: "created",
      objectType: "task",
      objectId: task.id,
      diff: { title: task.title, linked_object_type: "appointment", linked_object_id: appointment.id }
    });
  }
}
