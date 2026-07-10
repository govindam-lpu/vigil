"use client";

import Link from "next/link";
import { HeartPulse, Phone, PenLine } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadError } from "@/components/ui/load-error";
import { EmergencyPacketModal } from "@/components/crisis/emergency-packet-modal";
import { RecordUpdateModal } from "@/components/crisis/record-update-modal";
import { CheckInModal } from "@/components/shared/check-in-modal";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import { useCrisisMode } from "@/components/shell/crisis-mode-provider";
import { roleMeetsMinimum } from "@/lib/permissions/roles";
import type { Contact, HydratedDocument, HydratedMedication, HydratedTimelineEvent } from "@/lib/types";
import { formatDateTime, formatPersonName, relativeTime } from "@/lib/utils";

function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// The restructured crisis dashboard (Phase 4 spec layout): emergency strip, then
// active meds (left) and emergency contacts (right), pinned documents, recent
// timeline, and the two crisis quick actions.
export function CrisisDashboard() {
  const { activeCircle } = useActiveCircle();
  const { session, activatedByName } = useCrisisMode();

  const careCircleId = activeCircle?.careCircle.id ?? null;
  const person = activeCircle?.person ?? null;
  const personId = person?.id ?? null;
  const canGenerate = Boolean(activeCircle && roleMeetsMinimum(activeCircle.membership.role, "coordinator"));

  const [medications, setMedications] = useState<HydratedMedication[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [documents, setDocuments] = useState<HydratedDocument[]>([]);
  const [timeline, setTimeline] = useState<HydratedTimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [packetOpen, setPacketOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);

  const reload = () => setReloadKey((key) => key + 1);

  useEffect(() => {
    if (!careCircleId || !personId) return;
    let cancelled = false;

    const load = async () => {
      try {
        setError(null);
        const [medResponse, contactResponse, documentResponse, timelineResponse] = await Promise.all([
          fetch(`/api/medications?careCircleId=${careCircleId}&personId=${personId}`),
          fetch(`/api/contacts?careCircleId=${careCircleId}&personId=${personId}`),
          fetch(`/api/documents?careCircleId=${careCircleId}&personId=${personId}&smartView=pinned`),
          fetch(`/api/timeline?careCircleId=${careCircleId}&personId=${personId}`)
        ]);
        if (!medResponse.ok || !contactResponse.ok || !documentResponse.ok || !timelineResponse.ok) {
          throw new Error("Request failed");
        }
        const medJson = (await medResponse.json()) as { medications?: HydratedMedication[] };
        const contactJson = (await contactResponse.json()) as { contacts?: Contact[] };
        const documentJson = (await documentResponse.json()) as { documents?: HydratedDocument[] };
        const timelineJson = (await timelineResponse.json()) as { events?: HydratedTimelineEvent[] };

        if (cancelled) return;
        setMedications((medJson.medications ?? []).filter((med) => med.status === "active"));
        setContacts((contactJson.contacts ?? []).filter((contact) => contact.is_emergency_contact || contact.pinned_in_crisis));
        setDocuments(documentJson.documents ?? []);
        setTimeline((timelineJson.events ?? []).slice(0, 10));
      } catch {
        if (!cancelled) {
          setError("We couldn't load crisis information. Check your connection and try again.");
        }
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

  if (!person || !careCircleId || !personId) {
    return null;
  }

  const personName = formatPersonName(person.first_name, person.last_name, person.preferred_name);

  return (
    <div className="mx-auto max-w-[1280px] space-y-5 p-6">
      {/* Emergency strip */}
      <div className="rounded-lg border border-red-400 bg-red-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-neutral-900">{personName}</h1>
              <Badge variant="red">Crisis Mode</Badge>
            </div>
            <p className="mt-1 text-sm text-neutral-700">
              {activatedByName ? `Activated by ${activatedByName}` : "Crisis mode active"}
              {session ? (
                <>
                  {" at "}
                  <span className="font-mono">{formatDateTime(session.activated_at)}</span>
                </>
              ) : (
                ""
              )}
              {session?.reason ? ` · ${session.reason}` : ""}
            </p>
          </div>
          {canGenerate ? (
            <Button onClick={() => setPacketOpen(true)}>Share Emergency Packet</Button>
          ) : null}
        </div>
      </div>

      {error ? <LoadError message={error} onRetry={reload} /> : null}

      {/* Critical info: medications (left) + emergency contacts (right) */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Active medications</CardTitle>
          </CardHeader>
          <CardContent>
            {medications.length === 0 ? (
              <p className="text-sm text-neutral-500">No active medications.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium text-neutral-500">
                      <th className="pb-2 pr-3">Name</th>
                      <th className="pb-2 pr-3">Dose</th>
                      <th className="pb-2">Frequency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medications.map((med) => (
                      <tr key={med.id} className="border-t border-neutral-100">
                        <td className="py-1.5 pr-3 font-medium text-neutral-900">{med.name}</td>
                        <td className="py-1.5 pr-3 font-mono text-neutral-700">
                          {[med.dosage, med.unit].filter(Boolean).join(" ") || "—"}
                        </td>
                        <td className="py-1.5 font-mono text-neutral-700">{med.frequency || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Emergency contacts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {contacts.length === 0 ? (
              <p className="text-sm text-neutral-500">No emergency contacts pinned.</p>
            ) : (
              contacts.map((contact) => (
                <div key={contact.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">{contact.name}</p>
                    <p className="text-xs text-neutral-500">
                      {[contact.role ? labelize(contact.role) : null, contact.organization].filter(Boolean).join(" · ") ||
                        "Contact"}
                    </p>
                    {contact.phone ? <p className="font-mono text-sm text-neutral-700">{contact.phone}</p> : null}
                  </div>
                  {contact.phone ? (
                    <a
                      href={`tel:${contact.phone}`}
                      className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
                    >
                      <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                      Call
                    </a>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pinned documents */}
      <Card>
        <CardHeader>
          <CardTitle>Pinned documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {documents.length === 0 ? (
            <p className="text-sm text-neutral-500">No documents pinned for crisis.</p>
          ) : (
            documents.map((document) => (
              <div key={document.id} className="flex items-center justify-between gap-3">
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

      {/* Recent timeline (last 10) */}
      <Card>
        <CardHeader>
          <CardTitle>Recent timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="text-sm text-neutral-500">No recent activity.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {timeline.map((event) => (
                <li key={event.id} className="flex items-baseline gap-3 py-2">
                  <span className="w-28 shrink-0 font-mono text-xs text-neutral-400">{relativeTime(event.occurred_at)}</span>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-neutral-900">{event.title}</span>
                    <span className="ml-2 text-xs text-neutral-500">{event.author?.display_name ?? "System"}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link href="/timeline" className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline">
            View full timeline →
          </Link>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setCheckInOpen(true)}>
          <HeartPulse className="h-4 w-4" aria-hidden="true" />
          Add check-in
        </Button>
        <Button variant="secondary" onClick={() => setUpdateOpen(true)}>
          <PenLine className="h-4 w-4" aria-hidden="true" />
          Record update
        </Button>
      </div>

      {packetOpen ? (
        <EmergencyPacketModal careCircleId={careCircleId} personId={personId} onClose={() => setPacketOpen(false)} />
      ) : null}

      {checkInOpen ? (
        <CheckInModal
          careCircleId={careCircleId}
          personId={personId}
          onClose={() => setCheckInOpen(false)}
          onSaved={() => {
            setCheckInOpen(false);
            reload();
          }}
        />
      ) : null}

      {updateOpen ? (
        <RecordUpdateModal
          careCircleId={careCircleId}
          personId={personId}
          onClose={() => setUpdateOpen(false)}
          onSaved={() => {
            setUpdateOpen(false);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}
