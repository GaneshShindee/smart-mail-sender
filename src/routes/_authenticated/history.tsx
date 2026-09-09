import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listHistoryRecipients } from "@/lib/history.functions";
import { listTemplates } from "@/lib/templates.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, EmptyState } from "./dashboard";
import { History as HistoryIcon, Search, Eye, FileText, Reply, CornerUpLeft, MailCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  defaultHistoryFilters,
  type HistoryFilters,
  type HistoryRecipientRow,
} from "@/lib/history-filters";
import { BulkReplyDialog } from "@/components/bulk-reply-dialog";
import { replyPreviewSubject } from "@/lib/reply-subject";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Email History — Smart Email Sender" },
      { name: "description", content: "Every recipient you've emailed, with opens, resume views, replies and bulk reply tools." },
      { property: "og:title", content: "Email History — Smart Email Sender" },
      { property: "og:description", content: "Track opens, resume views and replies per recipient, then reply in bulk." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<HistoryFilters>(defaultHistoryFilters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [replyOpen, setReplyOpen] = useState(false);

  const listFn = useServerFn(listHistoryRecipients);
  const templatesFn = useServerFn(listTemplates);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["history-recipients", filters],
    queryFn: () =>
      listFn({
        data: {
          search: filters.search,
          openCount: filters.openCount,
          replyStatus: filters.replyStatus,
          resume: filters.resume,
          status: filters.status,
          limit: 1000,
        },
      }),
  });
  const { data: templates } = useQuery({ queryKey: ["templates"], queryFn: () => templatesFn({}) });

  const rows = (data ?? []) as HistoryRecipientRow[];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  const set = <K extends keyof HistoryFilters>(k: K, v: HistoryFilters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Email History</h1>
        <p className="text-sm text-muted-foreground">
          Every recipient you've emailed — opens, resume views, replies and follow-ups.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Search name, email, subject or company…"
            className="pl-9"
          />
        </div>
        <Select value={filters.openCount} onValueChange={(v) => set("openCount", v as HistoryFilters["openCount"])}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any opens</SelectItem>
            <SelectItem value="0">0 opens</SelectItem>
            <SelectItem value="1">1 open</SelectItem>
            <SelectItem value="2">2 opens</SelectItem>
            <SelectItem value="3+">3+ opens</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.replyStatus} onValueChange={(v) => set("replyStatus", v as HistoryFilters["replyStatus"])}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
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
        <Select value={filters.status} onValueChange={(v) => set("status", v)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="replied">Replied</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="py-2">
          {isLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : rows.length ? (
            <>
              <div className="flex items-center gap-3 border-b border-border py-2 px-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={allSelected}
                  aria-label="Select all recipients"
                  onCheckedChange={(c) =>
                    setSelected(c ? new Set(rows.map((r) => r.id)) : new Set())
                  }
                />
                <span>{rows.length} recipient{rows.length === 1 ? "" : "s"}</span>
              </div>
              <ul className="divide-y divide-border">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className={`flex items-center gap-3 py-3 px-2 -mx-2 rounded-md transition-colors ${
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
                        {r.email}
                        {r.company ? ` · ${r.company}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.subject} · {new Date(r.sent_at).toLocaleString()}
                      </div>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      {r.open_count > 0 && (
                        <Badge variant="secondary" className="gap-1"><Eye className="h-3 w-3" />{r.open_count}</Badge>
                      )}
                      {r.pdf_view_count > 0 && (
                        <Badge variant="secondary" className="gap-1"><FileText className="h-3 w-3" />{r.pdf_view_count}</Badge>
                      )}
                      {r.has_reply && (
                        <Badge className="gap-1"><Reply className="h-3 w-3" />Replied</Badge>
                      )}
                      {r.user_reply_sent && (
                        <Badge variant="outline" className="gap-1">
                          <CornerUpLeft className="h-3 w-3" />You replied{r.user_reply_count > 1 ? ` ×${r.user_reply_count}` : ""}
                        </Badge>
                      )}
                      {r.followup_count > 0 && (
                        <Badge variant="outline" className="gap-1"><MailCheck className="h-3 w-3" />{r.followup_count} follow-up</Badge>
                      )}
                      <StatusBadge status={r.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState icon={HistoryIcon} title="No recipients match" desc="Try changing the search or filters." />
          )}
        </CardContent>
      </Card>

      {selectedRows.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(680px,calc(100%-2rem))]">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card/95 backdrop-blur px-4 py-3 shadow-lg">
            <span className="text-sm font-medium">
              {selectedRows.length} selected
            </span>
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
