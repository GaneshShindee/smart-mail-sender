import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listHistory } from "@/lib/history.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, EmptyState } from "./dashboard";
import { History as HistoryIcon, Search } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Email History — Smart Email Sender" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
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
              {data.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3 gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.subject}</div>
                    <div className="text-xs text-muted-foreground truncate">to {r.recipient} · {new Date(r.sent_at).toLocaleString()}{r.template_name ? ` · ${r.template_name}` : ""}</div>
                    {r.status === "failed" && r.error && <div className="text-xs text-destructive truncate">{r.error}</div>}
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={HistoryIcon} title="No emails match" desc="Try changing the search or filter." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}