"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
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
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
    setAll(searchParams.get("all") === "true");
  }, [searchParams]);

  useEffect(() => {
    if (!activeCircle?.person || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timeoutId = window.setTimeout(async () => {
      const params = new URLSearchParams({
        q: query,
        careCircleId: activeCircle.careCircle.id,
        personId: activeCircle.person?.id ?? "",
        all: String(all)
      });
      const response = await fetch(`/api/search?${params.toString()}`);
      const json = (await response.json()) as { results?: SearchResult[] };
      setResults(json.results ?? []);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [activeCircle?.careCircle.id, activeCircle?.person, activeCircle?.person?.id, all, query]);

  const visible = useMemo(() => (tab === "all" ? results : results.filter((result) => result.result_type === tab)), [results, tab]);

  return (
    <div className="mx-auto max-w-[960px] p-6">
      <div className="sticky top-14 z-20 -mx-2 border-b border-neutral-200 bg-neutral-50 px-2 py-3">
        <h1 className="text-lg font-semibold text-neutral-900">Search</h1>
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
            <button key={item} className={`h-8 rounded-full border px-3 text-sm font-medium ${tab === item ? "border-blue-600 bg-blue-50 text-blue-600" : "border-neutral-200 bg-white text-neutral-600"}`} onClick={() => setTab(item)}>
              {labelize(item)}
            </button>
          ))}
        </div>
      </div>
      <section className="mt-5 space-y-3">
        {visible.length === 0 ? (
          <Card>
            <p className="text-base text-neutral-600">No results found.</p>
          </Card>
        ) : (
          visible.map((result) => (
            <Link key={`${result.result_type}-${result.object_id}`} href={hrefForResult(result)} className="block rounded-lg border border-neutral-200 bg-white p-4 hover:bg-neutral-50">
              <div className="flex items-center gap-2">
                <Badge variant="neutral">{labelize(result.result_type)}</Badge>
                <span className="text-xs text-neutral-400">{formatDateTime(result.occurred_at)}</span>
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
