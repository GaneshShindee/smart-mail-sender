import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCampaigns, setCampaignFollowupEnabled, type CampaignSummary } from "@/lib/history.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusBadge, EmptyState } from "./dashboard";
import { History as HistoryIcon, Search, Eye, FileText, Reply, Users, ChevronRight, Paperclip, BellRing, BellOff, MoreVertical, X } from "lucide-react";
import { useState } from "react";

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const listFn = useServerFn(listCampaigns);
  const setFollowupEnabledFn = useServerFn(setCampaignFollowupEnabled);

  const { data, isLoading } = useQuery({
    queryKey: ["campaign-history", search, status, dateFrom, dateTo],
    queryFn: () =>
      listFn({
        data: {
          search,
          status,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          limit: 200,
        },
      }),
  });
  const rows = (data ?? []) as CampaignSummary[];
  const hasDateFilter = !!dateFrom || !!dateTo;

  const toggleFollowup = useMutation({
    mutationFn: (vars: { campaignId: string; enabled: boolean }) =>
      setFollowupEnabledFn({ data: vars }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaign-history"] }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="page-title">Email History</h1>
        <p className="text-sm text-muted-foreground">
          One row per campaign. Open a campaign to see its recipients, filters and bulk reply tools.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subject, recipient or template…"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            max={dateTo || undefined}
            className="w-full sm:w-[150px]"
            aria-label="Sent from"
          />
          <span className="text-xs text-muted-foreground shrink-0">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            min={dateFrom || undefined}
            className="w-full sm:w-[150px]"
            aria-label="Sent to"
          />
          {hasDateFilter && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              aria-label="Clear date filter"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="py-2">
          {isLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : rows.length ? (
            <ul className="divide-y divide-border">
              {rows.map((c) => (
                <li
                  key={c.id}
                  className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 py-3 px-2 -mx-2 rounded-md cursor-pointer hover:bg-accent/40 transition-colors ${
                    c.followupPending ? "border-l-2 border-l-destructive bg-destructive/5" : ""
                  }`}
                  onClick={() => navigate({ to: "/campaigns/$id", params: { id: c.id } })}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {c.role && c.company
                        ? `${c.role} · ${c.company}`
                        : c.role || c.company || c.subject}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.role || c.company ? `${c.subject} · ` : ""}
                      {new Date(c.sent_at).toLocaleString()}
                      {c.sender_email ? ` · from ${c.sender_email}` : ""}
                      {c.template_name ? ` · ${c.template_name}` : ""}
                    </div>
                    {c.status === "failed" && c.error && (
                      <div className="text-xs text-destructive truncate">{c.error}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap sm:justify-end sm:shrink-0">
                    {c.followupPending && (
                      <Badge variant="destructive" className="gap-1">
                        <BellRing className="h-3 w-3" />Day {c.followupDueDay} follow-up
                      </Badge>
                    )}
                    {!c.followupEnabled && (
                      <Badge variant="outline" className="gap-1 text-muted-foreground">
                        <BellOff className="h-3 w-3" />No follow-up
                      </Badge>
                    )}
                    <Badge variant="outline" className="gap-1">
                      <Users className="h-3 w-3" />{c.recipients}
                    </Badge>
                    {c.opened > 0 && (
                      <Badge variant="secondary" className="gap-1">
                        <Eye className="h-3 w-3" />{c.opened}/{c.recipients}
                      </Badge>
                    )}
                    {c.resume_views > 0 && (
                      <Badge variant="secondary" className="gap-1"><FileText className="h-3 w-3" />{c.resume_views}</Badge>
                    )}
                    {c.replied > 0 && (
                      <Badge className="gap-1"><Reply className="h-3 w-3" />{c.replied}</Badge>
                    )}
                    {c.attachment_count > 0 && (
                      <Badge variant="outline" className="gap-1"><Paperclip className="h-3 w-3" />{c.attachment_count}</Badge>
                    )}
                    <StatusBadge status={c.status} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Campaign options"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          onClick={() => toggleFollowup.mutate({ campaignId: c.id, enabled: !c.followupEnabled })}
                        >
                          {c.followupEnabled ? (
                            <><BellOff className="h-4 w-4 mr-2" />Turn off follow-up tracking</>
                          ) : (
                            <><BellRing className="h-4 w-4 mr-2" />Turn on follow-up tracking</>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={HistoryIcon} title="No campaigns match" desc="Try changing the search or status filter." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
