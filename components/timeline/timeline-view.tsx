"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/ui/load-error";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import type { HydratedTimelineEvent, MemberSummary } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

type TimelineFilter = "all" | "updates" | "tasks" | "appointments" | "documents" | "notes" | "system";

export function TimelineView() {
  const { activeCircle } = useActiveCircle();
  const [events, setEvents] = useState<HydratedTimelineEvent[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [type, setType] = useState<TimelineFilter>("all");
  const [authorId, setAuthorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (nextOffset = 0, append = false, isCancelled?: () => boolean) => {
    if (!activeCircle?.person) return;
    try {
      setError(null);
      const params = new URLSearchParams({
        careCircleId: activeCircle.careCircle.id,
        personId: activeCircle.person.id,
        type,
        offset: String(nextOffset)
      });
      if (authorId) params.set("authorId", authorId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const [eventResponse, memberResponse] = await Promise.all([
        fetch(`/api/timeline?${params.toString()}`),
        fetch(`/api/memberships?careCircleId=${activeCircle.careCircle.id}`)
      ]);
      if (!eventResponse.ok || !memberResponse.ok) throw new Error("Request failed");
      const eventJson = (await eventResponse.json()) as { events?: HydratedTimelineEvent[]; hasMore?: boolean };
      const memberJson = (await memberResponse.json()) as { members?: MemberSummary[] };
      if (isCancelled?.()) return;
      setEvents((current) => (append ? [...current, ...(eventJson.events ?? [])] : eventJson.events ?? []));
      setHasMore(eventJson.hasMore ?? false);
      setMembers(memberJson.members ?? []);
      setOffset(nextOffset);
    } catch {
      if (isCancelled?.()) return;
      setError("We couldn't load the timeline. Check your connection and try again.");
    }
  };

  useEffect(() => {
    let cancelled = false;
    void load(0, false, () => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCircle?.careCircle.id, activeCircle?.person?.id, authorId, from, to, type]);

  const clearFilters = () => {
    setType("all");
    setAuthorId("");
    setFrom("");
    setTo("");
  };

  return (
    <div className="mx-auto max-w-[1280px] p-6">
      <div className="sticky top-14 z-20 -mx-2 border-b border-neutral-200 bg-neutral-50 px-2 py-3">
        <h1 className="font-display text-xl font-semibold tracking-tight text-neutral-900">Timeline</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(["all", "updates", "tasks", "appointments", "documents", "notes", "system"] as TimelineFilter[]).map((item) => (
            <button
              key={item}
              onClick={() => setType(item)}
              className={cn(
                "h-8 rounded-full border px-3 text-sm font-medium",
                type === item ? "border-brand-600 bg-brand-50 text-brand-600" : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100"
              )}
            >
              {filterLabel(item)}
            </button>
          ))}
          <select
            value={authorId}
            onChange={(event) => setAuthorId(event.target.value)}
            className="h-8 rounded-lg border border-neutral-300 bg-white px-2 text-sm"
          >
            <option value="">All authors</option>
            {members.map((member) => (
              <option key={member.membership.user_id} value={member.membership.user_id}>
                {member.profile?.display_name ?? "Unknown member"}
              </option>
            ))}
          </select>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-8 w-36 text-sm" />
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-8 w-36 text-sm" />
          <button className="text-sm font-medium text-brand-600 hover:underline" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-5">
          <LoadError message={error} onRetry={() => void load(0, false)} />
        </div>
      ) : null}

      <section className="relative mt-5">
        {events.length > 0 ? (
          <div
            className="absolute bottom-6 left-[124px] top-3 hidden w-px bg-neutral-200 md:block"
            aria-hidden="true"
          />
        ) : null}
        {events.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 py-10 text-center">
            <Activity className="h-6 w-6 text-neutral-300" aria-hidden="true" />
            <h2 className="font-display text-md font-semibold tracking-tight text-neutral-700">
              The record begins here.
            </h2>
            <p className="max-w-md text-base text-neutral-500">
              Add a note, complete a task, or record an appointment outcome to build this timeline.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {events.map((event) => (
              <TimelineEntry
                key={event.id}
                event={event}
                currentUserId={activeCircle?.membership.user_id ?? ""}
                onReload={() => load(0, false)}
              />
            ))}
          </div>
        )}
        {hasMore ? (
          <div className="mt-4 md:pl-[140px]">
            <Button variant="secondary" onClick={() => load(offset + 25, true)}>
              Load more
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function TimelineEntry({ event, currentUserId, onReload }: { event: HydratedTimelineEvent; currentUserId: string; onReload: () => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const isSystem = event.event_type === "system" || event.event_type === "member_joined";
  const canEdit = event.is_editable && event.author_id === currentUserId;

  const archive = async () => {
    await fetch("/api/timeline", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: event.id, careCircleId: event.care_circle_id, personId: event.person_id, archive: true })
    });
    await onReload();
  };

  return (
    <article className="relative md:grid md:grid-cols-[112px_minmax(0,1fr)] md:gap-7">
      <span
        className={cn(
          "absolute left-[124px] top-5 hidden h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-neutral-50 md:block",
          isSystem ? "bg-neutral-300" : "bg-brand-600"
        )}
        aria-hidden="true"
      />
      <div className="mb-1 md:mb-0 md:pt-3.5 md:text-right">
        <span className="font-mono text-xs leading-relaxed text-neutral-500">{formatDateTime(event.occurred_at)}</span>
      </div>
      <div className={cn("min-w-0 rounded-xl border border-neutral-200 bg-white p-4", isSystem && "border-neutral-200/70")}>
        <div className="flex flex-wrap items-center gap-2">
          <Avatar name={event.author?.display_name ?? "System"} src={event.author?.avatar_url ?? null} className="h-6 w-6" />
          <span className="text-sm font-semibold text-neutral-900">{event.author?.display_name ?? "System"}</span>
          <Badge variant={event.event_type === "user_entry" ? "primary" : "neutral"}>{eventLabel(event.event_type)}</Badge>
          <div className="flex-1" />
          {canEdit ? (
            <select
              aria-label="Timeline actions"
              className="h-8 w-8 rounded-md border border-neutral-200 bg-white text-neutral-500"
              value=""
              onChange={(selectEvent) => {
                if (selectEvent.target.value === "delete") void archive();
                selectEvent.target.value = "";
              }}
            >
              <option value="">
                ...
              </option>
              <option value="delete">Delete</option>
            </select>
          ) : null}
        </div>
        <h2 className={cn("mt-2 font-semibold text-neutral-900", isSystem ? "text-sm" : "text-base")}>{event.title}</h2>
        {event.body ? (
          <p className={cn("mt-1 whitespace-pre-wrap text-base", isSystem ? "text-neutral-500" : "text-neutral-600", !expanded && "line-clamp-3")}>{event.body}</p>
        ) : null}
        {event.body && event.body.length > 180 ? (
          <button className="mt-1 text-sm font-medium text-brand-600 hover:underline" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}
        {event.linked_object_type && event.linked_object_id ? (
          <Link
            href={hrefForLinkedObject(event.linked_object_type, event.linked_object_id)}
            className="mt-3 inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            {labelize(event.linked_object_type)}: {event.linked_title ?? "View record"}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function filterLabel(value: TimelineFilter): string {
  const labels: Record<TimelineFilter, string> = {
    all: "All",
    updates: "Updates",
    tasks: "Tasks",
    appointments: "Appointments",
    documents: "Documents",
    notes: "Notes",
    system: "System"
  };
  return labels[value];
}

function eventLabel(value: string): string {
  return labelize(value);
}

function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function hrefForLinkedObject(type: string, id: string): string {
  if (type === "task") return `/tasks?task=${id}`;
  if (type === "appointment") return `/calendar?appointment=${id}`;
  if (type === "document") return `/documents?document=${id}`;
  return "/timeline";
}
