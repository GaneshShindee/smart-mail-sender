import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listCampaignOptions,
  listFollowupRecipients,
  sendFollowupBatch,
  type RecipientRow,
} from "@/lib/followup-center.functions";
import { listTemplates } from "@/lib/templates.functions";
import { listGmailAccounts } from "@/lib/gmail.functions";
import { listResumes } from "@/lib/resumes.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ListChecks, Send, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/followups")({
  head: () => ({
    meta: [
      { title: "Follow-up Center — Smart Email Sender" },
      { name: "description", content: "Filter campaign recipients by opens, resume views, clicks, replies and delivery, then send individual threaded follow-ups." },
      { property: "og:title", content: "Follow-up Center — Smart Email Sender" },
      { property: "og:description", content: "Target the right recipients and send individual threaded follow-ups." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FollowupCenter,
});

type Filters = {
  campaignId: string;
  opens: "all" | "1" | "2" | "3" | "5" | "10";
  pdf: "all" | "viewed" | "not_viewed" | "1" | "2" | "3";
  clicks: "all" | "clicked" | "not_clicked";
  reply: "all" | "replied" | "not_replied";
  delivery: "all" | "delivered" | "bounced" | "unknown";
  followup: "all" | "done" | "not_done";
  dateRange: "all" | "today" | "yesterday" | "7d" | "30d" | "custom";
  from: string;
  to: string;
  search: string;
};

const DEFAULTS: Filters = {
  campaignId: "all", opens: "all", pdf: "all", clicks: "all", reply: "all",
  delivery: "all", followup: "all", dateRange: "all", from: "", to: "", search: "",
};

const DELIVERED = ["accepted", "delivered"];
const BOUNCED = ["bounced", "invalid", "failed"];

function deliveryBadge(status: string) {
  if (DELIVERED.includes(status)) return <Badge className="bg-emerald-600 hover:bg-emerald-600">Delivered</Badge>;
  if (BOUNCED.includes(status)) return <Badge variant="destructive">Invalid / Bounced</Badge>;
  return <Badge variant="secondary">Unknown</Badge>;
}

function eligibility(r: RecipientRow): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (r.replied_at) return { label: "Excluded — Replied", variant: "secondary" };
  if (BOUNCED.includes(r.delivery_status)) return { label: "Excluded — Invalid/Bounced", variant: "destructive" };
  if (r.followup_sent_at) return { label: "Already Followed Up", variant: "outline" };
  return { label: "Eligible", variant: "default" };
}

function FollowupCenter() {
  const qc = useQueryClient();
  const campaignsFn = useServerFn(listCampaignOptions);
  const listFn = useServerFn(listFollowupRecipients);
  const sendFn = useServerFn(sendFollowupBatch);
  const templatesFn = useServerFn(listTemplates);
  const accountsFn = useServerFn(listGmailAccounts);
  const resumesFn = useServerFn(listResumes);

  const [f, setF] = useState<Filters>(DEFAULTS);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const PAGE = 100;

  const campaigns = useQuery({ queryKey: ["fc-campaigns"], queryFn: () => campaignsFn() });
  const templates = useQuery({ queryKey: ["fc-templates"], queryFn: () => templatesFn() });
  const accounts = useQuery({ queryKey: ["fc-accounts"], queryFn: () => accountsFn() });
  const resumes = useQuery({ queryKey: ["fc-resumes"], queryFn: () => resumesFn() });

  const query = useQuery({
    queryKey: ["fc-recipients", f, page],
    queryFn: () =>
      listFn({
        data: {
          campaignId: f.campaignId === "all" ? null : f.campaignId,
          opens: f.opens, pdf: f.pdf, clicks: f.clicks, reply: f.reply,
          delivery: f.delivery, followup: f.followup, dateRange: f.dateRange,
          from: f.from || null, to: f.to || null,
          search: f.search || undefined,
          limit: PAGE, offset: page * PAGE,
        },
      }),
  });

  const rows = query.data?.rows ?? [];
  const summary = query.data?.summary;
  const total = query.data?.total ?? 0;

  const selectable = useMemo(() => rows.filter((r) => !r.replied_at && !BOUNCED.includes(r.delivery_status)), [rows]);
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setPage(0);
  };

  // Compose state
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templateId, setTemplateId] = useState<string>("none");
  const [accountId, setAccountId] = useState<string>("default");
  const [resumeIds, setResumeIds] = useState<string[]>([]);

  const applyTemplateChoice = (id: string) => {
    setTemplateId(id);
    const t = (templates.data ?? []).find((x) => x.id === id);
    if (t) { setSubject(t.subject); setBody(t.body); }
  };

  const send = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          recipientIds: [...selected],
          subject,
          body,
          templateId: templateId === "none" ? null : templateId,
          gmailAccountId: accountId === "default" ? null : accountId,
          resumeIds,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Follow-ups sent: ${r.sent}${r.failed ? ` · failed ${r.failed}` : ""}${r.skipped.length ? ` · skipped ${r.skipped.length}` : ""}`);
      setSelected(new Set());
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["fc-recipients"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to send follow-ups"),
  });

  const stats: { label: string; value: number }[] = summary
    ? [
        { label: "All", value: summary.all },
        { label: "Opened", value: summary.opened },
        { label: "Opened ≥ 2", value: summary.opened2 },
        { label: "PDF Viewed", value: summary.pdfViewed },
        { label: "Clicked", value: summary.clicked },
        { label: "Replied", value: summary.replied },
        { label: "Invalid/Bounced", value: summary.bounced },
        { label: "Followed Up", value: summary.followedUp },
        { label: "Eligible", value: summary.eligible },
      ]
    : [];

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ListChecks className="h-6 w-6" /> Follow-up Center
          </h1>
          <p className="text-sm text-muted-foreground">
            Filter campaign recipients, then send individual follow-ups — each one threaded into that person's own conversation.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={selected.size === 0}>
              <Send className="h-4 w-4 mr-2" /> Send Follow-up ({selected.size})
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Send individual follow-ups</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Template</Label>
                  <Select value={templateId} onValueChange={applyTemplateChoice}>
                    <SelectTrigger><SelectValue placeholder="Pick a template" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {(templates.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Send from</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default account</SelectItem>
                      {(accounts.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.gmail_email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Following up on my application" />
                <p className="text-xs text-muted-foreground">Threaded follow-ups automatically keep a single “Re:” prefix.</p>
              </div>
              <div className="space-y-1">
                <Label>Body</Label>
                <Textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Hi {{first_name}}, just following up…" />
              </div>
              {(resumes.data ?? []).length > 0 && (
                <div className="space-y-1">
                  <Label>Attach resume</Label>
                  <div className="flex flex-wrap gap-3">
                    {(resumes.data ?? []).map((r) => (
                      <label key={r.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={resumeIds.includes(r.id)}
                          onCheckedChange={(c) =>
                            setResumeIds((prev) => (c ? [...prev, r.id] : prev.filter((x) => x !== r.id)))
                          }
                        />
                        {r.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={() => send.mutate()}
                disabled={send.isPending || !subject.trim() || !body.trim()}
              >
                {send.isPending ? "Sending…" : `Send to ${selected.size} recipient${selected.size === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Live summary */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {query.isLoading
          ? Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-16" />)
          : stats.map((s) => (
              <Card key={s.label}>
                <CardContent className="py-3 px-3">
                  <div className="text-xs text-muted-foreground truncate">{s.label}</div>
                  <div className="text-xl font-semibold">{s.value}</div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 lg:col-span-2">
            <Label>Campaign</Label>
            <Select value={f.campaignId} onValueChange={(v) => set("campaignId", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                {(campaigns.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.subject} · {c.recipient_count} · {new Date(c.sent_at).toLocaleDateString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Open count</Label>
            <Select value={f.opens} onValueChange={(v) => set("opens", v as Filters["opens"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="1">Opened 1+ time</SelectItem>
                <SelectItem value="2">Opened 2+ times</SelectItem>
                <SelectItem value="3">Opened 3+ times</SelectItem>
                <SelectItem value="5">Opened 5+ times</SelectItem>
                <SelectItem value="10">Opened 10+ times</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>PDF / Resume</Label>
            <Select value={f.pdf} onValueChange={(v) => set("pdf", v as Filters["pdf"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="viewed">PDF viewed</SelectItem>
                <SelectItem value="not_viewed">PDF not viewed</SelectItem>
                <SelectItem value="1">Viewed 1+ time</SelectItem>
                <SelectItem value="2">Viewed 2+ times</SelectItem>
                <SelectItem value="3">Viewed 3+ times</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Links</Label>
            <Select value={f.clicks} onValueChange={(v) => set("clicks", v as Filters["clicks"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="clicked">Clicked</SelectItem>
                <SelectItem value="not_clicked">Not clicked</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Reply</Label>
            <Select value={f.reply} onValueChange={(v) => set("reply", v as Filters["reply"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="not_replied">Not replied</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Email delivery</Label>
            <Select value={f.delivery} onValueChange={(v) => set("delivery", v as Filters["delivery"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="delivered">Valid / Delivered</SelectItem>
                <SelectItem value="bounced">Invalid / Bounced</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Follow-up</Label>
            <Select value={f.followup} onValueChange={(v) => set("followup", v as Filters["followup"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="done">Already followed up</SelectItem>
                <SelectItem value="not_done">Not followed up</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Date</Label>
            <Select value={f.dateRange} onValueChange={(v) => set("dateRange", v as Filters["dateRange"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {f.dateRange === "custom" && (
            <>
              <div className="space-y-1">
                <Label>From</Label>
                <Input type="date" value={f.from} onChange={(e) => set("from", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>To</Label>
                <Input type="date" value={f.to} onChange={(e) => set("to", e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-1 lg:col-span-2">
            <Label>Search</Label>
            <Input placeholder="Name, email or company" value={f.search} onChange={(e) => set("search", e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={() => { setF(DEFAULTS); setPage(0); }}>Reset filters</Button>
          </div>
        </CardContent>
      </Card>

      {/* Recipient table */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> {total} matching recipient{total === 1 ? "" : "s"}
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set(selectable.map((r) => r.id)))} disabled={selectable.length === 0}>
              Select all on page
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
              Clear selection
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {query.isLoading ? (
            <Skeleton className="h-64" />
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No recipients match these filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(c) =>
                        setSelected(c ? new Set(selectable.map((r) => r.id)) : new Set())
                      }
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="text-right">Opens</TableHead>
                  <TableHead className="text-right">PDF views</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead>Reply</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Follow-up</TableHead>
                  <TableHead>Last activity</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const el = eligibility(r);
                  const blocked = !!r.replied_at || BOUNCED.includes(r.delivery_status);
                  const last = [r.last_opened_at, r.last_pdf_view_at, r.replied_at, r.followup_sent_at]
                    .filter(Boolean)
                    .sort()
                    .pop();
                  return (
                    <TableRow key={r.id} className={blocked ? "opacity-60" : undefined}>
                      <TableCell>
                        <Checkbox
                          disabled={blocked}
                          checked={selected.has(r.id)}
                          onCheckedChange={(c) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (c) next.add(r.id); else next.delete(r.id);
                              return next;
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium">{r.name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.email}</TableCell>
                      <TableCell>{r.company || "—"}</TableCell>
                      <TableCell className="text-right">{r.open_count}</TableCell>
                      <TableCell className="text-right">{r.pdf_view_count}</TableCell>
                      <TableCell className="text-right">{r.click_count}</TableCell>
                      <TableCell>{r.replied_at ? <Badge className="bg-blue-600 hover:bg-blue-600">Replied</Badge> : <span className="text-muted-foreground text-xs">Not replied</span>}</TableCell>
                      <TableCell>{deliveryBadge(r.delivery_status)}</TableCell>
                      <TableCell className="text-xs">{r.followup_sent_at ? `Sent ×${r.followup_count}` : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{last ? new Date(last).toLocaleString() : "—"}</TableCell>
                      <TableCell><Badge variant={el.variant}>{el.label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {total > PAGE && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {Math.ceil(total / PAGE)}</span>
          <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
