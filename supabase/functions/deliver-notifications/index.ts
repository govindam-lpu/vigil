// Supabase Edge Function (Deno) — external notification delivery (Phase 5 §2).
//
// Pull model: on each invocation it processes a batch of undelivered notification
// rows (delivery_processed_at is null), fans each out to email (Resend) and/or push
// (FCM) according to the recipient's per-category channel preferences, then marks the
// row processed. Invoke it from pg_cron (via pg_net) every minute, or from a Supabase
// Database Webhook on inserts to public.notifications. In-app delivery already happened
// when the row was inserted — this function only adds the external channels.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (rotated; service-role only in this
// function), RESEND_API_KEY, RESEND_FROM, FCM_SERVER_KEY, DELIVER_SHARED_SECRET.
//
// NOT deployed/verified in-repo (needs a Resend account + an FCM project). The DB
// schema, preferences, and in-app rows are all exercised; this is the delivery layer.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type ChannelPrefs = { in_app: boolean; email: boolean; push: boolean };

const DEFAULT_PREFS: Record<string, ChannelPrefs> = {
  task_reminders: { in_app: true, email: true, push: false },
  appointment_reminders: { in_app: true, email: true, push: false },
  medication_refill_reminders: { in_app: true, email: true, push: false },
  check_in_alerts: { in_app: true, email: false, push: false },
  crisis_mode: { in_app: true, email: true, push: true },
  handoffs: { in_app: true, email: true, push: false },
  new_members: { in_app: true, email: false, push: false },
  general_activity: { in_app: true, email: false, push: false }
};

function categoryFor(notificationType: string, storedCategory: string | null, reminderType: string | null): string {
  if (storedCategory) return storedCategory;
  if (notificationType === "crisis_activated") return "crisis_mode";
  if (notificationType === "escalation") return "task_reminders";
  if (notificationType === "assignment") return "task_reminders";
  if (notificationType === "handoff") return "handoffs";
  if (notificationType === "reminder") {
    switch (reminderType) {
      case "task_due":
        return "task_reminders";
      case "appointment_upcoming":
        return "appointment_reminders";
      case "medication_refill":
        return "medication_refill_reminders";
      default:
        return "general_activity";
    }
  }
  return "general_activity";
}

function channelPrefs(preferences: any, category: string): ChannelPrefs {
  const fallback = DEFAULT_PREFS[category] ?? { in_app: true, email: false, push: false };
  const entry = preferences && typeof preferences === "object" ? preferences[category] : null;
  if (!entry || typeof entry !== "object") return fallback;
  return {
    in_app: typeof entry.in_app === "boolean" ? entry.in_app : fallback.in_app,
    email: typeof entry.email === "boolean" ? entry.email : fallback.email,
    push: typeof entry.push === "boolean" ? entry.push : fallback.push
  };
}

async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Vigil <notifications@vigil.app>";
  if (!apiKey) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text: body })
  });
  return response.ok;
}

async function sendPush(
  supabase: any,
  userId: string,
  title: string,
  body: string
): Promise<boolean> {
  const serverKey = Deno.env.get("FCM_SERVER_KEY");
  if (!serverKey) return false;

  const { data: tokens } = await supabase.from("user_device_tokens").select("id, token").eq("user_id", userId);
  if (!tokens || tokens.length === 0) return false;

  let anySent = false;
  for (const row of tokens) {
    const response = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: { Authorization: `key=${serverKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: row.token, notification: { title, body } })
    });
    if (response.ok) {
      const result = await response.json().catch(() => ({}));
      if (result?.failure > 0 && Array.isArray(result.results)) {
        const err = result.results[0]?.error;
        if (err === "NotRegistered" || err === "InvalidRegistration") {
          // Prune the dead token (service role bypasses the no-DELETE-policy RLS).
          await supabase.from("user_device_tokens").delete().eq("id", row.id);
          continue;
        }
      }
      anySent = true;
    }
  }
  return anySent;
}

Deno.serve(async (request: Request) => {
  const secret = Deno.env.get("DELIVER_SHARED_SECRET");
  if (secret && request.headers.get("x-deliver-secret") !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  // Prefer the new sb_secret_ key (set as the SERVICE_ROLE_KEY function secret) so delivery keeps
  // working after the legacy service_role key is disabled; fall back to the auto-injected legacy key
  // while both still exist.
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase env" }), { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("*")
    .is("delivery_processed_at", null)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let emailed = 0;
  let pushed = 0;

  for (const notification of notifications ?? []) {
    let reminderType: string | null = null;
    if (notification.reminder_id) {
      const { data: reminder } = await supabase
        .from("reminders")
        .select("reminder_type")
        .eq("id", notification.reminder_id)
        .maybeSingle();
      reminderType = reminder?.reminder_type ?? null;
    }

    const category = categoryFor(notification.notification_type, notification.category, reminderType);

    const { data: profile } = await supabase
      .from("users_profiles")
      .select("notification_preferences")
      .eq("id", notification.recipient_id)
      .maybeSingle();
    const prefs = channelPrefs(profile?.notification_preferences, category);

    const patch: Record<string, string> = { delivery_processed_at: new Date().toISOString() };

    if (prefs.email) {
      const { data: userData } = await supabase.auth.admin.getUserById(notification.recipient_id);
      const email = userData?.user?.email;
      if (email) {
        const ok = await sendEmail(email, notification.title, notification.body ?? notification.title);
        if (ok) {
          patch.email_sent_at = new Date().toISOString();
          emailed += 1;
        }
      }
    }

    if (prefs.push) {
      const ok = await sendPush(supabase, notification.recipient_id, notification.title, notification.body ?? "");
      if (ok) {
        patch.push_sent_at = new Date().toISOString();
        pushed += 1;
      }
    }

    await supabase.from("notifications").update(patch).eq("id", notification.id);
  }

  return new Response(JSON.stringify({ processed: notifications?.length ?? 0, emailed, pushed }), {
    headers: { "Content-Type": "application/json" }
  });
});
