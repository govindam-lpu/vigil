"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LoadError } from "@/components/ui/load-error";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
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

  const [documents, setDocuments] = useState<HydratedDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!careCircleId || !personId) return;
    let cancelled = false;

    const load = async () => {
      try {
        setError(null);
        const response = await fetch(
          `/api/documents?careCircleId=${careCircleId}&personId=${personId}&smartView=pinned`
        );
        if (!response.ok) throw new Error("Request failed");
        const json = (await response.json()) as { documents?: HydratedDocument[] };
        if (!cancelled) setDocuments(json.documents ?? []);
      } catch {
        if (!cancelled) setError("We couldn't load documents. Check your connection and try again.");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [careCircleId, personId, reloadKey]);

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
    <div className="mx-auto max-w-[1280px] space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Emergency Packet documents</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Showing documents pinned for crisis. Use &ldquo;All sections&rdquo; in the sidebar to browse the full library.
        </p>
      </div>

      {error ? <LoadError message={error} onRetry={() => setReloadKey((key) => key + 1)} /> : null}

      <Card>
        <CardContent className="space-y-2 py-4">
          {documents.length === 0 ? (
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
                  className="shrink-0 text-sm font-medium text-blue-600 hover:underline"
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
