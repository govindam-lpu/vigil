"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/ui/load-error";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import { roleLabel } from "@/lib/permissions/roles";
import type { EscalationAction, EscalationRule, EscalationTriggerType, MemberSummary, Role } from "@/lib/types";

const TRIGGER_TYPES: EscalationTriggerType[] = ["task_missed", "reminder_unacknowledged", "checkin_skipped", "custom"];
const ACTIONS: EscalationAction[] = ["notify_role", "notify_user", "notify_emergency_contact"];
const ROLES: Role[] = ["owner", "coordinator", "contributor", "caregiver", "viewer", "emergency"];

const CONDITION_KEY: Record<EscalationTriggerType, string | null> = {
  task_missed: "missed_for_hours",
  reminder_unacknowledged: "unacknowledged_for_hours",
  checkin_skipped: "skipped_for_hours",
  custom: null
};

export function SettingsView() {
  const { activeCircle } = useActiveCircle();
  const [rules, setRules] = useState<EscalationRule[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const role = activeCircle?.membership.role;
  const canManage = role === "owner" || role === "coordinator";

  const load = async (isCancelled?: () => boolean) => {
    if (!activeCircle || !canManage) return;
    try {
      setError(null);
      const [ruleResponse, memberResponse] = await Promise.all([
        fetch(`/api/escalation-rules?careCircleId=${activeCircle.careCircle.id}`),
        fetch(`/api/memberships?careCircleId=${activeCircle.careCircle.id}`)
      ]);
      if (!ruleResponse.ok || !memberResponse.ok) throw new Error("Request failed");
      const ruleJson = (await ruleResponse.json()) as { rules?: EscalationRule[] };
      const memberJson = (await memberResponse.json()) as { members?: MemberSummary[] };
      if (isCancelled?.()) return;
      setRules(ruleJson.rules ?? []);
      setMembers(memberJson.members ?? []);
    } catch {
      if (isCancelled?.()) return;
      setError("We couldn't load escalation rules. Check your connection and try again.");
    }
  };

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCircle?.careCircle.id, canManage]);

  const update = async (rule: EscalationRule, payload: Record<string, unknown>) => {
    if (!activeCircle) return;
    await fetch("/api/escalation-rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, careCircleId: activeCircle.careCircle.id, ...payload })
    });
    await load();
  };

  if (!activeCircle) return null;

  return (
    <div className="mx-auto max-w-[1280px] p-6">
      <div className="sticky top-14 z-20 -mx-2 border-b border-neutral-200 bg-neutral-50 px-2 py-3">
        <h1 className="text-lg font-semibold text-neutral-900">Settings</h1>
        <p className="text-sm text-neutral-500">Care circle configuration.</p>
      </div>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-md font-semibold text-neutral-900">Escalation Rules</h2>
            <p className="text-sm text-neutral-500">
              Define what happens when a task is missed or a reminder goes unacknowledged. Rules are stored now; automatic firing arrives in a
              later phase.
            </p>
          </div>
          {canManage ? (
            <Button size="sm" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Rule
            </Button>
          ) : null}
        </div>

        {!canManage ? (
          <Card className="mt-4">
            <p className="text-sm text-neutral-600">Escalation rules are available to coordinators and owners.</p>
          </Card>
        ) : (
          <>
            {error ? (
              <div className="mt-4">
                <LoadError message={error} onRetry={() => void load()} />
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {rules.length === 0 ? (
                <Card>
                  <p className="text-sm text-neutral-600">No escalation rules yet. Add one to define how missed items are surfaced.</p>
                </Card>
              ) : (
                rules.map((rule) => (
                  <Card key={rule.id} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{describeRule(rule, members)}</p>
                      {rule.message ? <p className="mt-1 text-sm text-neutral-500">“{rule.message}”</p> : null}
                      <div className="mt-2">
                        <Badge variant={rule.is_active ? "green" : "neutral"}>{rule.is_active ? "Active" : "Paused"}</Badge>
                      </div>
                    </div>
                    <select
                      aria-label="Rule actions"
                      className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm text-neutral-500"
                      value=""
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === "toggle") void update(rule, { isActive: !rule.is_active });
                        if (value === "delete") void update(rule, { archive: true });
                        event.target.value = "";
                      }}
                    >
                      <option value="">…</option>
                      <option value="toggle">{rule.is_active ? "Pause" : "Activate"}</option>
                      <option value="delete">Delete</option>
                    </select>
                  </Card>
                ))
              )}
            </div>
          </>
        )}
      </section>

      {modalOpen ? (
        <RuleModal
          careCircleId={activeCircle.careCircle.id}
          members={members}
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

function RuleModal({
  careCircleId,
  members,
  onClose,
  onSaved
}: {
  careCircleId: string;
  members: MemberSummary[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [triggerType, setTriggerType] = useState<EscalationTriggerType>("task_missed");
  const [hours, setHours] = useState("2");
  const [action, setAction] = useState<EscalationAction>("notify_role");
  const [targetRole, setTargetRole] = useState<Role>("coordinator");
  const [targetUserId, setTargetUserId] = useState("");
  const [message, setMessage] = useState("");

  const conditionKey = CONDITION_KEY[triggerType];

  const save = async () => {
    const triggerCondition = conditionKey && hours ? { [conditionKey]: Number(hours) } : null;
    const response = await fetch("/api/escalation-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        careCircleId,
        triggerType,
        triggerCondition,
        action,
        targetRole: action === "notify_role" ? targetRole : null,
        targetIds: action === "notify_user" && targetUserId ? [targetUserId] : null,
        message: message || null
      })
    });
    if (response.ok) await onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5">
        <h2 className="text-md font-semibold text-neutral-900">Add Escalation Rule</h2>
        <div className="mt-4 space-y-4">
          <Field label="Trigger">
            <select className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3" value={triggerType} onChange={(event) => setTriggerType(event.target.value as EscalationTriggerType)}>
              {TRIGGER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {labelize(type)}
                </option>
              ))}
            </select>
          </Field>
          {conditionKey ? (
            <Field label="Condition — after how many hours?">
              <Input type="number" min="1" value={hours} onChange={(event) => setHours(event.target.value)} />
            </Field>
          ) : null}
          <Field label="Action">
            <select className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3" value={action} onChange={(event) => setAction(event.target.value as EscalationAction)}>
              {ACTIONS.map((item) => (
                <option key={item} value={item}>
                  {labelize(item)}
                </option>
              ))}
            </select>
          </Field>
          {action === "notify_role" ? (
            <Field label="Notify role">
              <select className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3" value={targetRole} onChange={(event) => setTargetRole(event.target.value as Role)}>
                {ROLES.map((item) => (
                  <option key={item} value={item}>
                    {roleLabel(item)}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {action === "notify_user" ? (
            <Field label="Notify member">
              <select className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3" value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)}>
                <option value="">Select a member…</option>
                {members.map((member) => (
                  <option key={member.membership.user_id} value={member.membership.user_id}>
                    {member.profile?.display_name ?? "Unknown member"}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Custom message (optional)">
            <Input value={message} onChange={(event) => setMessage(event.target.value)} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={action === "notify_user" && !targetUserId}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function describeRule(rule: EscalationRule, members: MemberSummary[]): string {
  const trigger = triggerText(rule);
  const target = targetText(rule, members);
  return `${trigger} → ${target}`;
}

function triggerText(rule: EscalationRule): string {
  const condition = rule.trigger_condition as unknown as Record<string, number> | null;
  const hours = condition ? Object.values(condition)[0] : null;
  const base: Record<EscalationTriggerType, string> = {
    task_missed: "When a task is missed",
    reminder_unacknowledged: "When a reminder is unacknowledged",
    checkin_skipped: "When a check-in is skipped",
    custom: "Custom trigger"
  };
  const label = rule.trigger_type ? base[rule.trigger_type] : "Trigger";
  return hours ? `${label} for more than ${hours}h` : label;
}

function targetText(rule: EscalationRule, members: MemberSummary[]): string {
  if (rule.action === "notify_role") return `notify ${rule.target_role ? roleLabel(rule.target_role) + "s" : "a role"}`;
  if (rule.action === "notify_user") {
    const id = rule.target_ids?.[0];
    const member = members.find((item) => item.membership.user_id === id);
    return `notify ${member?.profile?.display_name ?? "a member"}`;
  }
  if (rule.action === "notify_emergency_contact") return "notify emergency contact";
  return "notify";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}

function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
