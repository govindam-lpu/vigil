"use client";

import { useEffect, useState } from "react";
import { Download, FileJson, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SettingsNav } from "@/components/settings/settings-nav";
import { useActiveCircle } from "@/components/shell/active-circle-provider";

type ExportFormat = "json" | "pdf";

export function ExportView() {
  const { activeCircle } = useActiveCircle();
  const [canExport, setCanExport] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const careCircleId = activeCircle?.careCircle.id ?? null;

  useEffect(() => {
    if (!careCircleId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/me/capabilities?careCircleId=${careCircleId}`);
        if (!response.ok) throw new Error("Request failed");
        const json = (await response.json()) as { capabilities?: string[] };
        if (cancelled) return;
        setCanExport((json.capabilities ?? []).includes("export.all"));
      } catch {
        if (cancelled) return;
        setCanExport(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [careCircleId]);

  const runExport = async (format: ExportFormat) => {
    if (!careCircleId) return;
    setBusy(format);
    setError(null);
    try {
      const response = await fetch(`/api/export/${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ careCircleId })
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? "Export failed. Please try again.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = format === "json" ? "vigil-export.zip" : "vigil-care-summary.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Export failed. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  if (!activeCircle) return null;

  return (
    <div className="mx-auto max-w-[1280px] p-6">
      <SettingsNav />
      <div className="mt-4">
        <h1 className="font-display text-xl font-semibold tracking-tight text-neutral-900">Export</h1>
        <p className="text-sm text-neutral-500">Download this care circle&apos;s full record.</p>
      </div>

      {canExport === false ? (
        <Card className="mt-6">
          <p className="text-sm text-neutral-600">
            Exports are available to owners and members granted the &ldquo;Export all data&rdquo; permission.
          </p>
        </Card>
      ) : null}

      {canExport ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-brand-600" aria-hidden="true" />
              <h2 className="text-md font-semibold text-neutral-900">Full data export (JSON)</h2>
            </div>
            <p className="text-sm text-neutral-500">
              A zip with all structured records and a list of time-limited document download links.
            </p>
            <div>
              <Button size="sm" onClick={() => void runExport("json")} disabled={busy !== null}>
                <Download className="h-4 w-4" aria-hidden="true" />
                {busy === "json" ? "Preparing…" : "Download JSON"}
              </Button>
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-brand-600" aria-hidden="true" />
              <h2 className="text-md font-semibold text-neutral-900">Care summary (PDF)</h2>
            </div>
            <p className="text-sm text-neutral-500">
              A human-readable summary: profile, active medications, upcoming appointments, open tasks,
              recent activity, and contacts.
            </p>
            <div>
              <Button size="sm" onClick={() => void runExport("pdf")} disabled={busy !== null}>
                <Download className="h-4 w-4" aria-hidden="true" />
                {busy === "pdf" ? "Preparing…" : "Download PDF"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-lg border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      ) : null}
    </div>
  );
}
