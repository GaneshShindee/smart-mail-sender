import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listJobSources,
  upsertJobSource,
  deleteJobSource,
  syncJobSource,
  type JobSource,
  type JobSourceKind,
} from "@/lib/job-sources.functions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Loader2, Plus, RefreshCw, Rss, Trash2 } from "lucide-react";
import { Field } from "@/components/app/field";
import { IconButton } from "@/components/app/icon-button";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { useConfirm } from "@/components/app/confirm-dialog";

const KIND_LABEL: Record<JobSourceKind, string> = {
  rss: "RSS",
  greenhouse: "Greenhouse",
  lever: "Lever",
  telegram: "Telegram",
};

/** Stamp colour per source type (small text on paper, so the saturated tokens are fine). */
const KIND_TONE: Record<JobSourceKind, string> = {
  rss: "text-warning",
  greenhouse: "text-success",
  lever: "text-info",
  telegram: "text-highlight",
};

export function JobSourcesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listJobSources);
  const upsertFn = useServerFn(upsertJobSource);
  const delFn = useServerFn(deleteJobSource);
  const syncFn = useServerFn(syncJobSource);
  const confirm = useConfirm();

  const sources = useQuery({
    queryKey: ["job-sources"],
    queryFn: () => listFn(),
    enabled: open,
  });

  const [kind, setKind] = useState<JobSourceKind>("rss");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [boardToken, setBoardToken] = useState("");
  const [site, setSite] = useState("");
  const [company, setCompany] = useState("");

  const webhookBase = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/api/public/telegram/webhook`;
  }, []);

  const create = useMutation({
    mutationFn: async (): Promise<JobSource> =>
      upsertFn({
        data: {
          name: name.trim(),
          kind,
          enabled: true,
          config: {
            url: kind === "rss" ? url.trim() : undefined,
            boardToken: kind === "greenhouse" ? boardToken.trim() : undefined,
            site: kind === "lever" ? site.trim() : undefined,
            company: company.trim() || undefined,
          },
        },
      }) as Promise<JobSource>,
    onSuccess: (row: JobSource) => {
      qc.invalidateQueries({ queryKey: ["job-sources"] });
      toast.success("Source added");
      setName("");
      setUrl("");
      setBoardToken("");
      setSite("");
      setCompany("");
      if (row.kind === "telegram" && row.webhook_secret) {
        const wh = `${webhookBase}?secret=${row.webhook_secret}`;
        void navigator.clipboard.writeText(wh).then(
          () => toast.message("Telegram webhook URL copied", { description: wh }),
          () => toast.message("Telegram webhook URL", { description: wh }),
        );
      }
    },
    onError: (e) => toast.error("Could not add source", { description: (e as Error).message }),
  });

  const sync = useMutation({
    mutationFn: (id: string) => syncFn({ data: { id } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["job-sources"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast.success(`Synced: ${r.created} new, ${r.skipped} skipped`, {
        description: `Scanned ${r.scanned} listings`,
      });
    },
    onError: (e) => toast.error("Sync failed", { description: (e as Error).message }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job-sources"] });
      toast.success("Source removed");
    },
    onError: (e) => toast.error("Could not remove source", { description: (e as Error).message }),
  });

  const copyWebhook = (s: JobSource) => {
    if (!s.webhook_secret) return;
    const wh = `${webhookBase}?secret=${s.webhook_secret}`;
    void navigator.clipboard.writeText(wh).then(
      () => toast.success("Webhook URL copied"),
      () => toast.message(wh),
    );
  };

  const rows = sources.data as JobSource[] | undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <p className="eyebrow">Wire service</p>
          <DialogTitle>Sync job sources</DialogTitle>
          <DialogDescription>
            Pull openings from RSS feeds, Greenhouse / Lever boards, or a Telegram channel. Duplicates are skipped by URL.
            Run the <code className="font-mono text-xs text-foreground">job_sources</code> SQL migration in Supabase if this fails.
          </DialogDescription>
        </DialogHeader>

        <section aria-labelledby="add-source-title" className="space-y-4 border-2 border-border bg-muted p-4">
          <h3 id="add-source-title" className="font-mono text-xs font-semibold uppercase tracking-[0.08em]">Add a source</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Type" htmlFor="source-kind">
              <Select value={kind} onValueChange={(v) => setKind(v as JobSourceKind)}>
                <SelectTrigger id="source-kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rss">RSS / Atom feed</SelectItem>
                  <SelectItem value="greenhouse">Greenhouse board</SelectItem>
                  <SelectItem value="lever">Lever board</SelectItem>
                  <SelectItem value="telegram">Telegram channel</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Name (optional)" htmlFor="source-name">
              <Input id="source-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme careers" />
            </Field>
          </div>

          {kind === "rss" && (
            <Field label="Feed URL" htmlFor="source-url">
              <Input id="source-url" className="font-mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/jobs.xml" />
            </Field>
          )}
          {kind === "greenhouse" && (
            <Field label="Board token" htmlFor="source-board-token">
              <Input
                id="source-board-token"
                className="font-mono"
                value={boardToken}
                onChange={(e) => setBoardToken(e.target.value)}
                placeholder="from boards.greenhouse.io/TOKEN"
              />
            </Field>
          )}
          {kind === "lever" && (
            <Field label="Site slug" htmlFor="source-site">
              <Input id="source-site" className="font-mono" value={site} onChange={(e) => setSite(e.target.value)} placeholder="from jobs.lever.co/SITE" />
            </Field>
          )}
          {kind === "telegram" && (
            <p className="border-l-4 border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              Creates a webhook URL. Point your bot with{" "}
              <code className="font-mono text-xs text-foreground">setWebhook</code>, add the bot to the channel, then post JDs — they become jobs automatically.
            </p>
          )}
          {kind !== "telegram" && (
            <Field label="Company fallback (optional)" htmlFor="source-company">
              <Input id="source-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Used if AI cannot infer company" />
            </Field>
          )}

          <Button
            className="w-full sm:w-auto"
            onClick={() => create.mutate()}
            disabled={
              create.isPending ||
              (kind === "rss" && !url.trim()) ||
              (kind === "greenhouse" && !boardToken.trim()) ||
              (kind === "lever" && !site.trim())
            }
          >
            {create.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
            Add source
          </Button>
        </section>

        <section aria-labelledby="sources-list-title">
          <h3 id="sources-list-title" className="mb-2 flex items-baseline justify-between border-b-2 border-border pb-1.5 font-mono text-xs font-semibold uppercase tracking-[0.08em]">
            Your sources
            {rows && <span className="text-muted-foreground">{rows.length}</span>}
          </h3>
          {sources.isLoading ? (
            <div className="space-y-3 py-2" aria-busy="true" aria-label="Loading sources">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>
                  <Skeleton className="h-9 w-20" />
                </div>
              ))}
            </div>
          ) : sources.isError ? (
            <ErrorState title="Couldn't load sources" error={sources.error} onRetry={() => sources.refetch()} retrying={sources.isFetching} className="py-8" />
          ) : rows?.length ? (
            <ul className="divide-y divide-border/20">
              {rows.map((s) => {
                const syncingThis = sync.isPending && sync.variables === s.id;
                return (
                  <li key={s.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className={`stamp shrink-0 bg-card px-1.5 text-xs ${KIND_TONE[s.kind] ?? "text-foreground"}`}>{KIND_LABEL[s.kind] ?? s.kind}</span>
                        <span className="min-w-0 truncate text-sm font-semibold">{s.name}</span>
                        {!s.enabled && <Badge variant="muted">off</Badge>}
                      </div>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {s.kind === "rss" && String((s.config as { url?: string }).url ?? "")}
                        {s.kind === "greenhouse" && `board: ${(s.config as { boardToken?: string }).boardToken ?? ""}`}
                        {s.kind === "lever" && `site: ${(s.config as { site?: string }).site ?? ""}`}
                        {s.kind === "telegram" && "Webhook-driven"}
                        {s.last_synced_at ? ` · last sync ${new Date(s.last_synced_at).toLocaleString()}` : ""}
                      </p>
                      {s.last_error && <p className="truncate text-xs text-destructive" title={s.last_error}>{s.last_error}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                      {s.kind === "telegram" ? (
                        <Button size="sm" variant="outline" onClick={() => copyWebhook(s)}>
                          <Copy aria-hidden /> Webhook
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(s.id)}>
                          {syncingThis ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
                          {syncingThis ? "Syncing…" : "Sync"}
                        </Button>
                      )}
                      <IconButton
                        label={`Remove ${s.name}`}
                        className="text-destructive hover:bg-destructive-subtle hover:text-foreground"
                        onClick={async () => {
                          if (await confirm({ title: "Remove this source?", description: `"${s.name}" will stop syncing. Jobs already imported stay on the board.`, confirmLabel: "Remove source" })) remove.mutate(s.id);
                        }}
                      >
                        <Trash2 aria-hidden />
                      </IconButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              framed={false}
              icon={Rss}
              title="No sources yet"
              description="Add a feed, board or Telegram channel above, then hit Sync to pull its openings."
              className="py-8"
            />
          )}
        </section>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
