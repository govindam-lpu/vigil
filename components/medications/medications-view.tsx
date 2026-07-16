"use client";

import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pill, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DetailSheet } from "@/components/ui/detail-sheet";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/ui/load-error";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import { fetchJson } from "@/lib/query/fetch";
import type {
  Contact,
  HydratedMedication,
  HydratedMedicationAdministration,
  HydratedTimelineEvent,
  MedicationForm,
  MedicationStatus
} from "@/lib/types";
import { cn, formatDateTime, toDateTimeLocalValue } from "@/lib/utils";

type MedTab = "active" | "paused" | "discontinued";

const FREQUENCY_OPTIONS = [
  "Once daily",
  "Twice daily",
  "Three times daily",
  "Four times daily",
  "As needed",
  "Weekly",
  "Custom"
];

const SCHEDULE_COUNT: Record<string, number> = {
  "Once daily": 1,
  "Twice daily": 2,
  "Three times daily": 3,
  "Four times daily": 4,
  Weekly: 1,
  "As needed": 0,
  Custom: 1
};

const COMMON_DRUGS = [
  "Metformin",
  "Lisinopril",
  "Atorvastatin",
  "Amlodipine",
  "Omeprazole",
  "Levothyroxine",
  "Losartan",
  "Eliquis",
  "Metoprolol",
  "Gabapentin"
];

const statusVariant: Record<MedicationStatus, "green" | "yellow" | "neutral"> = {
  active: "green",
  paused: "yellow",
  discontinued: "neutral"
};

export function MedicationsView() {
  return (
    <Suspense fallback={<MedicationsSkeleton />}>
      <MedicationsContent />
    </Suspense>
  );
}

function MedicationsSkeleton() {
  return (
    <div className="mx-auto max-w-[1280px] p-4 sm:p-6" aria-busy="true">
      <div className="flex items-center justify-between border-b border-neutral-200 py-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="mt-5">
        <SkeletonRows rows={5} />
      </div>
    </div>
  );
}

