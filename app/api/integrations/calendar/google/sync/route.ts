import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "@/lib/ai/crypto";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { matchCareEvents, type CalendarEvent } from "@/lib/calendar/ics";
import { createClient } from "@/lib/supabase/server";
import type { CalendarConnection } from "@/lib/types";

export const runtime = "nodejs";

const bodySchema = z.object({
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  keywords: z.array(z.string()).optional()
});

type GoogleEvent = {
  summary?: string;
  location?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
};

// POST /api/integrations/calendar/google/sync — pull the connected member's Google
// Calendar events (next 90 days), refresh the token if needed, and return the ones that
// look care-related. Authored but not verifiable in-repo (needs Google credentials).
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sync payload" }, { status: 400 });
  }

  const context = await getRequestContext(parsed.data.careCircleId, "emergency");
  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("calendar_connections")
      .select("*")
      .eq("care_circle_id", parsed.data.careCircleId)
      .eq("user_id", context.userId)
      .eq("provider", "google")
      .maybeSingle();

    const connection = data as CalendarConnection | null;
    if (!connection || !connection.encrypted_access_token) {
      return NextResponse.json({ error: "Google Calendar is not connected." }, { status: 400 });
    }

    let accessToken = decryptSecret(connection.encrypted_access_token);

    // Refresh an expired access token using the stored refresh token.
    if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() < Date.now()) {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!connection.encrypted_refresh_token || !clientId || !clientSecret) {
        return NextResponse.json({ error: "Reconnect your Google Calendar." }, { status: 400 });
      }
      const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: decryptSecret(connection.encrypted_refresh_token),
          grant_type: "refresh_token"
        })
      });
      const refreshed = (await refreshResponse.json()) as { access_token?: string; expires_in?: number };
      if (!refreshResponse.ok || !refreshed.access_token) {
        return NextResponse.json({ error: "Reconnect your Google Calendar." }, { status: 400 });
      }
      accessToken = refreshed.access_token;
      await supabase
        .from("calendar_connections")
        .update({
          encrypted_access_token: encryptSecret(accessToken),
          token_expires_at: new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString()
        })
        .eq("id", connection.id);
    }

    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 90 * 86400000).toISOString();
    const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250"
    })}`;
    const eventsResponse = await fetch(eventsUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!eventsResponse.ok) {
      return NextResponse.json({ error: "Failed to fetch calendar events." }, { status: 502 });
    }

    const eventsJson = (await eventsResponse.json()) as { items?: GoogleEvent[] };
    const events: CalendarEvent[] = (eventsJson.items ?? []).map((item) => ({
      summary: item.summary ?? "Untitled event",
      start: item.start?.dateTime ?? (item.start?.date ? `${item.start.date}T00:00:00.000Z` : null),
      location: item.location ?? null,
      description: item.description ?? null
    }));

    const { data: contacts } = await supabase
      .from("contacts")
      .select("name")
      .eq("care_circle_id", parsed.data.careCircleId)
      .eq("person_id", parsed.data.personId)
      .is("deleted_at", null);
    const contactNames = (contacts ?? []).map((contact) => contact.name);
    const keywords = parsed.data.keywords ?? connection.keyword_list ?? [];
    const suggestions = matchCareEvents(events, contactNames, keywords);

    return NextResponse.json({ suggestions, totalParsed: events.length });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
