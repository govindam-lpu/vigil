"use client";

import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DetailSheet } from "@/components/ui/detail-sheet";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/ui/load-error";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import { createClient } from "@/lib/supabase/client";
import { fetchJson } from "@/lib/query/fetch";
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
    <Suspense fallback={<AppointmentsSkeleton />}>
      <AppointmentsContent />
    </Suspense>
  );
}

function AppointmentsSkeleton() {
  return (
    <div className="mx-auto max-w-[1280px] p-4 sm:p-6" aria-busy="true">
      <div className="flex items-center justify-between border-b border-neutral-200 py-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="mt-5">
        <SkeletonRows rows={6} />
      </div>
    </div>
  );
}

function AppointmentsContent() {
  const { activeCircle } = useActiveCircle();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const appointmentParam = searchParams.get("appointment");
  const [mode, setMode] = useState<ViewMode>("list");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(appointmentParam);
  const [detailOpen, setDetailOpen] = useState(Boolean(appointmentParam));

  const careCircleId = activeCircle?.careCircle.id ?? null;
  const personId = activeCircle?.person?.id ?? null;

  const appointmentsQuery = useQuery({
    queryKey: ["appointments", careCircleId, personId],
    queryFn: () =>
      fetchJson<{ appointments?: HydratedAppointment[] }>(`/api/appointments?careCircleId=${careCircleId}&personId=${personId}`),
    enabled: Boolean(careCircleId && personId)
  });
  const membersQuery = useQuery({
    queryKey: ["members", careCircleId],
    queryFn: () => fetchJson<{ members?: MemberSummary[] }>(`/api/memberships?careCircleId=${careCircleId}`),
    enabled: Boolean(careCircleId),
    staleTime: 5 * 60_000
  });
  const foldersQuery = useQuery({
    queryKey: ["folders", careCircleId, personId],
    queryFn: () => fetchJson<{ folders?: Folder[] }>(`/api/folders?careCircleId=${careCircleId}&personId=${personId}`),
    enabled: Boolean(careCircleId && personId),
    staleTime: 5 * 60_000
  });
  const contactsQuery = useQuery({
    queryKey: ["contacts", careCircleId, personId],
    queryFn: () => fetchJson<{ contacts?: Contact[] }>(`/api/contacts?careCircleId=${careCircleId}&personId=${personId}`),
    enabled: Boolean(careCircleId && personId),
    staleTime: 5 * 60_000
  });

  const appointments = useMemo(() => appointmentsQuery.data?.appointments ?? [], [appointmentsQuery.data]);
  const members = membersQuery.data?.members ?? [];
  const folders = foldersQuery.data?.folders ?? [];
  const contacts = contactsQuery.data?.contacts ?? [];
  const loading = appointmentsQuery.isPending;

  const selected = appointments.find((appointment) => appointment.id === selectedId) ?? appointments[0] ?? null;

  const reload = async () => {
    await queryClient.invalidateQueries({ queryKey: ["appointments", careCircleId, personId] });
  };

  useEffect(() => {
    if (appointmentParam) {
      setSelectedId(appointmentParam);
      setDetailOpen(true);
    }
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

  const selectAppointment = (id: string) => {
    setSelectedId(id);
    setDetailOpen(true);
  };

  return (
    <div className="mx-auto max-w-[1280px] p-4 sm:p-6">
      <div className="sticky top-14 z-20 -mx-2 flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-2 py-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-tight text-neutral-900">Calendar</h1>
          <p className="hidden text-sm text-neutral-500 sm:block">Track appointments, outcomes, and reminders.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-neutral-200 bg-white p-1">
            <button className={cn("h-8 rounded-md px-3 text-sm font-medium", mode === "list" && "bg-brand-50 text-brand-600")} onClick={() => setMode("list")}>
              List
            </button>
            <button className={cn("h-8 rounded-md px-3 text-sm font-medium", mode === "calendar" && "bg-brand-50 text-brand-600")} onClick={() => setMode("calendar")}>
              Calendar
            </button>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Add Appointment</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      {appointmentsQuery.isError ? (
        <div className="mt-5">
          <LoadError
            message="We couldn't load appointments. Check your connection and try again."
            onRetry={() => void appointmentsQuery.refetch()}
          />
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {mode === "list" ? (
          <section className="min-w-0 space-y-5">
            {loading ? (
              <SkeletonRows rows={5} />
            ) : appointments.length === 0 ? (
              <Card className="flex items-start gap-3">
                <CalendarDays className="mt-1 h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
                <p className="text-base text-neutral-600"><span className="font-display tracking-tight">No appointments scheduled.</span> Add appointments to track upcoming visits.</p>
              </Card>
            ) : (
              grouped.map(([month, items]) => (
                <div key={month} className="rounded-xl border border-neutral-200 bg-white">
                  <h2 className="border-b border-neutral-200 px-4 py-3 text-md font-semibold text-neutral-900">{month}</h2>
                  {items.map((appointment) => (
                    <AppointmentRow
                      key={appointment.id}
                      appointment={appointment}
                      selected={selected?.id === appointment.id}
                      onSelect={() => selectAppointment(appointment.id)}
                    />
                  ))}
                </div>
              ))
            )}
          </section>
        ) : (
          <CalendarGrid appointments={appointments} onSelect={selectAppointment} />
        )}

        <aside className="hidden h-fit lg:block">
          <AppointmentDetailCard key={selected?.id ?? "none"} appointment={selected} members={members} folders={folders} onReload={reload} />
        </aside>
      </div>

      <DetailSheet open={detailOpen && Boolean(selected)} onClose={() => setDetailOpen(false)} title={selected?.title ?? "Appointment"}>
        <AppointmentDetailBody key={selected?.id ?? "none"} appointment={selected} members={members} folders={folders} onReload={reload} />
      </DetailSheet>

      {modalOpen ? (
        <AppointmentModal
          careCircleId={activeCircle.careCircle.id}
          personId={activeCircle.person.id}
          members={members}
          contacts={contacts}
          onClose={() => setModalOpen(false)}
          onSaved={async () => {
            setModalOpen(false);
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}

// Flexible row: date badge + title/provider always; status from sm, type from md,
// attendees/duration from xl. The old fixed 432px grid forced page-wide sideways
// scrolling on phones.
function AppointmentRow({
  appointment,
  selected,
  onSelect
}: {
  appointment: HydratedAppointment;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-3 text-left hover:bg-neutral-50",
        selected && "bg-brand-50"
      )}
      onClick={onSelect}
    >
      <DateBadge value={appointment.scheduled_at} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-neutral-900">{appointment.title}</p>
        <p className="truncate text-sm text-neutral-500">{appointment.provider_name || "No provider listed"}</p>
        <span className="mt-1 inline-flex sm:hidden">
          <Badge variant={statusVariant[appointment.status]}>{labelize(appointment.status)}</Badge>
        </span>
      </div>
      <span className="hidden shrink-0 md:inline-flex">
        <Badge variant="neutral">{labelize(appointment.appointment_type ?? "other")}</Badge>
      </span>
      <span className="hidden shrink-0 sm:inline-flex">
        <Badge variant={statusVariant[appointment.status]}>{labelize(appointment.status)}</Badge>
      </span>
      <span className="hidden shrink-0 items-center -space-x-2 xl:flex">
        {appointment.attendees.slice(0, 4).map((attendee) => (
          <Avatar key={attendee.id} name={attendee.display_name} src={attendee.avatar_url} className="h-7 w-7 border-white" />
        ))}
        <span className="pl-3 font-mono text-sm text-neutral-500">{appointment.duration_minutes ? `${appointment.duration_minutes} min` : ""}</span>
      </span>
    </button>
  );
}

type AppointmentDetailProps = {
  appointment: HydratedAppointment | null;
  members: MemberSummary[];
  folders: Folder[];
  onReload: () => Promise<void>;
};

function AppointmentDetailCard(props: AppointmentDetailProps) {
  if (!props.appointment) return <Card className="h-fit">Select an appointment to view details.</Card>;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <AppointmentDetailBody {...props} />
    </div>
  );
}

function AppointmentDetailBody({ appointment, members, folders, onReload }: AppointmentDetailProps) {
  const [outcome, setOutcome] = useState(appointment?.outcome ?? "");
  const [followUps, setFollowUps] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    setOutcome(appointment?.outcome ?? "");
    setFollowUps("");
  }, [appointment?.id, appointment?.outcome]);

  if (!appointment) return null;

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
    // Follow-ups create task rows — refresh any cached task lists too.
    void queryClient.invalidateQueries({ queryKey: ["tasks", appointment.care_circle_id] });
  };

  return (
    <div>
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
    </div>
  );
}

function AppointmentAttachments({ appointment, folders }: { appointment: HydratedAppointment; folders: Folder[] }) {
  const queryClient = useQueryClient();
  const attachmentsQuery = useQuery({
    queryKey: ["documents", appointment.care_circle_id, appointment.person_id, { appointmentId: appointment.id }],
    queryFn: () => {
      const params = new URLSearchParams({
        careCircleId: appointment.care_circle_id,
        personId: appointment.person_id,
        appointmentId: appointment.id
      });
      return fetchJson<{ documents?: HydratedDocument[] }>(`/api/documents?${params.toString()}`);
    }
  });
  const documents = attachmentsQuery.data?.documents ?? [];

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
    await queryClient.invalidateQueries({ queryKey: ["documents", appointment.care_circle_id] });
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
              <button type="button" className="text-left text-sm font-medium text-brand-600 hover:underline" onClick={() => void openDocument(document.id)}>
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
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5">
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
  const today = new Date().getDate();
  return (
    <section className="min-w-0 rounded-xl border border-neutral-200 bg-white p-2 sm:p-4">
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((day) => {
          const items = appointments.filter((appointment) => new Date(appointment.scheduled_at).getDate() === day);
          return (
            <div key={day} className="min-h-16 min-w-0 rounded border border-neutral-200 p-1.5 sm:min-h-24 sm:p-2">
              <p className="flex items-center gap-1 font-mono text-xs font-semibold text-neutral-500">
                {day}
                {day === today ? <span className="ember-dot" aria-hidden="true" /> : null}
              </p>
              {/* Phones don't have room for title chips — show tap-able dots instead. */}
              <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                {items.slice(0, 4).map((appointment) => (
                  <button
                    key={appointment.id}
                    aria-label={appointment.title}
                    className="h-2 w-2 rounded-full bg-brand-600"
                    onClick={() => onSelect(appointment.id)}
                  />
                ))}
              </div>
              <div className="hidden sm:block">
                {items.slice(0, 3).map((appointment) => (
                  <button key={appointment.id} className="mt-1 block max-w-full truncate rounded bg-brand-50 px-2 py-1 text-xs text-brand-700" onClick={() => onSelect(appointment.id)}>
                    {appointment.title}
                  </button>
                ))}
              </div>
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
    <div className="shrink-0 rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-center">
      <p className="font-mono text-xs font-semibold uppercase text-neutral-500">{date.toLocaleDateString("en", { month: "short" })}</p>
      <p className="font-mono text-lg font-semibold text-neutral-900">{date.getDate()}</p>
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
