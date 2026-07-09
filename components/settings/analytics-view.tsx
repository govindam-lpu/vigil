"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Card } from "@/components/ui/card";
import { LoadError } from "@/components/ui/load-error";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsNav } from "@/components/settings/settings-nav";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import type { AnalyticsRange, CareCircleAnalytics, MemberSummary } from "@/lib/types";

// Recharts lives in a separate chunk loaded on demand (ssr:false) so it stays out of the
// analytics route's first-load JS. A skeleton holds the space while it streams in.
const AnalyticsCharts = dynamic(() => import("./analytics-charts"), {
  ssr: false,
  loading: () => <ChartsSkeleton />
});

const RANGES: Array<{ value: AnalyticsRange; label: string }> = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "6m", label: "Last 6 months" }
];

function ChartsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-5 w-24" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

export function AnalyticsView() {
  const { activeCircle } = useActiveCircle();
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [analytics, setAnalytics] = useState<CareCircleAnalytics | null>(null);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const role = activeCircle?.membership.role;
  const canView = role === "owner" || role === "coordinator";
  const careCircleId = activeCircle?.careCircle.id ?? null;

  const nameFor = useCallback(
    (userId: string) => {
      const member = members.find((item) => item.membership.user_id === userId);
      return member?.profile?.display_name ?? "Unknown";
    },
    [members]
  );

  const load = useCallback(
    async (isCancelled?: () => boolean) => {
      if (!careCircleId || !canView) return;
      try {
        setError(null);
        const [analyticsResponse, memberResponse] = await Promise.all([
          fetch(`/api/analytics?careCircleId=${careCircleId}&range=${range}`),
          fetch(`/api/memberships?careCircleId=${careCircleId}`)
        ]);
        if (!analyticsResponse.ok || !memberResponse.ok) throw new Error("Request failed");
        const analyticsJson = (await analyticsResponse.json()) as { analytics?: CareCircleAnalytics };
        const memberJson = (await memberResponse.json()) as { members?: MemberSummary[] };
        if (isCancelled?.()) return;
        setAnalytics(analyticsJson.analytics ?? null);
        setMembers(memberJson.members ?? []);
      } catch {
        if (isCancelled?.()) return;
        setError("We couldn't load analytics. Check your connection and try again.");
      } finally {
        if (!isCancelled?.()) setIsLoading(false);
      }
    },
    [careCircleId, canView, range]
  );

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (!activeCircle) return null;

  return (
    <div className="mx-auto max-w-[1280px] p-6">
      <SettingsNav />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Analytics</h1>
          <p className="text-sm text-neutral-500">Workload and accountability for this care circle.</p>
        </div>
        {canView ? (
          <select
            aria-label="Date range"
            className="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-sm"
            value={range}
            onChange={(event) => setRange(event.target.value as AnalyticsRange)}
          >
            {RANGES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {!canView ? (
        <Card className="mt-6">
          <p className="text-sm text-neutral-600">Analytics are available to coordinators and owners.</p>
        </Card>
      ) : null}

      {error ? (
        <div className="mt-4">
          <LoadError message={error} onRetry={() => void load()} />
        </div>
      ) : null}

      {canView && !error ? (
        analytics ? (
          <div className="mt-6">
            <AnalyticsCharts
              analytics={analytics}
              careCircleId={careCircleId}
              personId={activeCircle.person?.id ?? null}
              nameFor={nameFor}
            />
          </div>
        ) : isLoading ? (
          <div className="mt-6">
            <ChartsSkeleton />
          </div>
        ) : null
      ) : null}
    </div>
  );
}
