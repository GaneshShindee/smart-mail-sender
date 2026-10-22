import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCampaign, listHistoryRecipients, setCampaignFollowupDay, setCampaignFollowupEnabled, type FollowupDay } from "@/lib/history.functions";
import { listTemplates } from "@/lib/templates.functions";
import { getUserPreferences } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Page, PageHeader } from "@/components/app/page";
import { SectionCard } from "@/components/app/section-card";
import { StatCard } from "@/components/app/stat-card";
import {
  Eye,
  Mail,
  Users,
  ArrowLeft,
  Flame,
  Paperclip,
  Search,
  FileText,
  Reply,
  CornerUpLeft,
  MailCheck,
  X,
  BellRing,
  BellOff,
  Percent,
  Check,
  MailQuestion,
  UserSearch,
} from "lucide-react";
import { relativeTime } from "@/lib/user-agent";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { defaultHistoryFilters, type HistoryFilters, type HistoryRecipientRow } from "@/lib/history-filters";
import { BulkReplyDialog, type BulkReplyRecipient } from "@/components/bulk-reply-dialog";

export const Route = createFileRoute("/_authenticated/campaigns/$id")({
  head: () => ({
    meta: [
      { title: "Campaign — Smart Email Sender" },
      { name: "description", content: "Recipients, opens, resume views and replies for this campaign." },
      { property: "og:title", content: "Campaign — Smart Email Sender" },
      { property: "og:description", content: "Filter recipients and reply in bulk, one personalized reply per person." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => (
    <Page>
      <BackToHistory />
      <ErrorState title="Couldn't open this campaign" error={error} />
    </Page>
  ),
  notFoundComponent: () => <CampaignNotFound />,
  component: CampaignDetailsPage,
});

function BackToHistory() {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link to="/history">
        <ArrowLeft aria-hidden /> Back to history
      </Link>
    </Button>
  );
}

function CampaignNotFound() {
  return (
    <Page>
      <BackToHistory />
      <EmptyState
        icon={MailQuestion}
        title="Campaign not found"
        description="It may have been deleted, or the link is wrong."
        action={
          <Button asChild>
            <Link to="/history">Go to history</Link>
          </Button>
        }
      />
    </Page>
  );
}

function CampaignDetailsPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const fn = useServerFn(getCampaign);
  const listFn = useServerFn(listHistoryRecipients);
  const templatesFn = useServerFn(listTemplates);
  const prefsFn = useServerFn(getUserPreferences);
  const setFollowupDayFn = useServerFn(setCampaignFollowupDay);
  const setFollowupEnabledFn = useServerFn(setCampaignFollowupEnabled);

  const [filters, setFilters] = useState<HistoryFilters>(defaultHistoryFilters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyMode, setReplyMode] = useState<"free" | "template" | "followup">("free");
  const [replyTargets, setReplyTargets] = useState<BulkReplyRecipient[] | null>(null);

  const campaignQuery = useQuery({ queryKey: ["campaign", id], queryFn: () => fn({ data: { id } }) });
  const { data, isLoading } = campaignQuery;
  const {
    data: recipientData,
    isLoading: loadingRecipients,
    isError: recipientsError,
    error: recipientsErr,
    isFetching: fetchingRecipients,
    refetch,
  } = useQuery({
    queryKey: ["campaign-recipients", id, filters],
    queryFn: () =>
      listFn({
        data: {
          campaignId: id,
          search: filters.search,
          openCount: filters.openCount,
          replyStatus: filters.replyStatus,
          resume: filters.resume,
          status: filters.status,
          limit: 2000,
        },
      }),
  });
  const { data: templates } = useQuery({ queryKey: ["templates"], queryFn: () => templatesFn({}) });
  const { data: prefs } = useQuery({ queryKey: ["user-prefs"], queryFn: () => prefsFn() });

  const toggleFollowupDay = useMutation({
    mutationFn: (vars: { day: number; done: boolean }) =>
      setFollowupDayFn({ data: { campaignId: id, day: vars.day, done: vars.done } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-history"] });
    },
    onError: (e) => toast.error("Couldn't update follow-up day", { description: (e as Error).message }),
  });

  const toggleFollowupEnabled = useMutation({
    mutationFn: (enabled: boolean) => setFollowupEnabledFn({ data: { campaignId: id, enabled } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-history"] });
    },
    onError: (e) => toast.error("Couldn't update follow-up tracking", { description: (e as Error).message }),
  });

  const rows = useMemo(() => (recipientData ?? []) as HistoryRecipientRow[], [recipientData]);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  const templateOptions = useMemo(
    () =>
      (templates ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        body: t.body ?? "",
        is_default: !!(t as { is_default?: boolean }).is_default,
      })),
    [templates],
  );

  const set = <K extends keyof HistoryFilters>(k: K, v: HistoryFilters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }));

  const toggle = (rid: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(rid)) next.delete(rid);
      else next.add(rid);
      return next;
    });

  const toReplyRecipient = (r: HistoryRecipientRow): BulkReplyRecipient => ({
    id: r.id,
    email: r.email,
    name: r.name,
    subject: r.subject,
  });

  const openReply = (targets: HistoryRecipientRow[], mode: "free" | "template" | "followup" = "free") => {
    setReplyTargets(targets.map(toReplyRecipient));
    setReplyMode(mode);
    setReplyOpen(true);
  };

  const followUp = (r: HistoryRecipientRow) => openReply([r], "followup");
  const replyOne = (r: HistoryRecipientRow) => openReply([r], "free");

  if (campaignQuery.isError) {
    const message = (campaignQuery.error as Error)?.message ?? "";
    if (/not found/i.test(message)) return <CampaignNotFound />;
    return (
      <Page>
        <BackToHistory />
        <ErrorState
          title="Couldn't load this campaign"
          error={campaignQuery.error}
          onRetry={() => campaignQuery.refetch()}
          retrying={campaignQuery.isFetching}
        />
      </Page>
    );
  }

  if (isLoading || !data) {
    return (
      <Page size="wide">
        <Skeleton className="h-9 w-40" />
        <div className="space-y-3 border-b-2 border-border pb-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-96 w-full lg:col-span-2" />
          <Skeleton className="h-96 w-full" />
        </div>
      </Page>
    );
  }
  const { campaign, recipients, followupDays } = data;
  const opened = recipients.filter((r) => (r.open_count ?? 0) > 0);
  const openRate = recipients.length ? opened.length / recipients.length : 0;
  const attachments = Array.isArray(campaign.attachments) ? (campaign.attachments as Array<{ name: string }>) : [];
  const filtering =
    !!filters.search ||
    filters.openCount !== defaultHistoryFilters.openCount ||
    filters.replyStatus !== defaultHistoryFilters.replyStatus ||
    filters.resume !== defaultHistoryFilters.resume;

  const signals = (r: HistoryRecipientRow) => {
    const opens = r.open_count;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {opens >= 3 && <HotStamp />}
        {r.pdf_view_count > 0 && (
          <Badge variant="highlight" title="Resume views">
            <FileText aria-hidden />
            {r.pdf_view_count}
            <span className="sr-only"> resume views</span>
          </Badge>
        )}
        {r.has_reply && <StatusBadge status="replied" />}
        {r.user_reply_sent && (
          <Badge variant="outline">
            <CornerUpLeft aria-hidden />You replied{r.user_reply_count > 1 ? ` ×${r.user_reply_count}` : ""}
          </Badge>
        )}
        {r.followup_count > 0 && (
          <Badge variant="outline" title="Follow-ups sent">
            <MailCheck aria-hidden />
            {r.followup_count}
            <span className="sr-only"> follow-ups sent</span>
          </Badge>
        )}
      </div>
    );
  };

  const rowButtons = (r: HistoryRecipientRow) => {
    const opens = r.open_count;
    const hot = opens >= 3;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => replyOne(r)}>
          <Reply aria-hidden />Reply
        </Button>
        {opens > 0 && !r.has_reply && (
          <Button size="sm" variant={hot ? "default" : "outline"} onClick={() => followUp(r)}>
            {hot && <Flame aria-hidden />}Follow-up
          </Button>
        )}
      </div>
    );
  };

  const opensLine = (r: HistoryRecipientRow) =>
    r.open_count > 0
      ? `${r.open_count}× · last ${r.last_opened_at ? relativeTime(r.last_opened_at) : "—"}`
      : "Not opened";

  return (
    <Page size="wide" className={cn(selectedRows.length > 0 && "pb-32")}>
      <BackToHistory />

      <PageHeader
        eyebrow="02 · Outreach · Dispatch report"
        title={campaign.subject}
        meta={
          <>
            <StatusBadge status={campaign.status} />
            <span className="font-mono text-xs text-muted-foreground">
              Sent {new Date(campaign.sent_at).toLocaleString()} · from {campaign.sender_email}
              {campaign.template_name ? ` · ${campaign.template_name}` : ""}
            </span>
          </>
        }
        className="-mt-4"
      />

      <section
        aria-label="Campaign stats"
        className="grid grid-cols-2 gap-0.5 border-2 border-border bg-border shadow-[var(--shadow-brutal)] lg:grid-cols-4"
      >
        <StatCard flat className="border-0" label="Recipients" value={String(recipients.length)} icon={Users} />
        <StatCard flat className="border-0" label="Opened" value={`${opened.length} / ${recipients.length}`} icon={Eye} />
        <StatCard
          flat
          className="border-0"
          tone="primary"
          label="Open rate"
          value={`${Math.round(openRate * 100)}%`}
          icon={Percent}
        />
        <StatCard flat className="border-0" label="Total opens" value={String(campaign.open_count ?? 0)} icon={Mail} />
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <SectionCard
          className="min-w-0 lg:col-span-2"
          id="campaign-recipients"
          icon={Users}
          title={`Recipients (${rows.length})`}
          description="Select people to reply in bulk — each gets an individual reply in their own thread."
          contentClassName="space-y-0 p-0 sm:p-0"
        >
          <div className="grid grid-cols-1 gap-3 border-b-2 border-border bg-muted p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2 xl:col-span-1">
              <Label htmlFor="recipient-search" className="eyebrow">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="recipient-search"
                  value={filters.search}
                  onChange={(e) => set("search", e.target.value)}
                  placeholder="Name, email, role, company…"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recipient-opens" className="eyebrow">Opens</Label>
              <Select value={filters.openCount} onValueChange={(v) => set("openCount", v as HistoryFilters["openCount"])}>
                <SelectTrigger id="recipient-opens" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any opens</SelectItem>
                  <SelectItem value="0">0 opens</SelectItem>
                  <SelectItem value="1+">1+ viewed</SelectItem>
                  <SelectItem value="1">1 open</SelectItem>
                  <SelectItem value="2">2 opens</SelectItem>
                  <SelectItem value="3+">3+ opens</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recipient-reply" className="eyebrow">Reply</Label>
              <Select value={filters.replyStatus} onValueChange={(v) => set("replyStatus", v as HistoryFilters["replyStatus"])}>
                <SelectTrigger id="recipient-reply" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any reply status</SelectItem>
                  <SelectItem value="replied">Replied</SelectItem>
                  <SelectItem value="not_replied">Not replied</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2 xl:col-span-1">
              <Label htmlFor="recipient-resume" className="eyebrow">Resume</Label>
              <Select value={filters.resume} onValueChange={(v) => set("resume", v as HistoryFilters["resume"])}>
                <SelectTrigger id="recipient-resume" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any resume view</SelectItem>
                  <SelectItem value="viewed">Resume viewed</SelectItem>
                  <SelectItem value="not_viewed">Resume not viewed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {recipientsError ? (
            <div className="p-4">
              <ErrorState
                title="Couldn't load recipients"
                error={recipientsErr}
                onRetry={() => refetch()}
                retrying={fetchingRecipients}
              />
            </div>
          ) : loadingRecipients ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={UserSearch}
                title={filtering ? "No recipients match" : "No recipients"}
                description={
                  filtering
                    ? "Try loosening the search or filters."
                    : "This campaign has no recipient records."
                }
                action={
                  filtering ? (
                    <Button variant="outline" onClick={() => setFilters(defaultHistoryFilters)}>
                      <X aria-hidden /> Clear filters
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-border/20 px-4 py-2 md:hidden">
                <Checkbox
                  id="select-all-mobile"
                  checked={allSelected}
                  onCheckedChange={(c) => setSelected(c ? new Set(rows.map((r) => r.id)) : new Set())}
                />
                <Label htmlFor="select-all-mobile" className="eyebrow">
                  Select all ({rows.length})
                </Label>
              </div>
              <ul className="divide-y divide-border/20 md:hidden">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className={cn("flex items-start gap-3 px-4 py-3", selected.has(r.id) && "bg-accent")}
                  >
                    <Checkbox
                      checked={selected.has(r.id)}
                      aria-label={`Select ${r.email}`}
                      onCheckedChange={() => toggle(r.id)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to="/recipients/$id"
                          params={{ id: r.id }}
                          className="min-w-0 hover:underline"
                        >
                          <span className="block truncate font-semibold">{r.name ?? r.email}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {r.email}{r.role ? ` · ${r.role}` : ""}{r.company ? ` · ${r.company}` : ""}
                          </span>
                        </Link>
                        <StatusBadge status={r.status} className="shrink-0" />
                      </div>
                      <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                        <Eye className="size-3.5" aria-hidden />
                        {opensLine(r)}
                      </div>
                      {signals(r)}
                      {rowButtons(r)}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          aria-label="Select all recipients"
                          onCheckedChange={(c) => setSelected(c ? new Set(rows.map((r) => r.id)) : new Set())}
                          className="border-secondary-foreground"
                        />
                      </TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Opens</TableHead>
                      <TableHead>Signals</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(r.id)}
                            aria-label={`Select ${r.email}`}
                            onCheckedChange={() => toggle(r.id)}
                          />
                        </TableCell>
                        <TableCell className="max-w-64">
                          <Link
                            to="/recipients/$id"
                            params={{ id: r.id }}
                            className="block truncate font-semibold hover:underline"
                          >
                            {r.name ?? r.email}
                          </Link>
                          <span className="block truncate text-xs text-muted-foreground">
                            {r.email}{r.role ? ` · ${r.role}` : ""}{r.company ? ` · ${r.company}` : ""}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{opensLine(r)}</TableCell>
                        <TableCell>{signals(r)}</TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">{rowButtons(r)}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </SectionCard>

        <div className="min-w-0 space-y-6">
          <FollowupTracker
            enabled={campaign.followup_enabled}
            days={followupDays}
            pending={toggleFollowupDay.isPending}
            enabledPending={toggleFollowupEnabled.isPending}
            onToggle={(day, done) => toggleFollowupDay.mutate({ day, done })}
            onToggleEnabled={(enabled) => toggleFollowupEnabled.mutate(enabled)}
          />

          <section
            aria-labelledby="postcard-title"
            className="relative border-2 border-border bg-card shadow-[var(--shadow-brutal)]"
          >
            <div aria-hidden className="airmail h-2 border-b-2 border-border" />
            <div
              aria-hidden
              className="perforated absolute right-3 top-5 grid size-14 rotate-6 place-items-center bg-primary p-1 text-primary-foreground"
            >
              <span className="grid size-full place-items-center border-2 border-current">
                <Mail className="size-5" strokeWidth={2.2} />
              </span>
            </div>
            <div className="space-y-4 p-4 sm:p-5">
              <div className="pr-16">
                <p className="eyebrow">Postcard · Email preview</p>
                <h2 id="postcard-title" className="mt-1 font-expanded text-base leading-tight break-words">
                  {campaign.subject}
                </h2>
              </div>
              <dl className="space-y-1 border-y border-border/20 py-2 font-mono text-xs">
                <div className="flex gap-2">
                  <dt className="w-12 shrink-0 uppercase text-muted-foreground">From</dt>
                  <dd className="min-w-0 truncate">{campaign.sender_email}</dd>
                </div>
                {attachments.length > 0 && (
                  <div className="flex gap-2">
                    <dt className="w-12 shrink-0 uppercase text-muted-foreground">
                      <Paperclip className="inline size-3.5" aria-hidden />
                      <span className="sr-only">Attachments</span>
                    </dt>
                    <dd className="min-w-0 break-words">{attachments.map((a) => a.name).join(", ")}</dd>
                  </div>
                )}
              </dl>
              <div className="max-h-96 overflow-auto whitespace-pre-wrap text-sm leading-relaxed">
                {campaign.body}
              </div>
              {campaign.error && (
                <div role="alert" className="border-2 border-border bg-destructive-subtle p-2 text-xs">
                  <span className="font-mono font-semibold uppercase">Error · </span>
                  {campaign.error}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {selectedRows.length > 0 && (
        <div className="fixed bottom-24 left-1/2 z-50 w-[min(680px,calc(100%-1.5rem))] -translate-x-1/2 md:bottom-6">
          <div
            role="region"
            aria-label="Bulk actions"
            className="flex items-center gap-2 border-2 border-border bg-secondary px-3 py-2.5 text-secondary-foreground shadow-[var(--shadow-brutal-lg)] sm:gap-3 sm:px-4"
          >
            <span className="shrink-0 font-mono text-sm font-bold uppercase tracking-[0.06em]">
              {selectedRows.length} selected
            </span>
            <span className="hidden text-xs opacity-80 sm:inline">
              Each gets an individual reply in their own thread
            </span>
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
              <X aria-hidden /> Clear
            </Button>
            <Button size="sm" onClick={() => openReply(selectedRows, "free")}>
              <Reply aria-hidden /> Reply
            </Button>
          </div>
        </div>
      )}

      <BulkReplyDialog
        open={replyOpen}
        onOpenChange={(o) => {
          setReplyOpen(o);
          if (!o) setReplyTargets(null);
        }}
        recipients={replyTargets ?? selectedRows.map(toReplyRecipient)}
        templates={templateOptions}
        followUpTemplateId={prefs?.followUpTemplateId ?? null}
        initialMode={replyMode}
        onDone={() => refetch()}
      />
    </Page>
  );
}

/** "Hot" rubber stamp for recipients with 3+ opens. */
function HotStamp() {
  return (
    <span className="stamp inline-flex items-center gap-1 px-1.5 py-0.5 text-xs text-destructive">
      <Flame className="size-3.5" aria-hidden />
      Hot
    </span>
  );
}

function FollowupTracker({
  enabled,
  days,
  pending,
  enabledPending,
  onToggle,
  onToggleEnabled,
}: {
  enabled: boolean;
  days: FollowupDay[];
  pending: boolean;
  enabledPending: boolean;
  onToggle: (day: number, done: boolean) => void;
  onToggleEnabled: (enabled: boolean) => void;
}) {
  const overdueCount = days.filter((d) => d.overdue).length;
  const todayKey = new Date().toDateString();
  return (
    <SectionCard
      id="followup-tracker"
      icon={enabled ? BellRing : BellOff}
      title="7-day follow-up"
      tone={overdueCount > 0 ? "highlight" : "plain"}
      actions={
        overdueCount > 0 ? (
          <Badge variant="destructive">
            <BellRing aria-hidden />
            {overdueCount} due
          </Badge>
        ) : undefined
      }
    >
      <div className="flex items-center justify-between gap-3 border-2 border-border px-3 py-2">
        <Label htmlFor="followup-enabled" className="cursor-pointer text-sm">
          Track follow-ups for this campaign
        </Label>
        <Switch
          id="followup-enabled"
          checked={enabled}
          disabled={enabledPending}
          onCheckedChange={onToggleEnabled}
        />
      </div>
      {!enabled ? (
        <p className="text-xs text-muted-foreground">
          Follow-up tracking is off for this campaign — no reminders will show in history.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Tick a day once you've followed up — the next day lights up red 24h later.
          </p>
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-4">
            {days.map((d) => {
              const dueLabel = new Date(d.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
              const isToday = new Date(d.dueAt).toDateString() === todayKey;
              const cbId = `followup-day-${d.day}`;
              return (
                <li key={d.day}>
                  <label
                    htmlFor={cbId}
                    className={cn(
                      "flex aspect-square cursor-pointer flex-col items-center justify-between border-2 border-border p-1.5 text-center transition-colors",
                      d.overdue
                        ? "bg-destructive-subtle"
                        : d.done
                          ? "bg-success-subtle"
                          : isToday
                            ? "bg-primary text-primary-foreground"
                            : "bg-card hover:bg-accent",
                      isToday && "shadow-[var(--shadow-brutal-sm)]",
                    )}
                  >
                    <span className="font-expanded text-sm leading-none">D{d.day}</span>
                    <Checkbox
                      id={cbId}
                      checked={d.done}
                      disabled={pending}
                      onCheckedChange={(c) => onToggle(d.day, !!c)}
                      aria-label={`Day ${d.day} follow-up, due ${dueLabel}${d.overdue ? " (overdue)" : ""}`}
                    />
                    <span className="flex items-center gap-0.5 font-mono text-xs leading-none">
                      {d.overdue ? (
                        <><BellRing className="size-3" aria-hidden />Due</>
                      ) : d.done ? (
                        <><Check className="size-3" aria-hidden />Done</>
                      ) : isToday ? (
                        "Today"
                      ) : (
                        dueLabel
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
