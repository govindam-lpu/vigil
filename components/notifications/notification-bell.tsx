"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/query/fetch";
import type { Notification } from "@/lib/types";
import { relativeTime } from "@/lib/utils";

type NotificationsResponse = { notifications: Notification[]; unreadCount: number };

// action_url is attacker-influenceable: create_notification is a member-callable RPC, so
// a member could set an off-site or javascript: URL. Only ever navigate to a same-origin
// relative path ("/..." but not "//host").
function isSafeInternalUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//");
}

function dateGroup(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayMs = 86400000;
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / dayMs);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Functional notification center (Phase 4). Polls every 60s; opens a panel grouped
// by date; marks read on click (then navigates the action_url) or all-at-once.
export function NotificationBell({ careCircleId }: { careCircleId: string | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const notificationsKey = ["notifications", careCircleId];
  const notificationsQuery = useQuery({
    queryKey: notificationsKey,
    queryFn: () => fetchJson<NotificationsResponse>(`/api/notifications?careCircleId=${careCircleId}`),
    enabled: Boolean(careCircleId),
    refetchInterval: 60_000,
    staleTime: 30_000
  });
  const notifications = notificationsQuery.data?.notifications ?? [];
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  const markRead = async (notification: Notification) => {
    if (careCircleId && !notification.is_read) {
      queryClient.setQueryData<NotificationsResponse>(notificationsKey, (current) =>
        current
          ? {
              notifications: current.notifications.map((item) =>
                item.id === notification.id ? { ...item, is_read: true } : item
              ),
              unreadCount: Math.max(0, current.unreadCount - 1)
            }
          : current
      );
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ careCircleId, notificationId: notification.id })
      }).catch(() => undefined);
    }
    setOpen(false);
    if (isSafeInternalUrl(notification.action_url)) {
      router.push(notification.action_url);
    }
  };

  const markAllRead = async () => {
    if (!careCircleId) return;
    queryClient.setQueryData<NotificationsResponse>(notificationsKey, (current) =>
      current
        ? { notifications: current.notifications.map((item) => ({ ...item, is_read: true })), unreadCount: 0 }
        : current
    );
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ careCircleId, markAllRead: true })
    }).catch(() => undefined);
  };

  const badge = unreadCount > 9 ? "9+" : String(unreadCount);

  const groups: { label: string; items: Notification[] }[] = [];
  for (const notification of notifications) {
    const label = dateGroup(notification.created_at);
    const existing = groups.find((group) => group.label === label);
    if (existing) {
      existing.items.push(notification);
    } else {
      groups.push({ label, items: [notification] });
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 max-h-[28rem] w-80 overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-pane">
            <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
              <p className="text-sm font-semibold text-neutral-900">Notifications</p>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  Mark all as read
                </button>
              ) : null}
            </div>

            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center font-display text-sm tracking-tight text-neutral-500">You&apos;re all caught up.</p>
            ) : (
              groups.map((group) => (
                <div key={group.label}>
                  <p className="bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-500">{group.label}</p>
                  {group.items.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => void markRead(notification)}
                      className="flex w-full flex-col items-start gap-0.5 border-b border-neutral-100 px-3 py-2 text-left hover:bg-neutral-50"
                    >
                      <div className="flex w-full items-center gap-2">
                        {!notification.is_read ? (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden="true" />
                        ) : (
                          <span className="h-1.5 w-1.5 shrink-0" aria-hidden="true" />
                        )}
                        <span
                          className={
                            notification.is_read
                              ? "flex-1 truncate text-sm text-neutral-600"
                              : "flex-1 truncate text-sm font-semibold text-neutral-900"
                          }
                        >
                          {notification.title}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-neutral-400">
                          {relativeTime(notification.created_at)}
                        </span>
                      </div>
                      {notification.body ? (
                        <span className="line-clamp-2 pl-3.5 text-xs text-neutral-500">{notification.body}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
