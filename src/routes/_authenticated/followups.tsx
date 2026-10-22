import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFollowups, refreshFollowupQueue, decideFollowup, deleteFollowup } from "@/lib/followups.functions";
import { listTemplates } from "@/lib/templates.functions";
import { getUserPreferences } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Page, PageHeader } from "@/components/app/page";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { StatusBadge } from "@/components/app/status-badge";
import { IconButton } from "@/components/app/icon-button";
import { SegmentedControl } from "@/components/app/segmented-control";
import { useConfirm } from "@/components/app/confirm-dialog";
import { Ban, CalendarClock, Check, CircleDashed, ListChecks, RefreshCw, Reply, Send, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BulkReplyDialog, type BulkReplyRecipient } from "@/components/bulk-reply-dialog";

export const Route = createFileRoute("/_authenticated/followups")({
  head: () => ({ meta: [{ title: "Follow-up Queue — Smart Email Sender" }] }),
  component: FollowupsPage,
});

function FollowupsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listFollowups);
  const refreshFn = useServerFn(refreshFollowupQueue);
  const decideFn = useServerFn(decideFollowup);
  const delFn = useServerFn(deleteFollowup);
  const templatesFn = useServerFn(listTemplates);
  const prefsFn = useServerFn(getUserPreferences);
  const [status, setStatus] = useState<"pending" | "approved" | "sent" | "rejected" | "canceled" | "">("pending");
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<BulkReplyRecipient | null>(null);
  const [activeFollowupId, setActiveFollowupId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["followups", status],
    queryFn: () => listFn({ data: { status: status || undefined } }),
  });
  const templates = useQuery({ queryKey: ["templates"], queryFn: () => templatesFn({}) });
  const prefs = useQuery({ queryKey: ["user-prefs"], queryFn: () => prefsFn() });

  const templateOptions = useMemo(
    () =>
      (templates.data ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        body: t.body ?? "",
        is_default: !!(t as { is_default?: boolean }).is_default,
      })),
    [templates.data],
  );

  const refresh = useMutation({
    mutationFn: () => refreshFn(),
    onSuccess: (r) => { toast.success(`Queue refreshed — ${r.added} added`); qc.invalidateQueries({ queryKey: ["followups"] }); },
    onError: (e) => toast.error("Couldn't refresh queue", { description: (e as Error).message }),
  });
  const decide = useMutation({
    mutationFn: (v: { id: string; action: "approve" | "reject" | "sent"; templateId?: string | null }) =>
      decideFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["followups"] }),
    onError: (e) => toast.error("Couldn't update follow-up", { description: (e as Error).message }),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["followups"] }),
    onError: (e) => toast.error("Couldn't delete follow-up", { description: (e as Error).message }),
  });
  const confirm = useConfirm();

  const tabs: { value: Exclude<typeof status, "">; label: string; icon: typeof Check }[] = [
    { value: "pending", label: "Pending", icon: CircleDashed }, { value: "approved", label: "Scheduled", icon: CalendarClock },
    { value: "sent", label: "Sent", icon: Send }, { value: "rejected", label: "Rejected", icon: Ban }, { value: "canceled", label: "Canceled", icon: X },
  ];

  const openFollowUpReply = (f: {
    id: string;
    recipient_id: string | null;
    recipient_email: string;
    recipient_name: string;
  }) => {
    if (!f.recipient_id) {
      toast.error("Missing recipient — refresh the queue and try again");
      return;
    }
    setActiveFollowupId(f.id);
    setReplyTarget({
      id: f.recipient_id,
      email: f.recipient_email,
      name: f.recipient_name || null,
      subject: "Follow-up",
    });
    setReplyOpen(true);
  };

  const onDelete = async (f: { id: string; recipient_name: string; recipient_email: string }) => {
    if (
      await confirm({
        title: `Delete follow-up for ${f.recipient_name || f.recipient_email}?`,
        description: "It's removed from the queue. Refreshing the queue may add it back if they're still eligible.",
      })
    ) {
      del.mutate(f.id);
    }
  };

  const items = q.data ?? [];

  return (
    <Page>
      <PageHeader
        eyebrow="02 · Outreach"
        title="Follow-up Queue"
        icon={ListChecks}
        description="Follow-ups are sent as individual thread replies. Pick your follow-up template — it fills the reply body."
        actions={
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            <RefreshCw className={refresh.isPending ? "animate-spin" : undefined} aria-hidden />
            {refresh.isPending ? "Scanning opens…" : "Refresh queue"}
          </Button>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <SegmentedControl
          value={status || "pending"}
          onValueChange={(v) => setStatus(v)}
          ariaLabel="Follow-up status"
          options={tabs}
        />
        {q.data && (
          <p className="tabular text-xs text-muted-foreground" aria-live="polite">
            {items.length} ticket{items.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {q.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading follow-ups">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex border-2 border-border bg-card">
              <div className="w-20 shrink-0 border-r-2 border-dashed border-border p-3 sm:w-28">
                <Skeleton className="h-8 w-10" />
                <Skeleton className="mt-2 h-3 w-14" />
              </div>
              <div className="flex-1 space-y-2 p-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-5 w-40" />
              </div>
            </div>
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState
          title="Couldn't load the queue"
          error={q.error}
          onRetry={() => q.refetch()}
          retrying={q.isFetching}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Nothing in this tray"
          description="Refresh the queue to scan recent opens for people worth following up with."
          action={
            <Button onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              <RefreshCw className={refresh.isPending ? "animate-spin" : undefined} aria-hidden /> Refresh queue
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {items.map((f) => {
            const since = daysSince(f.last_open_at ?? f.created_at);
            return (
              <li key={f.id}>
                <article className="flex border-2 border-border bg-card shadow-[var(--shadow-brutal-sm)]">
                  {/* Ticket stub */}
                  <div className="flex w-20 shrink-0 flex-col justify-between gap-2 border-r-2 border-dashed border-border bg-muted p-3 sm:w-28">
                    <div>
                      <p className="font-expanded text-3xl leading-none tabular-nums">
                        {since}
                        <span className="text-base">d</span>
                      </p>
                      <p className="mt-1 font-mono text-xs uppercase leading-4 tracking-[0.08em] text-muted-foreground">
                        since {f.last_open_at ? "open" : "queued"}
                      </p>
                    </div>
                    <p className="font-mono text-xs uppercase leading-4 tracking-[0.08em]">
                      <span className="tabular-nums font-bold">{f.open_count}</span> open{f.open_count === 1 ? "" : "s"}
                    </p>
                  </div>

                  {/* Ticket body */}
                  <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                    <div className="min-w-0 space-y-1.5">
                      <h3 className="truncate text-base font-bold">{f.recipient_name || f.recipient_email}</h3>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {f.recipient_email} {f.company ? `· ${f.company}` : ""}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge status={f.status} />
                        <Badge variant="outline">{f.condition.replaceAll("_", " ")}</Badge>
                        {f.scheduled_at && (
                          <Badge variant="info">
                            <CalendarClock aria-hidden /> Due {new Date(f.scheduled_at).toLocaleString()}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                      {(f.status === "pending" || f.status === "approved") && (
                        <>
                          {f.status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 sm:flex-none"
                              disabled={decide.isPending}
                              onClick={() => decide.mutate({ id: f.id, action: "reject" })}
                            >
                              <X aria-hidden /> Reject
                            </Button>
                          )}
                          <Button size="sm" className="flex-1 sm:flex-none" onClick={() => openFollowUpReply(f)}>
                            <Reply aria-hidden /> Reply with follow-up
                          </Button>
                        </>
                      )}
                      <IconButton
                        label={`Delete follow-up for ${f.recipient_email}`}
                        size="sm"
                        disabled={del.isPending}
                        onClick={() => onDelete(f)}
                      >
                        <Trash2 aria-hidden />
                      </IconButton>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <BulkReplyDialog
        open={replyOpen}
        onOpenChange={(o) => {
          setReplyOpen(o);
          if (!o) {
            setReplyTarget(null);
            setActiveFollowupId(null);
          }
        }}
        recipients={replyTarget ? [replyTarget] : []}
        templates={templateOptions}
        followUpTemplateId={prefs.data?.followUpTemplateId ?? null}
        initialMode="followup"
        onDone={() => {
          if (activeFollowupId) {
            decide.mutate({
              id: activeFollowupId,
              action: "sent",
              templateId: prefs.data?.followUpTemplateId ?? null,
            });
          }
          qc.invalidateQueries({ queryKey: ["followups"] });
        }}
      />
    </Page>
  );
}

/** Whole days elapsed since an ISO timestamp (never negative). */
function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}
