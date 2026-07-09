"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { LoadError } from "@/components/ui/load-error";
import { SettingsNav } from "@/components/settings/settings-nav";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS
} from "@/lib/notifications/preferences";
import type { NotificationCategory, NotificationChannelPrefs, NotificationPreferences } from "@/lib/types";

export function NotificationsView() {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/notifications/preferences");
        if (!response.ok) throw new Error("Request failed");
        const json = (await response.json()) as { preferences?: NotificationPreferences };
        if (cancelled) return;
        setPreferences(json.preferences ?? DEFAULT_NOTIFICATION_PREFERENCES);
      } catch {
        if (cancelled) return;
        setError("We couldn't load your notification preferences.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (category: NotificationCategory, channel: keyof NotificationChannelPrefs) => {
    if (!preferences) return;
    const next: NotificationPreferences = {
      ...preferences,
      [category]: { ...preferences[category], [channel]: !preferences[category][channel] }
    };
    setPreferences(next);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next)
      });
      if (!response.ok) throw new Error("Request failed");
    } catch {
      setError("We couldn't save that change. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1280px] p-6">
      <SettingsNav />
      <div className="mt-4">
        <h1 className="font-display text-xl font-semibold tracking-tight text-neutral-900">Notifications</h1>
        <p className="text-sm text-neutral-500">Choose how you&apos;re notified for each type of update.</p>
      </div>

      {error ? (
        <div className="mt-4">
          <LoadError message={error} onRetry={() => window.location.reload()} />
        </div>
      ) : null}

      {preferences ? (
        <Card className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs font-semibold text-neutral-500">
                <th className="py-2 pr-4">Category</th>
                {NOTIFICATION_CHANNELS.map((channel) => (
                  <th key={channel.key} className="px-4 py-2 text-center">
                    {channel.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_CATEGORIES.map((category) => (
                <tr key={category.key} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 font-medium text-neutral-900">{category.label}</td>
                  {NOTIFICATION_CHANNELS.map((channel) => (
                    <td key={channel.key} className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${category.label} — ${channel.label}`}
                        className="h-4 w-4 accent-brand-600"
                        checked={preferences[category.key][channel.key]}
                        disabled={saving}
                        onChange={() => void toggle(category.key, channel.key)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      <p className="mt-3 text-xs text-neutral-400">
        In-app notifications appear in the bell menu. Email and push require the delivery service to be configured.
      </p>
    </div>
  );
}
