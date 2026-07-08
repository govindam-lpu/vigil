import type {
  NotificationCategory,
  NotificationChannelPrefs,
  NotificationPreferences
} from "@/lib/types";

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  task_reminders: { in_app: true, email: true, push: false },
  appointment_reminders: { in_app: true, email: true, push: false },
  medication_refill_reminders: { in_app: true, email: true, push: false },
  check_in_alerts: { in_app: true, email: false, push: false },
  crisis_mode: { in_app: true, email: true, push: true },
  handoffs: { in_app: true, email: true, push: false },
  new_members: { in_app: true, email: false, push: false },
  general_activity: { in_app: true, email: false, push: false }
};

export const NOTIFICATION_CATEGORIES: Array<{ key: NotificationCategory; label: string }> = [
  { key: "task_reminders", label: "Task reminders" },
  { key: "appointment_reminders", label: "Appointment reminders" },
  { key: "medication_refill_reminders", label: "Medication refill reminders" },
  { key: "check_in_alerts", label: "Check-in alerts" },
  { key: "crisis_mode", label: "Crisis mode" },
  { key: "handoffs", label: "Handoffs" },
  { key: "new_members", label: "New members" },
  { key: "general_activity", label: "General activity" }
];

export const NOTIFICATION_CHANNELS: Array<{ key: keyof NotificationChannelPrefs; label: string }> = [
  { key: "in_app", label: "In-app" },
  { key: "email", label: "Email" },
  { key: "push", label: "Push" }
];

// Merge a stored (possibly partial/untyped) preferences blob onto the defaults so the
// UI and any server reads always see a complete, well-typed object.
export function mergeNotificationPreferences(value: unknown): NotificationPreferences {
  const result: NotificationPreferences = {
    task_reminders: { ...DEFAULT_NOTIFICATION_PREFERENCES.task_reminders },
    appointment_reminders: { ...DEFAULT_NOTIFICATION_PREFERENCES.appointment_reminders },
    medication_refill_reminders: { ...DEFAULT_NOTIFICATION_PREFERENCES.medication_refill_reminders },
    check_in_alerts: { ...DEFAULT_NOTIFICATION_PREFERENCES.check_in_alerts },
    crisis_mode: { ...DEFAULT_NOTIFICATION_PREFERENCES.crisis_mode },
    handoffs: { ...DEFAULT_NOTIFICATION_PREFERENCES.handoffs },
    new_members: { ...DEFAULT_NOTIFICATION_PREFERENCES.new_members },
    general_activity: { ...DEFAULT_NOTIFICATION_PREFERENCES.general_activity }
  };

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const { key } of NOTIFICATION_CATEGORIES) {
      const entry = record[key];
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const channels = entry as Record<string, unknown>;
        result[key] = {
          in_app: typeof channels.in_app === "boolean" ? channels.in_app : result[key].in_app,
          email: typeof channels.email === "boolean" ? channels.email : result[key].email,
          push: typeof channels.push === "boolean" ? channels.push : result[key].push
        };
      }
    }
  }

  return result;
}
