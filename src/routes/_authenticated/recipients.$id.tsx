import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRecipient, getRecipientThread, type ThreadMessage } from "@/lib/history.functions";
import { listTemplates } from "@/lib/templates.functions";
import { getUserPreferences } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Page } from "@/components/app/page";
import { SegmentedControl } from "@/components/app/segmented-control";
import { StatCard } from "@/components/app/stat-card";
import {
  ArrowLeft,
  Eye,
  Flame,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Reply,
  Zap,
  MessagesSquare,
  History,
  ListOrdered,
  Timer,
  FileText,
  UserX,
  MailOpen,
  Send,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { relativeTime } from "@/lib/user-agent";
import { cn } from "@/lib/utils";
import { BulkReplyDialog } from "@/components/bulk-reply-dialog";

export const Route = createFileRoute("/_authenticated/recipients/$id")({
  head: () => ({ meta: [{ title: "Recipient — Smart Email Sender" }] }),
  errorComponent: ({ error }) => (
    <Page>
      <BackLink />
      <ErrorState title="Couldn't open this recipient" error={error} />
    </Page>
  ),
  notFoundComponent: () => <RecipientNotFound />,
  component: RecipientDetailsPage,
});

type OpenRow = {
  id: string;
  opened_at: string;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  ip: string | null;
};

type DossierTab = "thread" | "opens" | "timeline";

function BackLink({ campaignId }: { campaignId?: string }) {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      {campaignId ? (
        <Link to="/campaigns/$id" params={{ id: campaignId }}>
          <ArrowLeft aria-hidden /> Back to campaign
        </Link>
      ) : (
        <Link to="/history">
          <ArrowLeft aria-hidden /> Back to history
        </Link>
      )}
    </Button>
  );
}

function RecipientNotFound() {
  return (
    <Page>
      <BackLink />
      <EmptyState
        icon={UserX}
        title="Recipient not found"
        description="This recipient may have been deleted along with its campaign."
        action={
          <Button asChild>
            <Link to="/history">Go to history</Link>
          </Button>
        }
      />
    </Page>
  );
}

function RecipientDetailsPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const fn = useServerFn(getRecipient);
  const threadFn = useServerFn(getRecipientThread);
  const templatesFn = useServerFn(listTemplates);
  const prefsFn = useServerFn(getUserPreferences);
  const recipientQuery = useQuery({ queryKey: ["recipient", id], queryFn: () => fn({ data: { id } }) });
  const { data, isLoading } = recipientQuery;
  const threadQuery = useQuery({
    queryKey: ["recipient-thread", id],
    queryFn: () => threadFn({ data: { id } }),
  });
  const { data: thread, isLoading: loadingThread } = threadQuery;
  const { data: templates } = useQuery({ queryKey: ["templates"], queryFn: () => templatesFn({}) });
  const { data: prefs } = useQuery({ queryKey: ["user-prefs"], queryFn: () => prefsFn() });
  const [search, setSearch] = useState("");
  const [device, setDevice] = useState("all");
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyMode, setReplyMode] = useState<"free" | "template" | "followup">("followup");
  const [tab, setTab] = useState<DossierTab>("thread");

  const openReply = (mode: "free" | "template" | "followup" = "free") => {
    setReplyMode(mode);
    setReplyOpen(true);
  };

  const filtered = useMemo(() => {
    const opens = (data?.opens ?? []) as OpenRow[];
    return opens.filter((o) => {
      if (device !== "all" && (o.device_type ?? "Unknown") !== device) return false;
      if (search) {
        const hay = `${o.browser ?? ""} ${o.os ?? ""} ${o.country ?? ""} ${o.city ?? ""} ${o.region ?? ""} ${o.ip ?? ""}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [data, device, search]);

  if (recipientQuery.isError) {
    const message = (recipientQuery.error as Error)?.message ?? "";
    if (/not found/i.test(message)) return <RecipientNotFound />;
    return (
      <Page>
        <BackLink />
        <ErrorState
          title="Couldn't load this recipient"
          error={recipientQuery.error}
          onRetry={() => recipientQuery.refetch()}
          retrying={recipientQuery.isFetching}
        />
      </Page>
    );
  }

  if (isLoading || !data) {
    return (
      <Page size="wide">
        <Skeleton className="h-9 w-44" />
        <div className="grid gap-6 lg:grid-cols-5">
          <Skeleton className="h-72 w-full lg:col-span-2" />
          <div className="space-y-4 lg:col-span-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
        <Skeleton className="h-96 w-full" />
      </Page>
    );
  }
  const { recipient, campaign, opens } = data;
  const opensTyped = opens as OpenRow[];

  // Stats.
  const total = opensTyped.length;
  const first = opensTyped[0]?.opened_at ?? recipient.first_opened_at;
  const last = opensTyped[opensTyped.length - 1]?.opened_at ?? recipient.last_opened_at;
  const avgMs = (() => {
    if (opensTyped.length < 2) return null;
    let sum = 0;
    for (let i = 1; i < opensTyped.length; i++) {
      sum += new Date(opensTyped[i].opened_at).getTime() - new Date(opensTyped[i - 1].opened_at).getTime();
    }
    return sum / (opensTyped.length - 1);
  })();
  const mostUsed = (key: keyof OpenRow) => {
    const counts = new Map<string, number>();
    for (const o of opensTyped) {
      const v = (o[key] as string | null) ?? "Unknown";
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  };
  const mostDevice = mostUsed("device_type");
  const mostBrowser = mostUsed("browser");
  const mostDay = (() => {
    const counts = new Map<string, number>();
    for (const o of opensTyped) {
      const d = new Date(o.opened_at).toLocaleDateString(undefined, { weekday: "long" });
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  })();

  const insight = ((): { icon: LucideIcon; label: string; desc: string } | null => {
    if (total === 0) return null;
    if (last) {
      const minsSince = (Date.now() - new Date(last).getTime()) / 60_000;
      if (minsSince < 60) return { icon: Zap, label: "Recently Active", desc: `Opened ${relativeTime(last)}.` };
    }
    if (total >= 5 && first && last) {
      const days = (new Date(last).getTime() - new Date(first).getTime()) / (1000 * 60 * 60 * 24);
      if (days <= 2) return { icon: Flame, label: "Very High Interest", desc: `Opened ${total} times in ${Math.max(1, Math.round(days))} day${days > 1 ? "s" : ""}.` };
    }
    if (total >= 3) return { icon: Eye, label: "Frequently Revisiting", desc: `Viewed ${total} times.` };
    return null;
  })();

  const startFollowUp = () => openReply("followup");

  const hot = total >= 3;
  const messageCount = thread?.messages.length;

  return (
    <Page size="wide">
      <BackLink campaignId={recipient.email_history_id} />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Identity block */}
        <section
          aria-labelledby="dossier-title"
          className="border-2 border-border bg-card shadow-[var(--shadow-brutal)] lg:col-span-2"
        >
          <div className="flex items-center justify-between gap-2 border-b-2 border-border bg-secondary px-4 py-2 text-secondary-foreground">
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.1em]">
              02 · Outreach · Dossier
            </span>
            {total === 0 ? (
              <Badge variant="muted">Not opened</Badge>
            ) : (
              <Badge variant="info">
                <Eye aria-hidden />
                {total} open{total === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
          <div className="space-y-5 p-4 sm:p-5">
            <div>
              <h1 id="dossier-title" className="font-expanded text-2xl leading-tight break-all sm:text-3xl">
                {recipient.email}
              </h1>
              {(recipient.name || recipient.role || recipient.company) && (
                <p className="mt-2 font-mono text-sm break-words text-muted-foreground">
                  {[recipient.name, recipient.role, recipient.company].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            {insight && (
              <div className="flex items-start gap-4">
                <span className="stamp inline-flex shrink-0 items-center gap-2 bg-card px-3 py-1.5 text-sm text-destructive">
                  <insight.icon className="size-4" strokeWidth={2.4} aria-hidden />
                  {insight.label}
                </span>
                <p className="pt-1 text-xs text-muted-foreground">{insight.desc}</p>
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => openReply("free")} size="lg" className="w-full sm:flex-1">
                <Reply aria-hidden />
                Reply in thread
              </Button>
              <Button onClick={startFollowUp} size="lg" variant="outline" className="w-full sm:flex-1">
                {hot ? <Flame aria-hidden /> : <Send aria-hidden />}
                {hot ? "Follow-up recommended" : "Follow-up"}
              </Button>
            </div>
          </div>
        </section>

        {/* Numbers + facts */}
        <div className="min-w-0 space-y-4 lg:col-span-3">
          <section
            aria-label="Open stats"
            className="grid grid-cols-2 gap-0.5 border-2 border-border bg-border shadow-[var(--shadow-brutal)] sm:grid-cols-4"
          >
            <StatCard flat size="compact" tone={hot ? "primary" : "default"} className="border-0" label="Opens" value={String(total)} icon={MailOpen} />
            <StatCard flat size="compact" className="border-0" label="Avg gap" value={avgMs != null ? formatDuration(avgMs) : "—"} icon={Timer} />
            <StatCard flat size="compact" className="border-0" label="Device" value={mostDevice} icon={deviceIcon(mostDevice)} />
            <StatCard flat size="compact" className="border-0" label="Browser" value={mostBrowser} icon={Globe} />
          </section>

          <dl className="divide-y divide-border/20 border-2 border-border bg-card">
            <Fact term="First open" value={first ? new Date(first).toLocaleString() : "—"} mono />
            <Fact term="Last open" value={last ? new Date(last).toLocaleString() : "—"} mono />
            <Fact term="Most active day" value={mostDay} />
            <Fact
              term="Campaign"
              value={
                campaign?.subject ? (
                  <Link
                    to="/campaigns/$id"
                    params={{ id: recipient.email_history_id }}
                    className="underline decoration-2 underline-offset-4 hover:bg-accent"
                  >
                    {campaign.subject}
                  </Link>
                ) : (
                  "—"
                )
              }
            />
          </dl>
        </div>
      </div>

      <section aria-label="Recipient activity" className="space-y-4">
        <SegmentedControl<DossierTab>
          value={tab}
          onValueChange={setTab}
          ariaLabel="Recipient activity view"
          options={[
            { value: "thread", label: "Thread", icon: MessagesSquare, count: messageCount },
            { value: "opens", label: "Opens", icon: ListOrdered, count: total },
            { value: "timeline", label: "Timeline", icon: History },
          ]}
        />

        {tab === "thread" && (
          <div className="space-y-3">
            {threadQuery.isError ? (
              <ErrorState
                title="Couldn't load the conversation"
                error={threadQuery.error}
                onRetry={() => threadQuery.refetch()}
                retrying={threadQuery.isFetching}
              />
            ) : loadingThread ? (
              <>
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full sm:ml-8 sm:w-[calc(100%-2rem)]" />
              </>
            ) : (thread?.messages ?? []).length === 0 ? (
              <EmptyState
                icon={MessagesSquare}
                title="No messages yet"
                description="No messages recorded for this recipient yet."
                action={
                  <Button onClick={() => openReply("free")}>
                    <Reply aria-hidden /> Reply
                  </Button>
                }
              />
            ) : (
              (thread?.messages as ThreadMessage[]).map((m) => <ThreadBubble key={`${m.direction}-${m.id}`} m={m} />)
            )}
          </div>
        )}

        {tab === "opens" && (
          <div className="border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
            <div className="flex flex-col gap-3 border-b-2 border-border bg-muted p-3 sm:flex-row sm:items-end sm:p-4">
              <div className="w-full space-y-1.5 sm:flex-1">
                <Label htmlFor="opens-search" className="eyebrow">Search opens</Label>
                <Input
                  id="opens-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Browser, OS, location, IP…"
                />
              </div>
              <div className="w-full space-y-1.5 sm:w-44">
                <Label htmlFor="opens-device" className="eyebrow">Device</Label>
                <Select value={device} onValueChange={setDevice}>
                  <SelectTrigger id="opens-device" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All devices</SelectItem>
                    <SelectItem value="Desktop">Desktop</SelectItem>
                    <SelectItem value="Mobile">Mobile</SelectItem>
                    <SelectItem value="Tablet">Tablet</SelectItem>
                    <SelectItem value="Bot">Bot</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="border-b border-border/20 px-4 py-2 font-mono text-xs uppercase tracking-[0.08em]">
              Complete open history · {filtered.length} of {total}
            </p>

            {filtered.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  framed={false}
                  icon={Eye}
                  title={total === 0 ? "No opens yet" : "No opens match"}
                  description={
                    total === 0
                      ? "No opens yet. When the recipient views this email, every open will appear here."
                      : "No opens match your filters."
                  }
                  action={
                    total > 0 ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearch("");
                          setDevice("all");
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <>
                <ul className="divide-y divide-border/20 md:hidden">
                  {filtered.map((o, i) => (
                    <li key={o.id} className="flex items-start gap-3 px-4 py-3">
                      <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">#{i + 1}</span>
                      <DeviceIcon type={o.device_type} />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="font-mono text-sm font-semibold">{new Date(o.opened_at).toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">{relativeTime(o.opened_at)}</div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span>{o.device_type ?? "Unknown"}</span>
                          <span>{o.browser ?? "Unknown browser"}</span>
                          <span>{o.os ?? "Unknown OS"}</span>
                          {(o.city || o.country) && (
                            <span className="inline-flex items-center gap-1">
                              <Globe className="size-3" aria-hidden />
                              {[o.city, o.region, o.country].filter(Boolean).join(", ")}
                            </span>
                          )}
                          {o.ip && <span className="font-mono text-xs">{o.ip}</span>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Device</TableHead>
                        <TableHead>Browser</TableHead>
                        <TableHead>OS</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>IP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((o, i) => (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <span className="block font-mono text-xs font-semibold">
                              {new Date(o.opened_at).toLocaleString()}
                            </span>
                            <span className="block text-xs text-muted-foreground">{relativeTime(o.opened_at)}</span>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5 text-sm">
                              <DeviceIcon type={o.device_type} />
                              {o.device_type ?? "Unknown"}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">{o.browser ?? "Unknown browser"}</TableCell>
                          <TableCell className="text-sm">{o.os ?? "Unknown OS"}</TableCell>
                          <TableCell className="text-sm">
                            {o.city || o.country ? [o.city, o.region, o.country].filter(Boolean).join(", ") : "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{o.ip ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "timeline" && (
          <div className="border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal)] sm:p-6">
            <ol className="relative space-y-5 border-l-4 border-border pl-6">
              <TimelineNode label="Email Sent" when={campaign?.sent_at ?? recipient.first_opened_at} accent />
              {opensTyped.map((o, i) => (
                <TimelineNode key={o.id} label={`Open #${i + 1}`} when={o.opened_at} />
              ))}
              {opensTyped.length === 0 && (
                <li className="text-xs text-muted-foreground">Timeline will populate as opens arrive.</li>
              )}
            </ol>
          </div>
        )}
      </section>

      <BulkReplyDialog
        open={replyOpen}
        onOpenChange={setReplyOpen}
        recipients={[
          {
            id: recipient.id,
            email: recipient.email,
            name: recipient.name,
            subject: campaign?.subject ?? "",
          },
        ]}
        templates={(templates ?? []).map((t: { id: string; name: string; body: string | null; is_default?: boolean }) => ({
          id: t.id,
          name: t.name,
          body: t.body ?? "",
          is_default: !!t.is_default,
        }))}
        followUpTemplateId={prefs?.followUpTemplateId ?? null}
        initialMode={replyMode}
        onDone={() => {
          void queryClient.invalidateQueries({ queryKey: ["recipient-thread", id] });
          void queryClient.invalidateQueries({ queryKey: ["recipient", id] });
        }}
      />
    </Page>
  );
}

