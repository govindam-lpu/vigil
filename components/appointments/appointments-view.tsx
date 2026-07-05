"use client";

import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadError } from "@/components/ui/load-error";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import { createClient } from "@/lib/supabase/client";
import type { AppointmentStatus, AppointmentType, Contact, Folder, HydratedAppointment, HydratedDocument, MemberSummary } from "@/lib/types";
import { cn, formatMonth, toDateTimeLocalValue } from "@/lib/utils";

type ViewMode = "list" | "calendar";

const statusVariant: Record<AppointmentStatus, "neutral" | "green" | "red"> = {
  scheduled: "neutral",
  completed: "green",
  cancelled: "neutral",
  missed: "red"
};

export function AppointmentsView() {
  return (
    <Suspense fallback={<div className="p-6">Loading calendar…</div>}>
      <AppointmentsContent />
    </Suspense>
  );
}

function AppointmentsContent() {
  const { activeCircle } = useActiveCircle();
  const searchParams = useSearchParams();
  const appointmentParam = searchParams.get("appointment");
  const [appointments, setAppointments] = useState<HydratedAppointment[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [mode, setMode] = useState<ViewMode>("list");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(appointmentParam);
  const [error, setError] = useState<string | null>(null);

  const selected = appointments.find((appointment) => appointment.id === selectedId) ?? appointments[0] ?? null;

  const load = async (isCancelled?: () => boolean) => {
    if (!activeCircle?.person) return;
    try {
      setError(null);
      const [appointmentResponse, memberResponse, folderResponse, contactResponse] = await Promise.all([
        fetch(`/api/appointments?careCircleId=${activeCircle.careCircle.id}&personId=${activeCircle.person.id}`),
        fetch(`/api/memberships?careCircleId=${activeCircle.careCircle.id}`),
        fetch(`/api/folders?careCircleId=${activeCircle.careCircle.id}&personId=${activeCircle.person.id}`),
        fetch(`/api/contacts?careCircleId=${activeCircle.careCircle.id}&personId=${activeCircle.person.id}`)
      ]);
      if (!appointmentResponse.ok || !memberResponse.ok || !folderResponse.ok || !contactResponse.ok) throw new Error("Request failed");
      const appointmentJson = (await appointmentResponse.json()) as { appointments?: HydratedAppointment[] };
      const memberJson = (await memberResponse.json()) as { members?: MemberSummary[] };
      const folderJson = (await folderResponse.json()) as { folders?: Folder[] };
      const contactJson = (await contactResponse.json()) as { contacts?: Contact[] };
      if (isCancelled?.()) return;
      setAppointments(appointmentJson.appointments ?? []);
      setMembers(memberJson.members ?? []);
      setFolders(folderJson.folders ?? []);
      setContacts(contactJson.contacts ?? []);
    } catch {
      if (isCancelled?.()) return;
      setError("We couldn't load appointments. Check your connection and try again.");
    }
  };

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCircle?.careCircle.id, activeCircle?.person?.id]);

  useEffect(() => {
    if (appointmentParam) setSelectedId(appointmentParam);
  }, [appointmentParam]);

  const grouped = useMemo(() => {
    const groups = new Map<string, HydratedAppointment[]>();
    for (const appointment of appointments) {
      const key = formatMonth(appointment.scheduled_at);
      groups.set(key, [...(groups.get(key) ?? []), appointment]);
    }
    return Array.from(groups.entries());
  }, [appointments]);

  if (!activeCircle?.person) return null;

  return (
    <div className="mx-auto max-w-[1280px] p-6">
      <div className="sticky top-14 z-20 -mx-2 flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-2 py-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Calendar</h1>
          <p className="text-sm text-neutral-500">Track appointments, outcomes, and reminders.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-neutral-200 bg-white p-1">
            <button className={cn("h-8 rounded-md px-3 text-sm font-medium", mode === "list" && "bg-blue-50 text-blue-600")} onClick={() => setMode("list")}>
              List
            </button>
            <button className={cn("h-8 rounded-md px-3 text-sm font-medium", mode === "calendar" && "bg-blue-50 text-blue-600")} onClick={() => setMode("calendar")}>
              Calendar
            </button>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Appointment
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-5">
          <LoadError message={error} onRetry={() => void load()} />
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {mode === "list" ? (
          <section className="space-y-5">
            {appointments.length === 0 ? (
              <Card className="flex items-start gap-3">
                <CalendarDays className="mt-1 h-5 w-5 text-neutral-400" aria-hidden="true" />
                <p className="text-base text-neutral-600">No appointments scheduled. Add appointments to track upcoming visits.</p>
              </Card>
            ) : (
              grouped.map(([month, items]) => (
                <div key={month} className="rounded-lg border border-neutral-200 bg-white">
                  <h2 className="border-b border-neutral-200 px-4 py-3 text-md font-semibold text-neutral-900">{month}</h2>
                  {items.map((appointment) => (
                    <button
                      key={appointment.id}
                      className={cn("grid w-full grid-cols-[64px_1fr_110px_90px_120px] items-center gap-3 border-b border-neutral-100 px-4 py-3 text-left hover:bg-neutral-50", selected?.id === appointment.id && "bg-blue-50")}
                      onClick={() => setSelectedId(appointment.id)}
                    >
                      <DateBadge value={appointment.scheduled_at} />
                      <div>
                        <p className="font-semibold text-neutral-900">{appointment.title}</p>
                        <p className="text-sm text-neutral-500">{appointment.provider_name || "No provider listed"}</p>
                      </div>
                      <Badge variant="neutral">{labelize(appointment.appointment_type ?? "other")}</Badge>
                      <Badge variant={statusVariant[appointment.status]}>{labelize(appointment.status)}</Badge>
                      <div className="flex items-center -space-x-2">
                        {appointment.attendees.slice(0, 4).map((attendee) => (
                          <Avatar key={attendee.id} name={attendee.display_name} src={attendee.avatar_url} className="h-7 w-7 border-white" />
                        ))}
                        <span className="pl-3 text-sm text-neutral-500">{appointment.duration_minutes ? `${appointment.duration_minutes} min` : ""}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </section>
        ) : (
          <CalendarGrid appointments={appointments} onSelect={(id) => setSelectedId(id)} />
        )}

        <AppointmentDetail key={selected?.id ?? "none"} appointment={selected} members={members} folders={folders} onReload={load} />
      </div>

      {modalOpen ? (
        <AppointmentModal
          careCircleId={activeCircle.careCircle.id}
          personId={activeCircle.person.id}
          members={members}
          contacts={contacts}
          onClose={() => setModalOpen(false)}
          onSaved={async () => {
            setModalOpen(false);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function AppointmentDetail({ appointment, members, folders, onReload }: { appointment: HydratedAppointment | null; members: MemberSummary[]; folders: Folder[]; onReload: () => Promise<void> }) {
  const [outcome, setOutcome] = useState("");
  const [followUps, setFollowUps] = useState("");

  useEffect(() => {
    setOutcome(appointment?.outcome ?? "");
    setFollowUps("");
  }, [appointment?.id, appointment?.outcome]);

  if (!appointment) return <Card className="hidden h-fit lg:block">Select an appointment to view details.</Card>;

  const update = async (payload: Partial<HydratedAppointment>) => {
    await fetch("/api/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: appointment.id,
        careCircleId: appointment.care_circle_id,
        personId: appointment.person_id,
        title: payload.title,
        providerName: payload.provider_name,
        scheduledAt: payload.scheduled_at,
        durationMinutes: payload.duration_minutes,
        appointmentType: payload.appointment_type,
        location: payload.location,
        address: payload.address,
        prepNotes: payload.prep_notes,
        attendeeIds: payload.attendee_ids,
        status: payload.status,
        outcome: payload.outcome,
        archive: payload.deleted_at !== undefined
      })
    });
    await onReload();
  };

  const submitFollowUps = async () => {
    const lines = followUps
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    await fetch("/api/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: appointment.id,
        careCircleId: appointment.care_circle_id,
        personId: appointment.person_id,
        outcome,
        followUpTasks: lines
      })
    });
    setFollowUps("");
    await onReload();
  };

  return (
    <aside className="h-fit rounded-lg border border-neutral-200 bg-white p-4">
      <EditableInput label="Title" value={appointment.title} onSave={(value) => update({ title: value })} />
      <EditableInput label="Provider" value={appointment.provider_name ?? ""} onSave={(value) => update({ provider_name: value || null })} />
      <EditableInput label="Location" value={appointment.location ?? ""} onSave={(value) => update({ location: value || null })} />
      <EditableInput label="Address" value={appointment.address ?? ""} onSave={(value) => update({ address: value || null })} />
      <EditableInput label="Date and time" type="datetime-local" value={toDateTimeLocalValue(appointment.scheduled_at)} onSave={(value) => update({ scheduled_at: new Date(value).toISOString() })} />
      <EditableInput label="Duration minutes" type="number" value={appointment.duration_minutes ? String(appointment.duration_minutes) : ""} onSave={(value) => update({ duration_minutes: value ? Number(value) : null })} />
      <Field label="Status">
        <select className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-2" value={appointment.status} onChange={(event) => update({ status: event.target.value as AppointmentStatus, outcome })}>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="missed">Missed</option>
        </select>
      </Field>
      <Field label="Appointment type">
        <select className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-2" value={appointment.appointment_type ?? "other"} onChange={(event) => update({ appointment_type: event.target.value as AppointmentType })}>
          <option value="medical">Medical</option>
          <option value="legal">Legal</option>
          <option value="financial">Financial</option>
          <option value="home_service">Home service</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="Attendees">
        <select
          multiple
          className="min-h-24 w-full rounded-lg border border-neutral-300 bg-white p-2"
          value={appointment.attendee_ids ?? []}
          onChange={(event) => update({ attendee_ids: Array.from(event.currentTarget.selectedOptions).map((option) => option.value) })}
        >
          {members.map((member) => (
            <option key={member.membership.user_id} value={member.membership.user_id}>
              {member.profile?.display_name ?? "Unknown member"}
            </option>
          ))}
        </select>
      </Field>
      {appointment.status === "completed" ? (
        <>
          <Field label="Visit summary / outcome">
            <textarea className="min-h-32 w-full rounded border border-neutral-300 p-3 text-base" value={outcome} onChange={(event) => setOutcome(event.target.value)} onBlur={() => update({ outcome })} />
            <Button className="mt-2" size="sm" variant="secondary" onClick={() => update({ outcome, status: "completed" })}>
              Save completion
            </Button>
          </Field>
          <Field label="Add follow-up tasks from this visit? (one per line)">
            <textarea
              className="min-h-20 w-full rounded border border-neutral-300 p-3 text-base"
              placeholder={"Schedule 6-month follow-up\nSubmit referral for PT"}
              value={followUps}
              onChange={(event) => setFollowUps(event.target.value)}
            />
            <Button className="mt-2" size="sm" onClick={submitFollowUps} disabled={!followUps.trim()}>
              Create follow-up tasks
            </Button>
          </Field>
        </>
      ) : null}
      <AppointmentAttachments appointment={appointment} folders={folders} />
      <Button className="mt-4" size="sm" variant="secondary" onClick={() => update({ deleted_at: new Date().toISOString() })}>
        Archive
      </Button>
    </aside>
  );
}

function AppointmentAttachments({ appointment, folders }: { appointment: HydratedAppointment; folders: Folder[] }) {
  const [documents, setDocuments] = useState<HydratedDocument[]>([]);

  const load = async () => {
    const params = new URLSearchParams({ careCircleId: appointment.care_circle_id, personId: appointment.person_id, appointmentId: appointment.id });
    const response = await fetch(`/api/documents?${params.toString()}`);
    const json = (await response.json()) as { documents?: HydratedDocument[] };
    setDocuments(json.documents ?? []);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment.id]);

  const upload = async (file: File) => {
    const supabase = createClient();
    const path = `${appointment.care_circle_id}/${appointment.id}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("documents").upload(path, file);
    if (error) return;
    const folder = folders.find((item) => item.name === "Medical Records") ?? folders[0];
    await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        careCircleId: appointment.care_circle_id,
        personId: appointment.person_id,
        folderId: folder?.id ?? null,
        appointmentId: appointment.id,
        title: file.name,
        documentType: "medical_record",
        storagePath: path,
        fileType: file.type,
        fileSizeBytes: file.size,
        description: `Attachment for ${appointment.title}`
      })
    });
    await load();
  };

  const openDocument = async (documentId: string) => {
    const params = new URLSearchParams({ careCircleId: appointment.care_circle_id, personId: appointment.person_id, id: documentId });
    const response = await fetch(`/api/documents/signed-url?${params.toString()}`);
    const json = (await response.json()) as { url?: string };
    if (json.url) window.open(json.url, "_blank", "noopener,noreferrer");
  };

  return (
    <Field label="Attachments">
      {documents.length > 0 ? (
        <ul className="mb-2 space-y-1">
          {documents.map((document) => (
            <li key={document.id}>
              <button type="button" className="text-left text-sm font-medium text-blue-600 hover:underline" onClick={() => void openDocument(document.id)}>
                {document.title}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input type="file" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void upload(file);
      }} />
    </Field>
  );
}

function AppointmentModal({ careCircleId, personId, members, contacts, onClose, onSaved }: { careCircleId: string; personId: string; members: MemberSummary[]; contacts: Contact[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [providerName, setProviderName] = useState("");
  const [providerContactId, setProviderContactId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [appointmentType, setAppointmentType] = useState<AppointmentType>("medical");
  const [location, setLocation] = useState("");
  const [address, setAddress] = useState("");
  const [prepNotes, setPrepNotes] = useState("");
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [createReminder, setCreateReminder] = useState(true);

  const save = async () => {
    const response = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        careCircleId,
        personId,
        title,
        providerName,
        providerContactId: providerContactId || null,
        scheduledAt: new Date(scheduledAt).toISOString(),
        durationMinutes: durationMinutes ? Number(durationMinutes) : null,
        appointmentType,
        location,
        address,
        prepNotes,
        attendeeIds,
        createReminder
      })
    });
    if (response.ok) await onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5">
        <h2 className="text-md font-semibold text-neutral-900">Add Appointment</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Title"><Input value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
          <Field label="Provider (from contacts)">
            <select
              className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3"
              value={providerContactId}
              onChange={(event) => {
                const id = event.target.value;
                setProviderContactId(id);
                const contact = contacts.find((item) => item.id === id);
                if (contact) setProviderName(contact.name);
              }}
            >
              <option value="">Not linked</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                  {contact.organization ? ` (${contact.organization})` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Provider name"><Input value={providerName} onChange={(event) => setProviderName(event.target.value)} /></Field>
          <Field label="Date and time"><Input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></Field>
          <Field label="Duration"><Input type="number" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} /></Field>
          <Field label="Location"><Input value={location} onChange={(event) => setLocation(event.target.value)} /></Field>
          <Field label="Address"><Input value={address} onChange={(event) => setAddress(event.target.value)} /></Field>
          <Field label="Type">
            <select className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3" value={appointmentType} onChange={(event) => setAppointmentType(event.target.value as AppointmentType)}>
              <option value="medical">Medical</option><option value="legal">Legal</option><option value="financial">Financial</option><option value="home_service">Home service</option><option value="other">Other</option>
            </select>
          </Field>
          <Field label="Attendees">
            <select multiple className="min-h-24 w-full rounded-lg border border-neutral-300 bg-white p-2" value={attendeeIds} onChange={(event) => setAttendeeIds(Array.from(event.currentTarget.selectedOptions).map((option) => option.value))}>
              {members.map((member) => <option key={member.membership.user_id} value={member.membership.user_id}>{member.profile?.display_name ?? "Unknown member"}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2"><Field label="Prep notes"><textarea className="min-h-24 w-full rounded border border-neutral-300 p-3" value={prepNotes} onChange={(event) => setPrepNotes(event.target.value)} /></Field></div>
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-700"><input type="checkbox" checked={createReminder} onChange={(event) => setCreateReminder(event.target.checked)} /> Create reminder for this appointment</label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!title.trim() || !scheduledAt}>Save</Button>
        </div>
      </div>
    </div>
  );
}

function CalendarGrid({ appointments, onSelect }: { appointments: HydratedAppointment[]; onSelect: (id: string) => void }) {
  const days = Array.from({ length: 35 }, (_, index) => index + 1);
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const items = appointments.filter((appointment) => new Date(appointment.scheduled_at).getDate() === day);
          return (
            <div key={day} className="min-h-24 rounded border border-neutral-200 p-2">
              <p className="text-xs font-semibold text-neutral-500">{day}</p>
              {items.slice(0, 3).map((appointment) => (
                <button key={appointment.id} className="mt-1 block max-w-full truncate rounded bg-blue-50 px-2 py-1 text-xs text-blue-700" onClick={() => onSelect(appointment.id)}>
                  {appointment.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DateBadge({ value }: { value: string }) {
  const date = new Date(value);
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-center">
      <p className="text-xs font-semibold uppercase text-neutral-500">{date.toLocaleDateString("en", { month: "short" })}</p>
      <p className="text-lg font-semibold text-neutral-900">{date.getDate()}</p>
    </div>
  );
}

function EditableInput({ label, value, type = "text", onSave }: { label: string; value: string; type?: string; onSave: (value: string) => void }) {
  return <Field label={label}><Input type={type} defaultValue={value} onBlur={(event) => onSave(event.target.value)} /></Field>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="mt-3 block"><span className="mb-2 block text-sm font-medium text-neutral-700">{label}</span>{children}</label>;
}

function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
