import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listReplies, syncReplies, getReply, updateReplyState, generateReplyDraft, sendReply } from "@/lib/replies.functions";
import { listTemplates } from "@/lib/templates.functions";
import { getUserPreferences } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Page, PageHeader } from "@/components/app/page";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Field } from "@/components/app/field";
import { SegmentedControl } from "@/components/app/segmented-control";
import { Inbox, RefreshCw, Sparkles, Send, Archive, ArchiveRestore, ArrowLeft, MailOpen, Mail, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import { relativeTime } from "@/lib/user-agent";
import { ReplyAssistantModal, type ReplyTone, type ReplyLength } from "@/components/reply-assistant-modal";
import { TemplateCombobox } from "@/components/template-combobox";

export const Route = createFileRoute("/_authenticated/replies")({
  head: () => ({ meta: [{ title: "Reply Center — Smart Email Sender" }] }),
  component: RepliesPage,
});

function RepliesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listReplies);
  const syncFn = useServerFn(syncReplies);
  const getFn = useServerFn(getReply);
  const updFn = useServerFn(updateReplyState);
  const genFn = useServerFn(generateReplyDraft);
  const sendFn = useServerFn(sendReply);
  const templatesFn = useServerFn(listTemplates);
  const prefsFn = useServerFn(getUserPreferences);

  const [filter, setFilter] = useState<"unread" | "read" | "archived" | "all">("unread");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [assistOpen, setAssistOpen] = useState(false);
  const [tplId, setTplId] = useState("");

  const list = useQuery({ queryKey: ["replies", filter], queryFn: () => listFn({ data: { filter } }) });
  const detail = useQuery({
    queryKey: ["reply", selectedId],
    queryFn: () => getFn({ data: { id: selectedId! } }),
    enabled: !!selectedId,
  });
  const templates = useQuery({ queryKey: ["templates"], queryFn: () => templatesFn({}) });
  const prefs = useQuery({ queryKey: ["user-prefs"], queryFn: () => prefsFn() });

  const sync = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      if (r.needsReconnect) {
        toast.info("Reconnect Gmail with read access to sync replies");
      } else {
        toast.success(`Synced ${r.replies} new repl${r.replies === 1 ? "y" : "ies"}`);
      }
      qc.invalidateQueries({ queryKey: ["replies"] });
    },
    onError: (e) => toast.error("Sync failed", { description: (e as Error).message }),
  });

  const setRead = useMutation({
    mutationFn: (id: string) => updFn({ data: { id, isRead: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["replies"] }),
    onError: (e) => toast.error("Couldn't mark as read", { description: (e as Error).message }),
  });
  const archive = useMutation({
    mutationFn: ({ id, isArchived }: { id: string; isArchived: boolean }) =>
      updFn({ data: { id, isArchived } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["replies"] });
      qc.invalidateQueries({ queryKey: ["reply"] });
    },
    onError: (e) => toast.error("Couldn't update archive", { description: (e as Error).message }),
  });

  const generate = useMutation({
    mutationFn: (opts: { tone: ReplyTone; length: ReplyLength; instruction: string }) =>
      genFn({ data: { replyId: selectedId!, tone: opts.tone, length: opts.length, instruction: opts.instruction || undefined } }),
    onSuccess: (r) => { setSubject(r.subject); setBody(r.body); setAssistOpen(false); toast.success("Draft generated"); },
    onError: (e) => toast.error("AI failed", { description: (e as Error).message }),
  });

  const submit = useMutation({
    mutationFn: () => sendFn({ data: { replyId: selectedId!, subject, body } }),
    onSuccess: () => {
      toast.success("Reply sent");
      qc.invalidateQueries({ queryKey: ["replies"] });
      setSubject(""); setBody("");
    },
    onError: (e) => toast.error("Send failed", { description: (e as Error).message }),
  });

  const onSelect = (id: string) => {
    setSelectedId(id);
    setSubject("");
    setBody("");
    setTplId("");
    setRead.mutate(id);
  };

  const FILTERS = [
    { value: "unread", label: "Unread", icon: Mail },
    { value: "read", label: "Read", icon: MailOpen },
    { value: "archived", label: "Archived", icon: Archive },
    { value: "all", label: "All", icon: Layers },
  ] as const;

  return (
    <Page size="wide">
      <PageHeader
        eyebrow="02 · Outreach"
        title="Reply Center"
        icon={Inbox}
        description="Every reply on your connected Gmail account, matched to a campaign when possible."
        actions={
          <Button onClick={() => sync.mutate()} disabled={sync.isPending} variant="secondary" className="w-full sm:w-auto">
            <RefreshCw className={sync.isPending ? "animate-spin" : undefined} aria-hidden /> {sync.isPending ? "Syncing…" : "Sync now"}
          </Button>
        }
      />

      <SegmentedControl
        value={filter}
        onValueChange={setFilter}
        ariaLabel="Filter replies"
        options={FILTERS.map((f) => ({ ...f }))}
      />

      <div className="grid grid-cols-1 border-2 border-border bg-card shadow-[var(--shadow-brutal)] lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* ── Pigeonholes (list column) ─────────────────────────── */}
        <div className={cn("min-w-0 lg:border-r-2 lg:border-border", selectedId && "hidden lg:block")}>
          <div className="flex items-center justify-between gap-2 border-b-2 border-border bg-muted px-4 py-2.5">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em]">Pigeonhole · {filter}</p>
            {list.data && <p className="tabular text-xs text-muted-foreground">{list.data.length}</p>}
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {list.isLoading ? (
              <ul className="divide-y divide-border/20" aria-busy="true" aria-label="Loading replies">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="flex gap-3 px-4 py-3">
                    <Skeleton className="mt-1 size-2.5" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-4/5" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : list.isError ? (
              <ErrorState
                className="m-4"
                title="Couldn't load replies"
                error={list.error}
                onRetry={() => list.refetch()}
                retrying={list.isFetching}
              />
            ) : list.data?.length ? (
              <ul className="divide-y divide-border/20">
                {list.data.map((r) => {
                  const selected = selectedId === r.id;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(r.id)}
                        aria-current={selected ? "true" : undefined}
                        className={cn(
                          "flex w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-offset-[-3px]",
                          selected ? "bg-secondary text-secondary-foreground" : "hover:bg-accent",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "mt-1.5 size-2.5 shrink-0",
                            r.is_read ? "border-2 border-transparent" : "border-2 border-border bg-primary",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={cn("truncate text-sm", r.is_read ? "font-medium" : "font-extrabold")}>
                              {!r.is_read && <span className="sr-only">Unread: </span>}
                              {r.from_name ?? r.from_email}
                            </span>
                            <span className={cn("tabular shrink-0 text-xs", selected ? "opacity-75" : "text-muted-foreground")}>
                              {relativeTime(r.received_at)}
                            </span>
                          </span>
                          <span className={cn("block truncate text-xs", !r.is_read && "font-semibold")}>
                            {r.subject ?? "(no subject)"}
                          </span>
                          <span className={cn("block truncate text-xs", selected ? "opacity-75" : "text-muted-foreground")}>
                            {r.snippet ?? ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                framed={false}
                icon={Inbox}
                title="No replies here"
                description="Hit Sync to check your Gmail for new replies."
                action={
                  <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
                    <RefreshCw className={sync.isPending ? "animate-spin" : undefined} aria-hidden /> Sync now
                  </Button>
                }
              />
            )}
          </div>
        </div>

        {/* ── Reading pane ──────────────────────────────────────── */}
        <div className={cn("min-w-0", !selectedId && "hidden lg:block")}>
          {!selectedId ? (
            <EmptyState
              framed={false}
              className="py-24"
              icon={MailOpen}
              title="Select a reply"
              description="Pick a letter from the pigeonholes to read it and draft a response."
            />
          ) : detail.isError ? (
            <div className="space-y-4 p-4 sm:p-6">
              <Button size="sm" variant="outline" className="lg:hidden" onClick={() => setSelectedId(null)}>
                <ArrowLeft aria-hidden /> Back to inbox
              </Button>
              <ErrorState
                title="Couldn't open this reply"
                error={detail.error}
                onRetry={() => detail.refetch()}
                retrying={detail.isFetching}
              />
            </div>
          ) : detail.isLoading || !detail.data ? (
            <div className="space-y-4 p-4 sm:p-6" aria-busy="true" aria-label="Loading reply">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <article className="flex min-w-0 flex-col">
              <div className="flex items-center justify-between gap-2 border-b-2 border-border bg-muted px-4 py-2 sm:px-6">
                <Button size="sm" variant="outline" className="lg:hidden" onClick={() => setSelectedId(null)}>
                  <ArrowLeft aria-hidden /> Back to inbox
                </Button>
                <p className="hidden font-mono text-xs font-semibold uppercase tracking-[0.08em] lg:block">Letter</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={archive.isPending}
                  onClick={() => archive.mutate({ id: detail.data!.reply.id, isArchived: !detail.data!.reply.is_archived })}
                >
                  {detail.data.reply.is_archived ? <><ArchiveRestore aria-hidden /> Unarchive</> : <><Archive aria-hidden /> Archive</>}
                </Button>
              </div>

              <div className="space-y-5 px-4 py-5 sm:px-6">
                <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-2 border-border bg-background p-3 font-mono text-xs">
                  <dt className="uppercase tracking-[0.08em] text-muted-foreground">From</dt>
                  <dd className="min-w-0 break-words font-semibold">
                    {detail.data.reply.from_name ? (
                      <>
                        {detail.data.reply.from_name}{" "}
                        <span className="font-normal text-muted-foreground">&lt;{detail.data.reply.from_email}&gt;</span>
                      </>
                    ) : (
                      detail.data.reply.from_email
                    )}
                  </dd>
                  {detail.data.campaign?.sender_email && (
                    <>
                      <dt className="uppercase tracking-[0.08em] text-muted-foreground">To</dt>
                      <dd className="min-w-0 break-words">{detail.data.campaign.sender_email}</dd>
                    </>
                  )}
                  <dt className="uppercase tracking-[0.08em] text-muted-foreground">Received</dt>
                  <dd className="min-w-0">{new Date(detail.data.reply.received_at).toLocaleString()}</dd>
                  {detail.data.campaign && (
                    <>
                      <dt className="uppercase tracking-[0.08em] text-muted-foreground">Campaign</dt>
                      <dd className="min-w-0 break-words">{detail.data.campaign.subject}</dd>
                    </>
                  )}
                </dl>

                <h2 className="font-expanded break-words text-xl leading-tight sm:text-2xl">
                  {detail.data.reply.subject ?? "(no subject)"}
                </h2>

                <div className="max-h-96 max-w-prose overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {detail.data.reply.body ?? detail.data.reply.snippet ?? ""}
                </div>
              </div>

              {/* ── Composer ─────────────────────────────────────── */}
              <section aria-labelledby="reply-composer-title" className="border-t-2 border-border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-border bg-primary px-4 py-2.5 text-primary-foreground sm:px-6">
                  <h3 id="reply-composer-title" className="font-expanded text-base leading-tight">Your reply</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const id = prefs.data?.followUpTemplateId;
                        const t = (templates.data ?? []).find((x) => x.id === id);
                        if (t) {
                          setTplId(t.id);
                          setBody(t.body ?? "");
                          toast.success("Follow-up template applied to body");
                        } else {
                          toast.message("No follow-up template set", {
                            description: "Pick a template below to fill the reply body.",
                          });
                        }
                      }}
                    >
                      Use follow-up template
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setAssistOpen(true)} disabled={generate.isPending}>
                      <Sparkles aria-hidden /> {generate.isPending ? "Drafting…" : "AI Draft"}
                    </Button>
                  </div>
                </div>
                <div className="space-y-4 px-4 py-5 sm:px-6">
                  <div className="space-y-2">
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em]">Template</p>
                    <TemplateCombobox
                      templates={(templates.data ?? []).map((t) => ({
                        id: t.id,
                        name: t.name,
                        is_default: !!(t as { is_default?: boolean }).is_default,
                      }))}
                      value={tplId}
                      onValueChange={(id) => {
                        setTplId(id);
                        const t = (templates.data ?? []).find((x) => x.id === id);
                        if (t) setBody(t.body ?? "");
                      }}
                      placeholder="Optional: fill body from a template…"
                      searchPlaceholder="Search templates…"
                      allowClear
                      clearLabel="Clear template"
                    />
                  </div>
                  <Field label="Subject" htmlFor="reply-subject">
                    <Input
                      id="reply-subject"
                      placeholder="Subject"
                      value={subject || `Re: ${detail.data.reply.subject ?? ""}`}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </Field>
                  <Field label="Message" htmlFor="reply-body">
                    <Textarea id="reply-body" rows={8} placeholder="Write a reply…" value={body} onChange={(e) => setBody(e.target.value)} />
                  </Field>
                  <div className="flex justify-end border-t-2 border-dashed border-border/40 pt-4">
                    <Button onClick={() => submit.mutate()} disabled={submit.isPending || !body.trim()} className="w-full sm:w-auto">
                      <Send aria-hidden /> {submit.isPending ? "Sending…" : "Send reply"}
                    </Button>
                  </div>
                </div>
              </section>
            </article>
          )}
        </div>
      </div>

      <ReplyAssistantModal
        open={assistOpen}
        onOpenChange={setAssistOpen}
        pending={generate.isPending}
        onGenerate={(opts) => generate.mutate(opts)}
      />
    </Page>
  );
}