function Fact({ term, value, mono }: { term: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-1 px-4 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="eyebrow">{term}</dt>
      <dd className={cn("min-w-0 break-words text-sm", mono && "font-mono")}>{value}</dd>
    </div>
  );
}

function ThreadBubble({ m }: { m: ThreadMessage }) {
  const outgoing = m.direction === "outgoing";
  return (
    <article
      className={cn(
        "border-2 border-border p-3 shadow-[var(--shadow-brutal-sm)] sm:p-4",
        outgoing ? "bg-card sm:mr-8" : "bg-info-subtle sm:ml-8",
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold uppercase tracking-[0.08em]">
          {outgoing ? (m.is_original ? "You sent the original email" : "You replied") : "They replied"}
        </span>
        <time className="font-mono text-xs text-muted-foreground" dateTime={m.at}>
          {new Date(m.at).toLocaleString()}
        </time>
      </header>
      {m.subject && <div className="mt-1 truncate text-sm font-semibold">{m.subject}</div>}
      <div className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap border-t border-border/20 pt-2 text-sm">
        {m.body || "(no content)"}
      </div>
      {outgoing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!m.tracking_enabled ? (
            <Badge variant="outline">Tracking off</Badge>
          ) : m.open_count > 0 ? (
            <>
              <Badge variant="info"><Eye aria-hidden />Viewed {m.open_count}×</Badge>
              <span className="font-mono text-xs text-muted-foreground">
                last {m.last_opened_at ? relativeTime(m.last_opened_at) : "—"}
              </span>
            </>
          ) : (
            <Badge variant="muted">Not viewed yet</Badge>
          )}
          {m.pdf_view_count > 0 && (
            <Badge variant="highlight"><FileText aria-hidden />Resume viewed {m.pdf_view_count}×</Badge>
          )}
        </div>
      )}
    </article>
  );
}

function TimelineNode({ label, when, accent }: { label: string; when: string | null | undefined; accent?: boolean }) {
  return (
    <li className="relative">
      <span
        aria-hidden
        className={cn(
          "absolute -left-[2.125rem] top-0.5 size-4 border-2 border-border",
          accent ? "bg-primary" : "bg-card",
        )}
      />
      <div className="font-expanded text-sm leading-tight">{label}</div>
      <div className="font-mono text-xs text-muted-foreground">{when ? new Date(when).toLocaleString() : "—"}</div>
    </li>
  );
}

function deviceIcon(type: string | null): LucideIcon {
  if (type === "Mobile") return Smartphone;
  if (type === "Tablet") return Tablet;
  return Monitor;
}

function DeviceIcon({ type }: { type: string | null }) {
  const Icon = deviceIcon(type);
  return <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}
