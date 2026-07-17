"use client";

import Link from "next/link";
import { HeartPulse, Phone, PenLine } from "lucide-react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadError } from "@/components/ui/load-error";
import { SkeletonRows } from "@/components/ui/skeleton";
import { fetchJson } from "@/lib/query/fetch";
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

  const queryClient = useQueryClient();
  const [packetOpen, setPacketOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);

  const ready = Boolean(careCircleId && personId);

  // These reuse the same cache keys as the regular views, so entering crisis mode
  // renders instantly from anything already loaded — important under stress.
  const medicationsQuery = useQuery({
    queryKey: ["medications", careCircleId, personId],
    queryFn: () => fetchJson<{ medications?: HydratedMedication[] }>(`/api/medications?careCircleId=${careCircleId}&personId=${personId}`),
    enabled: ready
  });
  const contactsQuery = useQuery({
    queryKey: ["contacts", careCircleId, personId],
    queryFn: () => fetchJson<{ contacts?: Contact[] }>(`/api/contacts?careCircleId=${careCircleId}&personId=${personId}`),
    enabled: ready
  });
  const documentsQuery = useQuery({
    queryKey: ["documents", careCircleId, personId, { folderId: null, smartView: "pinned" }],
    queryFn: () =>
      fetchJson<{ documents?: HydratedDocument[] }>(`/api/documents?careCircleId=${careCircleId}&personId=${personId}&smartView=pinned`),
    enabled: ready
  });
  const timelineQuery = useQuery({
    queryKey: ["timeline-recent", careCircleId, personId],
    queryFn: () =>
      fetchJson<{ events?: HydratedTimelineEvent[] }>(`/api/timeline?careCircleId=${careCircleId}&personId=${personId}&type=all&offset=0`),
    enabled: ready
  });

  const medications = (medicationsQuery.data?.medications ?? []).filter((med) => med.status === "active");
  const contacts = (contactsQuery.data?.contacts ?? []).filter(
    (contact) => contact.is_emergency_contact || contact.pinned_in_crisis
  );
  const documents = documentsQuery.data?.documents ?? [];
  const timeline = (timelineQuery.data?.events ?? []).slice(0, 10);
  const error = medicationsQuery.isError || contactsQuery.isError || documentsQuery.isError || timelineQuery.isError;

  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: ["medications", careCircleId, personId] });
    void queryClient.invalidateQueries({ queryKey: ["contacts", careCircleId, personId] });
    void queryClient.invalidateQueries({ queryKey: ["documents", careCircleId, personId] });
    void queryClient.invalidateQueries({ queryKey: ["timeline-recent", careCircleId, personId] });
    void queryClient.invalidateQueries({ queryKey: ["check-ins", careCircleId, personId] });
  };

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

      {error ? (
        <LoadError message="We couldn't load crisis information. Check your connection and try again." onRetry={reload} />
      ) : null}

      {/* Critical info: medications (left) + emergency contacts (right) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Active medications</CardTitle>
          </CardHeader>
          <CardContent>
            {medicationsQuery.isPending ? (
              <SkeletonRows rows={2} className="[&>div]:h-8" />
            ) : medications.length === 0 ? (
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
            {contactsQuery.isPending ? (
              <SkeletonRows rows={2} className="[&>div]:h-8" />
            ) : contacts.length === 0 ? (
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
          {documentsQuery.isPending ? (
            <SkeletonRows rows={2} className="[&>div]:h-6" />
          ) : documents.length === 0 ? (
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
          {timelineQuery.isPending ? (
            <SkeletonRows rows={3} className="[&>div]:h-6" />
          ) : timeline.length === 0 ? (
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
