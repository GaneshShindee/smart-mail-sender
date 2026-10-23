import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  Ban,
  Briefcase,
  CalendarClock,
  Check,
  CircleDashed,
  PhoneCall,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  deleteCallFollowup,
  listCallFollowups,
  updateCallFollowup,
  type CallFollowup,
  type CallFollowupStatus,
} from "@/lib/call-followups.functions";
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
import { daysFromNow } from "@/components/call-followup-dialog";

export const Route = createFileRoute("/_authenticated/calls")({
  head: () => ({ meta: [{ title: "Call Follow-ups — Smart Email Sender" }] }),
  component: CallsPage,
});

const TABS: { value: CallFollowupStatus; label: string; icon: typeof Check }[] = [
  { value: "pending", label: "To call", icon: CircleDashed },
  { value: "done", label: "Done", icon: Check },
  { value: "canceled", label: "Canceled", icon: Ban },
];

function CallsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const listFn = useServerFn(listCallFollowups);
  const updateFn = useServerFn(updateCallFollowup);
  const delFn = useServerFn(deleteCallFollowup);
  const [status, setStatus] = useState<CallFollowupStatus>("pending");

  const q = useQuery({
    queryKey: ["call-followups", status],
    queryFn: () => listFn({ data: { status } }),
  });

  const update = useMutation({
    mutationFn: (v: { id: string; status?: CallFollowupStatus; dueAt?: string }) =>
      updateFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["call-followups"] }),
    onError: (e) => toast.error("Couldn't update call", { description: (e as Error).message }),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["call-followups"] }),
    onError: (e) => toast.error("Couldn't delete call", { description: (e as Error).message }),
  });

  const items = q.data ?? [];
  const overdue =
    status === "pending"
      ? items.filter((c) => new Date(c.due_at).getTime() < Date.now()).length
      : 0;

  const onDelete = async (c: CallFollowup) => {
    if (
      await confirm({
        title: `Delete call follow-up for ${c.company || c.phone}?`,
        confirmLabel: "Delete",
      })
    ) {
      del.mutate(c.id);
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow="02 · Outreach"
        title="Call Follow-ups"
        icon={PhoneCall}
        description="Recruiter calls you've scheduled from the jobs board. Each one gets a deadline — two days by default."
        meta={overdue > 0 ? <Badge variant="danger">{overdue} overdue</Badge> : undefined}
        actions={
          <Button variant="outline" className="w-full sm:w-auto" asChild>
            <Link to="/jobs">
              <Briefcase aria-hidden /> Jobs board
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <SegmentedControl
          value={status}
          onValueChange={setStatus}
          ariaLabel="Call status"
          options={TABS}
        />
        {q.data && (
          <p className="tabular text-xs text-muted-foreground" aria-live="polite">
            {items.length} call{items.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {q.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading calls">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState
          title="Couldn't load calls"
          error={q.error}
          onRetry={() => q.refetch()}
          retrying={q.isFetching}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={PhoneCall}
          title={status === "pending" ? "No calls to make" : "Nothing here yet"}
          description="On the jobs board, use “Call follow-up” on a listing to schedule a recruiter call."
          action={
            <Button asChild>
              <Link to="/jobs">
                <Briefcase aria-hidden /> Open jobs board
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id}>
              <CallCard
                call={c}
                busy={update.isPending || del.isPending}
                onStatus={(s) => update.mutate({ id: c.id, status: s })}
                onSnooze={() => update.mutate({ id: c.id, dueAt: daysFromNow(1).toISOString() })}
                onDelete={() => onDelete(c)}
              />
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

function CallCard({
  call: c,
  busy,
  onStatus,
  onSnooze,
  onDelete,
}: {
  call: CallFollowup;
  busy: boolean;
  onStatus: (s: CallFollowupStatus) => void;
  onSnooze: () => void;
  onDelete: () => void;
}) {
  const due = new Date(c.due_at);
  const isPending = c.status === "pending";
  const isOverdue = isPending && due.getTime() < Date.now();

  return (
    <article className="flex border-2 border-border bg-card shadow-[var(--shadow-brutal-sm)]">
      {/* Ticket stub: time left until the deadline */}
      <div
        className={`flex w-20 shrink-0 flex-col justify-center gap-1 border-r-2 border-dashed border-border p-3 sm:w-28 ${
          isOverdue ? "bg-destructive-subtle" : "bg-muted"
        }`}
      >
        <p className="font-expanded text-2xl leading-none tabular-nums">
          {isPending ? timeLeft(due) : "—"}
        </p>
        <p className="font-mono text-xs uppercase leading-4 tracking-[0.08em] text-muted-foreground">
          {isPending ? (isOverdue ? "overdue" : "left") : c.status}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0 space-y-1.5">
          <h3 className="truncate text-base font-bold">
            {c.company || "Unknown company"}
            {c.role && <span className="font-normal text-muted-foreground"> · {c.role}</span>}
          </h3>
          <p className="truncate font-mono text-sm">
            <a
              href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}
              className="underline underline-offset-2 hover:bg-primary"
            >
              {c.phone}
            </a>
            {c.contact_name && <span className="text-muted-foreground"> · {c.contact_name}</span>}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge
              status={c.status === "done" ? "sent" : c.status}
              label={c.status === "done" ? "Called" : undefined}
            />
            <Badge variant={isOverdue ? "danger" : "info"}>
              <CalendarClock aria-hidden /> Call by{" "}
              {due.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </Badge>
          </div>
          {c.notes && (
            <p className="whitespace-pre-line text-sm text-muted-foreground">{c.notes}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          {isPending ? (
            <>
              <Button size="sm" className="flex-1 sm:flex-none" asChild>
                <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>
                  <PhoneCall aria-hidden /> Call
                </a>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 sm:flex-none"
                disabled={busy}
                onClick={() => onStatus("done")}
              >
                <Check aria-hidden /> Mark called
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={onSnooze}>
                <CalendarClock aria-hidden /> +1 day
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onStatus("canceled")}
              >
                <Ban aria-hidden /> Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus("pending")}>
              <RotateCcw aria-hidden /> Reopen
            </Button>
          )}
          <IconButton
            label={`Delete call for ${c.company || c.phone}`}
            size="sm"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 aria-hidden />
          </IconButton>
        </div>
      </div>
    </article>
  );
}

/** Compact "time until" label: 3h, 2d, or the overdue amount. */
function timeLeft(due: Date): string {
  const ms = Math.abs(due.getTime() - Date.now());
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`;
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
