"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LoadError } from "@/components/ui/load-error";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import { fetchJson } from "@/lib/query/fetch";
import type { HydratedDocument } from "@/lib/types";

function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Crisis-mode Documents (DESIGN: "Documents (Emergency Packet only)"). Shows only
// crisis-pinned documents; the full library remains reachable via "All sections".
export function CrisisDocumentsView() {
  const { activeCircle } = useActiveCircle();
  const careCircleId = activeCircle?.careCircle.id ?? null;
  const personId = activeCircle?.person?.id ?? null;

  const documentsQuery = useQuery({
    queryKey: ["documents", careCircleId, personId, { folderId: null, smartView: "pinned" }],
    queryFn: () =>
      fetchJson<{ documents?: HydratedDocument[] }>(
        `/api/documents?careCircleId=${careCircleId}&personId=${personId}&smartView=pinned`
      ),
    enabled: Boolean(careCircleId && personId)
  });
  const documents = documentsQuery.data?.documents ?? [];

  const openDocument = async (documentId: string) => {
    if (!careCircleId || !personId) return;
    const response = await fetch(
      `/api/documents/signed-url?careCircleId=${careCircleId}&personId=${personId}&id=${documentId}`
    );
    if (!response.ok) return;
    const data = (await response.json()) as { url?: string };
    if (data.url) {
      window.open(data.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="mx-auto max-w-[1280px] space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight text-neutral-900">Emergency Packet documents</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Showing documents pinned for crisis. Use &ldquo;All sections&rdquo; in the sidebar to browse the full library.
        </p>
      </div>

      {documentsQuery.isError ? (
        <LoadError
          message="We couldn't load documents. Check your connection and try again."
          onRetry={() => void documentsQuery.refetch()}
        />
      ) : null}

      <Card>
        <CardContent className="space-y-2 py-4">
          {documentsQuery.isPending ? (
            <SkeletonRows rows={3} className="[&>div]:h-8" />
          ) : documents.length === 0 ? (
            <p className="text-sm text-neutral-500">No documents are pinned for crisis yet.</p>
          ) : (
            documents.map((document) => (
              <div
                key={document.id}
                className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-2 last:border-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium text-neutral-900">{document.title}</span>
                  {document.document_type ? <Badge variant="neutral">{labelize(document.document_type)}</Badge> : null}
                </div>
                <button
                  type="button"
                  onClick={() => void openDocument(document.id)}
                  className="shrink-0 text-sm font-medium text-brand-600 hover:underline"
                >
                  View
                </button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
