import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listEmailDrafts, saveEmailDraft, getEmailDraft, deleteEmailDraft, type EmailDraft } from "@/lib/drafts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Save, FolderOpen, Trash2, Loader2, FileText } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { IconButton } from "@/components/app/icon-button";
import { toast } from "sonner";

export type DraftState = {
  name: string;
  gmailAccountId: string | null;
  templateId: string | null;
  resumeVersionId: string | null;
  recipients: string;
  subject: string;
  body: string;
  variables: Record<string, string>;
  resumeIds: string[];
  attachments: Array<{ filename: string; mimeType: string; size: number; base64?: string; storagePath?: string }>;
  company: string;
  role: string;
  jobDescription: string;
  instructions: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type LoadedDraft = { draft: EmailDraft; files: File[] };

export async function filesFromDraftAttachments(
  attachments: Array<{ filename: string; mimeType: string; size: number; storagePath: string; url: string | null }>,
): Promise<File[]> {
  const files: File[] = [];
  for (const a of attachments) {
    if (!a.url) continue;
    try {
      const buf = await (await fetch(a.url)).arrayBuffer();
      files.push(new File([buf], a.filename, { type: a.mimeType || "application/octet-stream" }));
    } catch {
      toast.error(`Could not restore ${a.filename}`);
    }
  }
  return files;
}

export function DraftManager({
  draftId,
  onDraftIdChange,
  getState,
  onLoad,
}: {
  draftId: string | null;
  onDraftIdChange: (id: string | null) => void;
  getState: () => Promise<DraftState>;
  onLoad: (loaded: LoadedDraft) => void;
}) {
  const qc = useQueryClient();
  const [openList, setOpenList] = useState(false);
  const [openSave, setOpenSave] = useState(false);
  const [name, setName] = useState("");

  const listFn = useServerFn(listEmailDrafts);
  const saveFn = useServerFn(saveEmailDraft);
  const getFn = useServerFn(getEmailDraft);
  const delFn = useServerFn(deleteEmailDraft);

  const drafts = useQuery({ queryKey: ["email-drafts"], queryFn: () => listFn(), enabled: openList });

  const save = useMutation({
    mutationFn: async () => {
      const state = await getState();
      return saveFn({
        data: {
          ...state,
          id: draftId ?? undefined,
          name: name.trim() || state.name || "Untitled draft",
          metadata: { ...(state.metadata ?? {}), autosave: false },
        },
      });
    },
    onSuccess: (r) => {
      onDraftIdChange(r.id);
      setOpenSave(false);
      qc.invalidateQueries({ queryKey: ["email-drafts"] });
      toast.success("Draft saved");
    },
    onError: (e) => toast.error("Could not save draft", { description: (e as Error).message }),
  });

  const load = useMutation({
    mutationFn: async (id: string) => {
      const r = await getFn({ data: { id } });
      const files = await filesFromDraftAttachments(r.attachments);
      return { draft: r.draft, files } as LoadedDraft;
    },
    onSuccess: (loaded) => {
      onLoad(loaded);
      onDraftIdChange(loaded.draft.id);
      setOpenList(false);
      toast.success(`Loaded “${loaded.draft.name}”`);
    },
    onError: (e) => toast.error("Could not load draft", { description: (e as Error).message }),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: (_r, id) => {
      if (draftId === id) onDraftIdChange(null);
      qc.invalidateQueries({ queryKey: ["email-drafts"] });
      toast.success("Draft deleted");
    },
    onError: (e) => toast.error("Could not delete draft", { description: (e as Error).message }),
  });

  return (
    <>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={() => setOpenList(true)}>
          <FolderOpen aria-hidden />
          Drafts
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpenSave(true)}>
          <Save aria-hidden />
          {draftId ? "Update draft" : "Save draft"}
        </Button>
      </div>

      <Dialog open={openSave} onOpenChange={(o) => !save.isPending && setOpenSave(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save draft</DialogTitle>
            <DialogDescription>Recipients, subject, body, variables and attachments are stored so you can pick this up later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="draft-name">Draft name</Label>
            <Input id="draft-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Backend applications — Nov batch" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenSave(false)} disabled={save.isPending}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openList} onOpenChange={setOpenList}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Saved drafts</DialogTitle>
            <DialogDescription>Load a draft to continue where you left off.</DialogDescription>
          </DialogHeader>
          {drafts.isLoading ? (
            <div role="status" className="py-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
            </div>
          ) : (drafts.data?.length ?? 0) === 0 ? (
            <EmptyState icon={FileText} title="No drafts yet" description="Use “Save draft” to keep an email for later." className="py-8" framed={false} />
          ) : (
            <ul className="max-h-80 overflow-auto divide-y divide-border/20 border-2 border-border">
              {drafts.data?.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{d.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {d.subject || "(no subject)"} · {new Date(d.updated_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => load.mutate(d.id)} disabled={load.isPending}>
                      {load.isPending && load.variables === d.id ? "Loading…" : "Load"}
                    </Button>
                    <IconButton label={`Delete draft “${d.name}”`} size="sm" onClick={() => del.mutate(d.id)}>
                      <Trash2 aria-hidden />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}