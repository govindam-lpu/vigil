"use client";

import { ChevronDown, LayoutGrid, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { roleLabel } from "@/lib/permissions/roles";
import { formatPersonName } from "@/lib/utils";
import type { WorkspaceSummary } from "@/lib/types";
import { useActiveCircle } from "./active-circle-provider";

type CircleMetric = { openTaskCount: number; unreadCount: number };

export function PersonSwitcher() {
  const router = useRouter();
  const { circles, activeCircle, setActiveCareCircleId } = useActiveCircle();
  const [metrics, setMetrics] = useState<Record<string, CircleMetric>>({});

  const hasMultiple = circles.length > 1;

  useEffect(() => {
    if (!hasMultiple) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/workspaces");
        if (!response.ok) return;
        const json = (await response.json()) as { workspaces?: WorkspaceSummary[] };
        if (cancelled) return;
        const next: Record<string, CircleMetric> = {};
        for (const workspace of json.workspaces ?? []) {
          next[workspace.careCircleId] = {
            openTaskCount: workspace.openTaskCount,
            unreadCount: workspace.unreadCount
          };
        }
        setMetrics(next);
      } catch {
        // Metadata is non-critical; the switcher still works without counts.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasMultiple, circles]);

  const activePerson = activeCircle?.person;
  const activeName = activePerson
    ? formatPersonName(activePerson.first_name, activePerson.last_name, activePerson.preferred_name)
    : "No person selected";

  if (!hasMultiple) {
    return (
      <div className="inline-flex h-9 items-center rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700">
        {activeName}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        {activeName}
        <ChevronDown className="h-4 w-4 text-neutral-500" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-80 overflow-y-auto">
        {circles.map((circle) => {
          const person = circle.person;
          const personName = person
            ? formatPersonName(person.first_name, person.last_name, person.preferred_name)
            : circle.careCircle.name;
          const metric = metrics[circle.careCircle.id];

          return (
            <DropdownMenuItem
              key={circle.careCircle.id}
              onSelect={() => {
                setActiveCareCircleId(circle.careCircle.id);
                router.refresh();
              }}
              className="h-auto flex-col items-stretch gap-1 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-neutral-900">{personName}</span>
                <Badge variant="primary">{roleLabel(circle.membership.role)}</Badge>
              </div>
              {metric ? (
                <div className="flex items-center gap-3 text-xs text-neutral-400">
                  <span>
                    {metric.openTaskCount} open {metric.openTaskCount === 1 ? "task" : "tasks"}
                  </span>
                  {metric.unreadCount > 0 ? (
                    <span className="text-red-600">{metric.unreadCount} unread</span>
                  ) : null}
                </div>
              ) : null}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator className="my-1 h-px bg-neutral-200" />
        <DropdownMenuItem onSelect={() => router.push("/workspaces")}>
          <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          All care circles
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/onboarding")} className="text-blue-600">
          <Plus className="h-4 w-4" aria-hidden="true" />
          New Care Circle
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
