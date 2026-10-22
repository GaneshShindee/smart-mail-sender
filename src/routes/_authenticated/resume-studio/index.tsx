import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listResumeProjects,
  createResumeProject,
  deleteResumeProject,
  setDefaultResumeProject,
  listResumeVersions,
  generateResumeVersion,
  duplicateResumeProjectAsVersion,
  duplicateResumeVersion,
  deleteResumeVersion,
} from "@/lib/resume-studio.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Page, PageHeader } from "@/components/app/page";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Field } from "@/components/app/field";
import { IconButton } from "@/components/app/icon-button";
import { SegmentedControl } from "@/components/app/segmented-control";
import { useConfirm } from "@/components/app/confirm-dialog";
import { cn } from "@/lib/utils";
import { Trash2, Wand2, FileText, Sparkles, Pencil, Upload, Copy, Star, Loader2, Paperclip } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fileToBase64 } from "@/lib/resumes";
import { relativeTime } from "@/lib/user-agent";
import { z } from "zod";
import { getJob } from "@/lib/jobs.functions";
import { jobToContextFields } from "@/lib/job-context";
import { getLinkedResumeVersionId, setLinkedResumeVersionId } from "@/lib/job-resume-link";

const searchSchema = z.object({
  jd: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  jobId: z.string().optional(),
}).partial();

export const Route = createFileRoute("/_authenticated/resume-studio/")({
  head: () => ({ meta: [{ title: "AI Resume Studio — Smart Email Sender" }] }),
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  component: ResumeStudioPage,
});

function ResumeStudioPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const search = Route.useSearch();
  const listFn = useServerFn(listResumeProjects);
  const createFn = useServerFn(createResumeProject);
  const delFn = useServerFn(deleteResumeProject);
  const setDefaultFn = useServerFn(setDefaultResumeProject);
  const listVersionsFn = useServerFn(listResumeVersions);
  const genFn = useServerFn(generateResumeVersion);
  const duplicateFn = useServerFn(duplicateResumeProjectAsVersion);
  const duplicateVersionFn = useServerFn(duplicateResumeVersion);
  const deleteVersionFn = useServerFn(deleteResumeVersion);
  const getJobFn = useServerFn(getJob);

  const confirm = useConfirm();
  const projects = useQuery({ queryKey: ["resume-projects"], queryFn: () => listFn() });
  const versions = useQuery({ queryKey: ["resume-versions"], queryFn: () => listVersionsFn({ data: {} }) });

  const [createOpen, setCreateOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [genProjectId, setGenProjectId] = useState<string>("");
  const [prefill, setPrefill] = useState<{ jd: string; title: string; company: string } | null>(null);
  const jobHydratedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!search.jobId || !projects.data?.length) return;
    if (jobHydratedRef.current === search.jobId) return;

    const linked = getLinkedResumeVersionId({
      jobId: search.jobId,
      company: search.company,
      role: search.title,
    });
    if (linked) {
      jobHydratedRef.current = search.jobId;
      toast.message("Opening your existing resume for this job");
      nav({ to: "/resume-studio/$id", params: { id: linked } });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const job = await getJobFn({ data: { id: search.jobId! } });
        if (cancelled) return;
        const fields = jobToContextFields(job);
        jobHydratedRef.current = search.jobId!;
        setGenProjectId(projects.data!.find((p) => p.is_default)?.id ?? projects.data![0].id);
        setPrefill({
          jd: fields.jobContext,
          title: fields.role || search.title || "",
          company: fields.company || search.company || "",
        });
        setGenOpen(true);
      } catch (e) {
        toast.error("Could not load job", { description: (e as Error).message });
        // Fall back to thin search params if present
        if (search.title || search.company || search.jd) {
          setGenProjectId(projects.data!.find((p) => p.is_default)?.id ?? projects.data![0].id);
          setPrefill({ jd: search.jd ?? "", title: search.title ?? "", company: search.company ?? "" });
          setGenOpen(true);
        }
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.jobId, projects.data]);

  useEffect(() => {
    if (search.jobId) return; // handled above with full job load
    if ((search.jd || search.title || search.company) && projects.data?.length && !genOpen) {
      setGenProjectId(projects.data.find((p) => p.is_default)?.id ?? projects.data[0].id);
      setPrefill({ jd: search.jd ?? "", title: search.title ?? "", company: search.company ?? "" });
      setGenOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.jd, search.title, search.company, projects.data]);

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["resume-projects"] }); toast.success("Master resume deleted"); },
    onError: (e) => toast.error("Delete failed", { description: (e as Error).message }),
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => setDefaultFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["resume-projects"] }); toast.success("Default master resume updated"); },
    onError: (e) => toast.error("Could not set default", { description: (e as Error).message }),
  });

  const create = useMutation({
    mutationFn: async (payload: { name: string; description: string; mainFile: File; extra: File[] }) => {
      const mainText = await payload.mainFile.text();
      const extras = await Promise.all(
        payload.extra.map(async (f) => ({
          filename: f.name,
          mimeType: f.type || "application/octet-stream",
          base64: await fileToBase64(f),
          size: f.size,
        })),
      );
      return createFn({
        data: {
          name: payload.name,
          description: payload.description || null,
          mainTexFilename: payload.mainFile.name,
          mainTexContent: mainText,
          extraFiles: extras,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resume-projects"] });
      toast.success("Master resume uploaded");
      setCreateOpen(false);
    },
    onError: (e) => toast.error("Upload failed", { description: (e as Error).message }),
  });

  const generate = useMutation({
    mutationFn: (payload: { projectId: string; jd: string; jobTitle: string; company: string; instructions: string }) =>
      genFn({
        data: {
          projectId: payload.projectId,
          jobDescription: payload.jd,
          jobContext: payload.jd || null,
          jobTitle: payload.jobTitle || null,
          company: payload.company || null,
          customInstructions: payload.instructions || null,
        },
      }),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ["resume-versions"] });
      setLinkedResumeVersionId(
        {
          jobId: search.jobId,
          company: v.company ?? search.company,
          role: v.job_title ?? search.title,
        },
        v.id,
      );
      toast.success("Tailored resume generated — compile PDF, then Save to Resumes");
      setGenOpen(false);
      nav({ to: "/resume-studio/$id", params: { id: v.id } });
    },
    onError: (e) => toast.error("AI failed", { description: (e as Error).message }),
  });

  const duplicate = useMutation({
    mutationFn: (projectId: string) => duplicateFn({ data: { projectId } }),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ["resume-versions"] });
      toast.success("Duplicated — edit it below, or use Ask AI");
      nav({ to: "/resume-studio/$id", params: { id: v.id } });
    },
    onError: (e) => toast.error("Duplicate failed", { description: (e as Error).message }),
  });

  const duplicateVersion = useMutation({
    mutationFn: (id: string) => duplicateVersionFn({ data: { id } }),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ["resume-versions"] });
      toast.success("Copied — edit it below, or use Ask AI");
      nav({ to: "/resume-studio/$id", params: { id: v.id } });
    },
    onError: (e) => toast.error("Copy failed", { description: (e as Error).message }),
  });

  const deleteVersion = useMutation({
    mutationFn: (id: string) => deleteVersionFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["resume-versions"] }); toast.success("Deleted"); },
    onError: (e) => toast.error("Delete failed", { description: (e as Error).message }),
  });

  const onGenerateClick = () => { if (!projects.data?.length) { toast.error("Upload a master resume first"); return; } setGenProjectId(projects.data[0].id); setGenOpen(true); };

  const confirmDeleteProject = async (p: { id: string; name: string }) => {
    if (
      await confirm({
        title: `Delete master "${p.name}"?`,
        description: "This deletes the master resume and all of its tailored versions.",
        confirmLabel: "Delete master",
      })
    ) {
      del.mutate(p.id);
    }
  };

  const confirmDeleteVersion = async (id: string) => {
    if (await confirm({ title: "Delete this tailored version?", confirmLabel: "Delete version" })) {
      deleteVersion.mutate(id);
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow="03 · Library"
        title="AI Resume Studio"
        icon={Wand2}
        description="Tailor an ATS-optimised resume to any job description — without ever fabricating facts."
        actions={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <Upload aria-hidden /> Upload master resume
            </Button>
            <Button onClick={onGenerateClick}>
              <Sparkles aria-hidden /> Generate for a JD
            </Button>
          </>
        }
      />

      <section aria-labelledby="studio-masters" className="space-y-5">
        <WorkshopHeading
          id="studio-masters"
          index="A"
          title="Masters"
          meta={projects.data ? `${projects.data.length} on the bench` : undefined}
        />
        {projects.isError ? (
          <ErrorState
            title="Couldn't load master resumes"
            error={projects.error}
            onRetry={() => projects.refetch()}
            retrying={projects.isFetching}
          />
        ) : projects.isLoading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2" role="status" aria-label="Loading master resumes">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-52 w-full" />)}
          </div>
        ) : projects.data?.length ? (
          <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {projects.data.map((p) => (
              <li
                key={p.id}
                className={cn(
                  "relative flex flex-col border-2 border-border bg-card",
                  p.is_default ? "shadow-[var(--shadow-brutal-lg)]" : "shadow-[var(--shadow-brutal)]",
                )}
              >
                <div className={cn("h-2 border-b-2 border-border", p.is_default ? "airmail" : "bg-muted")} aria-hidden />
                <div className="flex flex-1 flex-col gap-4 p-5">
                  <div className="flex items-start gap-4">
                    <div className="grid size-12 shrink-0 place-items-center border-2 border-border bg-primary text-primary-foreground">
                      <FileText className="size-6" strokeWidth={2.2} aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1 pr-16">
                      <h3 className="font-expanded truncate text-xl leading-tight" title={p.name}>{p.name}</h3>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground" title={p.main_tex_filename}>
                        {p.main_tex_filename}
                      </p>
                    </div>
                  </div>
                  {p.is_default && (
                    <span className="stamp absolute right-4 top-6 px-2 py-0.5 text-xs text-destructive">
                      Default master
                    </span>
                  )}
                  {p.description ? (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No description.</p>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border/20 pt-4">
                    <Button size="sm" onClick={() => { setGenProjectId(p.id); setGenOpen(true); }}>
                      <Sparkles aria-hidden /> Tailor
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      title="Duplicate — copy this .tex, then edit it manually or with Ask AI"
                      disabled={duplicate.isPending}
                      onClick={() => duplicate.mutate(p.id)}
                    >
                      {duplicate.isPending && duplicate.variables === p.id ? <Loader2 className="animate-spin" aria-hidden /> : <Copy aria-hidden />}
                      {duplicate.isPending && duplicate.variables === p.id ? "Duplicating…" : "Duplicate"}
                    </Button>
                    <div className="ml-auto flex items-center gap-1">
                      {!p.is_default && (
                        <IconButton
                          label="Set as default master resume"
                          disabled={setDefault.isPending}
                          onClick={() => setDefault.mutate(p.id)}
                        >
                          <Star aria-hidden />
                        </IconButton>
                      )}
                      <IconButton
                        label={`Delete master resume ${p.name}`}
                        className="hover:bg-destructive-subtle"
                        onClick={() => void confirmDeleteProject(p)}
                      >
                        <Trash2 aria-hidden />
                      </IconButton>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={FileText}
            title="No master resume yet"
            description="Upload a .tex file or paste your LaTeX source to start tailoring."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Upload aria-hidden /> Upload master resume
              </Button>
            }
          />
        )}
      </section>

      <section aria-labelledby="studio-versions" className="space-y-5">
        <WorkshopHeading
          id="studio-versions"
          index="B"
          title="Recent tailored versions"
          meta={versions.data ? `${versions.data.length} cut` : undefined}
        />
        {versions.isError ? (
          <ErrorState
            title="Couldn't load tailored versions"
            error={versions.error}
            onRetry={() => versions.refetch()}
            retrying={versions.isFetching}
          />
        ) : versions.isLoading ? (
          <div className="space-y-2" role="status" aria-label="Loading tailored versions">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : versions.data?.length ? (
          <>
            {/* Mobile: stacked cards */}
            <ul className="space-y-3 md:hidden">
              {versions.data.map((v) => (
                <li key={v.id} className="border-2 border-border bg-card shadow-[var(--shadow-brutal-sm)]">
                  <div className="flex items-start gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/resume-studio/$id"
                        params={{ id: v.id }}
                        className="block font-semibold leading-snug underline-offset-4 hover:underline"
                      >
                        {v.job_title || "Untitled role"}
                      </Link>
                      <p className="truncate text-sm text-muted-foreground">{v.company || "—"}</p>
                      <p className="mt-1 font-mono text-xs uppercase text-muted-foreground">{relativeTime(v.created_at)}</p>
                    </div>
                    <AtsScore score={v.ats_score} />
                  </div>
                  <div className="flex items-center gap-2 border-t border-border/20 px-3 py-2">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/resume-studio/$id" params={{ id: v.id }}>
                        <Pencil aria-hidden /> Edit
                      </Link>
                    </Button>
                    <div className="ml-auto flex items-center gap-1">
                      <IconButton
                        label="Copy — duplicate this version"
                        disabled={duplicateVersion.isPending}
                        onClick={() => duplicateVersion.mutate(v.id)}
                      >
                        <Copy aria-hidden />
                      </IconButton>
                      <IconButton
                        label="Delete tailored version"
                        className="hover:bg-destructive-subtle"
                        disabled={deleteVersion.isPending}
                        onClick={() => void confirmDeleteVersion(v.id)}
                      >
                        <Trash2 aria-hidden />
                      </IconButton>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {/* md+: table */}
            <div className="hidden border-2 border-border bg-card shadow-[var(--shadow-brutal)] md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>ATS</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.data.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="max-w-72">
                        <Link
                          to="/resume-studio/$id"
                          params={{ id: v.id }}
                          className="block truncate font-semibold underline-offset-4 hover:underline"
                        >
                          {v.job_title || "Untitled role"}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-56 truncate text-muted-foreground">{v.company || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs uppercase text-muted-foreground">
                        {relativeTime(v.created_at)}
                      </TableCell>
                      <TableCell>
                        <AtsScore score={v.ats_score} compact />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild size="sm" variant="outline">
                            <Link to="/resume-studio/$id" params={{ id: v.id }}>
                              <Pencil aria-hidden /> Edit
                            </Link>
                          </Button>
                          <IconButton
                            label="Copy — duplicate this version"
                            size="sm"
                            disabled={duplicateVersion.isPending}
                            onClick={() => duplicateVersion.mutate(v.id)}
                          >
                            <Copy aria-hidden />
                          </IconButton>
                          <IconButton
                            label="Delete tailored version"
                            size="sm"
                            className="hover:bg-destructive-subtle"
                            disabled={deleteVersion.isPending}
                            onClick={() => void confirmDeleteVersion(v.id)}
                          >
                            <Trash2 aria-hidden />
                          </IconButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <EmptyState
            icon={Sparkles}
            title="No tailored versions yet"
            description="Paste a JD and let AI adapt your resume."
            action={
              <Button onClick={onGenerateClick}>
                <Sparkles aria-hidden /> Generate for a JD
              </Button>
            }
          />
        )}
      </section>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        pending={create.isPending}
        onSubmit={(v) => create.mutate(v)}
      />

      <GenerateDialog
        open={genOpen}
        onOpenChange={setGenOpen}
        pending={generate.isPending}
        projects={projects.data ?? []}
        projectId={genProjectId}
        setProjectId={setGenProjectId}
        onSubmit={(v) => generate.mutate(v)}
        initial={prefill}
      />
    </Page>
  );
}

/** Section heading for the workshop: index block, expanded title, mono count, thick rule. */
function WorkshopHeading({ id, index, title, meta }: { id: string; index: string; title: string; meta?: string }) {
  return (
    <div className="flex items-end justify-between gap-3 border-b-2 border-border pb-2">
      <h2 id={id} className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center bg-secondary font-mono text-xs font-bold text-secondary-foreground">
          {index}
        </span>
        <span className="font-expanded text-xl leading-tight sm:text-2xl">{title}</span>
      </h2>
      {meta && <span className="eyebrow shrink-0">{meta}</span>}
    </div>
  );
}

/** ATS score thresholds — one place for the number → label mapping on this page. */
function atsBand(score: number) {
  if (score >= 75) return { label: "Strong", tone: "bg-success-subtle" };
  if (score >= 50) return { label: "Fair", tone: "bg-warning-subtle" };
  return { label: "Weak", tone: "bg-destructive-subtle" };
}

function AtsScore({ score, compact }: { score: number | null | undefined; compact?: boolean }) {
  if (typeof score !== "number") {
    return <span className="font-mono text-xs uppercase text-muted-foreground">No score</span>;
  }
  const band = atsBand(score);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-baseline gap-1.5 border-2 border-border px-2 py-1 text-foreground",
        band.tone,
        !compact && "flex-col items-center gap-0 px-3",
      )}
      aria-label={`ATS score ${score}, ${band.label}`}
    >
      <span className={cn("font-expanded leading-none tabular-nums", compact ? "text-base" : "text-2xl")}>{score}</span>
      <span className="font-mono text-xs uppercase tracking-[0.08em]">
        {compact && <span aria-hidden>· </span>}
        {band.label}
      </span>
    </span>
  );
}

function CreateProjectDialog({
  open, onOpenChange, pending, onSubmit,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; pending: boolean;
  onSubmit: (v: { name: string; description: string; mainFile: File; extra: File[] }) => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [pasteTex, setPasteTex] = useState("");
  const [pasteFilename, setPasteFilename] = useState("resume.tex");
  const [extra, setExtra] = useState<File[]>([]);
  const mainRef = useRef<HTMLInputElement | null>(null);
  const extraRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setName("");
    setDesc("");
    setMode("upload");
    setMainFile(null);
    setPasteTex("");
    setPasteFilename("resume.tex");
    setExtra([]);
  };

  const canSubmit = mode === "upload" ? !!mainFile : true;

  const handleSubmit = () => {
    if (mode === "upload" && !mainFile) return;
    const projectName = name.trim() || (mode === "upload" ? mainFile?.name.replace(/\.tex$/i, "") : pasteFilename.replace(/\.tex$/i, "")) || "Master resume";
    let file = mainFile;
    if (mode === "paste") {
      const filename = (pasteFilename.trim() || "resume.tex").replace(/\.tex$/i, "") + ".tex";
      file = new File([pasteTex], filename, { type: "application/x-tex" });
    }
    if (!file) return;
    onSubmit({ name: projectName, description: desc.trim(), mainFile: file, extra });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload className="size-5" aria-hidden /> Upload master LaTeX resume</DialogTitle>
          <DialogDescription>Your master is the source every tailored version is cut from.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <Field label="Name" htmlFor="master-name">
            <Input id="master-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My master CV" />
          </Field>
          <Field label="Description (optional)" htmlFor="master-description">
            <Textarea id="master-description" value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} />
          </Field>
          <SegmentedControl
            ariaLabel="How to add the LaTeX source"
            value={mode}
            onValueChange={setMode}
            className="[&>div]:flex [&>div]:w-full [&>div>*]:flex-1 [&>div>*]:justify-center"
            options={[
              { value: "upload", label: "Upload .tex", icon: Upload },
              { value: "paste", label: "Paste LaTeX", icon: FileText },
            ]}
          />
          {mode === "upload" ? (
            <Field label="Main .tex file" htmlFor="master-main-file">
              <input id="master-main-file" ref={mainRef} type="file" accept=".tex,text/x-tex,application/x-tex" hidden onChange={(e) => setMainFile(e.target.files?.[0] ?? null)} />
              <button
                type="button"
                onClick={() => mainRef.current?.click()}
                className="flex min-h-14 w-full items-center gap-3 border-2 border-dashed border-border bg-background px-4 py-3 text-left text-sm font-semibold transition-colors hover:bg-accent"
              >
                <Upload className="size-5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{mainFile ? mainFile.name : "Choose resume.tex"}</span>
              </button>
            </Field>
          ) : (
            <div className="space-y-5">
              <Field label="Filename" htmlFor="master-paste-filename">
                <Input
                  id="master-paste-filename"
                  value={pasteFilename}
                  onChange={(e) => setPasteFilename(e.target.value)}
                  placeholder="resume.tex"
                />
              </Field>
              <Field label="LaTeX source" htmlFor="master-paste-source" hint="Saved as a .tex file in your master resume project.">
                <Textarea
                  id="master-paste-source"
                  rows={12}
                  value={pasteTex}
                  onChange={(e) => setPasteTex(e.target.value)}
                  placeholder={"\\documentclass{article}\n\\begin{document}\n...\n\\end{document}"}
                  className="font-mono text-xs"
                />
              </Field>
            </div>
          )}
          <Field label="Project assets (optional: .cls, .sty, images…)" htmlFor="master-extra-files">
            <input id="master-extra-files" ref={extraRef} type="file" multiple hidden onChange={(e) => setExtra(Array.from(e.target.files ?? []))} />
            <button
              type="button"
              onClick={() => extraRef.current?.click()}
              className="flex min-h-12 w-full items-center gap-3 border-2 border-dashed border-border bg-background px-4 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-accent"
            >
              <Paperclip className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">{extra.length ? `${extra.length} file(s) selected` : "Add project files"}</span>
            </button>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={pending || !canSubmit} onClick={handleSubmit}>
            {pending ? "Uploading…" : "Save master resume"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GenerateDialog({
  open, onOpenChange, pending, projects, projectId, setProjectId, onSubmit, initial,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; pending: boolean;
  projects: Array<{ id: string; name: string; is_default?: boolean }>;
  projectId: string; setProjectId: (v: string) => void;
  onSubmit: (v: { projectId: string; jd: string; jobTitle: string; company: string; instructions: string }) => void;
  initial?: { jd: string; title: string; company: string } | null;
}) {
  const [jd, setJd] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [instructions, setInstructions] = useState("");
  useEffect(() => {
    if (open && initial) {
      setJd(initial.jd || "");
      setJobTitle(initial.title || "");
      setCompany(initial.company || "");
    }
  }, [open, initial]);
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setJd(""); setJobTitle(""); setCompany(""); setInstructions(""); } }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-5" aria-hidden /> Generate a tailored resume</DialogTitle>
          <DialogDescription>Pick a master, paste the posting, and the AI cuts a version for this job.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <Field label="Master resume" htmlFor="generate-master">
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="generate-master" className="w-full">
                <SelectValue placeholder="Choose a master resume…" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.is_default ? " · Default" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Job title (optional)" htmlFor="generate-job-title">
              <Input id="generate-job-title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Senior Backend Engineer" />
            </Field>
            <Field label="Company (optional)" htmlFor="generate-company">
              <Input id="generate-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Corp" />
            </Field>
          </div>
          <Field label="Full job posting" htmlFor="generate-jd">
            <Textarea id="generate-jd" rows={8} value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the full posting — skills, location, salary, responsibilities, description…" />
          </Field>
          <Field label="Custom instructions (optional)" htmlFor="generate-instructions">
            <Textarea id="generate-instructions" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Emphasise cloud infra experience, keep it to one page, etc." />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={pending || !projectId}
            onClick={() => onSubmit({ projectId, jd: jd.trim(), jobTitle: jobTitle.trim(), company: company.trim(), instructions: instructions.trim() })}
          >
            {pending ? <><Loader2 className="animate-spin" aria-hidden /> Generating…</> : <><Sparkles aria-hidden /> Generate</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