function MedicationsContent() {
  const { activeCircle } = useActiveCircle();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const medicationParam = searchParams.get("medication");
  const [tab, setTab] = useState<MedTab>("active");
  const [selectedId, setSelectedId] = useState<string | null>(medicationParam);
  const [detailOpen, setDetailOpen] = useState(Boolean(medicationParam));
  const [modalOpen, setModalOpen] = useState(false);

  const careCircleId = activeCircle?.careCircle.id ?? null;
  const personId = activeCircle?.person?.id ?? null;

  const medicationsQuery = useQuery({
    queryKey: ["medications", careCircleId, personId],
    queryFn: () =>
      fetchJson<{ medications?: HydratedMedication[] }>(`/api/medications?careCircleId=${careCircleId}&personId=${personId}`),
    enabled: Boolean(careCircleId && personId)
  });
  const contactsQuery = useQuery({
    queryKey: ["contacts", careCircleId, personId],
    queryFn: () => fetchJson<{ contacts?: Contact[] }>(`/api/contacts?careCircleId=${careCircleId}&personId=${personId}`),
    enabled: Boolean(careCircleId && personId),
    staleTime: 5 * 60_000
  });

  const medications = useMemo(() => medicationsQuery.data?.medications ?? [], [medicationsQuery.data]);
  const contacts = contactsQuery.data?.contacts ?? [];
  const loading = medicationsQuery.isPending;

  const load = async () => {
    await queryClient.invalidateQueries({ queryKey: ["medications", careCircleId, personId] });
  };
  const reloadContacts = async () => {
    await queryClient.invalidateQueries({ queryKey: ["contacts", careCircleId, personId] });
  };

  useEffect(() => {
    if (medicationParam) {
      setSelectedId(medicationParam);
      setDetailOpen(true);
    }
  }, [medicationParam]);

  const counts = useMemo(
    () => ({
      active: medications.filter((med) => med.status === "active").length,
      paused: medications.filter((med) => med.status === "paused").length,
      discontinued: medications.filter((med) => med.status === "discontinued").length,
      refillsDue: medications.filter((med) => med.status === "active" && refillDays(med) !== null && (refillDays(med) as number) <= 14).length
    }),
    [medications]
  );

  const visible = useMemo(() => medications.filter((med) => med.status === tab), [medications, tab]);
  const selected = visible.find((med) => med.id === selectedId) ?? medications.find((med) => med.id === selectedId) ?? visible[0] ?? null;

  if (!activeCircle?.person) return null;

  return (
    <div className="mx-auto max-w-[1280px] p-4 sm:p-6">
      <div className="sticky top-14 z-20 -mx-2 flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-2 py-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-tight text-neutral-900">Medications</h1>
          {loading ? (
            <Skeleton className="mt-1 h-4 w-48" />
          ) : (
            <p className="text-sm text-neutral-500">
              {counts.active} active · {counts.refillsDue} refills due · {counts.discontinued} discontinued
            </p>
          )}
        </div>
        <Button className="shrink-0" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Add Medication</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      {medicationsQuery.isError ? (
        <div className="mt-5">
          <LoadError
            message="We couldn't load medications. Check your connection and try again."
            onRetry={() => void medicationsQuery.refetch()}
          />
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {(["active", "paused", "discontinued"] as MedTab[]).map((item) => (
          <button
            key={item}
            className={cn(
              "h-9 rounded-full border px-4 text-sm font-medium capitalize",
              tab === item ? "border-brand-600 bg-brand-50 text-brand-600" : "border-neutral-200 text-neutral-600 hover:bg-neutral-100"
            )}
            onClick={() => setTab(item)}
          >
            {loading ? item : `${item} (${counts[item]})`}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="min-w-0 space-y-3">
          {loading ? (
            <SkeletonRows rows={4} />
          ) : visible.length === 0 ? (
            <Card className="flex items-start gap-3">
              <Pill className="mt-1 h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
              <p className="text-base text-neutral-600">
                <span className="font-display tracking-tight">No {tab} medications.</span> Medications track dosage, schedule, and refills so nothing is doubled up or missed.
              </p>
            </Card>
          ) : (
            visible.map((med) => (
              <MedicationCard
                key={med.id}
                medication={med}
                selected={selected?.id === med.id}
                onSelect={() => {
                  setSelectedId(med.id);
                  setDetailOpen(true);
                }}
              />
            ))
          )}
        </section>

        <aside className="hidden h-fit lg:block">
          <MedicationDetailCard key={selected?.id ?? "none"} medication={selected} contacts={contacts} onReload={load} />
        </aside>
      </div>

      <DetailSheet open={detailOpen && Boolean(selected)} onClose={() => setDetailOpen(false)} title={selected ? displayName(selected) : "Medication"}>
        <MedicationDetailBody key={selected?.id ?? "none"} medication={selected} contacts={contacts} onReload={load} />
      </DetailSheet>

      {modalOpen ? (
        <MedicationModal
          careCircleId={activeCircle.careCircle.id}
          personId={activeCircle.person.id}
          contacts={contacts}
          onContactsChanged={reloadContacts}
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

function MedicationCard({ medication, selected, onSelect }: { medication: HydratedMedication; selected: boolean; onSelect: () => void }) {
  const chip = refillChip(medication);
  return (
    <button
      className={cn(
        "w-full rounded-xl border border-neutral-200 bg-white p-4 text-left hover:bg-neutral-50",
        selected && "border-brand-200 bg-brand-50"
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-neutral-900">{displayName(medication)}</p>
          <p className="font-mono text-sm text-neutral-500">{[medication.form, medication.route].filter(Boolean).join(" · ") || "—"}</p>
          <p className="mt-1 font-mono text-sm text-neutral-600">{scheduleLine(medication)}</p>
          {medication.prescriber ? <p className="mt-1 text-xs text-neutral-400">Prescriber: {medication.prescriber.name}</p> : null}
        </div>
        {chip ? <Badge variant={chip.variant}>{chip.label}</Badge> : null}
      </div>
    </button>
  );
}

type MedicationDetailProps = {
  medication: HydratedMedication | null;
  contacts: Contact[];
  onReload: () => Promise<void>;
};

function MedicationDetailCard(props: MedicationDetailProps) {
  if (!props.medication) {
    return (
      <Card className="h-fit">
        <p className="text-sm text-neutral-500">Select a medication to view details.</p>
      </Card>
    );
  }
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <MedicationDetailBody {...props} />
    </div>
  );
}

function MedicationDetailBody({ medication, contacts, onReload }: MedicationDetailProps) {
  const [statusAction, setStatusAction] = useState<"paused" | "discontinued" | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [logging, setLogging] = useState(false);

  if (!medication) return null;

  const update = async (payload: Record<string, unknown>) => {
    await fetch("/api/medications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: medication.id, careCircleId: medication.care_circle_id, personId: medication.person_id, ...payload })
    });
    await onReload();
  };

  const applyStatus = async () => {
    if (statusAction === "discontinued" && !statusNote.trim()) return;
    await update(
      statusAction === "discontinued"
        ? { status: "discontinued", discontinuedReason: statusNote.trim() }
        : { status: "paused", statusNote: statusNote.trim() || null }
    );
    setStatusAction(null);
    setStatusNote("");
  };

  const chip = refillChip(medication);

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="break-words text-md font-semibold text-neutral-900">{displayName(medication)}</h2>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant={statusVariant[medication.status]}>{labelize(medication.status)}</Badge>
            {chip ? <Badge variant={chip.variant}>{chip.label}</Badge> : null}
          </div>
        </div>
        <select
          aria-label="Medication actions"
          className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm text-neutral-500"
          value=""
          onChange={(event) => {
            const value = event.target.value;
            if (value === "pause") setStatusAction("paused");
            if (value === "discontinue") setStatusAction("discontinued");
            if (value === "resume") void update({ status: "active" });
            if (value === "archive") void update({ archive: true });
            event.target.value = "";
          }}
        >
          <option value="">Actions…</option>
          {medication.status !== "active" ? <option value="resume">Resume</option> : null}
          {medication.status === "active" ? <option value="pause">Pause</option> : null}
          {medication.status !== "discontinued" ? <option value="discontinue">Discontinue</option> : null}
          <option value="archive">Archive</option>
        </select>
      </div>

      {statusAction ? (
        <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-sm font-medium text-neutral-700">
            {statusAction === "discontinued" ? "Reason for discontinuing (required)" : "Note for pausing (optional)"}
          </p>
          <textarea
            className="mt-2 min-h-16 w-full rounded border border-neutral-300 p-2 text-sm"
            value={statusNote}
            onChange={(event) => setStatusNote(event.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={applyStatus} disabled={statusAction === "discontinued" && !statusNote.trim()}>
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setStatusAction(null); setStatusNote(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {medication.discontinued_reason ? (
        <p className="mt-3 rounded border-l-4 border-l-neutral-400 bg-neutral-50 p-2 text-sm text-neutral-600">
          Discontinued: {medication.discontinued_reason}
        </p>
      ) : null}

      <div className="mt-4 space-y-1 border-t border-neutral-200 pt-4">
        <EditableInput label="Name" value={medication.name} onSave={(value) => update({ name: value })} />
        <EditableInput label="Dosage" value={medication.dosage ?? ""} onSave={(value) => update({ dosage: value || null })} />
        <EditableInput label="Unit" value={medication.unit ?? ""} onSave={(value) => update({ unit: value || null })} />
        <Field label="Form">
          <select
            className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-2 text-sm"
            value={medication.form ?? ""}
            onChange={(event) => update({ form: (event.target.value || null) as MedicationForm | null })}
          >
            <option value="">—</option>
            {(["pill", "liquid", "patch", "injection", "inhaler", "other"] as MedicationForm[]).map((form) => (
              <option key={form} value={form}>
                {labelize(form)}
              </option>
            ))}
          </select>
        </Field>
        <EditableInput label="Route" value={medication.route ?? ""} onSave={(value) => update({ route: value || null })} />
        <EditableInput label="Frequency" value={medication.frequency} onSave={(value) => update({ frequency: value })} />
        <EditableInput label="Rx number" value={medication.rx_number ?? ""} onSave={(value) => update({ rxNumber: value || null })} />
        <EditableInput
          label="Refills remaining"
          type="number"
          value={medication.refills_remaining !== null ? String(medication.refills_remaining) : ""}
          onSave={(value) => update({ refillsRemaining: value ? Number(value) : null })}
        />
        <EditableInput
          label="Next refill date"
          type="date"
          value={medication.next_refill_date ?? ""}
          onSave={(value) => update({ nextRefillDate: value || null })}
        />
        <EditableInput label="Start date" type="date" value={medication.start_date ?? ""} onSave={(value) => update({ startDate: value || null })} />
        <EditableInput label="End date" type="date" value={medication.end_date ?? ""} onSave={(value) => update({ endDate: value || null })} />
        <ContactSelect label="Prescriber" contacts={contacts} value={medication.prescriber_id} onChange={(value) => update({ prescriberId: value })} />
        <ContactSelect label="Pharmacy" contacts={contacts} value={medication.pharmacy_id} onChange={(value) => update({ pharmacyId: value })} />
        <EditableTextarea label="Instructions" value={medication.instructions ?? ""} onSave={(value) => update({ instructions: value || null })} />
        <EditableTextarea label="Side effects to watch" value={medication.side_effects_to_watch ?? ""} onSave={(value) => update({ sideEffectsToWatch: value || null })} />
        <EditableTextarea label="Interactions" value={medication.interactions ?? ""} onSave={(value) => update({ interactions: value || null })} />
      </div>

      <div className="mt-4 border-t border-neutral-200 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-900">History</h3>
          <Button size="sm" variant="secondary" onClick={() => setLogging((value) => !value)}>
            Log administration
          </Button>
        </div>
        {logging ? (
          <AdministrationForm medication={medication} onLogged={async () => { setLogging(false); await onReload(); }} />
        ) : null}
        <MedicationHistory medication={medication} />
      </div>
    </div>
  );
}

function AdministrationForm({ medication, onLogged }: { medication: HydratedMedication; onLogged: () => Promise<void> }) {
  const queryClient = useQueryClient();
  const [administeredAt, setAdministeredAt] = useState(toDateTimeLocalValue(new Date().toISOString()));
  const [notes, setNotes] = useState("");

  const save = async () => {
    await fetch("/api/medications/administrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        careCircleId: medication.care_circle_id,
        personId: medication.person_id,
        medicationId: medication.id,
        administeredAt: administeredAt ? new Date(administeredAt).toISOString() : null,
        notes: notes || null
      })
    });
    void queryClient.invalidateQueries({ queryKey: ["medication-history", medication.id] });
    await onLogged();
  };

  return (
    <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <Field label="Administered at">
        <Input type="datetime-local" value={administeredAt} onChange={(event) => setAdministeredAt(event.target.value)} />
      </Field>
      <Field label="Notes">
        <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" />
      </Field>
      <Button className="mt-2" size="sm" onClick={save}>
        Save administration
      </Button>
    </div>
  );
}

function MedicationHistory({ medication }: { medication: HydratedMedication }) {
  const historyQuery = useQuery({
    queryKey: ["medication-history", medication.id],
    queryFn: async () => {
      const [timelineJson, adminJson] = await Promise.all([
        fetchJson<{ events?: HydratedTimelineEvent[] }>(
          `/api/timeline?careCircleId=${medication.care_circle_id}&personId=${medication.person_id}&linkedObjectId=${medication.id}`
        ),
        fetchJson<{ administrations?: HydratedMedicationAdministration[] }>(
          `/api/medications/administrations?careCircleId=${medication.care_circle_id}&medicationId=${medication.id}`
        )
      ]);
      return { events: timelineJson.events ?? [], administrations: adminJson.administrations ?? [] };
    }
  });
  const events = historyQuery.data?.events ?? [];
  const administrations = historyQuery.data?.administrations ?? [];

  if (historyQuery.isPending) {
    return <SkeletonRows rows={2} className="mt-3 [&>div]:h-10" />;
  }

  if (events.length === 0 && administrations.length === 0) {
    return <p className="mt-3 font-display text-sm tracking-tight text-neutral-500">No history yet.</p>;
  }

  return (
    <div className="mt-3 space-y-2">
      {administrations.map((log) => (
        <div key={log.id} className="rounded-lg bg-neutral-50 p-2 text-sm">
          <p className="font-mono font-medium text-neutral-800">Dose given · {formatDateTime(log.administered_at)}</p>
          <p className="text-xs text-neutral-500">
            {log.administeredByProfile?.display_name ?? "Unknown member"}
            {log.notes ? ` — ${log.notes}` : ""}
          </p>
        </div>
      ))}
      {events.map((event) => (
        <div key={event.id} className="rounded-lg bg-neutral-50 p-2 text-sm">
          <p className="font-medium text-neutral-800">{event.title}</p>
          <p className="font-mono text-xs text-neutral-500">{formatDateTime(event.occurred_at)}</p>
        </div>
      ))}
    </div>
  );
}

function MedicationModal({
  careCircleId,
  personId,
  contacts,
  onContactsChanged,
  onClose,
  onSaved
}: {
  careCircleId: string;
  personId: string;
  contacts: Contact[];
  onContactsChanged: () => Promise<void>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [genericName, setGenericName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [dosage, setDosage] = useState("");
  const [unit, setUnit] = useState("");
  const [form, setForm] = useState<MedicationForm | "">("");
  const [route, setRoute] = useState("");
  const [frequency, setFrequency] = useState("Once daily");
  const [schedule, setSchedule] = useState<string[]>(["08:00"]);
  const [prescriberId, setPrescriberId] = useState("");
  const [pharmacyId, setPharmacyId] = useState("");
  const [rxNumber, setRxNumber] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [refillsRemaining, setRefillsRemaining] = useState("");
  const [nextRefillDate, setNextRefillDate] = useState("");
  const [instructions, setInstructions] = useState("");
  const [sideEffects, setSideEffects] = useState("");
  const [interactions, setInteractions] = useState("");
  const [saving, setSaving] = useState(false);

  const onFrequencyChange = (value: string) => {
    setFrequency(value);
    const count = SCHEDULE_COUNT[value] ?? 0;
    setSchedule(Array.from({ length: count }, (_, index) => schedule[index] ?? "08:00"));
  };

  const save = async () => {
    setSaving(true);
    const response = await fetch("/api/medications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        careCircleId,
        personId,
        name,
        genericName: genericName || null,
        brandName: brandName || null,
        dosage: dosage || null,
        unit: unit || null,
        form: form || null,
        route: route || null,
        frequency,
        schedule: schedule.filter(Boolean),
        prescriberId: prescriberId || null,
        pharmacyId: pharmacyId || null,
        rxNumber: rxNumber || null,
        startDate: startDate || null,
        endDate: endDate || null,
        refillsRemaining: refillsRemaining ? Number(refillsRemaining) : null,
        nextRefillDate: nextRefillDate || null,
        instructions: instructions || null,
        sideEffectsToWatch: sideEffects || null,
        interactions: interactions || null
      })
    });
    setSaving(false);
    if (response.ok) await onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5">
        <h2 className="text-md font-semibold text-neutral-900">Add Medication</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Name (required)">
            <Input list="common-drugs" value={name} onChange={(event) => setName(event.target.value)} />
            <datalist id="common-drugs">
              {COMMON_DRUGS.map((drug) => (
                <option key={drug} value={drug} />
              ))}
            </datalist>
          </Field>
          <Field label="Generic name">
            <Input value={genericName} onChange={(event) => setGenericName(event.target.value)} />
          </Field>
          <Field label="Brand name">
            <Input value={brandName} onChange={(event) => setBrandName(event.target.value)} />
          </Field>
          <Field label="Dosage (required)">
            <Input value={dosage} onChange={(event) => setDosage(event.target.value)} placeholder="e.g. 750mg" />
          </Field>
          <Field label="Unit">
            <Input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="mg, mL…" />
          </Field>
          <Field label="Form (required)">
            <select className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3" value={form} onChange={(event) => setForm(event.target.value as MedicationForm | "")}>
              <option value="">Select…</option>
              {(["pill", "liquid", "patch", "injection", "inhaler", "other"] as MedicationForm[]).map((item) => (
                <option key={item} value={item}>
                  {labelize(item)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Route (required)">
            <Input value={route} onChange={(event) => setRoute(event.target.value)} placeholder="oral, topical…" />
          </Field>
          <Field label="Frequency (required)">
            <select className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3" value={frequency} onChange={(event) => onFrequencyChange(event.target.value)}>
              {FREQUENCY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <ScheduleEditor schedule={schedule} onChange={setSchedule} />
          </div>
          <Field label="Start date (required)">
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </Field>
          <Field label="End date">
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </Field>
          <ContactPicker
            label="Prescriber"
            careCircleId={careCircleId}
            personId={personId}
            defaultRole="doctor"
            contacts={contacts}
            value={prescriberId}
            onChange={setPrescriberId}
            onContactsChanged={onContactsChanged}
          />
          <ContactPicker
            label="Pharmacy"
            careCircleId={careCircleId}
            personId={personId}
            defaultRole="pharmacist"
            contacts={contacts}
            value={pharmacyId}
            onChange={setPharmacyId}
            onContactsChanged={onContactsChanged}
          />
          <Field label="Rx number">
            <Input value={rxNumber} onChange={(event) => setRxNumber(event.target.value)} />
          </Field>
          <Field label="Refills remaining">
            <Input type="number" value={refillsRemaining} onChange={(event) => setRefillsRemaining(event.target.value)} />
          </Field>
          <Field label="Next refill date">
            <Input type="date" value={nextRefillDate} onChange={(event) => setNextRefillDate(event.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Instructions">
              <textarea className="min-h-16 w-full rounded border border-neutral-300 p-2" value={instructions} onChange={(event) => setInstructions(event.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Side effects to watch">
              <textarea className="min-h-16 w-full rounded border border-neutral-300 p-2" value={sideEffects} onChange={(event) => setSideEffects(event.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Interactions">
              <textarea className="min-h-16 w-full rounded border border-neutral-300 p-2" value={interactions} onChange={(event) => setInteractions(event.target.value)} />
            </Field>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !name.trim() || !dosage.trim() || !form || !route.trim() || !frequency}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function ScheduleEditor({ schedule, onChange }: { schedule: string[]; onChange: (value: string[]) => void }) {
  return (
    <Field label="Schedule times">
      <div className="space-y-2">
        {schedule.map((time, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              type="time"
              value={time}
              onChange={(event) => onChange(schedule.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))}
            />
            <button
              type="button"
              className="text-sm text-neutral-500 hover:text-red-600"
              onClick={() => onChange(schedule.filter((_, itemIndex) => itemIndex !== index))}
            >
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={() => onChange([...schedule, "08:00"])}>
          + Add time
        </button>
      </div>
    </Field>
  );
}

function ContactPicker({
  label,
  careCircleId,
  personId,
  defaultRole,
  contacts,
  value,
  onChange,
  onContactsChanged
}: {
  label: string;
  careCircleId: string;
  personId: string;
  defaultRole: string;
  contacts: Contact[];
  value: string;
  onChange: (value: string) => void;
  onContactsChanged: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const addContact = async () => {
    const response = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ careCircleId, personId, name, role: defaultRole, phone: phone || null })
    });
    if (response.ok) {
      const json = (await response.json()) as { contact?: Contact };
      await onContactsChanged();
      if (json.contact) onChange(json.contact.id);
      setAdding(false);
      setName("");
      setPhone("");
    }
  };

  return (
    <Field label={label}>
      {adding ? (
        <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Contact name" />
          <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone (optional)" />
          <div className="flex gap-2">
            <Button size="sm" onClick={addContact} disabled={!name.trim()}>
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <select className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3" value={value} onChange={(event) => onChange(event.target.value)}>
            <option value="">None</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name}
                {contact.organization ? ` (${contact.organization})` : ""}
              </option>
            ))}
          </select>
          <button type="button" className="whitespace-nowrap text-sm font-medium text-brand-600 hover:underline" onClick={() => setAdding(true)}>
            + New
          </button>
        </div>
      )}
    </Field>
  );
}

function ContactSelect({ label, contacts, value, onChange }: { label: string; contacts: Contact[]; value: string | null; onChange: (value: string | null) => void }) {
  return (
    <Field label={label}>
      <select
        className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-2 text-sm"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">None</option>
        {contacts.map((contact) => (
          <option key={contact.id} value={contact.id}>
            {contact.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function EditableInput({ label, value, type = "text", onSave }: { label: string; value: string; type?: string; onSave: (value: string) => void }) {
  return (
    <Field label={label}>
      <Input type={type} defaultValue={value} onBlur={(event) => { if (event.target.value !== value) onSave(event.target.value); }} />
    </Field>
  );
}

function EditableTextarea({ label, value, onSave }: { label: string; value: string; onSave: (value: string) => void }) {
  return (
    <Field label={label}>
      <textarea
        className="min-h-16 w-full rounded border border-neutral-300 p-2 text-sm"
        defaultValue={value}
        onBlur={(event) => { if (event.target.value !== value) onSave(event.target.value); }}
      />
    </Field>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mt-2 block">
      <span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}

function displayName(medication: HydratedMedication): string {
  return medication.dosage ? `${medication.name} ${medication.dosage}` : medication.name;
}

function scheduleLine(medication: HydratedMedication): string {
  const times = (medication.schedule ?? []).map(formatTime);
  return times.length > 0 ? `${medication.frequency} — ${times.join(", ")}` : medication.frequency;
}

function formatTime(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours)) return value;
  const period = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes ?? 0).padStart(2, "0")} ${period}`;
}

function refillDays(medication: HydratedMedication): number | null {
  if (!medication.next_refill_date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${medication.next_refill_date}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function refillChip(medication: HydratedMedication): { label: string; variant: "green" | "yellow" | "red" | "neutral" } | null {
  if (medication.refills_remaining === 0) return { label: "No refills", variant: "red" };
  const days = refillDays(medication);
  if (days === null) return null;
  if (days < 0) return { label: "Refill overdue", variant: "red" };
  if (days < 7) return { label: `Refill in ${days}d`, variant: "red" };
  if (days <= 14) return { label: `Refill in ${days}d`, variant: "yellow" };
  return { label: `Refill in ${days}d`, variant: "green" };
}

function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
