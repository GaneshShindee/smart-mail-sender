import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TemplateCombobox } from "@/components/template-combobox";
import { IconButton } from "@/components/app/icon-button";
import { SegmentedControl } from "@/components/app/segmented-control";
import { StatusBadge } from "@/components/app/status-badge";
import { Sparkles, Send, X, RotateCcw, PenLine, LayoutTemplate, Reply } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { bulkSendReply, generateBulkReplyDraft } from "@/lib/bulk-reply.functions";
import { ReplyAssistantModal, type ReplyLength, type ReplyTone } from "@/components/reply-assistant-modal";
import { replyPreviewSubject } from "@/lib/reply-subject";
import { toast } from "sonner";

export type BulkReplyRecipient = {
  id: string;
  email: string;
  name: string | null;
  subject: string;
};

export type BulkReplyTemplate = {
  id: string;
  name: string;
  body: string;
  is_default?: boolean;
};

type RowState = "pending" | "sending" | "success" | "failed";
type ComposeMode = "free" | "template" | "followup";

export function BulkReplyDialog({
  open,
  onOpenChange,
  recipients,
  templates,
  followUpTemplateId = null,
  initialMode = "free",
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  recipients: BulkReplyRecipient[];
  templates: BulkReplyTemplate[];
  /** Preferred follow-up template from user prefs (fills body when Follow-up mode is used). */
  followUpTemplateId?: string | null;
  initialMode?: ComposeMode;
  onDone: () => void;
}) {
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ComposeMode>(initialMode);
  const [templateId, setTemplateId] = useState<string>("");
  const [body, setBody] = useState("");
  const [assistOpen, setAssistOpen] = useState(false);
  const [progress, setProgress] = useState<Record<string, { state: RowState; reason?: string }>>({});
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  const sendFn = useServerFn(bulkSendReply);
  const draftFn = useServerFn(generateBulkReplyDraft);

  const active = useMemo(() => recipients.filter((r) => !removed.has(r.id)), [recipients, removed]);

  const followUpTpl = useMemo(
    () => (followUpTemplateId ? templates.find((t) => t.id === followUpTemplateId) : null) ?? null,
    [templates, followUpTemplateId],
  );

  const applyTemplateBody = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setTemplateId(id);
    setBody(t.body ?? "");
  };

  // When dialog opens, hydrate mode + follow-up body if requested.
  useEffect(() => {
    if (!open) return;
    setRemoved(new Set());
    setProgress({});
    setRunning(false);
    setFinished(false);
    setAssistOpen(false);
    setMode(initialMode);

    if (initialMode === "followup" && followUpTpl) {
      setTemplateId(followUpTpl.id);
      setBody(followUpTpl.body ?? "");
    } else if (initialMode === "template") {
      setTemplateId("");
      setBody("");
    } else {
      setTemplateId("");
      setBody("");
    }
  }, [open, initialMode, followUpTpl]);

  const generate = useMutation({
    mutationFn: (opts: { tone: ReplyTone; length: ReplyLength; instruction: string }) =>
      draftFn({
        data: {
          recipientIds: active.map((r) => r.id),
          tone: opts.tone,
          length: opts.length,
          instruction: opts.instruction || undefined,
          templateId: templateId || undefined,
        },
      }),
    onSuccess: (r) => {
      setBody(r.body);
      setAssistOpen(false);
      toast.success("Draft generated — review before sending");
    },
    onError: (e) => toast.error("AI failed", { description: (e as Error).message }),
  });

  const reset = () => {
    setRemoved(new Set());
    setBody("");
    setTemplateId("");
    setMode("free");
    setProgress({});
    setRunning(false);
    setFinished(false);
  };

  const runSend = async (targets: BulkReplyRecipient[]) => {
    if (targets.length === 0) return;
    setRunning(true);
    setFinished(false);
    setProgress((p) => {
      const next = { ...p };
      for (const t of targets) next[t.id] = { state: "pending" };
      return next;
    });

    // Body-only send (template is applied into the textarea). One Gmail reply per recipient.
    for (const t of targets) {
      setProgress((p) => ({ ...p, [t.id]: { state: "sending" } }));
      try {
        const res = await sendFn({
          data: {
            recipientIds: [t.id],
            body,
          },
        });
        if (res.success.length > 0) {
          setProgress((p) => ({ ...p, [t.id]: { state: "success" } }));
        } else {
          setProgress((p) => ({
            ...p,
            [t.id]: { state: "failed", reason: res.failed[0]?.reason ?? "Unknown error" },
          }));
        }
      } catch (e) {
        setProgress((p) => ({ ...p, [t.id]: { state: "failed", reason: (e as Error).message } }));
      }
    }
    setRunning(false);
    setFinished(true);
    onDone();
  };

  const sentCount = active.filter((r) => progress[r.id]?.state === "success").length;
  const failed = active.filter((r) => progress[r.id]?.state === "failed");
  const doneCount = active.filter((r) => ["success", "failed"].includes(progress[r.id]?.state ?? "")).length;
  const canSend = !running && body.trim().length > 0 && active.length > 0;

  const selectMode = (next: ComposeMode) => {
    setMode(next);
    if (next === "followup") {
      if (followUpTpl) applyTemplateBody(followUpTpl.id);
      else {
        setTemplateId("");
        toast.message("No follow-up template set", {
          description: "Pick any template below, or set a follow-up template in preferences later.",
        });
      }
    }
    if (next === "free") {
      // keep body editable; don't wipe what they wrote
    }
  };

  const ROW_STATUS: Record<RowState, string> = {
    pending: "queued",
    sending: "sending",
    success: "sent",
    failed: "failed",
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (running) return;
          if (!o) reset();
          onOpenChange(o);
        }}
      >
        {/* Phones: full-screen sheet so the composer gets the whole viewport. sm+: centered card. */}
        <DialogContent className="left-0 top-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden border-0 p-0 shadow-none pt-[env(safe-area-inset-top)] sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:border-2 sm:p-0 sm:pt-0 sm:shadow-[var(--shadow-brutal-lg)]">
          <div className="airmail order-first h-2 shrink-0 border-b-2 border-border" aria-hidden />
          <DialogHeader className="shrink-0 border-b-2 border-border p-4 pr-14 text-left sm:p-5 sm:pr-14">
        <DialogContent className="flex max-h-[90dvh] w-[calc(100%-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:w-full sm:p-0">
          <div className="airmail order-first h-2 shrink-0 border-b-2 border-border" aria-hidden />
          <DialogHeader className="shrink-0 border-b-2 border-border p-5 pr-14 text-left">
            <p className="eyebrow">
              Outbox · {active.length} letter{active.length === 1 ? "" : "s"}
            </p>
            <DialogTitle>{initialMode === "followup" ? "Follow-up reply" : "Reply to selected"}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {active.length} individual repl{active.length === 1 ? "y" : "ies"} — one per recipient, each inside their own
              Gmail conversation. No BCC. Template / follow-up content is attached as the reply body.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-5 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:space-y-6 sm:p-5">
            <div className="space-y-6 p-5">
              {!finished && (
                <>
                  <div className="space-y-2">
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em]">Compose mode</p>
                    <SegmentedControl<ComposeMode>
                      value={mode}
                      onValueChange={selectMode}
                      ariaLabel="Compose mode"
                      size="sm"
                      options={[
                        { value: "free", label: "Free-form", icon: PenLine },
                        { value: "template", label: "Template", icon: LayoutTemplate },
                        { value: "followup", label: "Follow-up", icon: Reply },
                        { value: "followup", label: "Follow-up template", icon: Reply },
                      ]}
                    />
                  </div>

                  {(mode === "template" || mode === "followup") && (
                    <div className="space-y-2">
                      <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em]">
                        {mode === "followup" ? "Follow-up template (fills body below)" : "Template (fills body below)"}
                      </p>
                      <TemplateCombobox
                        templates={templates}
                        value={templateId}
                        onValueChange={(id) => {
                          if (!id) {
                            setTemplateId("");
                            return;
                          }
                          applyTemplateBody(id);
                        }}
                        placeholder={mode === "followup" ? "Choose follow-up template…" : "Choose a reply template…"}
                        searchPlaceholder="Search templates…"
                        allowClear
                        clearLabel="Clear template"
                      />
                      {mode === "followup" && !followUpTpl && (
                        <p className="text-xs text-muted-foreground">
                          No default follow-up template saved — pick any template to use as the reply body.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label htmlFor="bulk-reply-body">Reply body</Label>
                      <Button size="sm" variant="outline" onClick={() => setAssistOpen(true)} disabled={generate.isPending}>
                        <Sparkles aria-hidden /> {generate.isPending ? "Drafting…" : "Generate AI reply"}
                      </Button>
                    </div>
                    <Textarea
                      id="bulk-reply-body"
                      rows={8}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Write your reply. Use {{first_name}} for the recipient's name — each reply is personalized individually."
                      className="min-h-40 text-base sm:text-sm"
                      className="min-h-40"
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                      Subject uses each original email with a <span className="font-mono">Re:</span> prefix. Each person gets this body in their own thread.
                    </p>
                  </div>
                </>
              )}

              {finished && (
                <div className="border-2 border-border">
                  <div className="grid grid-cols-3 divide-x-2 divide-border">
                    <Tally label="Sent" value={sentCount} className="bg-success-subtle" />
                    <Tally label="Failed" value={failed.length} className={failed.length ? "bg-destructive-subtle" : "bg-card"} />
                    <Tally label="Total" value={active.length} className="bg-card" />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em]">
                    Recipients ({active.length})
                  </p>
                  {(running || finished) && (
                    <p className="tabular text-xs" aria-live="polite">
                      {doneCount} / {active.length}
                    </p>
                  )}
                </div>
                {running && (
                  <Progress
                    value={active.length ? (doneCount / active.length) * 100 : 0}
                    aria-label="Sending progress"
                  />
                )}
                <ol className="divide-y divide-border/20 border-2 border-border bg-card">
                  {active.map((r, i) => {
                    const st = progress[r.id]?.state;
                    return (
                      <li
                        key={r.id}
                        className={`flex items-start gap-2 px-2.5 py-2.5 sm:gap-3 sm:px-3 text-sm transition-colors ${st === "sending" ? "bg-accent" : ""}`}
                        className={`flex items-start gap-3 px-3 py-2.5 text-sm transition-colors ${st === "sending" ? "bg-accent" : ""}`}
                      >
                        <span className="tabular w-6 shrink-0 pt-0.5 text-xs text-muted-foreground" aria-hidden>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{r.name ?? r.email}</span>
                          <span className="block truncate font-mono text-xs text-muted-foreground">{r.email}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {replyPreviewSubject(r.subject)}
                          </span>
                          {progress[r.id]?.reason && (
                            <span className="mt-1 block text-xs text-destructive">{progress[r.id]?.reason}</span>
                          )}
                        </span>
                        {st && <StatusBadge status={ROW_STATUS[st]} className="mt-0.5 shrink-0" />}
                        {!running && !finished && (
                          <IconButton
                            label={`Remove ${r.email}`}
                            size="sm"
                            className="-my-1 shrink-0"
                            onClick={() => setRemoved((s) => new Set(s).add(r.id))}
                          >
                            <X aria-hidden />
                          </IconButton>
                        )}
                      </li>
                    );
                  })}
                  {active.length === 0 && (
                    <li className="px-3 py-4 text-sm text-muted-foreground">All recipients removed.</li>
                  )}
                </ol>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="shrink-0 flex-nowrap gap-2 border-b-2 border-border bg-muted p-3 sm:flex-wrap sm:p-4 sm:px-5 [&>button]:flex-1 sm:[&>button]:flex-none">
          <DialogFooter className="shrink-0 gap-2 border-b-2 border-border bg-muted p-4 sm:px-5">
            {finished ? (
              <>
                {failed.length > 0 && (
                  <Button variant="outline" onClick={() => runSend(failed)}>
                    <RotateCcw aria-hidden /> Retry failed ({failed.length})
                  </Button>
                )}
                <Button
                  onClick={() => {
                    reset();
                    onOpenChange(false);
                  }}
                >
                  Close
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={running}>
                  Cancel
                </Button>
                <Button onClick={() => runSend(active)} disabled={!canSend}>
                  <Send aria-hidden />
                  {running ? `Sending ${doneCount}/${active.length}…` : `Send ${active.length} repl${active.length === 1 ? "y" : "ies"}`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReplyAssistantModal
        open={assistOpen}
        onOpenChange={setAssistOpen}
        pending={generate.isPending}
        onGenerate={(opts) => generate.mutate(opts)}
        recipientCount={active.length}
      />
    </>
  );
}

function Tally({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={`px-3 py-3 ${className ?? ""}`}>
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em]">{label}</p>
      <p className="font-expanded mt-1 text-3xl leading-none tabular-nums">{value}</p>
    </div>
  );
}
