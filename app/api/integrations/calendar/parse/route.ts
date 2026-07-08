import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { matchCareEvents, parseIcs } from "@/lib/calendar/ics";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  icsText: z.string().min(1),
  keywords: z.array(z.string()).default([])
});

// POST /api/integrations/calendar/parse — parse an uploaded .ics and return the events
// (next 90 days) that look care-related (match a contact name or a keyword). Any member
// can preview; importing requires appointments.write.
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid calendar payload" }, { status: 400 });
  }

  const context = await getRequestContext(parsed.data.careCircleId, "emergency");
  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    const { data: contacts } = await supabase
      .from("contacts")
      .select("name")
      .eq("care_circle_id", parsed.data.careCircleId)
      .eq("person_id", parsed.data.personId)
      .is("deleted_at", null);

    const contactNames = (contacts ?? []).map((contact) => contact.name);
    const events = parseIcs(parsed.data.icsText);
    const suggestions = matchCareEvents(events, contactNames, parsed.data.keywords);

    return NextResponse.json({ suggestions, totalParsed: events.length });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
