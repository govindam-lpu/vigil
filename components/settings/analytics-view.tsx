"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Card } from "@/components/ui/card";
import { LoadError } from "@/components/ui/load-error";
import { SettingsNav } from "@/components/settings/settings-nav";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import type { AnalyticsRange, CareCircleAnalytics, MemberSummary } from "@/lib/types";

const BLUE = "#2563EB";
const GREEN = "#16A34A";
const RED = "#DC2626";
const YELLOW = "#D97706";
const ORANGE = "#F97316";
// Categorical series palette (charts legitimately need distinct hues per member/type).
const SERIES_COLORS = [BLUE, GREEN, YELLOW, ORANGE, RED, "#0891B2", "#7C3AED", "#BE185D"];

const RANGES: Array<{ value: AnalyticsRange; label: string }> = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "6m", label: "Last 6 months" }
];

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function shortMonth(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" }).format(new Date(`${value}T00:00:00`));
}

function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AnalyticsView() {
  const { activeCircle } = useActiveCircle();
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [analytics, setAnalytics] = useState<CareCircleAnalytics | null>(null);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

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

      {canView && analytics ? (
        <div className="mt-6 space-y-8">
          <TasksSection analytics={analytics} nameFor={nameFor} />
          <DocumentationSection analytics={analytics} careCircleId={careCircleId} personId={activeCircle.person?.id ?? null} />
          <ActivitySection analytics={analytics} nameFor={nameFor} />
        </div>
      ) : null}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-md font-semibold text-neutral-900">{children}</h2>;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h3 className="text-sm font-semibold text-neutral-700">{title}</h3>
      <div className="mt-3 h-64 w-full">{children}</div>
    </Card>
  );
}

function TasksSection({
  analytics,
  nameFor
}: {
  analytics: CareCircleAnalytics;
  nameFor: (userId: string) => string;
}) {
  const createdCompleted = analytics.tasks.created_completed_by_week.map((row) => ({
    week: shortDate(row.week),
    created: row.created,
    completed: row.completed
  }));
  const overdue = analytics.tasks.overdue_by_week.map((row) => ({ week: shortDate(row.week), missed: row.missed }));

  return (
    <section className="space-y-4">
      <SectionTitle>Tasks</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Created vs completed by week">
          <ResponsiveContainer>
            <BarChart data={createdCompleted}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#9CA3AF" />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="created" name="Created" fill={BLUE} radius={[2, 2, 0, 0]} />
              <Bar dataKey="completed" name="Completed" fill={GREEN} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Overdue (missed) tasks by week">
          <ResponsiveContainer>
            <LineChart data={overdue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#9CA3AF" />
              <Tooltip />
              <Line type="monotone" dataKey="missed" name="Missed" stroke={RED} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card>
        <h3 className="text-sm font-semibold text-neutral-700">By assignee</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs font-semibold text-neutral-500">
                <th className="py-2 pr-4">Member</th>
                <th className="py-2 pr-4">Assigned</th>
                <th className="py-2 pr-4">Completed</th>
                <th className="py-2 pr-4">Missed</th>
                <th className="py-2 pr-4">Completion rate</th>
              </tr>
            </thead>
            <tbody>
              {analytics.tasks.by_assignee.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-3 text-neutral-500">
                    No assigned tasks in this range.
                  </td>
                </tr>
              ) : (
                analytics.tasks.by_assignee.map((row) => {
                  const rate = row.assigned > 0 ? Math.round((row.completed / row.assigned) * 100) : 0;
                  return (
                    <tr key={row.user_id} className="border-b border-neutral-100">
                      <td className="py-2 pr-4 font-medium text-neutral-900">{nameFor(row.user_id)}</td>
                      <td className="py-2 pr-4 text-neutral-600">{row.assigned}</td>
                      <td className="py-2 pr-4 text-neutral-600">{row.completed}</td>
                      <td className="py-2 pr-4 text-neutral-600">{row.missed}</td>
                      <td className="py-2 pr-4 text-neutral-900">{rate}%</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {analytics.tasks.keywords.length > 0 ? (
        <Card>
          <h3 className="text-sm font-semibold text-neutral-700">Most common words in overdue tasks</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {analytics.tasks.keywords.map((keyword) => (
              <span
                key={keyword.word}
                className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-700"
              >
                {keyword.word}
                <span className="text-neutral-400">{keyword.count}</span>
              </span>
            ))}
          </div>
        </Card>
      ) : null}
    </section>
  );
}

function DocumentationSection({
  analytics,
  careCircleId,
  personId
}: {
  analytics: CareCircleAnalytics;
  careCircleId: string | null;
  personId: string | null;
}) {
  const uploads = analytics.documents.uploads_by_month.map((row) => ({ month: shortMonth(row.month), count: row.count }));
  const byType = analytics.documents.by_type.map((row) => ({ name: labelize(row.type), value: row.count }));

  return (
    <section className="space-y-4">
      <SectionTitle>Documentation</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Documents uploaded per month">
          <ResponsiveContainer>
            <BarChart data={uploads}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#9CA3AF" />
              <Tooltip />
              <Bar dataKey="count" name="Uploaded" fill={BLUE} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Documents by type">
          {byType.length === 0 ? (
            <p className="text-sm text-neutral-500">No documents yet.</p>
          ) : (
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byType} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {byType.map((entry, index) => (
                    <Cell key={entry.name} fill={SERIES_COLORS[index % SERIES_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <Card className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-neutral-900">Expiring in the next 90 days</p>
          <p className="text-sm text-neutral-500">Documents with an expiry date approaching.</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-2xl font-bold text-neutral-900">{analytics.documents.expiring_90d}</span>
          {careCircleId && personId ? (
            <Link
              href={`/documents?smartView=expiring`}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              View documents
            </Link>
          ) : null}
        </div>
      </Card>
    </section>
  );
}

function ActivitySection({
  analytics,
  nameFor
}: {
  analytics: CareCircleAnalytics;
  nameFor: (userId: string) => string;
}) {
  const memberIds = Array.from(new Set(analytics.activity.timeline_by_member_month.map((row) => row.user_id)));
  const months = Array.from(new Set(analytics.activity.timeline_by_member_month.map((row) => row.month))).sort();
  const stacked = months.map((month) => {
    const row: Record<string, string | number> = { month: shortMonth(month) };
    for (const userId of memberIds) {
      const entry = analytics.activity.timeline_by_member_month.find(
        (item) => item.month === month && item.user_id === userId
      );
      row[userId] = entry?.count ?? 0;
    }
    return row;
  });
  const checkins = analytics.activity.checkins_by_week.map((row) => ({ week: shortDate(row.week), count: row.count }));

  return (
    <section className="space-y-4">
      <SectionTitle>Activity</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Timeline entries per member per month">
          {memberIds.length === 0 ? (
            <p className="text-sm text-neutral-500">No activity in this range.</p>
          ) : (
            <ResponsiveContainer>
              <BarChart data={stacked}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#9CA3AF" />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {memberIds.map((userId, index) => (
                  <Bar
                    key={userId}
                    dataKey={userId}
                    name={nameFor(userId)}
                    stackId="activity"
                    fill={SERIES_COLORS[index % SERIES_COLORS.length]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Check-ins per week">
          <ResponsiveContainer>
            <BarChart data={checkins}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#9CA3AF" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#9CA3AF" />
              <Tooltip />
              <Bar dataKey="count" name="Check-ins" fill={GREEN} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </section>
  );
}
