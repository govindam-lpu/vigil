// Minimal iCalendar (.ics) parsing + care-event matching (Phase 5 §6).
//
// Pragmatic parser for the common Google/Apple exports: line unfolding, VEVENT blocks,
// SUMMARY / DTSTART / LOCATION / DESCRIPTION. Timezone handling is best-effort (naive
// datetimes are treated as UTC) — acceptable because every event is user-confirmed
// before import. Not a full RFC 5545 implementation.

export type CalendarEvent = {
  summary: string;
  start: string | null;
  location: string | null;
  description: string | null;
};

export type MatchedCalendarEvent = CalendarEvent & {
  matched: boolean;
  matchReason: string | null;
};

function unescapeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseIcsDate(value: string): string | null {
  const raw = value.trim();

  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (dateOnly) {
    return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00.000Z`;
  }

  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(raw);
  if (dateTime) {
    return `${dateTime[1]}-${dateTime[2]}-${dateTime[3]}T${dateTime[4]}:${dateTime[5]}:${dateTime[6]}.000Z`;
  }

  return null;
}

export function parseIcs(text: string): CalendarEvent[] {
  // Unfold continuation lines (RFC 5545: a leading space/tab continues the prior line).
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const events: CalendarEvent[] = [];
  let current: Partial<CalendarEvent> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) {
        events.push({
          summary: current.summary ?? "Untitled event",
          start: current.start ?? null,
          location: current.location ?? null,
          description: current.description ?? null
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const rawKey = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const key = rawKey.split(";")[0].toUpperCase();

    if (key === "SUMMARY") current.summary = unescapeIcsText(value);
    else if (key === "LOCATION") current.location = unescapeIcsText(value);
    else if (key === "DESCRIPTION") current.description = unescapeIcsText(value);
    else if (key === "DTSTART") current.start = parseIcsDate(value);
  }

  return events;
}

/**
 * Flag events that look care-related: the event text mentions a known contact
 * (provider) name, or contains one of the user's configured keywords. Only events
 * with a start date in [now, now + horizonDays] are considered.
 */
export function matchCareEvents(
  events: CalendarEvent[],
  contactNames: string[],
  keywords: string[],
  horizonDays = 90
): MatchedCalendarEvent[] {
  const now = Date.now();
  const horizon = now + horizonDays * 86400000;
  const names = contactNames.map((name) => name.toLowerCase().trim()).filter(Boolean);
  const words = keywords.map((word) => word.toLowerCase().trim()).filter(Boolean);

  const result: MatchedCalendarEvent[] = [];
  for (const event of events) {
    if (!event.start) continue;
    const startMs = new Date(event.start).getTime();
    if (Number.isNaN(startMs) || startMs < now || startMs > horizon) continue;

    const haystack = `${event.summary} ${event.location ?? ""} ${event.description ?? ""}`.toLowerCase();
    const contactHit = names.find((name) => haystack.includes(name));
    const keywordHit = words.find((word) => haystack.includes(word));
    const matched = Boolean(contactHit || keywordHit);

    if (matched) {
      result.push({
        ...event,
        matched: true,
        matchReason: contactHit ? `Matches contact "${contactHit}"` : `Matches keyword "${keywordHit}"`
      });
    }
  }

  return result;
}
