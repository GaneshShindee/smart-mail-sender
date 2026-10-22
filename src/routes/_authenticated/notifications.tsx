import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { notificationsFeed } from "@/lib/replies.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Page, PageHeader } from "@/components/app/page";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Bell, Eye, FileText, Reply, ArrowUpRight, type LucideIcon } from "lucide-react";
import { relativeTime } from "@/lib/user-agent";
import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Smart Email Sender" }] }),
  component: NotificationsPage,
});

type FeedItem = { id: string; type: string; time: string; title: string; sub: string; link?: string };

/** Type stamp per wire entry — icon + text, never colour alone. */
const TYPE_STAMP: Record<string, { label: string; icon: LucideIcon; surface: string }> = {
  open: { label: "Opened", icon: Eye, surface: "bg-info-subtle" },
  pdf: { label: "PDF viewed", icon: FileText, surface: "bg-highlight-subtle" },
  reply: { label: "Replied", icon: Reply, surface: "bg-primary text-primary-foreground" },
};

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Today";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function NotificationsPage() {
  const feedFn = useServerFn(notificationsFeed);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["notifications-feed"],
    queryFn: () => feedFn(),
  });

  // Client-side grouping by calendar day (feed is already newest-first).
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: FeedItem[] }[] = [];
    for (const n of (data ?? []) as FeedItem[]) {
      const key = dayKey(n.time);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(n);
      else out.push({ key, label: dayLabel(n.time), items: [n] });
    }
    return out;
  }, [data]);

  return (
    <Page size="narrow">
      <PageHeader
        eyebrow="01 · Overview · The wire"
        title="Notifications"
        icon={Bell}
        description="Opens, resume views and replies across your campaigns, newest first."
        meta={
          data ? (
            <span className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
              {data.length} dispatch{data.length === 1 ? "" : "es"}
            </span>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="space-y-3 border-l-2 border-border pl-6" aria-busy="true" aria-label="Loading notifications">
          <Skeleton className="h-6 w-28" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState title="Couldn't load the wire" error={error} onRetry={() => refetch()} retrying={isFetching} />
      ) : groups.length ? (
        <div className="space-y-10">
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`wire-${g.key}`}>
              <h2
                id={`wire-${g.key}`}
                className="inline-block border-2 border-border bg-secondary px-2 py-1 font-mono text-xs font-bold uppercase tracking-[0.1em] text-secondary-foreground"
              >
                {g.label}
              </h2>
              <ol className="relative ml-3 mt-2 space-y-3 border-l-2 border-border pb-1 pl-6 pt-3">
                {g.items.map((n) => (
                  <li key={n.id} className="relative">
                    <span
                      aria-hidden
                      className="absolute -left-[calc(1.5rem+7px)] top-5 size-3 border-2 border-border bg-card"
                    />
                    <WireEntry item={n} />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Bell}
          title="The wire is quiet"
          description="Sent-email opens, PDF views and replies show up here as they happen."
          action={
            <Button asChild>
              <Link to="/send">Send a campaign</Link>
            </Button>
          }
        />
      )}
    </Page>
  );
}

function WireEntry({ item: n }: { item: FeedItem }) {
  const stamp = TYPE_STAMP[n.type] ?? TYPE_STAMP.open;
  const Icon = stamp.icon;
  const inner: ReactNode = (
    <>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 border-[1.5px] border-border px-1.5 py-0.5 font-mono text-xs font-semibold uppercase leading-4 tracking-wide",
          stamp.surface,
        )}
      >
        <Icon className="size-3" strokeWidth={2.6} aria-hidden />
        {stamp.label}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{n.title}</span>
        {n.sub && <span className="block truncate text-xs text-muted-foreground">{n.sub}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <time dateTime={n.time} title={new Date(n.time).toLocaleString()} className="tabular text-xs text-muted-foreground">
          {relativeTime(n.time)}
        </time>
        {n.link && <ArrowUpRight className="size-4" aria-hidden />}
      </span>
    </>
  );
  const base =
    "flex flex-wrap items-center gap-x-3 gap-y-2 border-2 border-border bg-card px-3 py-3 sm:flex-nowrap";
  if (n.link) {
    return (
      <Link to={n.link} className={cn(base, "brutal-press shadow-[var(--shadow-brutal-sm)] hover:bg-accent")}>
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}
