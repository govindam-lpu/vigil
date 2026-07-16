"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadError } from "@/components/ui/load-error";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import { fetchJson } from "@/lib/query/fetch";
import { roleLabel } from "@/lib/permissions/roles";
import { formatPersonName, getInitials, relativeTime } from "@/lib/utils";
import type { WorkspaceSummary } from "@/lib/types";

export function WorkspacesView() {
  const router = useRouter();
  const { setActiveCareCircleId } = useActiveCircle();

  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => fetchJson<{ workspaces?: WorkspaceSummary[] }>("/api/workspaces")
  });
  const workspaces = workspacesQuery.isPending ? null : workspacesQuery.data?.workspaces ?? [];

  const open = (careCircleId: string) => {
    setActiveCareCircleId(careCircleId);
    router.push("/dashboard");
  };

  return (
    <div className="mx-auto max-w-[1280px] p-4 sm:p-6">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight text-neutral-900">Your care circles</h1>
        <p className="text-sm text-neutral-500">Choose a care circle to open, or create a new one.</p>
      </div>

      {workspacesQuery.isError ? (
        <div className="mt-6">
          <LoadError
            message="We couldn't load your care circles. Check your connection and try again."
            onRetry={() => void workspacesQuery.refetch()}
          />
        </div>
      ) : null}

      {workspacesQuery.isPending ? <SkeletonRows rows={2} className="mt-6 [&>div]:h-32" /> : null}

      {workspaces ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((workspace) => {
            const personName = workspace.person
              ? formatPersonName(workspace.person.first_name, workspace.person.last_name, workspace.person.preferred_name)
              : workspace.careCircleName;

            return (
              <Card key={workspace.careCircleId} className="flex flex-col gap-4 transition-shadow hover:border-neutral-300 hover:shadow-lift">
                <div className="flex items-start gap-3">
                  {workspace.person?.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={workspace.person.photo_url}
                      alt=""
                      className="h-12 w-12 rounded-full border border-neutral-200 object-cover"
                    />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-sm font-semibold text-neutral-600">
                      {getInitials(personName)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-semibold tracking-tight text-neutral-900">{personName}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant="neutral">{roleLabel(workspace.role)}</Badge>
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-neutral-400">
                        <Users className="h-3.5 w-3.5" aria-hidden="true" />
                        {workspace.memberCount}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={workspace.openTaskCount > 0 ? "primary" : "neutral"} className="font-mono">
                    {workspace.openTaskCount} open {workspace.openTaskCount === 1 ? "task" : "tasks"}
                  </Badge>
                  {workspace.unreadCount > 0 ? (
                    <Badge variant="red" className="font-mono">
                      {workspace.unreadCount} unread
                    </Badge>
                  ) : null}
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-neutral-400">
                    {workspace.lastActivityAt ? `Active ${relativeTime(workspace.lastActivityAt)}` : "No activity yet"}
                  </span>
                  <Button size="sm" onClick={() => open(workspace.careCircleId)}>
                    Open
                  </Button>
                </div>
              </Card>
            );
          })}

          <button
            type="button"
            onClick={() => router.push("/onboarding")}
            className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 bg-white text-sm font-medium text-neutral-500 transition-colors hover:border-brand-600 hover:text-brand-600"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            Create new care circle
          </button>
        </div>
      ) : null}
    </div>
  );
}
