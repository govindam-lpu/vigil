"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Phone, Plus, Star, UserCog } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConflictModal } from "@/components/ui/conflict-modal";
import { LoadError } from "@/components/ui/load-error";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import { fetchJson } from "@/lib/query/fetch";
import { roleLabel } from "@/lib/permissions/roles";
import type {
  Contact,
  ContactRole,
  HouseholdType,
  HydratedHousehold,
  MemberSummary,
  Person
} from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const HOUSEHOLD_TYPES: HouseholdType[] = [
  "primary_residence",
  "secondary_residence",
  "facility",
  "clinic",
  "hospital",
  "other"
];

const CONTACT_ROLES: ContactRole[] = [
  "doctor",
  "specialist",
  "pharmacist",
  "attorney",
  "insurance",
  "caregiver",
  "neighbor",
  "other"
];

type PersonFieldDef = {
  apiField: string;
  label: string;
  type: "text" | "date" | "textarea" | "list";
  toRaw: (person: Person) => string;
  toPayload: (raw: string) => string | string[] | null;
};

const PERSON_FIELDS: PersonFieldDef[] = [
  { apiField: "firstName", label: "First name", type: "text", toRaw: (p) => p.first_name, toPayload: (raw) => raw },
  { apiField: "lastName", label: "Last name", type: "text", toRaw: (p) => p.last_name, toPayload: (raw) => raw },
  { apiField: "preferredName", label: "Preferred name", type: "text", toRaw: (p) => p.preferred_name ?? "", toPayload: (raw) => raw.trim() || null },
  { apiField: "pronouns", label: "Pronouns", type: "text", toRaw: (p) => p.pronouns ?? "", toPayload: (raw) => raw.trim() || null },
  { apiField: "dateOfBirth", label: "Date of birth", type: "date", toRaw: (p) => p.date_of_birth ?? "", toPayload: (raw) => raw || null },
  { apiField: "bloodType", label: "Blood type", type: "text", toRaw: (p) => p.blood_type ?? "", toPayload: (raw) => raw.trim() || null },
  {
    apiField: "primaryDiagnoses",
    label: "Primary diagnoses",
    type: "list",
    toRaw: (p) => (p.primary_diagnoses ?? []).join(", "),
    toPayload: (raw) => splitList(raw)
  },
  { apiField: "allergies", label: "Allergies", type: "list", toRaw: (p) => (p.allergies ?? []).join(", "), toPayload: (raw) => splitList(raw) },
  { apiField: "aboutNote", label: "About", type: "textarea", toRaw: (p) => p.about_note ?? "", toPayload: (raw) => raw.trim() || null }
];

