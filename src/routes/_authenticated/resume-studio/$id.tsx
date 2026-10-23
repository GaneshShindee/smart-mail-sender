import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getResumeVersion,
  updateResumeVersionTex,
  uploadResumeVersionPdf,
  saveResumeVersionToLibrary,
  saveResumeVersionAsMaster,
  deleteResumeVersion,
  improveResumeSection,
  generateApplicationEmail,
} from "@/lib/resume-studio.functions";
import { getUserPreferences, setUserPreferences } from "@/lib/profile.functions";
import { resumeFileBaseName } from "@/lib/naming";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LatexEditor, type EditorSelection, type LatexEditorApi } from "@/components/latex-editor";
import { LatexPreview } from "@/components/latex-preview";
import { UpdateResumeDialog, InlineAskAi } from "@/components/resume-ai-dialogs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Page } from "@/components/app/page";
import { ErrorState } from "@/components/app/error-state";
import { IconButton } from "@/components/app/icon-button";
import { SegmentedControl } from "@/components/app/segmented-control";
import { useConfirm } from "@/components/app/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Save, Wand2, Sparkles, Trash2, Send, CheckCircle2, AlertCircle, FolderPlus, Paperclip, Copy,
  ChevronDown, ChevronUp, Check, CircleDashed, Code2, Eye, Loader2, MoreHorizontal, X, type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AI_JD_RESUME_FOLDER } from "@/lib/linkedin";
import { peekSendResumeHandoff, saveSendResumeHandoff } from "@/lib/send-resume-handoff";
import { setLinkedResumeVersionId } from "@/lib/job-resume-link";
import { z } from "zod";

const studioSearchSchema = z
  .object({
    /** Came from Send Email — attach PDF only, never AI-draft a new body. */
    returnToSend: z.union([z.boolean(), z.literal("true"), z.literal("1"), z.literal(1)]).optional(),
  })
  .partial();

function isReturnToSend(v: unknown): boolean {
  return v === true || v === "true" || v === "1" || v === 1;
}

export const Route = createFileRoute("/_authenticated/resume-studio/$id")({
  head: () => ({ meta: [{ title: "Resume workspace — Smart Email Sender" }] }),
  validateSearch: (s: Record<string, unknown>) => studioSearchSchema.parse(s),
  component: WorkspacePage,
});

