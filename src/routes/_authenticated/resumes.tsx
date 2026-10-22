import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Upload, Star, Trash2, Pencil, Download, Eye, RefreshCw, Loader2, Folder, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Page, PageHeader } from "@/components/app/page";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Field } from "@/components/app/field";
import { useConfirm } from "@/components/app/confirm-dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  listResumes,
  createResume,
  renameResume,
  replaceResume,
  deleteResume,
  setDefaultResume,
  getResumeSignedUrl,
  type Resume,
} from "@/lib/resumes.functions";
import { isAllowedResumeFile, uploadResumeFile, formatBytes } from "@/lib/resumes";
import { AI_JD_RESUME_FOLDER } from "@/lib/linkedin";

export const Route = createFileRoute("/_authenticated/resumes")({
  head: () => ({ meta: [{ title: "Resume Library — Smart Email Sender" }] }),
  component: ResumesPage,
});

function ResumesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listResumes);
  const createFn = useServerFn(createResume);
  const renameFn = useServerFn(renameResume);
  const replaceFn = useServerFn(replaceResume);
  const deleteFn = useServerFn(deleteResume);
  const setDefFn = useServerFn(setDefaultResume);
  const signFn = useServerFn(getResumeSignedUrl);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({ queryKey: ["resumes"], queryFn: () => listFn() });
  const confirm = useConfirm();

  const groups = useMemo(() => {
    const rows = data ?? [];
    const map = new Map<string, Resume[]>();
    for (const r of rows) {
      const key = r.folder?.trim() || "General";
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === "General") return -1;
      if (b === "General") return 1;
      if (a === AI_JD_RESUME_FOLDER) return -1;
      if (b === AI_JD_RESUME_FOLDER) return 1;
      return a.localeCompare(b);
    });
  }, [data]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const replaceRef = useRef<HTMLInputElement | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [renaming, setRenaming] = useState<Resume | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["resumes"] });

  const onPickUpload = async (file: File) => {
    const check = isAllowedResumeFile(file);
    if (!check.ok) { toast.error(check.reason); return; }
    setUploading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not signed in");
      const { path } = await uploadResumeFile(user.user.id, file);
      await createFn({
        data: {
          name: file.name.replace(/\.(pdf|docx?|DOCX?|PDF)$/, ""),
          originalFilename: file.name,
          storagePath: path,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        },
      });
      toast.success("Resume uploaded");
      invalidate();
    } catch (e) {
      toast.error("Upload failed", { description: (e as Error).message });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onReplace = async (id: string, file: File) => {
    const check = isAllowedResumeFile(file);
    if (!check.ok) { toast.error(check.reason); return; }
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not signed in");
      const { path } = await uploadResumeFile(user.user.id, file);
      await replaceFn({
        data: {
          id,
          originalFilename: file.name,
          storagePath: path,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        },
      });
      toast.success("Resume replaced");
      invalidate();
    } catch (e) {
      toast.error("Replace failed", { description: (e as Error).message });
    } finally {
      setReplacingId(null);
      if (replaceRef.current) replaceRef.current.value = "";
    }
  };

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Deleted"); },
    onError: (e) => toast.error((e as Error).message),
  });
  const setDefault = useMutation({
    mutationFn: (id: string) => setDefFn({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Default updated"); },
    onError: (e) => toast.error("Could not set default", { description: (e as Error).message }),
  });
  const save = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameFn({ data: { id, name } }),
    onSuccess: () => { invalidate(); toast.success("Renamed"); setRenaming(null); },
    onError: (e) => toast.error("Rename failed", { description: (e as Error).message }),
  });

  const open = async (id: string, download: boolean) => {
    try {
      const { url, filename } = await signFn({ data: { id, download } });
      if (download) {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      toast.error("Could not open file", { description: (e as Error).message });
    }
  };

  const confirmDelete = async (r: Resume) => {
    if (
      await confirm({
        title: `Delete "${r.name}"?`,
        description: "The file is removed from your library. This can't be undone.",
        confirmLabel: "Delete",
      })
    ) {
      remove.mutate(r.id);
    }
  };

  const totalFiles = data?.length ?? 0;

  return (
    <Page>
      <PageHeader
        eyebrow="03 · Library"
        title="Resume Library"
        icon={FileText}
        description={<>The filing cabinet for every resume you attach. AI-tailored PDFs are filed under “{AI_JD_RESUME_FOLDER}”.</>}
        meta={
          data && (
            <>
              <Badge variant="outline">{totalFiles} file{totalFiles === 1 ? "" : "s"}</Badge>
              <Badge variant="outline">{groups.length} folder{groups.length === 1 ? "" : "s"}</Badge>
            </>
          )
        }
      />

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickUpload(f); }}
      />
      <input
        ref={replaceRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f && replacingId) onReplace(replacingId, f); }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-busy={uploading}
        className="group flex w-full flex-col items-start gap-4 border-2 border-dashed border-border bg-card p-5 text-left transition-colors hover:bg-accent disabled:cursor-progress sm:flex-row sm:items-center sm:p-6"
      >
        <span className="grid size-14 shrink-0 -rotate-3 place-items-center border-2 border-border bg-primary text-primary-foreground shadow-[var(--shadow-brutal)] transition-transform group-hover:rotate-0">
          {uploading ? <Loader2 className="size-7 animate-spin" aria-hidden /> : <Upload className="size-7" strokeWidth={2.2} aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-expanded block text-xl leading-tight sm:text-2xl">
            {uploading ? "Uploading…" : "Upload a resume"}
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">
            Click to choose a file from your device. It's filed under General.
          </span>
        </span>
        <span className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground sm:text-right">
          PDF · DOC · DOCX
          <br />
          Max 25 MB
        </span>
      </button>

      {isError ? (
        <ErrorState title="Couldn't load your resumes" error={error} onRetry={() => refetch()} retrying={isFetching} />
      ) : isLoading ? (
        <div className="space-y-8" role="status" aria-label="Loading resumes">
          {Array.from({ length: 2 }).map((_, g) => (
            <div key={g}>
              <div className="flex items-end">
                <Skeleton className="h-8 w-40" />
                <div className="flex-1 border-b-2 border-border" />
              </div>
              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}
              </div>
            </div>
          ))}
        </div>
      ) : groups.length > 0 ? (
        <div className="space-y-10">
          {groups.map(([folder, rows]) => (
            <section key={folder} aria-label={`${folder} folder`}>
              <div className="flex items-end">
                <h2
                  className={cn(
                    "inline-flex max-w-[80%] items-center gap-2 border-2 border-b-0 border-border px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-[0.1em]",
                    folderTabTone(folder),
                  )}
                >
                  <Folder className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{folder}</span>
                  <span className="bg-card px-1.5 text-foreground tabular">
                    {rows.length}
                    <span className="sr-only"> file{rows.length === 1 ? "" : "s"}</span>
                  </span>
                </h2>
                <div className="flex-1 border-b-2 border-border" />
              </div>
              <ul className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {rows.map((r) => {
                  const kind = fileKind(r);
                  return (
                    <li
                      key={r.id}
                      className="relative flex min-w-0 border-2 border-border bg-card shadow-[var(--shadow-brutal)]"
                    >
                      <div
                        className={cn(
                          "flex w-20 shrink-0 flex-col items-center justify-center gap-1 border-r-2 border-border sm:w-24",
                          KIND_TONE[kind],
                        )}
                      >
                        <span className="font-expanded text-lg leading-none sm:text-xl">{kind}</span>
                        <span className="font-mono text-xs">v{r.version}</span>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate font-semibold leading-snug" title={r.name}>{r.name}</h3>
                            <p className="truncate font-mono text-xs text-muted-foreground" title={r.original_filename}>
                              {r.original_filename}
                            </p>
                          </div>
                          {r.is_default && (
                            <span className="stamp mr-1 mt-1 inline-flex shrink-0 items-center gap-1 px-1.5 py-0.5 text-xs text-info">
                              <Star className="size-3" aria-hidden /> Default
                            </span>
                          )}
                        </div>
                        <dl className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs uppercase tracking-[0.04em] text-muted-foreground">
                          <div className="flex gap-1"><dt className="sr-only">Size</dt><dd>{formatBytes(r.size_bytes)}</dd></div>
                          <div className="flex gap-1"><dt>Uploaded</dt><dd>{new Date(r.created_at).toLocaleDateString()}</dd></div>
                          <div className="flex gap-1"><dt>Updated</dt><dd>{new Date(r.updated_at).toLocaleDateString()}</dd></div>
                        </dl>
                        <div className="mt-3 flex items-center gap-2 border-t border-border/20 pt-3">
                          <Button size="sm" variant="outline" onClick={() => open(r.id, false)}>
                            <Eye aria-hidden /> Preview
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" aria-label={`More actions for ${r.name}`}>
                                <MoreHorizontal aria-hidden /> More
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48">
                              <DropdownMenuItem onSelect={() => open(r.id, true)}>
                                <Download aria-hidden /> Download
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => { setRenaming(r); setRenameValue(r.name); }}>
                                <Pencil aria-hidden /> Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => { setReplacingId(r.id); replaceRef.current?.click(); }}>
                                <RefreshCw aria-hidden /> Replace file
                              </DropdownMenuItem>
                              {!r.is_default && (
                                <DropdownMenuItem onSelect={() => setDefault.mutate(r.id)}>
                                  <Star aria-hidden /> Set as default
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                                onSelect={() => void confirmDelete(r)}
                              >
                                <Trash2 aria-hidden /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="The cabinet is empty"
          description="Upload PDFs, DOCs, or DOCXs you frequently attach to emails."
          action={<Button onClick={() => inputRef.current?.click()}><Upload aria-hidden /> Upload resume</Button>}
        />
      )}

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename resume</DialogTitle></DialogHeader>
          <Field label="Display name" htmlFor="rename-resume-name">
            <Input id="rename-resume-name" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button onClick={() => renaming && save.mutate({ id: renaming.id, name: renameValue.trim() })} disabled={save.isPending || !renameValue.trim()}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

const ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type FileKind = "PDF" | "DOCX" | "DOC" | "FILE";

const KIND_TONE: Record<FileKind, string> = {
  PDF: "bg-destructive-subtle text-foreground",
  DOCX: "bg-info-subtle text-foreground",
  DOC: "bg-info-subtle text-foreground",
  FILE: "bg-muted text-foreground",
};

function fileKind(r: Resume): FileKind {
  const ext = r.original_filename.split(".").pop()?.toUpperCase();
  if (ext === "PDF" || ext === "DOCX" || ext === "DOC") return ext;
  if (r.mime_type.includes("pdf")) return "PDF";
  if (r.mime_type.includes("wordprocessingml")) return "DOCX";
  if (r.mime_type.includes("msword")) return "DOC";
  return "FILE";
}

function folderTabTone(folder: string) {
  if (folder === "General") return "bg-secondary text-secondary-foreground";
  if (folder === AI_JD_RESUME_FOLDER) return "bg-highlight-subtle text-foreground";
  return "bg-card text-foreground";
}