export function PeopleView() {
  const { activeCircle } = useActiveCircle();
  const queryClient = useQueryClient();

  const role = activeCircle?.membership.role;
  const canEditProfile = role === "owner" || role === "coordinator";
  const canWriteContacts = role === "owner" || role === "coordinator" || role === "contributor";

  const careCircleId = activeCircle?.careCircle.id ?? null;
  const personId = activeCircle?.person?.id ?? null;

  const membersQuery = useQuery({
    queryKey: ["members", careCircleId],
    queryFn: () => fetchJson<{ members?: MemberSummary[] }>(`/api/memberships?careCircleId=${careCircleId}`),
    enabled: Boolean(careCircleId),
    staleTime: 5 * 60_000
  });
  const contactsQuery = useQuery({
    queryKey: ["contacts", careCircleId, personId],
    queryFn: () => fetchJson<{ contacts?: Contact[] }>(`/api/contacts?careCircleId=${careCircleId}&personId=${personId}`),
    enabled: Boolean(careCircleId && personId),
    staleTime: 5 * 60_000
  });
  const personQuery = useQuery({
    queryKey: ["person", careCircleId],
    queryFn: () => fetchJson<{ person?: Person | null }>(`/api/persons?careCircleId=${careCircleId}`),
    enabled: Boolean(careCircleId)
  });
  const householdsQuery = useQuery({
    queryKey: ["households", careCircleId, personId],
    queryFn: () => fetchJson<{ households?: HydratedHousehold[] }>(`/api/households?careCircleId=${careCircleId}&personId=${personId}`),
    enabled: Boolean(careCircleId && personId)
  });

  const members = membersQuery.data?.members ?? [];
  const contacts = contactsQuery.data?.contacts ?? [];
  const households = householdsQuery.data?.households ?? [];
  const person = personQuery.data?.person ?? activeCircle?.person ?? null;
  const anyError = membersQuery.isError || contactsQuery.isError || personQuery.isError || householdsQuery.isError;

  const load = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["members", careCircleId] }),
      queryClient.invalidateQueries({ queryKey: ["contacts", careCircleId, personId] }),
      queryClient.invalidateQueries({ queryKey: ["person", careCircleId] }),
      queryClient.invalidateQueries({ queryKey: ["households", careCircleId, personId] })
    ]);
  };

  const setPerson = (next: Person) => {
    queryClient.setQueryData(["person", careCircleId], { person: next });
  };

  if (!activeCircle?.person) return null;

  return (
    <div className="mx-auto max-w-[1280px] p-4 sm:p-6">
      <div className="sticky top-14 z-20 -mx-2 border-b border-neutral-200 bg-neutral-50 px-2 py-3">
        <h1 className="font-display text-xl font-semibold tracking-tight text-neutral-900">People &amp; Roles</h1>
        <p className="hidden text-sm text-neutral-500 sm:block">Members of this care circle, the person&apos;s profile, and the care team.</p>
      </div>

      {anyError ? (
        <div className="mt-5">
          <LoadError message="We couldn't load this care circle. Check your connection and try again." onRetry={() => void load()} />
        </div>
      ) : null}

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        {person ? (
          <PersonProfileSection
            person={person}
            careCircleId={activeCircle.careCircle.id}
            canEdit={canEditProfile}
            onPersonChange={setPerson}
            onReload={load}
          />
        ) : null}
        <MembersSection members={members} loading={membersQuery.isPending} />
      </div>

      <ContactsSection
        contacts={contacts}
        loading={contactsQuery.isPending}
        careCircleId={activeCircle.careCircle.id}
        personId={activeCircle.person.id}
        canWrite={canWriteContacts}
        onReload={load}
      />

      <HouseholdsSection
        households={households}
        loading={householdsQuery.isPending}
        contacts={contacts}
        careCircleId={activeCircle.careCircle.id}
        personId={activeCircle.person.id}
        canWrite={canWriteContacts}
        canManageAccessNotes={canEditProfile}
        onReload={load}
      />
    </div>
  );
}

function PersonProfileSection({
  person,
  careCircleId,
  canEdit,
  onPersonChange,
  onReload
}: {
  person: Person;
  careCircleId: string;
  canEdit: boolean;
  onPersonChange: (person: Person) => void;
  onReload: () => Promise<void>;
}) {
  const [conflict, setConflict] = useState<{ def: PersonFieldDef; yourRaw: string; current: Person } | null>(null);

  const patchPerson = async (payload: Record<string, unknown>) =>
    fetch("/api/persons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: person.id, careCircleId, ...payload })
    });

  const saveField = async (def: PersonFieldDef, raw: string) => {
    if ((def.apiField === "firstName" || def.apiField === "lastName") && !raw.trim()) return;
    const response = await patchPerson({ [def.apiField]: def.toPayload(raw), expectedUpdatedAt: person.updated_at });
    if (response.status === 409) {
      const json = (await response.json()) as { current?: Person };
      if (json.current) setConflict({ def, yourRaw: raw, current: json.current });
      return;
    }
    if (response.ok) {
      const json = (await response.json()) as { person?: Person };
      if (json.person) onPersonChange(json.person);
    }
  };

  const resolveWith = async (raw: string) => {
    if (!conflict) return;
    const response = await patchPerson({ [conflict.def.apiField]: conflict.def.toPayload(raw) });
    if (response.ok) {
      const json = (await response.json()) as { person?: Person };
      if (json.person) onPersonChange(json.person);
    }
    setConflict(null);
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-md font-semibold text-neutral-900">Person profile</h2>
        {!canEdit ? <Badge variant="neutral">Read only</Badge> : null}
      </div>
      <div className="mt-3 space-y-1">
        {PERSON_FIELDS.map((def) => (
          <ProfileField key={def.apiField} def={def} person={person} canEdit={canEdit} onSave={(raw) => saveField(def, raw)} />
        ))}
      </div>

      {conflict ? (
        <ConflictModal
          fieldLabel={conflict.def.label}
          yourValue={conflict.yourRaw}
          theirValue={conflict.def.toRaw(conflict.current)}
          savedByLabel={`Current version (saved ${formatDateTime(conflict.current.updated_at)})`}
          onKeepTheirs={async () => {
            onPersonChange(conflict.current);
            setConflict(null);
            await onReload();
          }}
          onUseMine={() => resolveWith(conflict.yourRaw)}
          onMerge={(value) => resolveWith(value)}
          onClose={() => setConflict(null)}
        />
      ) : null}
    </Card>
  );
}

