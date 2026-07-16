"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import { fetchJson } from "@/lib/query/fetch";
import type { SearchResult } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

type SearchTab = "all" | "timeline" | "task" | "appointment" | "document" | "note";

export function SearchView() {
  return (
    <Suspense fallback={<div className="p-6">Loading search...</div>}>
      <SearchContent />
    </Suspense>
  );
}

function SearchContent() {
  const searchParams = useSearchParams();
  const { activeCircle, circles } = useActiveCircle();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [all, setAll] = useState(searchParams.get("all") === "true");
  const [tab, setTab] = useState<SearchTab>("all");
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
    setAll(searchParams.get("all") === "true");
  }, [searchParams]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timeoutId);
  }, [query]);

  const careCircleId = activeCircle?.careCircle.id ?? null;
  const personId = activeCircle?.person?.id ?? null;
  const searchable = Boolean(careCircleId && personId && debouncedQuery.trim().length >= 2);

  const searchQuery = useQuery({
    queryKey: ["search", careCircleId, personId, all, debouncedQuery.trim()],
    queryFn: () => {
      const params = new URLSearchParams({
        q: debouncedQuery,
        careCircleId: careCircleId ?? "",
        personId: personId ?? "",
        all: String(all)
      });
      return fetchJson<{ results?: SearchResult[] }>(`/api/search?${params.toString()}`);
    },
    enabled: searchable,
    // Keep the previous results on screen while the next keystroke's search runs.
    placeholderData: keepPreviousData
  });

  const results = useMemo(() => (searchable ? searchQuery.data?.results ?? [] : []), [searchable, searchQuery.data]);
  const searching = searchable && searchQuery.isPending;

  const visible = useMemo(() => (tab === "all" ? results : results.filter((result) => result.result_type === tab)), [results, tab]);

  return (
    <div className="mx-auto max-w-[960px] p-6">
      <div className="sticky top-14 z-20 -mx-2 border-b border-neutral-200 bg-neutral-50 px-2 py-3">
        <h1 className="font-display text-xl font-semibold tracking-tight text-neutral-900">Search</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} className="max-w-md" />
          {circles.length > 1 ? (
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
              <input type="checkbox" checked={all} onChange={(event) => setAll(event.target.checked)} />
              Search all care circles
            </label>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["all", "timeline", "task", "appointment", "document", "note"] as SearchTab[]).map((item) => (
            <button key={item} className={`h-8 rounded-full border px-3 text-sm font-medium ${tab === item ? "border-brand-600 bg-brand-50 text-brand-600" : "border-neutral-200 bg-white text-neutral-600"}`} onClick={() => setTab(item)}>
              {labelize(item)}
            </button>
          ))}
        </div>
      </div>
      <section className="mt-5 space-y-3">
        {!searchable ? (
          <Card>
            <p className="font-display text-base tracking-tight text-neutral-600">
              Search across tasks, appointments, documents, notes, and the timeline.
            </p>
          </Card>
        ) : searching ? (
          <SkeletonRows rows={3} />
        ) : visible.length === 0 ? (
          <Card>
            <p className="font-display text-base tracking-tight text-neutral-600">No results found.</p>
          </Card>
        ) : (
          visible.map((result) => (
            <Link key={`${result.result_type}-${result.object_id}`} href={hrefForResult(result)} className="block rounded-xl border border-neutral-200 bg-white p-4 hover:bg-neutral-50">
              <div className="flex items-center gap-2">
                <Badge variant="neutral">{labelize(result.result_type)}</Badge>
                <span className="font-mono text-xs text-neutral-400">{formatDateTime(result.occurred_at)}</span>
              </div>
              <h2 className="mt-2 text-base font-semibold text-neutral-900">{result.title}</h2>
              <p className="mt-1 text-sm text-neutral-600" dangerouslySetInnerHTML={{ __html: renderSnippet(result.snippet) }} />
            </Link>
          ))
        )}
      </section>
    </div>
  );
}

function hrefForResult(result: SearchResult): string {
  if (result.result_type === "timeline") return "/timeline";
  if (result.result_type === "task") return `/tasks?task=${result.object_id}`;
  if (result.result_type === "appointment") return `/calendar?appointment=${result.object_id}`;
  if (result.result_type === "document") return `/documents?document=${result.object_id}`;
  if (result.result_type === "note") return "/notes";
  return "/search";
}

function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// search_phase1 emits @@HL@@..@@/HL@@ sentinels around matches. Escape the
// untrusted snippet text, then convert only our sentinels to <mark> so no
// source-supplied markup can execute (stored-XSS safe).
function renderSnippet(snippet: string): string {
  const escaped = snippet
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return escaped.split("@@HL@@").join("<mark>").split("@@/HL@@").join("</mark>");
}
