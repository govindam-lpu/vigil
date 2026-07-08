import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getCapabilityContext, getErrorMessage } from "@/lib/api/server";
import { createTimelineEvent } from "@/lib/api/timeline";
import { createClient } from "@/lib/supabase/server";
import type { Appointment } from "@/lib/types";

const eventSchema = z.object({
  summary: z.string().min(1),
  start: z.string().min(1),
  location: z.string().nullable().optional()
});

const bodySchema = z.object({
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  events: z.array(eventSchema).min(1)
});

// POST /api/integrations/calendar/import — create appointments from selected calendar
// events (appointments.write). Each becomes a scheduled appointment with a timeline
// entry; attendees are left empty (no auto-reminder) — the user adds them later.
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid import payload" }, { status: 400 });
  }

  const context = await getCapabilityContext(parsed.data.careCircleId, "appointments.write");
  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    let imported = 0;

    for (const event of parsed.data.events) {
      const { data, error } = await supabase
        .from("appointments")
        .insert({
          care_circle_id: parsed.data.careCircleId,
          person_id: parsed.data.personId,
          title: event.summary,
          provider_name: null,
          provider_contact_id: null,
          location: event.location ?? null,
          address: null,
          appointment_type: "medical",
          scheduled_at: event.start,
          duration_minutes: null,
          status: "scheduled",
          prep_notes: null,
          outcome: null,
          attendee_ids: [],
          deleted_at: null
        })
        .select("*")
        .single();

      if (error) throw new Error(error.message);

      const appointment = data as Appointment;
      imported += 1;

      await createAuditLog({
        careCircleId: appointment.care_circle_id,
        actorId: context.userId,
        actionType: "created",
        objectType: "appointment",
        objectId: appointment.id,
        diff: { title: appointment.title, scheduled_at: appointment.scheduled_at, source: "calendar_import" }
      });

      await createTimelineEvent({
        careCircleId: appointment.care_circle_id,
        personId: appointment.person_id,
        eventType: "appointment_created",
        title: `Appointment imported: ${appointment.title}`,
        body: appointment.location,
        authorId: context.userId,
        linkedObjectType: "appointment",
        linkedObjectId: appointment.id
      });
    }

    return NextResponse.json({ imported });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
