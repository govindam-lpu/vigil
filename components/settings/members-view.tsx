"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadError } from "@/components/ui/load-error";
import { SkeletonRows } from "@/components/ui/skeleton";
import { SettingsNav } from "@/components/settings/settings-nav";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import { fetchJson } from "@/lib/query/fetch";
import { roleLabel } from "@/lib/permissions/roles";
import {
  CAPABILITY_GROUPS,
  CAPABILITY_LABELS,
  type Capability
} from "@/lib/permissions/capabilities";
import type { MemberSummary, Membership, MembershipPermissionOverride, Role } from "@/lib/types";

type PermissionsResponse = {
  membership: Membership;
  roleCapabilities: Capability[];
  overrides: MembershipPermissionOverride[];
  effectiveCapabilities: Capability[];
  granter: { role: Role; capabilities: Capability[] };
};

export function MembersView() {
  const { activeCircle } = useActiveCircle();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<MemberSummary | null>(null);

  const role = activeCircle?.membership.role;
  const canManage = role === "owner" || role === "coordinator";
  const careCircleId = activeCircle?.careCircle.id ?? null;

  const membersQuery = useQuery({
    queryKey: ["members", careCircleId],
    queryFn: () => fetchJson<{ members?: MemberSummary[] }>(`/api/memberships?careCircleId=${careCircleId}`),
    enabled: Boolean(careCircleId),
    staleTime: 5 * 60_000
  });
  const members = membersQuery.data?.members ?? [];

  const load = async () => {
    await queryClient.invalidateQueries({ queryKey: ["members", careCircleId] });
  };

  if (!activeCircle) return null;

  return (
    <div className="mx-auto max-w-[1280px] p-4 sm:p-6">
      <SettingsNav />
      <div className="mt-4">
        <h1 className="font-display text-xl font-semibold tracking-tight text-neutral-900">Members</h1>
        <p className="text-sm text-neutral-500">Roles and granular permission overrides for this care circle.</p>
      </div>

      {membersQuery.isError ? (
        <div className="mt-4">
          <LoadError message="We couldn't load members. Check your connection and try again." onRetry={() => void load()} />
        </div>
      ) : null}

      {membersQuery.isPending ? <SkeletonRows rows={3} className="mt-6" /> : null}

      <div className="mt-6 space-y-2">
        {members.map((member) => (
          <Card key={member.membership.id} className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-neutral-900">
                {member.profile?.display_name ?? "Unknown member"}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="neutral">{roleLabel(member.membership.role)}</Badge>
                {member.membership.relationship_label ? (
                  <span className="text-xs text-neutral-400">{member.membership.relationship_label}</span>
                ) : null}
              </div>
            </div>
            {canManage && member.membership.role !== "owner" ? (
              <Button size="sm" variant="secondary" onClick={() => setSelected(member)}>
                <Shield className="h-4 w-4" aria-hidden="true" />
                Manage permissions
              </Button>
            ) : null}
          </Card>
        ))}
      </div>

      {!canManage ? (
        <Card className="mt-4">
          <p className="text-sm text-neutral-600">Permission management is available to coordinators and owners.</p>
        </Card>
      ) : null}

      {selected ? (
        <PermissionsPanel
          careCircleId={activeCircle.careCircle.id}
          member={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

function PermissionsPanel({
  careCircleId,
  member,
  onClose
}: {
  careCircleId: string;
  member: MemberSummary;
  onClose: () => void;
}) {
  const [data, setData] = useState<PermissionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingCapability, setSavingCapability] = useState<Capability | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(
        `/api/memberships/permissions?careCircleId=${careCircleId}&membershipId=${member.membership.id}`
      );
      if (!response.ok) throw new Error("Request failed");
      setData((await response.json()) as PermissionsResponse);
    } catch {
      setError("We couldn't load this member's permissions.");
    }
  }, [careCircleId, member.membership.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const roleCapabilities = new Set<Capability>(data?.roleCapabilities ?? []);
  const effectiveCapabilities = new Set<Capability>(data?.effectiveCapabilities ?? []);
  const granterCapabilities = new Set<Capability>(data?.granter.capabilities ?? []);

  const toggle = async (capability: Capability, nextGranted: boolean) => {
    setSavingCapability(capability);
    try {
      setError(null);
      const response = await fetch("/api/memberships/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ careCircleId, membershipId: member.membership.id, capability, granted: nextGranted })
      });
      const json = (await response.json()) as {
        overrides?: MembershipPermissionOverride[];
        effectiveCapabilities?: Capability[];
        error?: string;
      };
      if (!response.ok) {
        setError(json.error ?? "We couldn't save that change.");
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              overrides: json.overrides ?? prev.overrides,
              effectiveCapabilities: json.effectiveCapabilities ?? prev.effectiveCapabilities
            }
          : prev
      );
    } catch {
      setError("We couldn't save that change.");
    } finally {
      setSavingCapability(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-white">
        <div className="flex items-start justify-between border-b border-neutral-200 p-5">
          <div>
            <h2 className="text-md font-semibold text-neutral-900">
              Permissions — {member.profile?.display_name ?? "Member"}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Role: {roleLabel(member.membership.role)}. Custom permissions extend the role&apos;s defaults. You can
              only grant permissions you hold yourself.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error ? (
            <div className="mb-4 rounded-lg border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          ) : null}

          {!data ? (
            <p className="text-sm text-neutral-500">Loading permissions…</p>
          ) : (
            <div className="space-y-5">
              {CAPABILITY_GROUPS.map((group) => (
                <div key={group.label}>
                  <h3 className="text-sm font-semibold text-neutral-700">{group.label}</h3>
                  <div className="mt-2 space-y-1">
                    {group.capabilities.map((capability) => {
                      const isRoleDefault = roleCapabilities.has(capability);
                      const isEffective = effectiveCapabilities.has(capability);
                      const granterCanGrant = granterCapabilities.has(capability);
                      // Role defaults are the floor — shown checked and locked (can't be
                      // dropped below the role). Everything else is a grantable custom
                      // permission, enabled only if the acting member holds it.
                      const locked = isRoleDefault || !granterCanGrant;

                      return (
                        <label
                          key={capability}
                          className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-neutral-50"
                        >
                          <span className="flex items-center gap-2 text-sm text-neutral-700">
                            {CAPABILITY_LABELS[capability]}
                            {isRoleDefault ? (
                              <span className="text-xs text-neutral-400">Role default</span>
                            ) : !granterCanGrant ? (
                              <span className="text-xs text-neutral-400">Requires your own access</span>
                            ) : null}
                          </span>
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-brand-600 disabled:opacity-40"
                            checked={isEffective}
                            disabled={locked || savingCapability === capability}
                            onChange={(event) => void toggle(capability, event.target.checked)}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-neutral-200 p-4">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