function ProfileField({ def, person, canEdit, onSave }: { def: PersonFieldDef; person: Person; canEdit: boolean; onSave: (raw: string) => void }) {
  const raw = def.toRaw(person);

  if (!canEdit) {
    return (
      <div className="flex justify-between gap-3 border-b border-neutral-100 py-2 text-sm">
        <span className="text-neutral-500">{def.label}</span>
        <span className="text-right text-neutral-900">{raw || "—"}</span>
      </div>
    );
  }

  return (
    <label className="block border-b border-neutral-100 py-2">
      <span className="mb-1 block text-xs font-medium text-neutral-500">{def.label}</span>
      {def.type === "textarea" ? (
        <textarea
          className="min-h-16 w-full rounded border border-neutral-300 p-2 text-sm"
          defaultValue={raw}
          onBlur={(event) => {
            if (event.target.value !== raw) onSave(event.target.value);
          }}
        />
      ) : (
        <Input
          type={def.type === "date" ? "date" : "text"}
          defaultValue={raw}
          placeholder={def.type === "list" ? "Comma separated" : undefined}
          onBlur={(event) => {
            if (event.target.value !== raw) onSave(event.target.value);
          }}
        />
      )}
    </label>
  );
}

function MembersSection({ members, loading }: { members: MemberSummary[]; loading: boolean }) {
  return (
    <Card>
      <h2 className="text-md font-semibold text-neutral-900">Members</h2>
      {loading ? <SkeletonRows rows={3} className="mt-3 [&>div]:h-10" /> : null}
      <div className="mt-3 space-y-3">
        {members.map((member) => (
          <div key={member.membership.id} className="flex items-center gap-3">
            <Avatar name={member.profile?.display_name ?? "Unknown"} src={member.profile?.avatar_url ?? null} className="h-9 w-9" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-900">{member.profile?.display_name ?? "Unknown member"}</p>
              <p className="text-xs text-neutral-500">
                {member.membership.relationship_label ? `${member.membership.relationship_label} · ` : ""}
                {roleLabel(member.membership.role)}
              </p>
            </div>
            {member.membership.elevation_expires_at ? (
              <Badge variant="yellow">
                <UserCog className="mr-1 h-3 w-3" aria-hidden="true" />
                Temp elevation
              </Badge>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

function ContactsSection({
  contacts,
  loading,
  careCircleId,
  personId,
  canWrite,
  onReload
}: {
  contacts: Contact[];
  loading: boolean;
  careCircleId: string;
  personId: string;
  canWrite: boolean;
  onReload: () => Promise<void>;
}) {
  const [modalContact, setModalContact] = useState<Contact | "new" | null>(null);

  const update = async (contact: Contact, payload: Record<string, unknown>) => {
    await fetch("/api/contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: contact.id, careCircleId, personId, ...payload })
    });
    await onReload();
  };

  return (
    <section className="mt-6 rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 p-4">
        <div>
          <h2 className="text-md font-semibold text-neutral-900">Care Team Contacts</h2>
          <p className="text-sm text-neutral-500">Doctors, pharmacies, and others outside the circle.</p>
        </div>
        {canWrite ? (
          <Button size="sm" onClick={() => setModalContact("new")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Contact
          </Button>
        ) : null}
      </div>

      {loading ? (
        <SkeletonRows rows={3} className="p-4" />
      ) : contacts.length === 0 ? (
        <p className="p-4 font-display text-sm tracking-tight text-neutral-600">No contacts yet. Add doctors, pharmacies, and other care-team members.</p>
      ) : (
        <>
          {/* Phones: card list with tap-to-call — a 720px table forced sideways scrolling. */}
          <div className="divide-y divide-neutral-100 sm:hidden">
            {contacts.map((contact) => (
              <div key={contact.id} className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-medium text-neutral-900">
                    <span className="min-w-0 truncate">{contact.name}</span>
                    {contact.is_emergency_contact ? (
                      <Star className="h-4 w-4 shrink-0 fill-red-500 text-red-500" aria-label="Emergency contact" />
                    ) : null}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                    {contact.role ? <Badge variant="neutral">{labelize(contact.role)}</Badge> : null}
                    {contact.organization ? <span className="min-w-0 truncate">{contact.organization}</span> : null}
                  </p>
                  {contact.phone ? (
                    <a href={`tel:${contact.phone}`} className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-sm font-medium text-brand-600">
                      <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                      {contact.phone}
                    </a>
                  ) : null}
                  {contact.email ? <p className="mt-0.5 break-all font-mono text-xs text-neutral-500">{contact.email}</p> : null}
                </div>
                {canWrite ? (
                  <select
                    aria-label="Contact actions"
                    className="h-8 shrink-0 rounded-md border border-neutral-200 bg-white px-2 text-neutral-500"
                    value=""
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "edit") setModalContact(contact);
                      if (value === "delete") void update(contact, { archive: true });
                      if (value === "pin") void update(contact, { pinnedInCrisis: !contact.pinned_in_crisis });
                      event.target.value = "";
                    }}
                  >
                    <option value="">…</option>
                    <option value="edit">Edit</option>
                    <option value="pin">{contact.pinned_in_crisis ? "Unpin from Crisis" : "Pin to Crisis"}</option>
                    <option value="delete">Delete</option>
                  </select>
                ) : null}
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs font-semibold text-neutral-500">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Organization</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Emergency</th>
                {canWrite ? <th className="px-4 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id} className="border-b border-neutral-100">
                  <td className="px-4 py-2 font-medium text-neutral-900">{contact.name}</td>
                  <td className="px-4 py-2 text-neutral-600">{contact.organization || "—"}</td>
                  <td className="px-4 py-2">{contact.role ? <Badge variant="neutral">{labelize(contact.role)}</Badge> : "—"}</td>
                  <td className="px-4 py-2 font-mono text-neutral-600">{contact.phone || "—"}</td>
                  <td className="px-4 py-2 font-mono text-neutral-600">{contact.email || "—"}</td>
                  <td className="px-4 py-2">
                    {contact.is_emergency_contact ? <Star className="h-4 w-4 fill-red-500 text-red-500" aria-label="Emergency contact" /> : null}
                  </td>
                  {canWrite ? (
                    <td className="px-4 py-2 text-right">
                      <select
                        aria-label="Contact actions"
                        className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-neutral-500"
                        value=""
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value === "edit") setModalContact(contact);
                          if (value === "delete") void update(contact, { archive: true });
                          if (value === "pin") void update(contact, { pinnedInCrisis: !contact.pinned_in_crisis });
                          event.target.value = "";
                        }}
                      >
                        <option value="">…</option>
                        <option value="edit">Edit</option>
                        <option value="pin">{contact.pinned_in_crisis ? "Unpin from Crisis" : "Pin to Crisis"}</option>
                        <option value="delete">Delete</option>
                      </select>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      {modalContact ? (
        <ContactModal
          careCircleId={careCircleId}
          personId={personId}
          contact={modalContact === "new" ? null : modalContact}
          onClose={() => setModalContact(null)}
          onSaved={async () => {
            setModalContact(null);
            await onReload();
          }}
        />
      ) : null}
    </section>
  );
}

function ContactModal({
  careCircleId,
  personId,
  contact,
  onClose,
  onSaved
}: {
  careCircleId: string;
  personId: string;
  contact: Contact | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(contact?.name ?? "");
  const [organization, setOrganization] = useState(contact?.organization ?? "");
  const [role, setRole] = useState<ContactRole | "">(contact?.role ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [address, setAddress] = useState(contact?.address ?? "");
  const [npi, setNpi] = useState(contact?.npi ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [isEmergency, setIsEmergency] = useState(contact?.is_emergency_contact ?? false);
  const [isPrimary, setIsPrimary] = useState(contact?.is_primary ?? false);

  const save = async () => {
    const payload = {
      careCircleId,
      personId,
      name,
      organization: organization || null,
      role: role || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      npi: npi || null,
      notes: notes || null,
      isEmergencyContact: isEmergency,
      isPrimary
    };
    const response = await fetch("/api/contacts", {
      method: contact ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contact ? { id: contact.id, ...payload } : payload)
    });
    if (response.ok) await onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5">
        <h2 className="text-md font-semibold text-neutral-900">{contact ? "Edit Contact" : "Add Contact"}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Name (required)">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Organization">
            <Input value={organization} onChange={(event) => setOrganization(event.target.value)} />
          </Field>
          <Field label="Role">
            <select className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3" value={role} onChange={(event) => setRole(event.target.value as ContactRole | "")}>
              <option value="">Select…</option>
              {CONTACT_ROLES.map((item) => (
                <option key={item} value={item}>
                  {labelize(item)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </Field>
          <Field label="Email">
            <Input value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field label="NPI">
            <Input value={npi} onChange={(event) => setNpi(event.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address">
              <Input value={address} onChange={(event) => setAddress(event.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea className="min-h-16 w-full rounded border border-neutral-300 p-2" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
            <input type="checkbox" checked={isEmergency} onChange={(event) => setIsEmergency(event.target.checked)} /> Emergency contact
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
            <input type="checkbox" checked={isPrimary} onChange={(event) => setIsPrimary(event.target.checked)} /> Primary contact
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function HouseholdsSection({
  households,
  loading,
  contacts,
  careCircleId,
  personId,
  canWrite,
  canManageAccessNotes,
  onReload
}: {
  households: HydratedHousehold[];
  loading: boolean;
  contacts: Contact[];
  careCircleId: string;
  personId: string;
  canWrite: boolean;
  canManageAccessNotes: boolean;
  onReload: () => Promise<void>;
}) {
  const [modalHousehold, setModalHousehold] = useState<HydratedHousehold | "new" | null>(null);

  const remove = async (household: HydratedHousehold) => {
    await fetch("/api/households", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: household.id, careCircleId, personId, archive: true })
    });
    await onReload();
  };

  return (
    <section className="mt-6 rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 p-4">
        <div>
          <h2 className="text-md font-semibold text-neutral-900">Locations</h2>
          <p className="text-sm text-neutral-500">Homes and facilities associated with this person.</p>
        </div>
        {canWrite ? (
          <Button size="sm" onClick={() => setModalHousehold("new")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Location
          </Button>
        ) : null}
      </div>

      {loading ? (
        <SkeletonRows rows={2} className="p-4" />
      ) : households.length === 0 ? (
        <p className="p-4 font-display text-sm tracking-tight text-neutral-600">
          No locations yet. Add a home or facility with its address and access notes.
        </p>
      ) : (
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          {households.map((household) => (
            <div key={household.id} className="rounded-lg border border-neutral-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{household.name}</p>
                  <Badge variant="neutral" className="mt-1">
                    {labelize(household.type)}
                  </Badge>
                </div>
                {canWrite ? (
                  <select
                    aria-label="Location actions"
                    className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm text-neutral-500"
                    value=""
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "edit") setModalHousehold(household);
                      if (value === "delete") void remove(household);
                      event.target.value = "";
                    }}
                  >
                    <option value="">…</option>
                    <option value="edit">Edit</option>
                    <option value="delete">Delete</option>
                  </select>
                ) : null}
              </div>

              {household.address ? (
                <p className="mt-2 flex items-start gap-1 text-sm text-neutral-600">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
                  {household.address}
                </p>
              ) : null}

              {household.linked_contacts.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {household.linked_contacts.map((contact) => (
                    <Badge key={contact.id} variant="neutral">
                      {contact.name}
                    </Badge>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 border-t border-neutral-100 pt-2">
                <p className="text-xs font-medium text-neutral-500">Access notes</p>
                {household.access_restricted ? (
                  <p className="text-sm text-neutral-400">Access notes restricted</p>
                ) : household.access_notes ? (
                  <p className="whitespace-pre-wrap text-sm text-neutral-700">{household.access_notes}</p>
                ) : (
                  <p className="text-sm text-neutral-400">None</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalHousehold ? (
        <HouseholdModal
          careCircleId={careCircleId}
          personId={personId}
          household={modalHousehold === "new" ? null : modalHousehold}
          contacts={contacts}
          canManageAccessNotes={canManageAccessNotes}
          onClose={() => setModalHousehold(null)}
          onSaved={async () => {
            setModalHousehold(null);
            await onReload();
          }}
        />
      ) : null}
    </section>
  );
}

function HouseholdModal({
  careCircleId,
  personId,
  household,
  contacts,
  canManageAccessNotes,
  onClose,
  onSaved
}: {
  careCircleId: string;
  personId: string;
  household: HydratedHousehold | null;
  contacts: Contact[];
  canManageAccessNotes: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(household?.name ?? "");
  const [type, setType] = useState<HouseholdType>(household?.type ?? "primary_residence");
  const [address, setAddress] = useState(household?.address ?? "");
  const [linkedContactIds, setLinkedContactIds] = useState<string[]>(household?.linked_contact_ids ?? []);
  const [accessNotes, setAccessNotes] = useState(household?.access_notes ?? "");

  const toggleContact = (id: string) =>
    setLinkedContactIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));

  const save = async () => {
    const payload: Record<string, unknown> = {
      careCircleId,
      personId,
      name,
      type,
      address: address || null,
      linkedContactIds
    };
    // Only include accessNotes when the user can manage them — otherwise the API
    // rejects the whole request (access notes are coordinator+ only).
    if (canManageAccessNotes) {
      payload.accessNotes = accessNotes || null;
    }
    const response = await fetch("/api/households", {
      method: household ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(household ? { id: household.id, ...payload } : payload)
    });
    if (response.ok) await onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5">
        <h2 className="text-md font-semibold text-neutral-900">{household ? "Edit Location" : "Add Location"}</h2>
        <div className="mt-4 space-y-3">
          <Field label="Name (required)">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Maple Hill Assisted Living" />
          </Field>
          <Field label="Type">
            <select
              className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3"
              value={type}
              onChange={(event) => setType(event.target.value as HouseholdType)}
            >
              {HOUSEHOLD_TYPES.map((item) => (
                <option key={item} value={item}>
                  {labelize(item)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Address">
            <Input value={address} onChange={(event) => setAddress(event.target.value)} />
          </Field>
          {contacts.length > 0 ? (
            <Field label="Linked contacts">
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 p-2">
                {contacts.map((contact) => (
                  <label key={contact.id} className="flex items-center gap-2 text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-600"
                      checked={linkedContactIds.includes(contact.id)}
                      onChange={() => toggleContact(contact.id)}
                    />
                    {contact.name}
                  </label>
                ))}
              </div>
            </Field>
          ) : null}
          {canManageAccessNotes ? (
            <Field label="Access notes (door codes, key location — coordinators only)">
              <textarea
                className="min-h-16 w-full rounded border border-neutral-300 p-2 text-sm"
                value={accessNotes}
                onChange={(event) => setAccessNotes(event.target.value)}
              />
            </Field>
          ) : (
            <p className="text-sm text-neutral-400">Access notes can only be edited by coordinators.</p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}

function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
