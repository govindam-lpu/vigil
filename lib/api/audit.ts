import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types";

export async function createAuditLog({
  careCircleId,
  actorId,
  actionType,
  objectType,
  objectId,
  diff
}: {
  careCircleId: string;
  actorId: string;
  actionType:
    | "created"
    | "updated"
    | "deleted"
    | "archived"
    | "permission_changed"
    | "role_changed"
    | "shared"
    | "export"
    | "crisis_activated"
    | "crisis_deactivated"
    | "login";
  objectType: string;
  objectId: string;
  diff: Json | null;
}) {
  const supabase = createClient();
  const { error } = await supabase.from("audit_logs").insert({
    care_circle_id: careCircleId,
    actor_id: actorId,
    action_type: actionType,
    object_type: objectType,
    object_id: objectId,
    diff,
    ip_address: null,
    user_agent: null
  });

  if (error) {
    throw new Error(error.message);
  }
}
