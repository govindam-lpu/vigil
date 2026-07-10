"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SettingsNav } from "@/components/settings/settings-nav";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import { formatDateTime } from "@/lib/utils";
import type { MatchedCalendarEvent } from "@/lib/calendar/ics";

export function IntegrationsView() {
  const { activeCircle } = useActiveCircle();
  const [keywords, setKeywords] = useState("");
  const [suggestions, setSuggestions] = useState<MatchedCalendarEvent[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [canImport, setCanImport] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const careCircleId = activeCircle?.careCircle.id ?? null;
  const personId = activeCircle?.person?.id ?? null;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) setStatus("Google Calendar connected. Use Sync to review events.");
    if (params.get("error")) setError("Google Calendar connection didn't complete. Please try again.");
  }, []);

  useEffect(() => {
    if (!careCircleId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/me/capabilities?careCircleId=${careCircleId}`);
        if (!response.ok) return;
        const json = (await response.json()) as { capabilities?: string[] };
        if (!cancelled) setCanImport((json.capabilities ?? []).includes("appointments.write"));
      } catch {
        // non-critical
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [careCircleId]);

  const keywordList = () =>
    keywords
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean);

  const applySuggestions = (next: MatchedCalendarEvent[]) => {
    setSuggestions(next);
    setSelected(new Set(next.map((_, index) => index)));
  };

  const handleIcs = async (file: File) => {
    if (!careCircleId || !personId) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const icsText = await file.text();
      const response = await fetch("/api/integrations/calendar/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ careCircleId, personId, icsText, keywords: keywordList() })
      });
      const json = (await response.json()) as { suggestions?: MatchedCalendarEvent[]; error?: string };
      if (!response.ok) {
        setError(json.error ?? "We couldn't read that calendar file.");
        return;
      }
      applySuggestions(json.suggestions ?? []);
    } catch {
      setError("We couldn't read that calendar file.");
    } finally {
      setBusy(false);
    }
  };

  const syncGoogle = async () => {
    if (!careCircleId || !personId) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/integrations/calendar/google/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ careCircleId, personId, keywords: keywordList() })
      });
      const json = (await response.json()) as { suggestions?: MatchedCalendarEvent[]; error?: string };
      if (!response.ok) {
        setError(json.error ?? "Calendar sync failed.");
        return;
      }
      applySuggestions(json.suggestions ?? []);
    } catch {
      setError("Calendar sync failed.");
    } finally {
      setBusy(false);
    }
  };

  const importSelected = async () => {
    if (!careCircleId || !personId || !suggestions) return;
    const events = suggestions
      .filter((_, index) => selected.has(index))
      .filter((event) => Boolean(event.start))
      .map((event) => ({ summary: event.summary, start: event.start as string, location: event.location }));
    if (events.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/calendar/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ careCircleId, personId, events })
      });
      const json = (await response.json()) as { imported?: number; error?: string };
      if (!response.ok) {
        setError(json.error ?? "Import failed.");
        return;
      }
      setStatus(`Imported ${json.imported ?? 0} appointment${json.imported === 1 ? "" : "s"}.`);
      setSuggestions(null);
      setSelected(new Set());
    } catch {
      setError("Import failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!activeCircle) return null;

  return (
    <div className="mx-auto max-w-[1280px] p-6">
      <SettingsNav />
      <div className="mt-4">
        <h1 className="font-display text-xl font-semibold tracking-tight text-neutral-900">Integrations</h1>
        <p className="text-sm text-neutral-500">Import care appointments from your calendar. Vigil never writes back to it.</p>
      </div>

      {status ? (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{status}</div>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-lg border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      ) : null}

      <Card className="mt-6">
        <h2 className="text-md font-semibold text-neutral-900">Match keywords</h2>
        <p className="text-sm text-neutral-500">
          Comma-separated words that identify care events (e.g. doctor, clinic, therapy). Events also match on your
          contacts&apos; names.
        </p>
        <div className="mt-3 max-w-md">
          <Input value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="doctor, clinic, lab, therapy" />
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-brand-600" aria-hidden="true" />
            <h2 className="text-md font-semibold text-neutral-900">Google Calendar</h2>
          </div>
          <p className="text-sm text-neutral-500">Connect read-only access, then review suggested care appointments.</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/integrations/calendar/google/connect?careCircleId=${careCircleId}`}
              className="inline-flex h-8 items-center rounded-lg border border-brand-600 bg-white px-3 text-sm font-medium text-brand-600 hover:bg-brand-50"
            >
              Connect Google Calendar
            </a>
            <Button size="sm" variant="ghost" onClick={() => void syncGoogle()} disabled={busy}>
              Sync now
            </Button>
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-brand-600" aria-hidden="true" />
            <h2 className="text-md font-semibold text-neutral-900">Apple / .ics file</h2>
          </div>
          <p className="text-sm text-neutral-500">Export a .ics from your calendar app and upload it here — no account needed.</p>
          <label className="inline-flex h-8 w-fit cursor-pointer items-center rounded-lg border border-brand-600 bg-white px-3 text-sm font-medium text-brand-600 hover:bg-brand-50">
            Upload .ics
            <input
              type="file"
              accept=".ics,text/calendar"
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleIcs(file);
                event.target.value = "";
              }}
            />
          </label>
        </Card>
      </div>

      {suggestions ? (
        <Card className="mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-md font-semibold text-neutral-900">
              {suggestions.length} suggested {suggestions.length === 1 ? "appointment" : "appointments"}
            </h2>
            {canImport ? (
              <Button size="sm" onClick={() => void importSelected()} disabled={busy || selected.size === 0}>
                Import selected ({selected.size})
              </Button>
            ) : (
              <Badge variant="neutral">Import needs appointment access</Badge>
            )}
          </div>

          {suggestions.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-600">
              No care-related events found in the next 90 days. Try adding more keywords.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {suggestions.map((event, index) => (
                <label key={`${event.summary}-${index}`} className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-brand-600"
                    checked={selected.has(index)}
                    onChange={(changeEvent) => {
                      const next = new Set(selected);
                      if (changeEvent.target.checked) next.add(index);
                      else next.delete(index);
                      setSelected(next);
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-neutral-900">{event.summary}</p>
                    <p className="text-xs text-neutral-500">
                      <span className="font-mono">{event.start ? formatDateTime(event.start) : "No date"}</span>
                      {event.location ? ` · ${event.location}` : ""}
                    </p>
                    {event.matchReason ? <p className="mt-1 text-xs text-neutral-400">{event.matchReason}</p> : null}
                  </div>
                </label>
              ))}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
