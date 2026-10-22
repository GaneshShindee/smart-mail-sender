import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { analyticsOverview } from "@/lib/history.functions";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Page, PageHeader } from "@/components/app/page";
import { StatCard } from "@/components/app/stat-card";
import { SectionCard } from "@/components/app/section-card";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { SegmentedControl } from "@/components/app/segmented-control";
import { useState } from "react";
import { Send, Eye, Users, AlertTriangle, TrendingUp, BarChart3, LayoutTemplate } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Smart Email Sender" }] }),
  component: AnalyticsPage,
});

/* Brutal chart chrome — tokens only (oklch vars are used directly, never wrapped in hsl()). */
const AXIS_TICK = { fill: "var(--foreground)", fontFamily: "var(--font-mono)", fontSize: 12 };
const AXIS_LINE = { stroke: "var(--foreground)", strokeWidth: 2 };
const GRID_STROKE = "color-mix(in oklab, var(--foreground) 15%, transparent)";
const TOOLTIP_STYLE = {
  background: "var(--card)",
  color: "var(--card-foreground)",
  border: "2px solid var(--border)",
  borderRadius: 0,
  boxShadow: "var(--shadow-brutal-sm)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
};

function AnalyticsPage() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const fn = useServerFn(analyticsOverview);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["analytics", days],
    queryFn: () => fn({ data: { days } }),
  });

  const totals = data?.totals;
  const openRate = totals ? Math.round(totals.openRate * 100) : 0;
  const maxTemplateSent = Math.max(1, ...(data?.topTemplates ?? []).map((t) => t.sent));

  return (
    <Page>
      <PageHeader
        eyebrow="04 · You · Scoreboard"
        title="Analytics"
        icon={BarChart3}
        description="Sends, deliveries, and opens over time."
        actions={
          <SegmentedControl
            value={String(days) as "7" | "30" | "90"}
            onValueChange={(v) => setDays(Number(v) as 7 | 30 | 90)}
            ariaLabel="Time period"
            options={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
            ]}
          />
        }
      />

      {isError ? (
        <ErrorState title="Couldn't load analytics" error={error} onRetry={() => refetch()} retrying={isFetching} />
      ) : (
        <>
          {/* ── Scoreboard ─────────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <StatCard
              size="hero"
              tone="primary"
              icon={TrendingUp}
              label="Open rate"
              value={`${openRate}%`}
              hint={`${totals?.uniqueOpened ?? 0} of ${totals?.trackedSent ?? 0} tracked emails opened · last ${days} days`}
              loading={isLoading}
            />
            <div className="grid grid-cols-2 gap-4">
              <StatCard icon={Send} label="Sent" value={totals?.sent ?? 0} loading={isLoading} />
              <StatCard icon={Users} label="Recipients" value={totals?.recipients ?? 0} loading={isLoading} />
              <StatCard icon={Eye} label="Total opens" value={totals?.opens ?? 0} tone="info" loading={isLoading} />
              <StatCard
                icon={AlertTriangle}
                label="Failed"
                value={totals?.failed ?? 0}
                tone={(totals?.failed ?? 0) > 0 ? "danger" : "default"}
                loading={isLoading}
              />
            </div>
          </div>

          {/* ── Sends vs opens ─────────────────────────────────── */}
          <SectionCard
            index="01"
            title="Sends & opens per day"
            description="Sent = solid area · Opens = dashed line"
          >
            <div className="h-72">
              {isLoading || !data ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.series} margin={{ left: -8, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid stroke={GRID_STROKE} strokeDasharray="4 4" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) => d.slice(5)}
                      tick={AXIS_TICK}
                      axisLine={AXIS_LINE}
                      tickLine={{ stroke: "var(--foreground)" }}
                      minTickGap={16}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={AXIS_TICK}
                      axisLine={AXIS_LINE}
                      tickLine={{ stroke: "var(--foreground)" }}
                      width={36}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={{ fontWeight: 700, marginBottom: 4 }}
                      cursor={{ stroke: "var(--foreground)", strokeWidth: 1, strokeDasharray: "3 3" }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={32}
                      iconType="square"
                      wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 12, textTransform: "uppercase" }}
                      formatter={(value: string) => <span style={{ color: "var(--foreground)" }}>{value}</span>}
                    />
                    <Area
                      type="monotone"
                      dataKey="sent"
                      name="Sent"
                      stroke="var(--chart-1)"
                      fill="var(--chart-1)"
                      fillOpacity={0.18}
                      strokeWidth={2}
                      activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="opens"
                      name="Opens"
                      stroke="var(--chart-2)"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
            {data && (
              <details className="border-t-2 border-dashed border-border/40 pt-3">
                <summary className="cursor-pointer font-mono text-xs font-semibold uppercase tracking-[0.08em]">
                  View as table
                </summary>
                <div className="mt-3 max-h-64 overflow-auto border-2 border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted">
                      <tr className="border-b-2 border-border text-left font-mono text-xs uppercase tracking-[0.08em]">
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2 text-right">Sent</th>
                        <th className="px-3 py-2 text-right">Opens</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {data.series.map((d) => (
                        <tr key={d.date}>
                          <td className="tabular px-3 py-1.5 text-xs">{d.date}</td>
                          <td className="tabular px-3 py-1.5 text-right text-xs">{d.sent}</td>
                          <td className="tabular px-3 py-1.5 text-right text-xs">{d.opens}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </SectionCard>

          {/* ── Top templates (ranked list with inline bars) ──── */}
          <SectionCard index="02" title="Top templates" description="Ranked by sends in this period">
            {isLoading || !data ? (
              <div className="space-y-3" aria-busy="true" aria-label="Loading templates">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : data.topTemplates.length === 0 ? (
              <EmptyState
                framed={false}
                className="py-8"
                icon={LayoutTemplate}
                title="No sends in this range yet"
                description="Try a longer period, or send a campaign to start the scoreboard."
              />
            ) : (
              <ol className="divide-y divide-border/20">
                {data.topTemplates.map((t, i) => (
                  <li key={t.name} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 py-3 first:pt-0 last:pb-0">
                    <span className="font-expanded text-xl leading-none tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold">{t.name}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="outline">{t.sent} sent</Badge>
                          <Badge variant="info">{Math.round(t.openRate * 100)}% open</Badge>
                        </div>
                      </div>
                      <div className="h-3 border-2 border-border bg-background" aria-hidden>
                        <div className="h-full bg-chart-1" style={{ width: `${(t.sent / maxTemplateSent) * 100}%` }} />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </>
      )}
    </Page>
  );
}
