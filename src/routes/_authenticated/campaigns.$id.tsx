import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCampaign, listHistoryRecipients } from "@/lib/history.functions";
import { listTemplates } from "@/lib/templates.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Mail, Users, ArrowLeft, Flame, Paperclip, Search, FileText, Reply, CornerUpLeft, MailCheck, X } from "lucide-react";
import { StatusBadge } from "./dashboard";
import { relativeTime } from "@/lib/user-agent";
import { useMemo, useState } from "react";
import { defaultHistoryFilters, type HistoryFilters, type HistoryRecipientRow } from "@/lib/history-filters";
import { BulkReplyDialog } from "@/components/bulk-reply-dialog";
import { replyPreviewSubject } from "@/lib/reply-subject";

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
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Campaign not found.</div>,
  component: CampaignDetailsPage,
});

function CampaignDetailsPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fn = useServerFn(getCampaign);
  const listFn = useServerFn(listHistoryRecipients);
  const templatesFn = useServerFn(listTemplates);

  const [filters, setFilters] = useState<HistoryFilters>(defaultHistoryFilters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [replyOpen, setReplyOpen] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["campaign", id], queryFn: () => fn({ data: { id } }) });
  const { data: recipientData, isLoading: loadingRecipients, refetch } = useQuery({
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

  const rows = (recipientData ?? []) as HistoryRecipientRow[];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  const set = <K extends keyof HistoryFilters>(k: K, v: HistoryFilters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }));

  const toggle = (rid: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(rid)) next.delete(rid);
      else next.add(rid);
      return next;
    });

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /><Skeleton className="h-96 w-full" />
      </div>
    );
  }
  const { campaign, recipients } = data;
  const opened = recipients.filter((r) => (r.open_count ?? 0) > 0);
  const openRate = recipients.length ? opened.length / recipients.length : 0;
  const attachments = Array.isArray(campaign.attachments) ? (campaign.attachments as Array<{ name: string }>) : [];

  const followUp = (r: HistoryRecipientRow) => {
    const sp = new URLSearchParams({ to: r.email, followUp: "1", campaignId: campaign.id });
    if (campaign.gmail_account_id) sp.set("sender", campaign.gmail_account_id);
    if (r.name) sp.set("name", r.name);
    if (r.company) sp.set("company", r.company);
    navigate({ to: "/send", search: Object.fromEntries(sp.entries()) as never });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link to="/history"><ArrowLeft className="h-4 w-4 mr-1" /> Back to history</Link>
          </Button>
          <h1 className="page-title truncate">{campaign.subject}</h1>
          <p className="text-[13px] text-muted-foreground truncate">
            Sent {new Date(campaign.sent_at).toLocaleString()} · from {campaign.sender_email}
            {campaign.template_name ? ` · ${campaign.template_name}` : ""}
          </p>
        </div>
        <StatusBadge status={campaign.status} />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Recipients" value={String(recipients.length)} icon={Users} />
        <Stat label="Opened" value={`${opened.length} / ${recipients.length}`} icon={Eye} />
        <Stat label="Open rate" value={`${Math.round(openRate * 100)}%`} icon={Flame} />
        <Stat label="Total opens" value={String(campaign.open_count ?? 0)} icon={Mail} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={filters.search}
                onChange={(e) => set("search", e.target.value)}
                placeholder="Search name, email or company…"
                className="pl-9"
              />
            </div>
            <Select value={filters.openCount} onValueChange={(v) => set("openCount", v as HistoryFilters["openCount"])}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any opens</SelectItem>
                <SelectItem value="0">0 opens</SelectItem>
                <SelectItem value="1">1 open</SelectItem>
                <SelectItem value="2">2 opens</SelectItem>
                <SelectItem value="3+">3+ opens</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.replyStatus} onValueChange={(v) => set("replyStatus", v as HistoryFilters["replyStatus"])}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any reply status</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="not_replied">Not replied</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.resume} onValueChange={(v) => set("resume", v as HistoryFilters["resume"])}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any resume view</SelectItem>
                <SelectItem value="viewed">Resume viewed</SelectItem>
                <SelectItem value="not_viewed">Resume not viewed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-3">
                <Checkbox
                  checked={allSelected}
                  aria-label="Select all recipients"
                  onCheckedChange={(c) => setSelected(c ? new Set(rows.map((r) => r.id)) : new Set())}
                />
                Recipients ({rows.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingRecipients ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : rows.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">No recipients match your filters.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {rows.map((r) => {
                    const opens = r.open_count;
                    const hot = opens >= 3;
                    return (
                      <li
                        key={r.id}
                        className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                          selected.has(r.id) ? "bg-accent/50" : "hover:bg-accent/30"
                        }`}
                      >
                        <Checkbox
                          checked={selected.has(r.id)}
                          aria-label={`Select ${r.email}`}
                          onCheckedChange={() => toggle(r.id)}
                        />
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => navigate({ to: "/recipients/$id", params: { id: r.id } })}
                        >
                          <div className="font-medium truncate">{r.name ?? r.email}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {r.email}{r.company ? ` · ${r.company}` : ""}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {opens > 0
                              ? `Opened ${opens} time${opens === 1 ? "" : "s"} · last ${r.last_opened_at ? relativeTime(r.last_opened_at) : "—"}`
                              : "Not opened"}
                          </div>
                        </button>
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                          {opens > 0 && <Badge variant="secondary" className="gap-1"><Eye className="h-3 w-3" />{opens}</Badge>}
                          {r.pdf_view_count > 0 && (
                            <Badge variant="secondary" className="gap-1"><FileText className="h-3 w-3" />{r.pdf_view_count}</Badge>
                          )}
                          {r.has_reply && <Badge className="gap-1"><Reply className="h-3 w-3" />Replied</Badge>}
                          {r.user_reply_sent && (
                            <Badge variant="outline" className="gap-1">
                              <CornerUpLeft className="h-3 w-3" />You replied{r.user_reply_count > 1 ? ` ×${r.user_reply_count}` : ""}
                            </Badge>
                          )}
                          {r.followup_count > 0 && (
                            <Badge variant="outline" className="gap-1"><MailCheck className="h-3 w-3" />{r.followup_count}</Badge>
                          )}
                          <StatusBadge status={r.status} />
                          {opens > 0 && !r.has_reply && (
                            <Button size="sm" variant={hot ? "default" : "outline"} onClick={() => followUp(r)}>
                              {hot && <Flame className="h-3 w-3 mr-1" />}Follow-up
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Email preview</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-3">
            <div><span className="text-muted-foreground">Subject:</span> {campaign.subject}</div>
            {attachments.length > 0 && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Paperclip className="h-3 w-3" />{attachments.map((a) => a.name).join(", ")}
              </div>
            )}
            <div className="rounded-md border border-border p-3 whitespace-pre-wrap text-xs max-h-96 overflow-auto">{campaign.body}</div>
            {campaign.error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">{campaign.error}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedRows.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(680px,calc(100%-2rem))]">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card/95 backdrop-blur px-4 py-3 shadow-lg">
            <span className="text-sm font-medium">{selectedRows.length} selected</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Each gets an individual reply in their own thread
            </span>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
            <Button size="sm" onClick={() => setReplyOpen(true)}>
              <Reply className="h-4 w-4 mr-1" /> Reply to selected
            </Button>
          </div>
        </div>
      )}

      <BulkReplyDialog
        open={replyOpen}
        onOpenChange={setReplyOpen}
        recipients={selectedRows.map((r) => ({
          id: r.id,
          email: r.email,
          name: r.name,
          subject: replyPreviewSubject(r.subject),
        }))}
        templates={(templates ?? []).map((t) => ({ id: t.id, name: t.name }))}
        onDone={() => refetch()}
      />
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card className="transition-orbit hover:border-primary/25">
      <div className="stat-tile">
        <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold tracking-tight leading-none">{value}</div>
      </div>
    </Card>
  );
}