function WorkspacePage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const nav = useNavigate();

  const getFn = useServerFn(getResumeVersion);
  const saveFn = useServerFn(updateResumeVersionTex);
  const uploadPdfFn = useServerFn(uploadResumeVersionPdf);
  const saveLibraryFn = useServerFn(saveResumeVersionToLibrary);
  const saveAsMasterFn = useServerFn(saveResumeVersionAsMaster);
  const delFn = useServerFn(deleteResumeVersion);
  const improveFn = useServerFn(improveResumeSection);
  const emailFn = useServerFn(generateApplicationEmail);
  const prefsFn = useServerFn(getUserPreferences);
  const setPrefsFn = useServerFn(setUserPreferences);

  const q = useQuery({ queryKey: ["resume-version", id], queryFn: () => getFn({ data: { id } }) });
  const prefs = useQuery({ queryKey: ["user-prefs"], queryFn: () => prefsFn() });
  const savePresets = useMutation({
    mutationFn: (resumeAiPresets: string[]) => setPrefsFn({ data: { resumeAiPresets } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-prefs"] }),
    onError: (e) => toast.error("Couldn't save preset", { description: (e as Error).message }),
  });
  const [tex, setTex] = useState("");
  const [dirty, setDirty] = useState(false);
  const [errorLines, setErrorLines] = useState<number[]>([]);
  const [compiledTex, setCompiledTex] = useState<string | null>(null);
  const [hasPdf, setHasPdf] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [selection, setSelection] = useState<EditorSelection | null>(null);
  const editorApi = useRef<LatexEditorApi | null>(null);
  /** Mobile only: which pane fills the workspace (both show side by side on lg+). */
  const [pane, setPane] = useState<"editor" | "preview">("editor");
  const confirm = useConfirm();
  const [attachOnlyHandoff, setAttachOnlyHandoff] = useState(
    () => peekSendResumeHandoff()?.attachOnly === true || isReturnToSend(search.returnToSend),
  );

  useEffect(() => {
    setAttachOnlyHandoff(
      peekSendResumeHandoff()?.attachOnly === true || isReturnToSend(search.returnToSend),
    );
  }, [id, search.returnToSend]);

  useEffect(() => {
    if (q.data && !dirty) setTex(q.data.version.tex_content);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { id, tex } }),
    onSuccess: () => { setDirty(false); toast.success("Saved"); qc.invalidateQueries({ queryKey: ["resume-version", id] }); },
    onError: (e) => toast.error("Save failed", { description: (e as Error).message }),
  });

  // Auto-save 1.5s after the user stops editing.
  useEffect(() => {
    if (!dirty || save.isPending) return;
    const t = setTimeout(() => save.mutate(), 1500);
    return () => clearTimeout(t);
  }, [tex, dirty]);

  const uploadPdf = useMutation({
    mutationFn: (b64: string) => uploadPdfFn({ data: { id, pdfBase64: b64 } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resume-version", id] });
      qc.invalidateQueries({ queryKey: ["resumes"] });
    },
    onError: (e) => toast.error("Couldn't upload the compiled PDF", { description: (e as Error).message }),
  });

  const saveToLibrary = useMutation({
    mutationFn: () => saveLibraryFn({ data: { id } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["resumes"] });
      toast.success(r.updated ? "Updated in Resumes" : "Saved to Resumes", {
        description: `Folder: ${r.folder}`,
        action: {
          label: "Open Resumes",
          onClick: () => nav({ to: "/resumes" }),
        },
      });
    },
    onError: (e) => toast.error("Could not save to Resumes", { description: (e as Error).message }),
  });

  const saveAsMaster = useMutation({
    mutationFn: () => saveAsMasterFn({ data: { id } }),
    onSuccess: (proj) => {
      qc.invalidateQueries({ queryKey: ["resume-projects"] });
      toast.success(`Saved as Master resume "${proj.name}"`, {
        action: { label: "Open Resume Studio", onClick: () => nav({ to: "/resume-studio" }) },
      });
    },
    onError: (e) => toast.error("Could not save as Master", { description: (e as Error).message }),
  });

  const del = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Version deleted"); nav({ to: "/resume-studio" }); },
    onError: (e) => toast.error("Delete failed", { description: (e as Error).message }),
  });

  const confirmDelete = async () => {
    if (await confirm({ title: "Delete this version?", description: "The tailored LaTeX and its compiled PDF are removed.", confirmLabel: "Delete version" })) {
      del.mutate();
    }
  };

  const improve = useMutation({
    mutationFn: (section: "summary" | "experience" | "projects" | "skills" | "ats") =>
      improveFn({ data: { id, section } }),
    onSuccess: (r) => { setTex(r.tex); setDirty(true); toast.success("AI updated the section"); },
    onError: (e) => toast.error("AI failed", { description: (e as Error).message }),
  });

  const draftEmail = useMutation({
    mutationFn: () => emailFn({ data: { versionId: id } }),
    onSuccess: (r) => {
      nav({
        to: "/send",
        search: { resumeVersionId: id, name: q.data?.version.job_title ?? "", company: q.data?.version.company ?? "" },
      });
      try {
        sessionStorage.setItem("resume-studio-email", JSON.stringify({ versionId: id, ...r }));
      } catch { /* ignore */ }
      toast.success("Draft ready — attaching in Send Email");
    },
    onError: (e) => toast.error("AI failed", { description: (e as Error).message }),
  });

  const pdfStale = compiledTex !== tex;

  /** Return to Send with existing email + this PDF — no new AI email. */
  const attachToExistingEmail = () => {
    if (!hasPdf) {
      toast.error("Compile the resume first", { description: "Click Compile in the preview to generate the PDF." });
      return;
    }
    if (pdfStale) {
      toast.error("Source changed since last compile", { description: "Re-compile so the newest PDF is attached." });
      return;
    }
    const existing = peekSendResumeHandoff();
    if (existing?.attachOnly) {
      saveSendResumeHandoff({ ...existing, resumeVersionId: id });
    } else {
      saveSendResumeHandoff({
        attachOnly: true,
        subject: "",
        body: "",
        company: q.data?.version.company ?? "",
        role: q.data?.version.job_title ?? "",
        resumeVersionId: id,
      });
    }
    // Keep this version linked to the company/role for future "Generate Resume" clicks.
    setLinkedResumeVersionId(
      {
        jobId: existing?.jobId,
        company: existing?.company || q.data?.version.company,
        role: existing?.role || q.data?.version.job_title,
      },
      id,
    );
    nav({
      to: "/send",
      search: {
        resumeVersionId: id,
        company: q.data?.version.company ?? "",
        name: q.data?.version.job_title ?? "",
        ...(existing?.jobId ? { jobId: existing.jobId } : {}),
      },
    });
    toast.success("Attaching resume to your email", {
      description: "Subject & body are unchanged.",
    });
  };

  const onSendClick = () => {
    // Re-check at click time — handoff / returnToSend must never AI-draft a new email.
    const handoff = peekSendResumeHandoff();
    if (handoff?.attachOnly || isReturnToSend(search.returnToSend) || attachOnlyHandoff) {
      attachToExistingEmail();
      return;
    }
    if (!hasPdf) {
      toast.error("Compile the resume first", { description: "Click Compile in the preview to generate resume.pdf." });
      return;
    }
    if (pdfStale) {
      toast.error("Source changed since last compile", { description: "Re-compile so the newest PDF is attached." });
      return;
    }
    draftEmail.mutate();
  };

  if (q.isError) {
    return (
      <Page size="narrow">
        <ErrorState
          title="Couldn't open this resume"
          error={q.error}
          onRetry={() => q.refetch()}
          retrying={q.isFetching}
        />
        <Button asChild variant="outline">
          <Link to="/resume-studio"><ArrowLeft aria-hidden /> All resumes</Link>
        </Button>
      </Page>
    );
  }

  if (q.isLoading || !q.data) {
    return (
      <Page size="full" className={cn("flex flex-col gap-0 space-y-0", WORKSPACE_HEIGHT)}>
        <div role="status" aria-label="Loading resume workspace" className={WORKSPACE_FRAME}>
          <div className="space-y-3 border-b-2 border-border p-4">
            <Skeleton className="h-8 w-72 max-w-full" />
            <Skeleton className="h-9 w-96 max-w-full" />
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
            <Skeleton className="h-full border-0" />
            <Skeleton className="hidden h-full border-0 border-l-2 border-l-border lg:block" />
          </div>
        </div>
      </Page>
    );
  }

  const v = q.data.version;
  const score = v.ats_score ?? null;
  const hasInsights = Boolean(
    v.matched_keywords.length || v.missing_keywords.length || v.strengths.length || v.suggestions.length,
  );
  const band = score !== null ? atsBand(score) : null;

  return (
    <Page size="full" className={cn("flex flex-col gap-0 space-y-0", WORKSPACE_HEIGHT)}>
      <div className={WORKSPACE_FRAME}>
        {/* ── One compact toolbar: identity · AI tools · save/send. Keeps code + preview tall. ── */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b-2 border-border bg-background px-2 py-2 sm:px-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <IconButton label="Back to all resumes" variant="outline" size="sm" asChild className="shrink-0">
              <Link to="/resume-studio"><ArrowLeft aria-hidden /></Link>
            </IconButton>
            <div className="min-w-0">
              <h1
                className="font-expanded truncate text-base leading-tight sm:text-lg"
                title={`Updated ${new Date(v.updated_at).toLocaleString()}`}
              >
                {v.job_title || "Untitled role"}{v.company ? ` · ${v.company}` : ""}
              </h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {save.isPending ? (
                  <Badge variant="info"><Loader2 className="animate-spin" aria-hidden /> Saving</Badge>
                ) : dirty ? (
                  <Badge variant="warning"><CircleDashed aria-hidden /> Unsaved</Badge>
                ) : (
                  <Badge variant="success"><Check aria-hidden /> Saved</Badge>
                )}
                {band && (
                  <span
                    className={cn("inline-flex items-center gap-1.5 border-[1.5px] border-border px-1.5 font-mono text-xs font-semibold uppercase leading-4 text-foreground", band.tone)}
                    aria-label={`ATS score ${score}, ${band.label}`}
                  >
                    ATS <span className="tabular-nums">{score}</span> · {band.label}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="secondary" className="h-8" onClick={() => setUpdateOpen(true)}>
              <Wand2 aria-hidden /> Update with AI
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8" disabled={improve.isPending}>
                  {improve.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
                  {improve.isPending ? "Improving…" : "Improve"}
                  <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {(["summary", "experience", "projects", "skills", "ats"] as const).map((s) => (
                  <DropdownMenuItem key={s} onSelect={() => improve.mutate(s)} disabled={improve.isPending}>
                    <Wand2 aria-hidden /> Improve {s === "ats" ? "ATS coverage" : s}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {hasInsights && (
              <Button
                size="sm"
                variant={showInsights ? "secondary" : "ghost"}
                className="h-8"
                onClick={() => setShowInsights((s) => !s)}
                aria-expanded={showInsights}
                aria-controls="ats-insights"
              >
                {showInsights ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
                ATS insights
              </Button>
            )}
            <span className="mx-0.5 hidden h-6 w-0.5 bg-border sm:block" aria-hidden />
            <Button data-mod-enter size="sm" variant="outline" className="h-8" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
              <Save aria-hidden /> {save.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
            </Button>
            <Button
              size="sm"
              className="h-8"
              onClick={onSendClick}
              disabled={draftEmail.isPending}
              title={
                !hasPdf
                  ? "Compile first to generate resume.pdf"
                  : pdfStale
                    ? "Source changed — re-compile before sending"
                    : attachOnlyHandoff
                      ? "Attach this PDF to your existing email (no new body)"
                      : "Attach the latest PDF and open the email composer"
              }
            >
              {attachOnlyHandoff ? (
                <><Paperclip aria-hidden /> {!hasPdf ? "Compile to attach" : pdfStale ? "Re-compile to attach" : "Attach to email"}</>
              ) : (
                <>{draftEmail.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} {draftEmail.isPending ? "Drafting…" : !hasPdf ? "Compile to send" : pdfStale ? "Re-compile to send" : "Send with email"}</>
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8" aria-label="More actions">
                  <MoreHorizontal aria-hidden /> More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem
                  onSelect={() => saveToLibrary.mutate()}
                  disabled={!hasPdf || pdfStale || saveToLibrary.isPending}
                >
                  <FolderPlus aria-hidden />
                  <span className="flex flex-col">
                    <span>{saveToLibrary.isPending ? "Saving…" : "Save to Resumes"}</span>
                    <span className="text-xs opacity-75">
                      {!hasPdf
                        ? "Compile the PDF first"
                        : pdfStale
                          ? "Re-compile so the newest PDF is saved"
                          : `Save PDF to Resumes → ${AI_JD_RESUME_FOLDER}`}
                    </span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => saveAsMaster.mutate()} disabled={saveAsMaster.isPending}>
                  <Copy aria-hidden />
                  <span className="flex flex-col">
                    <span>{saveAsMaster.isPending ? "Saving…" : "Save as Master"}</span>
                    <span className="text-xs opacity-75">Reuse this .tex to Tailor/Duplicate later</span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                  onSelect={() => void confirmDelete()}
                >
                  <Trash2 aria-hidden /> Delete version
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <SegmentedControl
              size="sm"
              ariaLabel="Show editor or preview"
              className="pb-0 lg:hidden"
              value={pane}
              onValueChange={setPane}
              options={[
                { value: "editor", label: "Editor", icon: Code2 },
                { value: "preview", label: "Preview", icon: Eye },
              ]}
            />
          </div>
        </div>

        {hasInsights && showInsights && <InsightsBar version={v} />}

        {/* ── Editor | Preview ──────────────────────────────────────── */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
          <section
            aria-label="LaTeX editor"
            className={cn("min-h-0 flex-col", pane === "editor" ? "flex" : "hidden lg:flex")}
          >
            <div className="flex h-11 items-center justify-between gap-2 border-b-2 border-border bg-background px-3">
              <span className="eyebrow truncate">Source · {q.data.project?.main_tex_filename ?? "resume.tex"}</span>
              <span className="hidden font-mono text-xs text-muted-foreground sm:inline lg:hidden xl:inline">Select text → Ask AI</span>
            </div>
            <div className="relative min-h-0 flex-1">
              <LatexEditor
                value={tex}
                onChange={(v) => { setTex(v); setDirty(true); }}
                errorLines={errorLines}
                onSelectionChange={setSelection}
                onReady={(api) => { editorApi.current = api; }}
              />
              <InlineAskAi
                selection={selection}
                versionId={id}
                document={tex}
                onReplace={(start, end, text) => {
                  editorApi.current?.replaceRange(start, end, text);
                  setDirty(true);
                  setSelection(null);
                }}
              />
            </div>
          </section>
          <section
            aria-label="PDF preview"
            className={cn("min-h-0 flex-col lg:border-l-2 lg:border-border", pane === "preview" ? "flex" : "hidden lg:flex")}
          >
            <LatexPreview
              tex={tex}
              filename={q.data.project?.main_tex_filename ?? "resume.tex"}
              downloadName={resumeFileBaseName({ fullName: prefs.data?.fullName ?? null, email: prefs.data?.email ?? null, company: v.company ?? null })}
              autoCompile
              onCompiled={(b64) => { setCompiledTex(tex); setHasPdf(true); uploadPdf.mutate(b64); }}
              onErrors={(errs) => setErrorLines(errs.map((e) => e.line ?? 0).filter((n) => n > 0))}
            />
          </section>
        </div>
      </div>

      <UpdateResumeDialog
        open={updateOpen}
        onOpenChange={setUpdateOpen}
        versionId={id}
        onApplied={(newTex) => { setTex(newTex); setDirty(false); qc.invalidateQueries({ queryKey: ["resume-version", id] }); }}
        presets={prefs.data?.resumeAiPresets}
        onPresetsChange={(p) => savePresets.mutate(p)}
      />
    </Page>
  );
}

/**
 * The workspace never scrolls the page — only the editor and the PDF scroll inside their panes.
 * Mobile/tablet: fill the viewport under the app header (h-16 = 4rem) minus <main>'s padding.
 * Desktop (lg+): bleed over <main>'s p-10 so the panes get every pixel under the header.
 */
const WORKSPACE_HEIGHT =
  "h-[calc(100dvh-12rem)] min-h-[34rem] sm:h-[calc(100dvh-12.5rem)] md:h-[calc(100dvh-8.5rem)] lg:-m-10 lg:h-[calc(100dvh-4rem)] lg:min-h-0 lg:w-auto lg:max-w-none";

/** Frame around the workspace: a bordered card on small screens, edge-to-edge on desktop. */
const WORKSPACE_FRAME =
  "flex min-h-0 flex-1 flex-col border-2 border-border bg-card shadow-[var(--shadow-brutal)] lg:border-0 lg:shadow-none";

/** ATS score thresholds — one place for the number → label mapping on this page. */
function atsBand(score: number) {
  if (score >= 75) return { label: "Strong", tone: "bg-success-subtle" };
  if (score >= 50) return { label: "Fair", tone: "bg-warning-subtle" };
  return { label: "Weak", tone: "bg-destructive-subtle" };
}

function InsightsBar({ version }: { version: { matched_keywords: string[]; missing_keywords: string[]; strengths: string[]; suggestions: string[] } }) {
  const { matched_keywords, missing_keywords, strengths, suggestions } = version;
  const hasAny = matched_keywords.length || missing_keywords.length || strengths.length || suggestions.length;
  if (!hasAny) return null;
  return (
    <div
      id="ats-insights"
      className="grid max-h-[40%] shrink-0 grid-cols-1 overflow-auto border-b-2 border-border bg-background sm:grid-cols-2 xl:grid-cols-4 [&>*]:border-border/20 [&>*+*]:border-t sm:[&>*+*]:border-t-0 sm:[&>*:nth-child(n+3)]:border-t sm:[&>*:nth-child(even)]:border-l xl:[&>*:nth-child(n+3)]:border-t-0 xl:[&>*+*]:border-l"
    >
      <InsightCol icon={CheckCircle2} title="Matched" items={matched_keywords} variant="success" itemIcon={Check} />
      <InsightCol icon={AlertCircle} title="Missing" items={missing_keywords} variant="danger" itemIcon={X} />
      <InsightCol icon={Sparkles} title="Strengths" items={strengths} variant="info" itemIcon={Sparkles} />
      <InsightCol icon={Wand2} title="Suggestions" items={suggestions} asList />
    </div>
  );
}

function InsightCol({
  icon: Icon,
  title,
  items,
  variant = "outline",
  itemIcon: ItemIcon,
  asList,
}: {
  icon: LucideIcon;
  title: string;
  items: string[];
  variant?: "success" | "danger" | "info" | "outline";
  itemIcon?: LucideIcon;
  asList?: boolean;
}) {
  return (
    <div className="min-w-0 p-3 sm:p-4">
      <p className="eyebrow mb-2 flex items-center gap-1.5 text-foreground">
        <Icon className="size-4" aria-hidden /> {title}
        <span className="text-muted-foreground">· {items.length}</span>
      </p>
      {items.length ? (
        asList ? (
          <ul className="space-y-1.5 text-sm">
            {items.slice(0, 12).map((k, i) => (
              <li key={i} className="border-l-2 border-border pl-2">{k}</li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {items.slice(0, 12).map((k, i) => (
              <Badge key={i} variant={variant} className="whitespace-normal">
                {ItemIcon && <ItemIcon aria-hidden />}
                {k}
              </Badge>
            ))}
          </div>
        )
      ) : <p className="text-xs text-muted-foreground">None.</p>}
    </div>
  );
}
