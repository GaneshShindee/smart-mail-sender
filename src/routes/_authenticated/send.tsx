import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTemplates } from "@/lib/templates.functions";
import { sendEmail, listGmailAccounts } from "@/lib/gmail.functions";
import { listResumes } from "@/lib/resumes.functions";
import { getUserPreferences } from "@/lib/profile.functions";
import { isAllowedResumeFile, fileToBase64, formatBytes } from "@/lib/resumes";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TemplateCombobox } from "@/components/template-combobox";
import { ResumeCombobox } from "@/components/resume-combobox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Page, PageHeader } from "@/components/app/page";
import { SectionCard } from "@/components/app/section-card";
import { Field } from "@/components/app/field";
import { StatCard } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { IconButton } from "@/components/app/icon-button";
import { Kbd } from "@/components/app/kbd";
import { useModKey } from "@/hooks/use-mod-key";
import { useEffect, useMemo, useRef, useState } from "react";
import { extractVariables, applyTemplate } from "@/lib/templating";
import { parseRecipients } from "@/lib/recipients";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Send,
  Sparkles,
  X,
  Upload,
  Flame,
  Eye,
  Pencil,
  Wand2,
  Mail,
  Loader2,
  CheckCircle2,
  Check,
  AlertCircle,
  Download,
} from "lucide-react";
import { EmailGeneratorDialog } from "@/components/email-generator-dialog";
import { AiBodyDialog } from "@/components/ai-body-dialog";
import { GenerateResumeDialog, openLinkedOrGenerateResume } from "@/components/generate-resume-dialog";
import { getLinkedResumeVersionId } from "@/lib/job-resume-link";
import { DraftManager, filesFromDraftAttachments, type DraftState, type LoadedDraft } from "@/components/draft-manager";
import { getAutosaveDraft, saveEmailDraft, deleteEmailDraft } from "@/lib/drafts.functions";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getResumeVersion } from "@/lib/resume-studio.functions";
import { getJob } from "@/lib/jobs.functions";
import { jobToContextFields, jobToTemplateVars } from "@/lib/job-context";
import { generateAiEmail } from "@/lib/ai-email.functions";
import { peekSendResumeHandoff, clearSendResumeHandoff } from "@/lib/send-resume-handoff";

const searchSchema = z
  .object({
    to: z.string().optional(),
    sender: z.string().optional(),
    template: z.string().optional(),
    followUp: z.string().optional(),
    campaignId: z.string().optional(),
    name: z.string().optional(),
    company: z.string().optional(),
    resumeVersionId: z.string().optional(),
    jobId: z.string().uuid().optional(),
  })
  .partial();

export const Route = createFileRoute("/_authenticated/send")({
  head: () => ({ meta: [{ title: "Send Email — Smart Email Sender" }] }),
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  component: SendPage,
});

function SendPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const listFn = useServerFn(listTemplates);
  const sendFn = useServerFn(sendEmail);
  const accountsFn = useServerFn(listGmailAccounts);
  const resumesFn = useServerFn(listResumes);
  const prefsFn = useServerFn(getUserPreferences);

  const templates = useQuery({ queryKey: ["templates"], queryFn: () => listFn() });
  const accounts = useQuery({ queryKey: ["gmail-accounts"], queryFn: () => accountsFn() });
  const resumes = useQuery({ queryKey: ["resumes"], queryFn: () => resumesFn() });
  const prefs = useQuery({ queryKey: ["user-prefs"], queryFn: () => prefsFn() });

  const [tplId, setTplId] = useState<string>("");
  const [senderId, setSenderId] = useState<string>("");
  const [recipientText, setRecipientText] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [genOpen, setGenOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [resumeGenOpen, setResumeGenOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [autosaveId, setAutosaveId] = useState<string | null>(null);
  const [tplPickerOpen, setTplPickerOpen] = useState(false);
  const [resumePickerOpen, setResumePickerOpen] = useState(false);
  const [jobMeta, setJobMeta] = useState({
    company: "",
    role: "",
    jobDescription: "",
    jobContext: "",
    instructions: "",
  });
  const [resumeIds, setResumeIds] = useState<string[]>([]);
  const [uploads, setUploads] = useState<File[]>([]);
  const [savedAttachments, setSavedAttachments] = useState<
    Array<{ filename: string; mimeType: string; size: number; storagePath: string }>
  >([]);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const initedRef = useRef(false);
  const jobHydratedRef = useRef<string | null>(null);
  const skipAutosaveUntilRef = useRef(0);
  const autosaveIdRef = useRef<string | null>(null);
  const getJobFn = useServerFn(getJob);
  const [report, setReport] = useState<null | {
    total: number; sent: number; failed: number;
    skipped: Array<{ email: string; reason: string; note?: string }>;
    recipientCount: number;
  }>(null);
  const [editingPreview, setEditingPreview] = useState(false);
  const [aiFilling, setAiFilling] = useState(false);
  const mod = useModKey();

  const autosaveFn = useServerFn(saveEmailDraft);
  const getAutosaveFn = useServerFn(getAutosaveDraft);
  const deleteDraftFn = useServerFn(deleteEmailDraft);
  const generateAiEmailFn = useServerFn(generateAiEmail);

  const isFollowUp = search.followUp === "1";
  const hasUrlPrefill = !!(search.to || search.followUp || search.resumeVersionId || search.campaignId || search.jobId);

  const selectedSender = useMemo(
    () => accounts.data?.find((a) => a.id === senderId) ?? null,
    [accounts.data, senderId],
  );
  const variables = useMemo(() => extractVariables(`${subject}\n${body}`), [subject, body]);
  const previewSubject = applyTemplate(subject, vars);
  const previewBody = applyTemplate(body, vars);
  const parsed = useMemo(() => parseRecipients(recipientText), [recipientText]);

  const selectTemplate = (id: string) => {
    setTplId(id);
    const t = templates.data?.find((x) => x.id === id);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
    }
    const preferred = (t as { preferred_resume_id?: string | null } | undefined)?.preferred_resume_id;
    if (preferred) setResumeIds((cur) => (cur.includes(preferred) ? cur : [...cur, preferred]));
  };

  // One-time hydration: URL prefill, cross-device autosave, or defaults.
  useEffect(() => {
    if (initedRef.current) return;
    if (!accounts.data || !templates.data || !prefs.data) return;

    const urlSender = search.sender ? accounts.data.find((a) => a.id === search.sender) : null;
    const defAcc = accounts.data.find((a) => a.is_default) ?? accounts.data[0];
    setSenderId((urlSender ?? defAcc)?.id ?? "");

    const applyDefaultTemplate = () => {
      let templateToUse: string | null = null;
      if (search.template && templates.data.some((t) => t.id === search.template)) {
        templateToUse = search.template;
      } else if (isFollowUp && prefs.data.followUpTemplateId && templates.data.some((t) => t.id === prefs.data.followUpTemplateId)) {
        templateToUse = prefs.data.followUpTemplateId;
      } else if (!isFollowUp && prefs.data.defaultTemplateId && templates.data.some((t) => t.id === prefs.data.defaultTemplateId)) {
        templateToUse = prefs.data.defaultTemplateId;
      } else {
        const marked = templates.data.find((t) => (t as { is_default?: boolean }).is_default);
        if (marked) templateToUse = marked.id;
      }
      if (templateToUse) selectTemplate(templateToUse);
    };

    if (search.to) setRecipientText(search.to);
    const preVars: Record<string, string> = {};
    if (search.name) preVars.name = search.name;
    if (search.company) preVars.company = search.company;
    if (Object.keys(preVars).length) setVars((v) => ({ ...preVars, ...v }));
    if (search.company) {
      setJobMeta((m) => ({ ...m, company: search.company || m.company }));
    }

    if (hasUrlPrefill) {
      // When returning from Resume Studio with a preserved email, don't wipe it with a template.
      const handoff = peekSendResumeHandoff();
      if (!(search.resumeVersionId && handoff?.attachOnly && (handoff.subject || handoff.body))) {
        applyDefaultTemplate();
      }
      initedRef.current = true;
      skipAutosaveUntilRef.current = Date.now() + 2000;
      // Reuse the user's single existing autosave row (if any) so composing from a job
      // posting overwrites that in-progress draft instead of leaving an orphaned extra one behind.
      getAutosaveFn()
        .then((r) => {
          if (r.draft && !autosaveIdRef.current) {
            setAutosaveId(r.draft.id);
            autosaveIdRef.current = r.draft.id;
          }
        })
        .catch(() => {});
      return;
    }

    initedRef.current = true; // block re-entry while fetching
    (async () => {
      try {
        const r = await getAutosaveFn();
        const d = r.draft;
        const hasContent = !!(d && (d.recipients?.trim() || d.subject?.trim() || d.body?.trim()));
        if (!hasContent || !d) {
          applyDefaultTemplate();
          if (d) {
            setAutosaveId(d.id);
            autosaveIdRef.current = d.id;
          }
        } else {
          const files = await filesFromDraftAttachments(r.attachments);
          setTplId(d.template_id ?? "");
          if (d.gmail_account_id) setSenderId(d.gmail_account_id);
          setRecipientText(d.recipients ?? "");
          setSubject(d.subject ?? "");
          setBody(d.body ?? "");
          setVars(d.variables ?? {});
          setResumeIds(d.resume_ids ?? []);
          setUploads(files);
          setSavedAttachments(d.attachments ?? []);
          setJobMeta({
            company: d.company ?? "",
            role: d.role ?? "",
            jobDescription: d.job_description ?? "",
            jobContext: d.job_description ?? "",
            instructions: d.instructions ?? "",
          });
          setAutosaveId(d.id);
          autosaveIdRef.current = d.id;
          toast.message("Restored autosaved draft", {
            description: `Last saved ${new Date(d.updated_at).toLocaleString()}`,
          });
        }
      } catch {
        applyDefaultTemplate();
      } finally {
        skipAutosaveUntilRef.current = Date.now() + 2000;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.data, templates.data, prefs.data]);

  // Load full Jobs Community posting when navigated with ?jobId=, then auto-fill subject/body via AI.
  useEffect(() => {
    if (!search.jobId || jobHydratedRef.current === search.jobId) return;
    // Wait until template hydration can resolve (same deps as one-time init).
    if (!accounts.data || !templates.data || !prefs.data) return;

    let cancelled = false;
    (async () => {
      try {
        const job = await getJobFn({ data: { id: search.jobId! } });
        if (cancelled) return;
        const fields = jobToContextFields(job);
        jobHydratedRef.current = search.jobId!;
        setJobMeta((m) => ({
          ...m,
          company: fields.company || m.company,
          role: fields.role || m.role,
          jobDescription: fields.jobDescription || m.jobDescription,
          jobContext: fields.jobContext || m.jobContext,
        }));
        setVars((v) => ({
          ...v,
          ...jobToTemplateVars(job),
        }));
        if (job.recruiter_email) {
          setRecipientText((cur) => (cur.trim() ? cur : job.recruiter_email));
        }

        // Resolve template the same way as page init (tplId state may still be stale this tick).
        let templateId: string | null = null;
        if (search.template && templates.data.some((t) => t.id === search.template)) {
          templateId = search.template;
        } else if (prefs.data.defaultTemplateId && templates.data.some((t) => t.id === prefs.data.defaultTemplateId)) {
          templateId = prefs.data.defaultTemplateId;
        } else {
          const marked = templates.data.find((t) => (t as { is_default?: boolean }).is_default);
          templateId = marked?.id ?? templates.data[0]?.id ?? null;
        }

        setAiFilling(true);
        skipAutosaveUntilRef.current = Date.now() + 8000;
        toast.message("Generating email from job…", {
          description: [job.title, job.company].filter(Boolean).join(" · "),
        });

        const result = await generateAiEmailFn({
          data: {
            templateId,
            resumeVersionId: search.resumeVersionId ?? null,
            company: fields.company || null,
            jobTitle: fields.role || null,
            jobDescription: fields.jobDescription || null,
            jobContext: fields.jobContext || null,
            instructions: null,
          },
        });
        if (cancelled) return;

        if (result.subject) setSubject(result.subject);
        if (result.body) setBody(result.body);
        setEditingPreview(false);
        skipAutosaveUntilRef.current = Date.now() + 2000;
        toast.success("Email filled from job posting", {
          description: "Review the preview — you can still edit or regenerate.",
        });
      } catch (e) {
        if (!cancelled) {
          toast.error("Could not load job / generate email", {
            description: (e as Error).message,
          });
        }
      } finally {
        if (!cancelled) setAiFilling(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.jobId, accounts.data, templates.data, prefs.data, getJobFn, generateAiEmailFn]);

  // Restore preserved email after returning from Resume Studio (attach-only — no new AI body).
  // Peek only (do not take) so React Strict Mode remounts / revisits keep the same draft.
  const handoffRestoredForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!search.resumeVersionId) return;
    if (handoffRestoredForRef.current === search.resumeVersionId) return;
    const h = peekSendResumeHandoff();
    if (!h?.attachOnly) return;
    handoffRestoredForRef.current = search.resumeVersionId;
    if (h.subject) setSubject(h.subject);
    if (h.body) setBody(h.body);
    if (h.recipientText) setRecipientText(h.recipientText);
    if (h.vars && Object.keys(h.vars).length) setVars((v) => ({ ...v, ...h.vars }));
    setJobMeta((m) => ({
      company: h.company || m.company,
      role: h.role || m.role,
      jobDescription: h.jobDescription || m.jobDescription,
      jobContext: h.jobContext || m.jobContext,
      instructions: h.instructions || m.instructions,
    }));
    setEditingPreview(false);
    skipAutosaveUntilRef.current = Date.now() + 2500;
    toast.message("Email restored", {
      description: "Subject & body unchanged — resume PDF attaching…",
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.resumeVersionId]);

  useEffect(() => {
    autosaveIdRef.current = autosaveId;
  }, [autosaveId]);

  const toggleResume = (id: string) =>
    setResumeIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const collectDraftState = async (): Promise<DraftState> => {
    const inline = await Promise.all(
      uploads.map(async (f) => ({
        filename: f.name,
        mimeType: f.type || "application/octet-stream",
        size: f.size,
        base64: await fileToBase64(f),
      })),
    );
    const keptSaved = savedAttachments.filter((a) => uploads.some((u) => u.name === a.filename));
    const fresh = inline.filter((a) => !keptSaved.some((k) => k.filename === a.filename));
    return {
      name: subject || "Untitled draft",
      gmailAccountId: senderId || null,
      templateId: tplId || null,
      resumeVersionId: search.resumeVersionId ?? null,
      recipients: recipientText,
      subject,
      body,
      variables: vars,
      resumeIds,
      attachments: [...keptSaved, ...fresh],
      company: jobMeta.company,
      role: jobMeta.role,
      jobDescription: jobMeta.jobDescription,
      instructions: jobMeta.instructions,
    };
  };

  const applyLoadedDraft = ({ draft, files }: LoadedDraft) => {
    initedRef.current = true;
    skipAutosaveUntilRef.current = Date.now() + 2500;
    setTplId(draft.template_id ?? "");
    setSenderId(draft.gmail_account_id ?? senderId);
    setRecipientText(draft.recipients ?? "");
    setSubject(draft.subject ?? "");
    setBody(draft.body ?? "");
    setVars(draft.variables ?? {});
    setResumeIds(draft.resume_ids ?? []);
    setUploads(files);
    setSavedAttachments(draft.attachments ?? []);
    setJobMeta({
      company: draft.company ?? "",
      role: draft.role ?? "",
      jobDescription: draft.job_description ?? "",
      jobContext: draft.job_description ?? "",
      instructions: draft.instructions ?? "",
    });
  };

  const onUpload = (files: FileList | null) => {
    if (!files) return;
    const next: File[] = [];
    for (const f of Array.from(files)) {
      const c = isAllowedResumeFile(f);
      if (!c.ok) {
        toast.error(`${f.name}: ${c.reason}`);
        continue;
      }
      next.push(f);
    }
    if (next.length) setUploads((u) => [...u, ...next]);
    if (uploadRef.current) uploadRef.current.value = "";
  };

  const selectedResumes = useMemo(
    () => (resumes.data ?? []).filter((r) => resumeIds.includes(r.id)),
    [resumes.data, resumeIds],
  );
  const totalAttachBytes =
    selectedResumes.reduce((n, r) => n + r.size_bytes, 0) + uploads.reduce((n, f) => n + f.size, 0);
  const overLimit = totalAttachBytes > 25 * 1024 * 1024;

  const send = useMutation({
    mutationFn: async () => {
      const inlineUploads = await Promise.all(
        uploads.map(async (f) => ({
          filename: f.name,
          mimeType: f.type || "application/octet-stream",
          base64: await fileToBase64(f),
          size: f.size,
        })),
      );
      const company = jobMeta.company.trim() || vars.company?.trim() || undefined;
      const role = jobMeta.role.trim() || undefined;
      return sendFn({
        data: {
          templateId: tplId || null,
          gmailAccountId: senderId || null,
          // Send everything the user typed — the server re-validates and skips.
          recipients: parsed.valid.length ? parsed.valid : [],
          recipientMeta:
            company || role
              ? parsed.meta.map((m) => ({ ...m, ...(company ? { company } : {}), ...(role ? { role } : {}) }))
              : parsed.meta,
          subject,
          body,
          variables: vars,
          resumeIds,
          uploads: inlineUploads,
        },
      });
    },
    onSuccess: async (r) => {
      toast.success(`Email sent to ${r.sent} recipient${r.sent === 1 ? "" : "s"}`);
      clearSendResumeHandoff();
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      setReport({
        total: r.total ?? r.recipientCount,
        sent: r.sent,
        failed: r.failed,
        skipped: (r.skipped ?? []) as Array<{ email: string; reason: string; note?: string }>,
        recipientCount: r.recipientCount,
      });
      setRecipientText("");
      setUploads([]);
      skipAutosaveUntilRef.current = Date.now() + 5000;
      const id = autosaveIdRef.current;
      if (id) {
        try {
          await deleteDraftFn({ data: { id } });
        } catch {
          /* ignore */
        }
        setAutosaveId(null);
        autosaveIdRef.current = null;
      }
    },
    onError: (e) => toast.error("Send failed", { description: (e as Error).message }),
  });

  // Debounced cross-device autosave (text + attachments to Supabase).
  useEffect(() => {
    if (!initedRef.current) return;
    const meaningful = !!(recipientText.trim() || subject.trim() || body.trim() || resumeIds.length || uploads.length);
    if (!meaningful) return;

    const delay = Math.max(1600, skipAutosaveUntilRef.current - Date.now());
    const timer = window.setTimeout(async () => {
      try {
        const state = await collectDraftState();
        const r = await autosaveFn({
          data: {
            ...state,
            id: autosaveIdRef.current ?? undefined,
            name: "Autosaved draft",
            metadata: { autosave: true },
          },
        });
        setAutosaveId(r.id);
        autosaveIdRef.current = r.id;
        if (r.attachments?.length) {
          setSavedAttachments(r.attachments);
        }
      } catch {
        /* silent — named Save draft still works */
      }
    }, delay);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientText, subject, body, vars, tplId, senderId, resumeIds, uploads, jobMeta]);

  // Keyboard: ⌘/Ctrl+Enter send · ⌘/Ctrl+⌥/Alt+T template · ⌘/Ctrl+⌥/Alt+R resumes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (genOpen || aiOpen || resumeGenOpen || report) return;

      if (e.key === "Enter") {
        e.preventDefault();
        if (
          !send.isPending &&
          parsed.valid.length > 0 &&
          subject.trim() &&
          body.trim() &&
          senderId &&
          !overLimit
        ) {
          send.mutate();
        }
        return;
      }
      if (e.altKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        setTplPickerOpen(true);
        setResumePickerOpen(false);
        return;
      }
      if (e.altKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        setResumePickerOpen(true);
        setTplPickerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [genOpen, aiOpen, resumeGenOpen, report, send, parsed.valid.length, subject, body, senderId, overLimit]);

  // Auto-attach the compiled PDF from Resume Studio. Only attach PDFs — never .tex.
  const getVersionFn = useServerFn(getResumeVersion);
  useEffect(() => {
    if (!search.resumeVersionId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await getVersionFn({ data: { id: search.resumeVersionId! } });
        if (cancelled) return;
        if (!r.pdfUrl) {
          toast.error("No compiled PDF for this resume yet", {
            description: "Open the resume in Resume Studio and click Compile before sending.",
          });
          return;
        }
        const { resumePdfName } = await import("@/lib/naming");
        const pdfName = resumePdfName({
          fullName: prefs.data?.fullName ?? null,
          email: prefs.data?.email ?? null,
          company: r.version.company ?? null,
        });
        try {
          const resp = await fetch(r.pdfUrl);
          const buf = await resp.arrayBuffer();
          if (!buf.byteLength) throw new Error("Empty PDF");
          const pdf = new File([buf], pdfName, { type: "application/pdf" });
          setUploads((u) => (u.some((x) => x.name === pdf.name) ? u : [...u, pdf]));
        } catch (err) {
          toast.error("Could not attach the compiled PDF", { description: (err as Error).message });
        }
      } catch (e) {
        toast.error("Could not load resume", { description: (e as Error).message });
      }
    })();
    return () => { cancelled = true; };
  }, [search.resumeVersionId, getVersionFn, prefs.data]);

  const altKey = mod === "⌘" ? "⌥" : "Alt";
  const linkedResumeVersionId =
    search.resumeVersionId ||
    getLinkedResumeVersionId({
      jobId: search.jobId,
      company: jobMeta.company || (vars.company ?? ""),
      role: jobMeta.role,
    });

  const canSend =
    !send.isPending &&
    parsed.valid.length > 0 &&
    !!subject.trim() &&
    !!body.trim() &&
    !!senderId &&
    !overLimit;
  const firstRecipient = parsed.valid[0];

  if (accounts.isError) {
    return (
      <Page size="narrow">
        <Card>
          <ErrorState
            title="Couldn't load your Gmail accounts"
            error={accounts.error}
            onRetry={() => accounts.refetch()}
            retrying={accounts.isFetching}
          />
        </Card>
      </Page>
    );
  }

  if (accounts.isLoading) {
    return (
      <Page size="wide">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-6">
            <Skeleton className="h-44" />
            <Skeleton className="h-40" />
            <Skeleton className="h-96" />
          </div>
          <Skeleton className="h-96" />
        </div>
        <span className="sr-only">Loading composer…</span>
      </Page>
    );
  }

  if (accounts.data && accounts.data.length === 0) {
    return (
      <Page size="narrow">
        <Card>
          <EmptyState
            icon={Mail}
            title="Connect Gmail first"
            description="You need to grant Gmail send permission before you can send emails."
            action={
              <Button asChild>
                <Link to="/settings">Go to Settings</Link>
              </Button>
            }
          />
        </Card>
      </Page>
    );
  }

  return (
    <Page size="wide">
      <PageHeader
        eyebrow="02 · Outreach · Compose"
        icon={isFollowUp ? Flame : Send}
        title={
          <>
            {isFollowUp ? "Follow-up" : "Send"}{" "}
            <span className="inline-block -rotate-1 bg-primary px-2 text-primary-foreground">email</span>
          </>
        }
        description={
          isFollowUp
            ? "Review the pre-filled details and hit send."
            : "Pick a template, add recipients, and send from your Gmail."
        }
        actions={
          <>
            <DraftManager
              draftId={draftId}
              onDraftIdChange={setDraftId}
              getState={collectDraftState}
              onLoad={applyLoadedDraft}
            />
            <Button onClick={() => send.mutate()} disabled={!canSend} className="w-full sm:w-auto">
              {send.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
              {send.isPending ? "Sending…" : "Send"}
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* ── Compose column ─────────────────────────────────────────── */}
        <div className="min-w-0 space-y-6">
          <SectionCard
            id="send-setup"
            index="01"
            title="Sender & template"
            description="Who the email comes from and where it starts."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From" htmlFor="send-from">
                <Select value={senderId} onValueChange={setSenderId}>
                  <SelectTrigger id="send-from" className="h-10 w-full min-w-0">
                    <SelectValue placeholder="Choose a Gmail account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.data?.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="truncate">
                          {a.label ?? a.full_name ?? a.gmail_email}
                          {a.is_default ? " · Default" : ""}
                          <span className="text-muted-foreground"> — {a.gmail_email}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Template"
                action={
                  <span className="hidden items-center gap-0.5 sm:flex" aria-hidden>
                    <Kbd>{mod}</Kbd>
                    <Kbd>{altKey}</Kbd>
                    <Kbd>T</Kbd>
                  </span>
                }
              >
                <TemplateCombobox
                  templates={(templates.data ?? []).map((t) => ({
                    id: t.id,
                    name: t.name,
                    is_default: !!(t as { is_default?: boolean }).is_default,
                  }))}
                  value={tplId}
                  onValueChange={selectTemplate}
                  placeholder={templates.isLoading ? "Loading templates…" : "Choose a template (optional)"}
                  searchPlaceholder="Search templates by name…"
                  allowClear
                  clearLabel="No template"
                  open={tplPickerOpen}
                  onOpenChange={setTplPickerOpen}
                />
              </Field>
            </div>

            {variables.length > 0 && (
              <div className="space-y-3 border-2 border-dashed border-border/50 bg-muted/40 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="eyebrow">Variables</span>
                  <span className="text-xs text-muted-foreground">
                    {variables.filter((v) => vars[v]?.trim()).length}/{variables.length} filled
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {variables.map((v) => {
                    const id = `send-var-${v.replace(/\W/g, "_")}`;
                    return (
                      <Field key={v} label={<span className="normal-case tracking-normal">{`{{${v}}}`}</span>} htmlFor={id}>
                        <Input
                          id={id}
                          value={vars[v] ?? ""}
                          onChange={(e) => setVars({ ...vars, [v]: e.target.value })}
                          placeholder={v}
                        />
                      </Field>
                    );
                  })}
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard
            id="send-recipients"
            index="02"
            title="Recipients"
            description="Separate with commas or new lines. “Name <email>” works too."
            actions={
              <Button type="button" variant="outline" size="sm" onClick={() => setGenOpen(true)}>
                <Sparkles aria-hidden /> Generate emails
              </Button>
            }
          >
            <Textarea
              id="send-recipients-input"
              aria-label="Recipient email addresses"
              rows={4}
              value={recipientText}
              onChange={(e) => setRecipientText(e.target.value)}
              placeholder="jane@company.com, John Doe <john@company.com>"
              className="font-mono"
            />
            <div className="flex flex-wrap items-center gap-2" aria-live="polite">
              {parsed.total > 0 ? (
                <>
                  <Badge variant={parsed.valid.length ? "success" : "muted"}>
                    <CheckCircle2 aria-hidden />
                    {parsed.valid.length} valid
                  </Badge>
                  {parsed.invalid.length > 0 && (
                    <Badge variant="danger">
                      <AlertCircle aria-hidden />
                      {parsed.invalid.length} invalid
                    </Badge>
                  )}
                  {parsed.duplicates > 0 && (
                    <Badge variant="muted">{parsed.duplicates} duplicate{parsed.duplicates === 1 ? "" : "s"} removed</Badge>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">No recipients yet.</span>
              )}
            </div>
          </SectionCard>

          <SectionCard
            id="send-attachments"
            index="03"
            title="Attachments"
            description="PDF or Word files, up to 25 MB in total."
            actions={
              <>
                <input
                  ref={uploadRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => onUpload(e.target.files)}
                />
                <Button type="button" size="sm" variant="outline" onClick={() => uploadRef.current?.click()}>
                  <Upload aria-hidden /> Add file
                </Button>
              </>
            }
          >
            {resumes.data && resumes.data.length > 0 ? (
              <Field
                label="From your resume library"
                action={
                  <span className="hidden items-center gap-0.5 sm:flex" aria-hidden>
                    <Kbd>{mod}</Kbd>
                    <Kbd>{altKey}</Kbd>
                    <Kbd>R</Kbd>
                  </span>
                }
              >
                <ResumeCombobox
                  resumes={resumes.data.map((r) => ({
                    id: r.id,
                    name: r.name,
                    is_default: !!r.is_default,
                  }))}
                  value={resumeIds}
                  onToggle={toggleResume}
                  placeholder="Attach from Resume Library…"
                  searchPlaceholder="Search resumes by name…"
                  open={resumePickerOpen}
                  onOpenChange={setResumePickerOpen}
                />
              </Field>
            ) : resumes.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <p className="text-sm text-muted-foreground">
                Your resume library is empty.{" "}
                <Link to="/resumes" className="font-medium text-primary underline-offset-4 hover:underline">
                  Upload a resume
                </Link>{" "}
                to attach it in one click.
              </p>
            )}

            {selectedResumes.length > 0 || uploads.length > 0 ? (
              <div className="space-y-3">
                <ul className="divide-y-2 divide-border border-2 border-border">
                  {selectedResumes.map((r) => (
                    <AttachmentRow
                      key={r.id}
                      name={r.original_filename}
                      meta={`${formatBytes(r.size_bytes)} · Library`}
                      onRemove={() => toggleResume(r.id)}
                    />
                  ))}
                  {uploads.map((f, i) => (
                    <AttachmentRow
                      key={`u-${i}-${f.name}`}
                      name={f.name}
                      meta={`${formatBytes(f.size)} · This email only`}
                      onRemove={() => setUploads((u) => u.filter((_, j) => j !== i))}
                    />
                  ))}
                </ul>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className={overLimit ? "font-medium text-destructive" : "text-muted-foreground"}>
                      {overLimit ? "Over the 25 MB Gmail limit" : "Total size"}
                    </span>
                    <span className={cn("tabular-nums", overLimit ? "text-destructive" : "text-muted-foreground")}>
                      {formatBytes(totalAttachBytes)} / 25 MB
                    </span>
                  </div>
                  <Progress
                    value={Math.min(100, (totalAttachBytes / (25 * 1024 * 1024)) * 100)}
                    aria-label="Attachment size used"
                    className={cn("h-1.5 bg-muted", overLimit && "[&>div]:bg-destructive")}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No attachments yet.</p>
            )}
          </SectionCard>
          <Button onClick={() => send.mutate()} disabled={!canSend} className="w-full" size="lg">
            {send.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            {send.isPending ? "Sending…" : "Send"}
          </Button>
        </div>

        {/* ── Preview (toggle to Edit) ───────────────────────────────── */}
        <aside className="min-w-0 lg:sticky lg:top-24" aria-label="Email preview">
          <section aria-labelledby="send-preview-title" className="airmail p-2 shadow-[var(--shadow-brutal)]">
            <div className="relative border-2 border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-border px-3 py-2.5 sm:px-4">
                <h2 id="send-preview-title" className="font-expanded flex items-center gap-2 text-base">
                  {editingPreview ? <Pencil className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                  {editingPreview ? "Edit" : "Preview"}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={editingPreview ? "secondary" : "outline"}
                    onClick={() => setEditingPreview((v) => !v)}
                    aria-pressed={editingPreview}
                  >
                    {editingPreview ? (
                      <><Eye aria-hidden /> Preview</>
                    ) : (
                      <><Pencil aria-hidden /> Edit</>
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const company = jobMeta.company || (vars.company ?? "");
                      const role = jobMeta.role || (vars.name ?? "");
                      openLinkedOrGenerateResume({
                        navigate,
                        jobId: search.jobId,
                        company,
                        role,
                        jobContext: jobMeta.jobContext || jobMeta.jobDescription,
                        instructions: jobMeta.instructions,
                        existingResumeVersionId:
                          search.resumeVersionId ||
                          getLinkedResumeVersionId({ jobId: search.jobId, company, role }),
                        preserveEmail: { subject, body, recipientText, vars },
                        openDialog: () => setResumeGenOpen(true),
                      });
                    }}
                    disabled={aiFilling}
                  >
                    <Wand2 aria-hidden />
                    {linkedResumeVersionId ? "Open Resume" : "Generate Resume"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setAiOpen(true)} disabled={aiFilling}>
                    {aiFilling ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
                    {aiFilling ? "Filling from job…" : "Generate Body Using AI"}
                  </Button>
                </div>
              </div>

              {aiFilling && (
                <div
                  role="status"
                  className="flex items-center gap-2 border-b-2 border-border bg-info-subtle px-4 py-2 text-sm font-medium"
                >
                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                  Tailoring subject & body from the full job posting…
                </div>
              )}

              {editingPreview ? (
                <div className="space-y-4 p-4">
                  <Field label="Subject" htmlFor="send-subject">
                    <Input
                      id="send-subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Email subject…"
                    />
                  </Field>
                  <Field label="Body" htmlFor="send-body">
                    <Textarea
                      id="send-body"
                      rows={16}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Write your email body…"
                      className="min-h-72 leading-relaxed"
                    />
                  </Field>
                </div>
              ) : (
                <>
                  <dl className="space-y-1 border-b-2 border-dashed border-border/50 px-4 py-3 font-mono text-xs">
                    <div className="flex gap-2">
                      <dt className="w-16 shrink-0 uppercase tracking-wider text-muted-foreground">From</dt>
                      <dd className="min-w-0 truncate">{selectedSender?.gmail_email ?? "—"}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-16 shrink-0 uppercase tracking-wider text-muted-foreground">To</dt>
                      <dd className="min-w-0 truncate">
                        {firstRecipient ?? "—"}
                        {parsed.valid.length > 1 && (
                          <span className="text-muted-foreground"> +{parsed.valid.length - 1} more</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                  <div className="max-h-[70vh] overflow-auto px-4 py-4">
                    <p className="eyebrow mb-1">Subject</p>
                    <p className="font-expanded break-words text-base leading-snug">{previewSubject || subject || "—"}</p>
                    <div className="mt-4 border-t-2 border-border pt-4">
                      <p className="eyebrow mb-1">Body</p>
                      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{previewBody || body || "—"}</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        </aside>
      </div>

      <EmailGeneratorDialog
        open={genOpen}
        onOpenChange={setGenOpen}
        companyFromEmail={jobMeta.company || vars.company || ""}
        onUse={(emails) => {
          const existing = parsed.valid;
          const merged = Array.from(new Set([...existing, ...emails.map((e) => e.toLowerCase())]));
          setRecipientText(merged.join(", "));
        }}
      />

      <SendReportDialog report={report} onClose={() => setReport(null)} />

      <AiBodyDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        templateId={tplId || null}
        resumeVersionId={search.resumeVersionId ?? null}
        jobId={search.jobId ?? null}
        initialCompany={jobMeta.company || (vars.company ?? "")}
        initialRole={jobMeta.role}
        initialJobDescription={jobMeta.jobDescription}
        initialJobContext={jobMeta.jobContext || jobMeta.jobDescription}
        preserveEmail={{
          subject,
          body,
          recipientText,
          vars,
        }}
        onUse={(r) => {
          if (r.subject) setSubject(r.subject);
          setBody(r.body);
          setJobMeta({
            company: r.company,
            role: r.role,
            jobDescription: r.jobDescription,
            jobContext: r.jobContext ?? r.jobDescription,
            instructions: r.instructions,
          });
          setEditingPreview(false);
          toast.success("AI email applied");
        }}
      />

      <GenerateResumeDialog
        open={resumeGenOpen}
        onOpenChange={setResumeGenOpen}
        jobId={search.jobId ?? null}
        existingResumeVersionId={search.resumeVersionId ?? null}
        initialCompany={jobMeta.company || (vars.company ?? "")}
        initialRole={jobMeta.role}
        initialJobContext={jobMeta.jobContext || jobMeta.jobDescription}
        initialInstructions={jobMeta.instructions}
        preserveEmail={{
          subject,
          body,
          recipientText,
          vars,
        }}
      />
    </Page>
  );
}

function AttachmentRow({ name, meta, onRemove }: { name: string; meta: string; onRemove: () => void }) {
  const ext = name.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE";
  return (
    <li className="flex items-center gap-3 bg-card px-3 py-2.5">
      <span className="grid h-10 w-12 shrink-0 place-items-center border-2 border-border bg-primary font-mono text-xs font-bold text-primary-foreground">
        {ext}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{name}</div>
        <div className="font-mono text-xs text-muted-foreground">{meta}</div>
      </div>
      <IconButton label={`Remove ${name}`} size="sm" onClick={onRemove}>
        <X aria-hidden />
      </IconButton>
    </li>
  );
}

/** Human-readable labels for server skip reasons (CSV export keeps the raw codes). */
const SKIP_REASON_LABELS: Record<string, string> = {
  invalid_syntax: "Invalid address",
  duplicate: "Duplicate",
  unroutable_domain: "Domain can't receive mail",
  blank: "Blank entry",
};

function SendReportDialog({
  report,
  onClose,
}: {
  report: null | { total: number; sent: number; failed: number; skipped: Array<{ email: string; reason: string; note?: string }>; recipientCount: number };
  onClose: () => void;
}) {
  const open = !!report;
  const download = () => {
    if (!report) return;
    const now = new Date().toISOString();
    const rows: string[] = ["Email,Status,Reason,Timestamp"];
    for (let i = 0; i < report.sent; i++) rows.push(`,sent,,${now}`);
    for (let i = 0; i < report.failed; i++) rows.push(`,failed,,${now}`);
    for (const s of report.skipped) rows.push(`${csv(s.email)},skipped,${csv(s.reason + (s.note ? ` (${s.note})` : ""))},${now}`);
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `send-report-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Campaign summary</DialogTitle>
          {report && (
            <DialogDescription>
              {report.failed
                ? `${report.sent} sent, ${report.failed} failed.`
                : `All ${report.sent} email${report.sent === 1 ? "" : "s"} sent successfully.`}
            </DialogDescription>
          )}
        </DialogHeader>
        {report && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Total" value={report.total} flat />
              <StatCard label="Sent" value={report.sent} tone="success" flat />
              <StatCard
                label="Failed"
                value={report.failed}
                tone={report.failed ? "danger" : "default"}
                flat
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Invalid" value={report.skipped.filter((s) => s.reason === "invalid_syntax").length} flat />
              <StatCard label="Duplicate" value={report.skipped.filter((s) => s.reason === "duplicate").length} flat />
              <StatCard label="Domain errors" value={report.skipped.filter((s) => s.reason === "unroutable_domain").length} flat />
            </div>
            {report.skipped.length > 0 && (
              <div className="space-y-2">
                <div className="eyebrow">Skipped ({report.skipped.length})</div>
                <ul className="max-h-48 divide-y divide-border/20 overflow-auto border-2 border-border text-sm">
                  {report.skipped.map((s, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 truncate font-mono text-xs">{s.email || "(blank)"}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {SKIP_REASON_LABELS[s.reason] ?? s.reason}
                        {s.note ? ` · ${s.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={download}>
            <Download aria-hidden /> Download report
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function csv(s: string) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}