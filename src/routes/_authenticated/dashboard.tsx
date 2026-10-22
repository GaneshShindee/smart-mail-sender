import { createFileRoute, Link } from "@tanstack/react-router";
import { NAV_ITEMS } from "@/lib/nav-items";
import { EmptyState as AppEmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { ErrorState } from "@/components/app/error-state";
import { Page, PageHeader } from "@/components/app/page";
import { SectionCard } from "@/components/app/section-card";
import { StatCard } from "@/components/app/stat-card";
import { BOTTOM_NAV_URLS } from "@/components/mobile-bottom-nav";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { dashboardStats, listCampaigns, type CampaignSummary } from "@/lib/history.functions";
import { getGmailStatus, startGmailConnect } from "@/lib/gmail.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Mail,
  Send,
  AlertTriangle,
  LayoutTemplate,
  Eye,
  Search,
  Users,
  FileText,
  Reply,
  Paperclip,
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  PenLine,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Smart Email Sender" }] }),
  component: Dashboard,
});

function Dashboard() {
  const statsFn = useServerFn(dashboardStats);
  const gmailFn = useServerFn(getGmailStatus);
  const startConnect = useServerFn(startGmailConnect);
  const listFn = useServerFn(listCampaigns);
  const [connecting, setConnecting] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const stats = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => statsFn() });
  const gmail = useQuery({ queryKey: ["gmail-status"], queryFn: () => gmailFn() });
  const campaigns = useQuery({
    queryKey: ["dashboard-campaigns", search, status],
    queryFn: () => listFn({ data: { search, status, limit: 500 } }),
  });
  const rows = (campaigns.data ?? []) as CampaignSummary[];
  const filtering = !!search || status !== "all";

  const onConnect = async () => {
    setConnecting(true);
    try {
      const { url } = await startConnect();
      window.location.href = url;
    } catch (e) {
      toast.error("Couldn't start Gmail connection", { description: (e as Error).message });
      setConnecting(false);
    }
  };

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const destinations = NAV_ITEMS.filter((item) => !BOTTOM_NAV_URLS.includes(item.url));

  return (
    <Page>
      <PageHeader
        eyebrow="01 · Overview"
        title="Dashboard"
        description="The front page of your outbox — what went out, what landed, and where to go next."
        meta={
          <span className="border-2 border-border bg-card px-2 py-1 font-mono text-xs uppercase tracking-[0.08em]">
            {today}
          </span>
        }
        actions={
          <Button asChild>
            <Link to="/send">
              <PenLine aria-hidden /> Compose
            </Link>
          </Button>
        }
      />

      {gmail.data && !gmail.data.connected && (
        <section
          aria-label="Gmail not connected"
          className="flex border-2 border-border bg-card shadow-[var(--shadow-brutal)]"
        >
          <div aria-hidden className="airmail w-2 shrink-0 border-r-2 border-border sm:w-3" />
          <div className="flex flex-1 flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center border-2 border-border bg-destructive-subtle">
                <Mail className="size-5" strokeWidth={2.2} aria-hidden />
              </div>
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-destructive">
                  Action needed
                </p>
                <h2 className="font-expanded text-lg leading-tight">Connect your Gmail account</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Grant send permission once. We'll handle token refresh from then on.
                </p>
              </div>
            </div>
            <Button onClick={onConnect} disabled={connecting} size="lg" className="w-full sm:w-auto">
              <Mail aria-hidden />
              {connecting ? "Redirecting…" : "Connect Gmail"}
            </Button>
          </div>
        </section>
      )}

      <section aria-label="Sending metrics">
        {stats.isError ? (
          <ErrorState
            title="Couldn't load your stats"
            error={stats.error}
            onRetry={() => stats.refetch()}
            retrying={stats.isFetching}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:grid-rows-2">
            <StatCard
              className="col-span-2 lg:row-span-2"
              size="hero"
              tone="primary"
              icon={Send}
              label="Total sent"
              value={stats.data?.sent ?? 0}
              hint={
                stats.data
                  ? `${stats.data.totalOpens} opens · ${Math.round((stats.data.openRate ?? 0) * 100)}% open rate`
                  : "Emails delivered from your outbox"
              }
              loading={stats.isLoading}
            />
            <StatCard
              icon={Eye}
              tone="info"
              label="Opens"
              value={stats.data?.totalOpens ?? 0}
              hint={stats.data ? `${Math.round((stats.data.openRate ?? 0) * 100)}% open rate` : undefined}
              loading={stats.isLoading}
            />
            <StatCard
              icon={AlertTriangle}
              tone={(stats.data?.failed ?? 0) > 0 ? "danger" : "default"}
              label="Failed"
              value={stats.data?.failed ?? 0}
              loading={stats.isLoading}
            />
            <StatCard
              icon={LayoutTemplate}
              label="Templates"
              value={stats.data?.templates ?? 0}
              loading={stats.isLoading}
            />
            <StatCard
              icon={Mail}
              tone={gmail.data && !gmail.data.connected ? "warning" : "default"}
              label="Gmail"
              value={
                <span className="text-xl sm:text-2xl">
                  {gmail.isError ? "Unknown" : gmail.data?.connected ? "Connected" : "Not connected"}
                </span>
              }
              hint={gmail.data?.email ?? "—"}
              loading={gmail.isLoading}
            />
          </div>
        )}
      </section>

      <section aria-labelledby="destinations-title" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 border-b-2 border-border pb-2">
          <h2 id="destinations-title" className="font-expanded text-lg">
            Index
          </h2>
          <span className="eyebrow">{destinations.length} destinations</span>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.map((item, i) => (
            <li key={item.url}>
              <Link
                to={item.url}
                className="brutal-press group flex h-full items-start gap-3 border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal-sm)] hover:bg-accent"
              >
                <span className="grid h-10 min-w-10 shrink-0 place-items-center bg-secondary px-1 font-mono text-sm font-bold text-secondary-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-expanded text-sm leading-tight">
                    <item.icon className="size-4 shrink-0" strokeWidth={2.2} aria-hidden />
                    {item.title}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 self-center" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <SectionCard
        id="campaign-ledger"
        icon={BookOpen}
        title="Campaign ledger"
        description={
          campaigns.isLoading
            ? "Loading…"
            : `${rows.length} campaign${rows.length === 1 ? "" : "s"}`
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/history">
              Full history <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
        contentClassName="p-0 sm:p-0 space-y-0"
      >
        <div className="flex flex-col gap-3 border-b-2 border-border bg-muted p-3 sm:flex-row sm:items-end sm:p-4">
          <div className="w-full space-y-1.5 sm:flex-1">
            <Label htmlFor="dashboard-campaign-search" className="eyebrow">
              Search
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="dashboard-campaign-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subject, recipient or template…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <Label htmlFor="dashboard-campaign-status" className="eyebrow">
              Status
            </Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="dashboard-campaign-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {campaigns.isError ? (
          <div className="p-4">
            <ErrorState
              title="Couldn't load campaigns"
              error={campaigns.error}
              onRetry={() => campaigns.refetch()}
              retrying={campaigns.isFetching}
            />
          </div>
        ) : campaigns.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : rows.length ? (
          <>
            <ul className="divide-y divide-border/20 md:hidden">
              {rows.map((c) => (
                <li key={c.id}>
                  <CampaignCard c={c} />
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Sender</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead className="text-right">Rcpts</TableHead>
                    <TableHead>Engagement</TableHead>
                    <TableHead className="text-right">Files</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => (
                    <CampaignRow key={c.id} c={c} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="p-4">
            <AppEmptyState
              icon={Send}
              title={filtering ? "No campaigns match" : "No emails yet"}
              description={
                filtering
                  ? "Try changing the search or status filter."
                  : "Once you send your first email, it will show up here."
              }
              action={
                filtering ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setStatus("all");
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button asChild>
                    <Link to="/send">Send an email</Link>
                  </Button>
                )
              }
            />
          </div>
        )}
      </SectionCard>
    </Page>
  );
}

/* ── Campaign ledger rows ─────────────────────────────────────────── */

function campaignTitle(c: CampaignSummary) {
  return c.role && c.company ? `${c.role} · ${c.company}` : c.role || c.company || c.subject;
}

function formatSentAt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Opens / resume views / replies as compact icon+number chips. */
function EngagementChips({ c }: { c: CampaignSummary }) {
  if (c.opened === 0 && c.resume_views === 0 && c.replied === 0) {
    return <span className="font-mono text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {c.opened > 0 && (
        <Badge variant="info" title="Recipients who opened">
          <Eye aria-hidden />
          {c.opened}/{c.recipients}
          <span className="sr-only"> opened</span>
        </Badge>
      )}
      {c.resume_views > 0 && (
        <Badge variant="highlight" title="Resume views">
          <FileText aria-hidden />
          {c.resume_views}
          <span className="sr-only"> resume views</span>
        </Badge>
      )}
      {c.replied > 0 && (
        <Badge variant="default" title="Replies">
          <Reply aria-hidden />
          {c.replied}
          <span className="sr-only"> replies</span>
        </Badge>
      )}
    </div>
  );
}

/** Desktop ledger row. The subject link stretches over the whole row, so the row is one keyboard stop. */
function CampaignRow({ c }: { c: CampaignSummary }) {
  return (
    <TableRow className="relative">
      <TableCell className="max-w-72">
        <Link
          to="/campaigns/$id"
          params={{ id: c.id }}
          className="block truncate font-semibold after:absolute after:inset-0 after:content-['']"
        >
          {campaignTitle(c)}
        </Link>
        {(c.role || c.company) && (
          <span className="block truncate text-xs text-muted-foreground">{c.subject}</span>
        )}
        {c.status === "failed" && c.error && (
          <span className="block truncate text-xs text-destructive">{c.error}</span>
        )}
      </TableCell>
      <TableCell className="max-w-48 truncate font-mono text-xs">
        {c.sender_email ?? "—"}
        {c.template_name && (
          <span className="block truncate text-muted-foreground">{c.template_name}</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap font-mono text-xs">{formatSentAt(c.sent_at)}</TableCell>
      <TableCell className="text-right font-mono text-sm tabular-nums">{c.recipients}</TableCell>
      <TableCell>
        <EngagementChips c={c} />
      </TableCell>
      <TableCell className="text-right font-mono text-sm tabular-nums">
        {c.attachment_count > 0 ? c.attachment_count : "—"}
      </TableCell>
      <TableCell>
        <StatusBadge status={c.status} />
      </TableCell>
    </TableRow>
  );
}

/** Mobile ledger entry: the whole card is a link. */
function CampaignCard({ c }: { c: CampaignSummary }) {
  return (
    <Link
      to="/campaigns/$id"
      params={{ id: c.id }}
      className="block space-y-2 px-4 py-3 transition-colors hover:bg-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block truncate font-semibold">{campaignTitle(c)}</span>
          {(c.role || c.company) && (
            <span className="block truncate text-xs text-muted-foreground">{c.subject}</span>
          )}
        </div>
        <StatusBadge status={c.status} className="shrink-0" />
      </div>
      <span className="block font-mono text-xs text-muted-foreground">
        {formatSentAt(c.sent_at)}
        {c.sender_email ? ` · ${c.sender_email}` : ""}
        {c.template_name ? ` · ${c.template_name}` : ""}
      </span>
      {c.status === "failed" && c.error && (
        <span className="block truncate text-xs text-destructive">{c.error}</span>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">
          <Users aria-hidden />
          {c.recipients}
          <span className="sr-only"> recipients</span>
        </Badge>
        {c.attachment_count > 0 && (
          <Badge variant="outline">
            <Paperclip aria-hidden />
            {c.attachment_count}
            <span className="sr-only"> attachments</span>
          </Badge>
        )}
        <EngagementChips c={c} />
      </div>
    </Link>
  );
}
