import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listHistory } from "@/lib/history.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge, EmptyState } from "./dashboard";
import { History as HistoryIcon, Search, Eye, Paperclip, Users, Mail } from "lucide-react";
import { useState } from "react";

type Row = {
  id: string;
  recipient: string;
  subject: string;
  template_name: string | null;
  status: string;
  sent_at: string;
  error: string | null;
  sender_email: string | null;
  bcc: string | null;
  attachments: unknown;
  recipient_count: number;
  open_count: number;
  last_opened_at: string | null;
  first_opened_at: string | null;
  tracking_enabled: boolean | null;
};

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Email History — Smart Email Sender" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Row | null>(null);
  const listFn = useServerFn(listHistory);
  const { data, isLoading } = useQuery({
    queryKey: ["history", search, status],
    queryFn: () => listFn({ data: { search, status, limit: 200 } }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Email History</h1>
        <p className="text-sm text-muted-foreground">Every email you've sent through Smart Email Sender.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search recipient or subject…" className="pl-9" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="py-2">
          {isLoading ? (
            <div className="space-y-2 py-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : data?.length ? (
            <ul className="divide-y divide-border">
              {(data as Row[]).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between py-3 gap-3 cursor-pointer hover:bg-accent/40 rounded-md px-2 -mx-2"
                  onClick={() => setSelected(r)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{r.subject}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      to {r.recipient_count} recipient{r.recipient_count === 1 ? "" : "s"} · {new Date(r.sent_at).toLocaleString()}
                      {r.template_name ? ` · ${r.template_name}` : ""}
                    </div>
                    {r.status === "failed" && r.error && <div className="text-xs text-destructive truncate">{r.error}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.open_count > 0 && (
                      <Badge variant="secondary" className="gap-1"><Eye className="h-3 w-3" />{r.open_count}</Badge>
                    )}
                    <StatusBadge status={r.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={HistoryIcon} title="No emails match" desc="Try changing the search or filter." />
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle className="truncate">{selected?.subject}</SheetTitle></SheetHeader>
          {selected && <DetailBody row={selected} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailBody({ row }: { row: Row }) {
  const atts = Array.isArray(row.attachments) ? (row.attachments as Array<{ name: string; size?: number }>) : [];
  return (
    <div className="mt-4 space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={row.status} />
        {row.tracking_enabled === false && <Badge variant="outline">Tracking off</Badge>}
        {row.open_count > 0 && <Badge variant="secondary" className="gap-1"><Eye className="h-3 w-3" />{row.open_count} open{row.open_count === 1 ? "" : "s"}</Badge>}
      </div>
      <div className="rounded-md border border-border p-3 space-y-1.5">
        <Kv icon={Mail} label="From" value={row.sender_email ?? "—"} />
        <Kv icon={Users} label="Recipients" value={`${row.recipient_count}`} />
        {row.bcc && <div className="text-xs text-muted-foreground break-words">BCC: {row.bcc}</div>}
        {row.template_name && <Kv label="Template" value={row.template_name} />}
        {atts.length > 0 && (
          <Kv icon={Paperclip} label="Attachments" value={atts.map((a) => a.name).join(", ")} />
        )}
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Timeline</div>
        <ul className="space-y-1.5 border-l border-border pl-3">
          <TimelineItem when={row.sent_at} label={row.status === "sent" ? "Sent" : row.status === "failed" ? "Send failed" : row.status} />
          {row.first_opened_at && <TimelineItem when={row.first_opened_at} label="First opened" />}
          {row.last_opened_at && row.last_opened_at !== row.first_opened_at && (
            <TimelineItem when={row.last_opened_at} label={`Last opened (${row.open_count} total)`} />
          )}
        </ul>
      </div>

      {row.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">{row.error}</div>
      )}

      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Body</div>
        <div className="rounded-md border border-border p-3 whitespace-pre-wrap text-xs">{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {((row as unknown) as { body?: string }).body ?? ""}
        </div>
      </div>
    </div>
  );
}

function Kv({ icon: Icon, label, value }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />}
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

function TimelineItem({ when, label }: { when: string; label: string }) {
  return (
    <li className="relative text-xs">
      <span className="absolute -left-[15px] top-1 h-2 w-2 rounded-full bg-primary" />
      <div className="font-medium">{label}</div>
      <div className="text-muted-foreground">{new Date(when).toLocaleString()}</div>
    </li>
  );
}