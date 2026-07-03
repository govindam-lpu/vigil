import { createClient } from "@/lib/supabase/server";
import type { TimelineEvent, TimelineEventType } from "@/lib/types";

export async function createTimelineEvent({
  careCircleId,
  personId,
  eventType,
  title,
  body,
  authorId,
  linkedObjectType,
  linkedObjectId
}: {
  careCircleId: string;
  personId: string;
  eventType: TimelineEventType;
  title: string;
  body: string | null;
  authorId: string | null;
  linkedObjectType: string | null;
  linkedObjectId: string | null;
}): Promise<TimelineEvent> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_timeline_event", {
    care_circle_id: careCircleId,
    person_id: personId,
    event_type: eventType,
    title,
    body,
    author_id: authorId,
    linked_object_type: linkedObjectType,
    linked_object_id: linkedObjectId
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as TimelineEvent;
}
