import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { generateAiEmail } from "@/lib/ai-email.functions";
import { listResumeProjects, generateResumeVersion } from "@/lib/resume-studio.functions";
import { linkedInCompanySearchUrl } from "@/lib/linkedin";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, ExternalLink, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { saveSendResumeHandoff } from "@/lib/send-resume-handoff";
import { getLinkedResumeVersionId, setLinkedResumeVersionId } from "@/lib/job-resume-link";
import { Field } from "@/components/app/field";

/**
 * "Generate Body Using AI" — customises the SELECTED template (~10% changed,
 * ~90% preserved) using the role, company, full job posting and the user's
 * resume facts. Also offers LinkedIn company search + JD-tailored resume gen.
 */
export function AiBodyDialog({
  open,
  onOpenChange,
  templateId,
  resumeVersionId,
  initialCompany = "",
  initialRole = "",
  initialJobDescription = "",
  initialJobContext = "",
  jobId = null,
  /** Current Send Email draft — preserved when opening Resume Studio so body is not regenerated. */
  preserveEmail,
  onUse,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  templateId: string | null;
  resumeVersionId: string | null;
  initialCompany?: string;
  initialRole?: string;
  initialJobDescription?: string;
  /** Full community-job dump; falls back to initialJobDescription. */
  initialJobContext?: string;
  jobId?: string | null;
  preserveEmail?: {
    subject: string;
    body: string;
    recipientText?: string;
    vars?: Record<string, string>;
  };
  onUse: (r: {
    subject: string;
    body: string;
    company: string;
    role: string;
    jobDescription: string;
    jobContext: string;
    instructions: string;
  }) => void;
}) {
  const navigate = useNavigate();
  const [company, setCompany] = useState(initialCompany);
  const [role, setRole] = useState(initialRole);
  const [jd, setJd] = useState(initialJobContext || initialJobDescription);
  const [instructions, setInstructions] = useState("");
  const [result, setResult] = useState<{ subject: string; body: string } | null>(null);
  const [masterId, setMasterId] = useState<string>("");
  const fn = useServerFn(generateAiEmail);
  const projectsFn = useServerFn(listResumeProjects);
  const genResumeFn = useServerFn(generateResumeVersion);

  const projects = useQuery({
    queryKey: ["resume-projects"],
    queryFn: () => projectsFn(),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setCompany(initialCompany);
    setRole(initialRole);
    setJd(initialJobContext || initialJobDescription);
    setInstructions("");
    setResult(null);
  }, [open, initialCompany, initialRole, initialJobDescription, initialJobContext]);

  useEffect(() => {
    if (!open || !projects.data?.length) return;
    const preferred =
      projects.data.find((p) => p.is_default)?.id ?? projects.data[0]?.id ?? "";
    setMasterId((cur) => cur || preferred);
  }, [open, projects.data]);

  const run = useMutation({
    mutationFn: () =>
      fn({
        data: {
          templateId: templateId || null,
          resumeVersionId: resumeVersionId || null,
          company: company.trim() || null,
          jobTitle: role.trim() || null,
          jobDescription: jd.trim() || null,
          jobContext: jd.trim() || null,
          instructions: instructions.trim() || null,
        },
      }),
    onSuccess: (r) => setResult(r),
    onError: (e) => toast.error("AI failed", { description: (e as Error).message }),
  });

  const genResume = useMutation({
    mutationFn: () => {
      if (!masterId) throw new Error("Pick a master resume first");
      if (!jd.trim() && !role.trim()) throw new Error("Add a role or job posting first");
      return genResumeFn({
        data: {
          projectId: masterId,
          jobDescription: jd.trim() || `Role: ${role.trim()}${company.trim() ? `\nCompany: ${company.trim()}` : ""}`,
          jobContext: jd.trim() || null,
          jobTitle: role.trim() || null,
          company: company.trim() || null,
          customInstructions: instructions.trim() || null,
        },
      });
    },
    onSuccess: (row) => {
      // Keep existing email — do not regenerate when returning from Resume Studio.
      const subject = result?.subject || preserveEmail?.subject || "";
      const body = result?.body || preserveEmail?.body || "";
      setLinkedResumeVersionId(
        { jobId, company: company.trim(), role: role.trim() },
        row.id,
      );
      saveSendResumeHandoff({
        attachOnly: true,
        subject,
        body,
        recipientText: preserveEmail?.recipientText,
        vars: preserveEmail?.vars,
        company: company.trim(),
        role: role.trim(),
        jobDescription: jd.trim(),
        jobContext: jd.trim(),
        instructions: instructions.trim(),
        resumeVersionId: row.id,
        jobId: jobId ?? undefined,
      });
      toast.success("Resume generated — compile PDF, then Attach to email", {
        description: "Your email subject & body stay as they are.",
      });
      onOpenChange(false);
      void navigate({
        to: "/resume-studio/$id",
        params: { id: row.id },
        search: { returnToSend: true } as never,
      });
    },
    onError: (e) => toast.error("Resume generation failed", { description: (e as Error).message }),
  });

  const openLinkedIn = () => {
    const name = company.trim();
    if (!name) {
      toast.message("Enter a company name first");
      return;
    }
    window.open(linkedInCompanySearchUrl(name), "_blank", "noopener,noreferrer");
  };

  const busy = run.isPending || genResume.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <p className="eyebrow flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" aria-hidden /> AI writer</p>
          <DialogTitle>Generate subject & body with AI</DialogTitle>
          <DialogDescription>
            {templateId
              ? "Your selected template keeps its structure, tone and variables — only about 10% is tailored to this role."
              : "Generate a subject and body from the role, company, and full job posting. You can edit before saving."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <fieldset className="space-y-4">
            <legend className="eyebrow mb-3 w-full border-b-2 border-border pb-1.5 text-foreground">01 · The role</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Company"
                htmlFor="ai-company"
                action={
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    onClick={openLinkedIn}
                    disabled={!company.trim()}
                  >
                    <ExternalLink aria-hidden /> LinkedIn search
                  </Button>
                }
              >
                <Input id="ai-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Corp" />
              </Field>
              <Field label="Role" htmlFor="ai-role">
                <Input id="ai-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Backend Engineer" />
              </Field>
            </div>
            <Field label="Full job posting" htmlFor="ai-jd">
              <Textarea
                id="ai-jd"
                rows={6}
                value={jd}
                onChange={(e) => setJd(e.target.value)}
                placeholder="Paste the full posting (skills, location, salary, responsibilities…)…"
                className="text-sm"
              />
            </Field>
            <Field label="Extra instructions (optional)" htmlFor="ai-instructions">
              <Textarea id="ai-instructions" rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Mention my Kubernetes experience in one line" />
            </Field>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="eyebrow mb-3 flex w-full items-center gap-1.5 border-b-2 border-border pb-1.5 text-foreground">
              <FileText className="h-3.5 w-3.5" aria-hidden /> 02 · Tailor resume for this JD
            </legend>
            {projects.isLoading ? (
              <div className="flex flex-col gap-2 sm:flex-row"><Skeleton className="h-10 w-full sm:flex-1" /><Skeleton className="h-10 w-48" /></div>
            ) : projects.isError ? (
              <div className="flex flex-wrap items-center gap-3 border-2 border-dashed border-destructive px-3 py-2.5 text-sm" role="alert">
                <span>Couldn't load your master resumes.</span>
                <Button type="button" size="sm" variant="outline" onClick={() => projects.refetch()}>Try again</Button>
              </div>
            ) : (projects.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                No master resume yet.{" "}
                <Link to="/resume-studio" className="font-semibold text-foreground underline decoration-2 underline-offset-4" onClick={() => onOpenChange(false)}>
                  Upload one in Resume Studio
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <label htmlFor="ai-master-resume" className="sr-only">Master resume</label>
                <Select value={masterId} onValueChange={setMasterId}>
                  <SelectTrigger id="ai-master-resume" className="w-full sm:flex-1">
                    <SelectValue placeholder="Master resume…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}{p.is_default ? " · Default" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0"
                  disabled={busy || (!masterId && !getLinkedResumeVersionId({ jobId, company, role }) && !resumeVersionId) || (!jd.trim() && !role.trim() && !getLinkedResumeVersionId({ jobId, company, role }) && !resumeVersionId)}
                  onClick={() => {
                    const existing =
                      resumeVersionId ||
                      getLinkedResumeVersionId({ jobId, company: company.trim(), role: role.trim() });
                    if (existing) {
                      const subject = result?.subject || preserveEmail?.subject || "";
                      const body = result?.body || preserveEmail?.body || "";
                      saveSendResumeHandoff({
                        attachOnly: true,
                        subject,
                        body,
                        recipientText: preserveEmail?.recipientText,
                        vars: preserveEmail?.vars,
                        company: company.trim(),
                        role: role.trim(),
                        jobDescription: jd.trim(),
                        jobContext: jd.trim(),
                        instructions: instructions.trim(),
                        resumeVersionId: existing,
                        jobId: jobId ?? undefined,
                      });
                      onOpenChange(false);
                      toast.message("Opening your existing resume", {
                        description: "Same tailored version for this job — not generating from scratch.",
                      });
                      void navigate({
                        to: "/resume-studio/$id",
                        params: { id: existing },
                        search: { returnToSend: true } as never,
                      });
                      return;
                    }
                    genResume.mutate();
                  }}
                >
                  {genResume.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
                  {genResume.isPending
                    ? "Generating…"
                    : resumeVersionId || getLinkedResumeVersionId({ jobId, company, role })
                      ? "Open existing resume"
                      : "Generate & edit resume"}
                </Button>
              </div>
            )}
          </fieldset>

          {(result || run.isPending) && (
            <section aria-labelledby="ai-result-title" aria-live="polite" className="border-2 border-border bg-card shadow-[var(--shadow-brutal-sm)]">
              <h3 id="ai-result-title" className="border-b-2 border-border bg-primary px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-primary-foreground">
                03 · Draft
              </h3>
              {run.isPending && !result ? (
                <div className="space-y-2 p-3" aria-busy="true">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-3 w-4/6" />
                </div>
              ) : result && (
                <div className="space-y-2 p-3 text-sm">
                  <p className="font-mono text-xs"><span className="font-semibold uppercase tracking-[0.08em]">Subj · </span>{result.subject || "—"}</p>
                  <div className="max-h-56 overflow-auto whitespace-pre-wrap border-t border-border/20 pt-2 leading-6">{result.body}</div>
                </div>
              )}
            </section>
          )}
        </div>
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="outline" onClick={() => run.mutate()} disabled={busy}>
            {run.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {run.isPending ? "Generating…" : result ? "Regenerate" : "Generate"}
          </Button>
          <Button
            disabled={!result || busy}
            onClick={() => {
              if (!result) return;
              const blob = jd.trim();
              onUse({
                ...result,
                company: company.trim(),
                role: role.trim(),
                jobDescription: blob,
                jobContext: blob,
                instructions: instructions.trim(),
              });
              onOpenChange(false);
            }}
          >
            Use this email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
