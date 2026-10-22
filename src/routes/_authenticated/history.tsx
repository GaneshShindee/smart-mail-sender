import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { deleteCampaign, listCampaignsPage, setCampaignFollowupEnabled, type CampaignSummary } from "@/lib/history.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { IconButton } from "@/components/app/icon-button";
import { Page, PageHeader } from "@/components/app/page";
import { Pager } from "@/components/app/pager";
import { SegmentedControl } from "@/components/app/segmented-control";
import {
  History as HistoryIcon,
  Search,
  Eye,
  FileText,
  Reply,
  Users,
  Paperclip,
  BellRing,
  BellOff,
  MoreVertical,
  Trash2,
  CalendarRange,
  X,
  PenLine,
  SearchX,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

const PAGE_SIZE = 25;

type CampaignFilters = { search: string; status: string; dateFrom: string; dateTo: string };
const defaultCampaignFilters: CampaignFilters = { search: "", status: "all", dateFrom: "", dateTo: "" };

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "sent", label: "Sent" },
  { value: "partial", label: "Partial" },
  { value: "failed", label: "Failed" },
];

/** Parses a "YYYY-MM-DD" filter value as a local date (not UTC, so the picker shows the right day). */
function parseDateKey(key: string): Date | undefined {
  if (!key) return undefined;
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateLabel(key: string): string {
  return parseDateKey(key)?.toLocaleDateString(undefined, { month: "short", day: "numeric" }) ?? "";
}

/** A "Sent date" filter button that opens a custom (themed) calendar popover instead of the native date picker. */
function DateRangeFilter({
  id,
  dateFrom,
  dateTo,
  onChange,
}: {
  id?: string;
  dateFrom: string;
  dateTo: string;
  onChange: (patch: Partial<CampaignFilters>) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasFilter = !!dateFrom || !!dateTo;
  const selected: DateRange | undefined = hasFilter
    ? { from: parseDateKey(dateFrom), to: parseDateKey(dateTo) }
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start font-mono text-xs uppercase tracking-[0.06em] sm:w-auto",
            hasFilter ? "bg-accent text-foreground" : "text-muted-foreground",
          )}
        >
          <CalendarRange aria-hidden />
          {hasFilter ? `${formatDateLabel(dateFrom) || "…"} – ${formatDateLabel(dateTo) || "…"}` : "Any date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="border-b-2 border-border bg-secondary px-3 py-2 font-mono text-xs uppercase tracking-[0.08em] text-secondary-foreground">
          Sent between
        </div>
        <Calendar
          mode="range"
          numberOfMonths={1}
          defaultMonth={selected?.from}
          selected={selected}
          onSelect={(range) =>
            onChange({
              dateFrom: range?.from ? toDateKey(range.from) : "",
              dateTo: range?.to ? toDateKey(range.to) : "",
            })
          }
        />
        {hasFilter && (
          <div className="flex justify-end border-t-2 border-border p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange({ dateFrom: "", dateTo: "" });
                setOpen(false);
              }}
            >
              <X aria-hidden />
              Clear dates
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Email History — Smart Email Sender" },
      { name: "description", content: "Every campaign you've sent, with recipients, opens, resume views and replies." },
      { property: "og:title", content: "Email History — Smart Email Sender" },
      { property: "og:description", content: "Browse campaigns, then drill into recipients and full conversations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<CampaignFilters>(defaultCampaignFilters);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<CampaignSummary | null>(null);
  const listFn = useServerFn(listCampaignsPage);
  const setFollowupEnabledFn = useServerFn(setCampaignFollowupEnabled);
  const deleteCampaignFn = useServerFn(deleteCampaign);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["campaign-history", filters, page],
    queryFn: () =>
      listFn({
        data: {
          search: filters.search,
          status: filters.status,
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtering =
    !!filters.search || filters.status !== "all" || !!filters.dateFrom || !!filters.dateTo;

  // Any filter change jumps back to page 1, since the current page may no longer exist.
  const updateFilter = (patch: Partial<CampaignFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const toggleFollowup = useMutation({
    mutationFn: (vars: { campaignId: string; enabled: boolean }) =>
      setFollowupEnabledFn({ data: vars }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaign-history"] }),
    onError: (e) => toast.error("Couldn't update follow-up tracking", { description: (e as Error).message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (campaignId: string) => deleteCampaignFn({ data: { campaignId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-history"] });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error("Couldn't delete campaign", { description: (e as Error).message }),
  });

  const rowActions = (c: CampaignSummary) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={`Options for ${campaignTitle(c)}`} size="sm">
          <MoreVertical aria-hidden />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => toggleFollowup.mutate({ campaignId: c.id, enabled: !c.followupEnabled })}
        >
          {c.followupEnabled ? (
            <><BellOff aria-hidden />Turn off follow-up tracking</>
          ) : (
            <><BellRing aria-hidden />Turn on follow-up tracking</>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => setDeleteTarget(c)}
        >
          <Trash2 aria-hidden />Delete campaign
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <Page size="wide">
      <PageHeader
        eyebrow="02 · Outreach"
        title="History"
        description="The ledger book: one row per campaign. Open a campaign to see its recipients, filters and bulk reply tools."
        actions={
          <Button asChild>
            <Link to="/send">
              <PenLine aria-hidden /> New campaign
            </Link>
          </Button>
        }
      />

      <div className="space-y-0">
        <div
          role="search"
          aria-label="Filter campaigns"
          className="flex flex-col gap-3 border-2 border-border bg-card p-3 shadow-[var(--shadow-brutal)] sm:p-4 lg:flex-row lg:items-end"
        >
          <div className="w-full space-y-1.5 lg:flex-1">
            <Label htmlFor="history-search" className="eyebrow">
              Search
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="history-search"
                value={filters.search}
                onChange={(e) => updateFilter({ search: e.target.value })}
                placeholder="Search subject, recipient, role or company…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="min-w-0 space-y-1.5">
            <span className="eyebrow block" aria-hidden>
              Status
            </span>
            <SegmentedControl
              value={filters.status}
              onValueChange={(status) => updateFilter({ status })}
              options={STATUS_OPTIONS}
              ariaLabel="Campaign status"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="history-date" className="eyebrow">
              Sent date
            </Label>
            <DateRangeFilter
              id="history-date"
              dateFrom={filters.dateFrom}
              dateTo={filters.dateTo}
              onChange={updateFilter}
            />
          </div>
        </div>

        <div className="border-2 border-t-0 border-border bg-card shadow-[var(--shadow-brutal)]">
          <div className="flex items-center justify-between gap-3 border-b-2 border-border px-4 py-2">
            <p className="font-mono text-xs uppercase tracking-[0.08em]" aria-live="polite">
              {isLoading ? "Loading…" : `${total} campaign${total === 1 ? "" : "s"}`}
            </p>
            {filtering && (
              <Button variant="ghost" size="sm" onClick={() => updateFilter(defaultCampaignFilters)}>
                <X aria-hidden /> Clear filters
              </Button>
            )}
          </div>

          {isError ? (
            <div className="p-4">
              <ErrorState
                title="Couldn't load your history"
                error={error}
                onRetry={() => refetch()}
                retrying={isFetching}
              />
            </div>
          ) : isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : rows.length ? (
            <>
              <ul className="divide-y divide-border/20 md:hidden">
                {rows.map((c) => (
                  <li
                    key={c.id}
                    className={cn("flex items-start gap-2 pr-2", c.followupPending && "bg-destructive-subtle")}
                  >
                    <Link
                      to="/campaigns/$id"
                      params={{ id: c.id }}
                      className="block min-w-0 flex-1 space-y-2 py-3 pl-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate font-semibold">{campaignTitle(c)}</span>
                        <StatusBadge status={c.status} className="shrink-0" />
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {formatSentAt(c.sent_at)}
                        {c.sender_email ? ` · ${c.sender_email}` : ""}
                      </div>
                      {(c.role || c.company) && (
                        <div className="truncate text-xs text-muted-foreground">{c.subject}</div>
                      )}
                      {c.status === "failed" && c.error && (
                        <div className="truncate text-xs text-destructive">{c.error}</div>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {c.followupPending && <FollowupStamp day={c.followupDueDay} />}
                        <Badge variant="outline">
                          <Users aria-hidden />
                          {c.recipients}
                          <span className="sr-only"> recipients</span>
                        </Badge>
                        <EngagementChips c={c} />
                      </div>
                    </Link>
                    <div className="pt-2.5">{rowActions(c)}</div>
                  </li>
                ))}
              </ul>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sent</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead className="text-right">Rcpts</TableHead>
                      <TableHead>Engagement</TableHead>
                      <TableHead>Follow-up</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-12">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((c) => (
                      <TableRow
                        key={c.id}
                        className={cn("relative", c.followupPending && "bg-destructive-subtle")}
                      >
                        <TableCell className="whitespace-nowrap py-2 font-mono text-xs">
                          {formatSentAt(c.sent_at)}
                        </TableCell>
                        <TableCell className="max-w-80 py-2">
                          <Link
                            to="/campaigns/$id"
                            params={{ id: c.id }}
                            className="block truncate font-semibold after:absolute after:inset-0 after:content-['']"
                          >
                            {campaignTitle(c)}
                          </Link>
                          <span className="block truncate text-xs text-muted-foreground">
                            {c.role || c.company ? `${c.subject} · ` : ""}
                            {c.sender_email ? `from ${c.sender_email}` : ""}
                            {c.template_name ? ` · ${c.template_name}` : ""}
                          </span>
                          {c.status === "failed" && c.error && (
                            <span className="block truncate text-xs text-destructive">{c.error}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono text-sm tabular-nums">
                          {c.recipients}
                        </TableCell>
                        <TableCell className="py-2">
                          <EngagementChips c={c} />
                        </TableCell>
                        <TableCell className="py-2">
                          {c.followupPending ? (
                            <FollowupStamp day={c.followupDueDay} />
                          ) : (
                            <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
                              {c.followupEnabled ? (
                                <><BellRing className="size-3.5" aria-hidden />On track</>
                              ) : (
                                <><BellOff className="size-3.5" aria-hidden />Off</>
                              )}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          <StatusBadge status={c.status} />
                        </TableCell>
                        <TableCell className="relative z-10 py-1 text-right">{rowActions(c)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : filtering ? (
            <div className="p-4">
              <EmptyState
                icon={SearchX}
                title="No matches"
                description="No campaigns match these filters. Try a different search, status or date range."
                action={
                  <Button variant="outline" onClick={() => updateFilter(defaultCampaignFilters)}>
                    <X aria-hidden /> Clear filters
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                icon={HistoryIcon}
                title="No campaigns yet"
                description="Every campaign you send is logged here with its opens, resume views and replies."
                action={
                  <Button asChild>
                    <Link to="/send">Send your first email</Link>
                  </Button>
                }
              />
            </div>
          )}
        </div>
      </div>

      <Pager page={page} totalPages={totalPages} onPageChange={setPage} totalItems={total} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes "{deleteTarget?.subject}" along with all its recipients, opens, replies and
              follow-up tracking. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}

function campaignTitle(c: CampaignSummary) {
  return c.role && c.company ? `${c.role} · ${c.company}` : c.role || c.company || c.subject;
}

function formatSentAt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** "Follow-up due" rubber stamp — icon + text, so it never relies on the row tint alone. */
function FollowupStamp({ day }: { day: number | null }) {
  return (
    <span className="stamp inline-flex items-center gap-1 bg-card px-1.5 py-0.5 text-xs text-destructive">
      <BellRing className="size-3.5" aria-hidden />
      Day {day} follow-up due
    </span>
  );
}

function EngagementChips({ c }: { c: CampaignSummary }) {
  if (c.opened === 0 && c.resume_views === 0 && c.replied === 0 && c.attachment_count === 0) {
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
      {c.attachment_count > 0 && (
        <Badge variant="outline" title="Attachments">
          <Paperclip aria-hidden />
          {c.attachment_count}
          <span className="sr-only"> attachments</span>
        </Badge>
      )}
    </div>
  );
}
