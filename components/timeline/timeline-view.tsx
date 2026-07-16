"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/ui/load-error";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import { fetchJson } from "@/lib/query/fetch";
import type { HydratedTimelineEvent, MemberSummary } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

type TimelineFilter = "all" | "updates" | "tasks" | "appointments" | "documents" | "notes" | "system";

const PAGE_SIZE = 25;

type TimelinePage = { events?: HydratedTimelineEvent[]; hasMore?: boolean };

export function TimelineView() {
  const { activeCircle } = useActiveCircle();
  const queryClient = useQueryClient();
  const [type, setType] = useState<TimelineFilter>("all");
  const [authorId, setAuthorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const careCircleId = activeCircle?.careCircle.id ?? null;
  const personId = activeCircle?.person?.id ?? null;
  const timelineKey = useMemo(
    () => ["timeline", careCircleId, personId, type, authorId, from, to] as const,
    [careCircleId, personId, type, authorId, from, to]
  );

  const timelineQuery = useInfiniteQuery({
    queryKey: timelineKey,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        careCircleId: careCircleId ?? "",
        personId: personId ?? "",
        type,
        offset: String(pageParam)
      });
      if (authorId) params.set("authorId", authorId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return fetchJson<TimelinePage>(`/api/timeline?${params.toString()}`);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length * PAGE_SIZE : undefined),
    enabled: Boolean(careCircleId && personId)
  });
  const membersQuery = useQuery({
    queryKey: ["members", careCircleId],
    queryFn: () => fetchJson<{ members?: MemberSummary[] }>(`/api/memberships?careCircleId=${careCircleId}`),
    enabled: Boolean(careCircleId),
    staleTime: 5 * 60_000
  });

  const events = useMemo(
    () => timelineQuery.data?.pages.flatMap((page) => page.events ?? []) ?? [],
    [timelineQuery.data]
  );
  const members = membersQuery.data?.members ?? [];
  const loading = timelineQuery.isPending;

  const reload = async () => {
    await queryClient.invalidateQueries({ queryKey: ["timeline", careCircleId, personId] });
  };

  const clearFilters = () => {
    setType("all");
    setAuthorId("");
    setFrom("");
    setTo("");
  };

  return (
    <div className="mx-auto max-w-[1280px] p-4 sm:p-6">
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

      {timelineQuery.isError ? (
        <div className="mt-5">
          <LoadError
            message="We couldn't load the timeline. Check your connection and try again."
            onRetry={() => void timelineQuery.refetch()}
          />
        </div>
      ) : null}

      <section className="relative mt-5">
        {loading ? (
          <SkeletonRows rows={5} />
        ) : events.length === 0 ? (
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
          <>
            <div
              className="absolute bottom-6 left-[124px] top-3 hidden w-px bg-neutral-200 md:block"
              aria-hidden="true"
            />
            <div className="space-y-4">
              {events.map((event) => (
                <TimelineEntry
                  key={event.id}
                  event={event}
                  currentUserId={activeCircle?.membership.user_id ?? ""}
                  onReload={reload}
                />
              ))}
            </div>
          </>
        )}
        {timelineQuery.hasNextPage ? (
          <div className="mt-4 md:pl-[140px]">
            <Button
              variant="secondary"
              disabled={timelineQuery.isFetchingNextPage}
              onClick={() => void timelineQuery.fetchNextPage()}
            >
              {timelineQuery.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function TimelineEntry({ event, currentUserId, onReload }: { event: HydratedTimelineEvent; currentUserId: string; onReload: () => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  // Only `user_entry` is manually authored (POST /api/timeline hardcodes it); every other
  // type is generated by the system and is de-emphasized per DESIGN (lighter node, smaller type).
  const isSystem = event.event_type !== "user_entry";
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
        <h2 className={cn("mt-2 break-words font-semibold text-neutral-900", isSystem ? "text-sm" : "text-base")}>{event.title}</h2>
        {event.body ? (
          <p className={cn("mt-1 whitespace-pre-wrap break-words text-base", isSystem ? "text-neutral-500" : "text-neutral-600", !expanded && "line-clamp-3")}>{event.body}</p>
        ) : null}
        {event.body && event.body.length > 180 ? (
          <button className="mt-1 text-sm font-medium text-brand-600 hover:underline" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}
        {event.linked_object_type && event.linked_object_id ? (
          <Link
            href={hrefForLinkedObject(event.linked_object_type, event.linked_object_id)}
            className="mt-3 inline-flex max-w-full rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            <span className="truncate">{labelize(event.linked_object_type)}: {event.linked_title ?? "View record"}</span>
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
