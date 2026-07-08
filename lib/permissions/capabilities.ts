import type { Role } from "@/lib/types";

/**
 * Granular capability model (Phase 5 — §3 permission overrides).
 *
 * Capabilities are an *additive* layer over the role hierarchy. Every role has a
 * default set of capabilities that mirror the enforcement the API already applied
 * in Phases 0–4 (see the per-route gate map). Membership-level overrides then add
 * (granted = true) or remove (granted = false) individual capabilities on top of
 * the role default.
 *
 * IMPORTANT: The defaults below must reproduce the historical role-minimum gates
 * exactly, so members with no overrides see identical behavior. Only members with
 * an explicit override experience a change — which is the entire point of §3.
 */
export const ALL_CAPABILITIES = [
  "tasks.read",
  "tasks.write",
  "tasks.assign",
  "appointments.read",
  "appointments.write",
  "medications.read",
  "medications.write",
  "documents.read",
  "documents.upload",
  "documents.delete",
  "notes.read",
  "notes.write",
  "notes.private",
  "contacts.read",
  "contacts.write",
  "members.invite",
  "circle.settings",
  "circle.crisis",
  "audit.read",
  "export.all"
] as const;

export type Capability = (typeof ALL_CAPABILITIES)[number];

const CAPABILITY_SET: ReadonlySet<string> = new Set<string>(ALL_CAPABILITIES);

// Reads were gated at `emergency` (any member) on every list route — all roles read.
const READ_CAPABILITIES: Capability[] = [
  "tasks.read",
  "appointments.read",
  "medications.read",
  "documents.read",
  "notes.read",
  "contacts.read"
];

// Writes gated at `contributor` on tasks/appointments/medications/documents/contacts.
const CONTRIBUTOR_WRITE_CAPABILITIES: Capability[] = [
  "tasks.write",
  "tasks.assign",
  "appointments.write",
  "medications.write",
  "documents.upload",
  "contacts.write",
  // notes were gated at `caregiver` (can_log_care) — a strict superset, so a
  // contributor also has them.
  "notes.write",
  "notes.private"
];

/**
 * Default capabilities per role, reproducing the historical gates:
 * - owner: everything.
 * - coordinator: everything except `export.all` (README: full data export is the
 *   Owner's by default; others need an explicit `export.all` grant — §5).
 * - contributor: all reads + contributor-level writes (no delete / admin / audit).
 * - caregiver: all reads + notes (can_log_care).
 * - viewer / emergency: reads only (emergency's narrow row scope is enforced by the
 *   crisis/emergency query paths and RLS, not by these capability flags).
 */
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  owner: [...ALL_CAPABILITIES],
  coordinator: ALL_CAPABILITIES.filter((capability) => capability !== "export.all"),
  contributor: [...READ_CAPABILITIES, ...CONTRIBUTOR_WRITE_CAPABILITIES],
  caregiver: [...READ_CAPABILITIES, "notes.write", "notes.private"],
  viewer: [...READ_CAPABILITIES],
  emergency: [...READ_CAPABILITIES]
};

export const CAPABILITY_LABELS: Record<Capability, string> = {
  "tasks.read": "View tasks",
  "tasks.write": "Create & edit tasks",
  "tasks.assign": "Assign tasks",
  "appointments.read": "View appointments",
  "appointments.write": "Create & edit appointments",
  "medications.read": "View medications",
  "medications.write": "Create & edit medications",
  "documents.read": "View documents",
  "documents.upload": "Upload documents",
  "documents.delete": "Delete documents",
  "notes.read": "View notes",
  "notes.write": "Create & edit notes",
  "notes.private": "Create private notes",
  "contacts.read": "View contacts",
  "contacts.write": "Create & edit contacts",
  "members.invite": "Invite members",
  "circle.settings": "Manage circle settings",
  "circle.crisis": "Activate crisis mode",
  "audit.read": "View audit log",
  "export.all": "Export all data"
};

export type CapabilityGroup = {
  label: string;
  capabilities: Capability[];
};

/** Ordered groups for the Permissions Management screen. */
export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  { label: "Tasks", capabilities: ["tasks.read", "tasks.write", "tasks.assign"] },
  { label: "Appointments", capabilities: ["appointments.read", "appointments.write"] },
  { label: "Medications", capabilities: ["medications.read", "medications.write"] },
  { label: "Documents", capabilities: ["documents.read", "documents.upload", "documents.delete"] },
  { label: "Notes", capabilities: ["notes.read", "notes.write", "notes.private"] },
  { label: "Contacts", capabilities: ["contacts.read", "contacts.write"] },
  {
    label: "Circle administration",
    capabilities: ["members.invite", "circle.settings", "circle.crisis", "audit.read", "export.all"]
  }
];

export function isCapability(value: string): value is Capability {
  return CAPABILITY_SET.has(value);
}

export function getRoleCapabilities(role: Role): Capability[] {
  return ROLE_CAPABILITIES[role];
}

export function roleHasCapability(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export type CapabilityOverrideInput = {
  capability: string;
  granted: boolean;
};

/**
 * Resolve a membership's effective capabilities: start from the role default, then
 * apply each override (granted = true adds, granted = false removes). Unknown
 * capability strings are ignored so a stale override row can never widen access.
 */
export function resolveEffectiveCapabilities(
  role: Role,
  overrides: CapabilityOverrideInput[]
): Set<Capability> {
  const capabilities = new Set<Capability>(ROLE_CAPABILITIES[role]);

  for (const override of overrides) {
    if (!isCapability(override.capability)) {
      continue;
    }

    if (override.granted) {
      capabilities.add(override.capability);
    } else {
      capabilities.delete(override.capability);
    }
  }

  return capabilities;
}
