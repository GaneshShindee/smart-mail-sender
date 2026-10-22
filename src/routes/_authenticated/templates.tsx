import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTemplates, upsertTemplate, deleteTemplate, duplicateTemplate, setDefaultTemplate, setTemplatePublic, listPublicTemplates, saveMarketplaceTemplate } from "@/lib/templates.functions";
import { updateTemplateByJD } from "@/lib/ai-template.functions";
import { listResumes } from "@/lib/resumes.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Copy, LayoutTemplate, Star, Globe, GlobeLock, Sparkles, Search, Download, Eye, Check, Library } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Page, PageHeader } from "@/components/app/page";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { SegmentedControl } from "@/components/app/segmented-control";
import { IconButton } from "@/components/app/icon-button";
import { Field } from "@/components/app/field";
import { useConfirm } from "@/components/app/confirm-dialog";
import { extractVariables } from "@/lib/templating";
import { AiBodyDialog } from "@/components/ai-body-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({ meta: [{ title: "My Templates — Smart Email Sender" }] }),
  component: TemplatesPage,
});

type Tpl = { id: string; name: string; subject: string; body: string; preferred_resume_id?: string | null; is_default?: boolean; is_public?: boolean; category?: string | null };

/** Coloured top edge for each index card, cycled so the box reads like a tabbed card file. */
const CARD_EDGES = ["bg-chart-1", "bg-chart-2", "bg-chart-4", "bg-chart-5", "bg-chart-3"];

function VariableChips({ vars, empty }: { vars: string[]; empty?: ReactNode }) {
  if (!vars.length) return empty ? <>{empty}</> : null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Template variables">
      {vars.map((v) => (
        <li key={v}>
          <Badge variant="outline" className="normal-case tracking-normal">{`{{${v}}}`}</Badge>
        </li>
      ))}
    </ul>
  );
}

/** A ruled index card: coloured top edge, expanded title, mono subject, excerpt and footer actions. */
function IndexCard({
  edge,
  title,
  subject,
  body,
  stamps,
  meta,
  footer,
}: {
  edge: string;
  title: string;
  subject: string;
  body?: string;
  stamps?: ReactNode;
  meta?: ReactNode;
  footer: ReactNode;
}) {
  return (
    <article className="brutal-press relative flex min-w-0 flex-col border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
      <div aria-hidden className={cn("h-2.5 border-b-2 border-border", edge)} />
      <div className="relative border-b-2 border-destructive px-4 pb-3 pt-4 sm:px-5">
        {stamps && <div className="absolute right-3 top-3 flex flex-col items-end gap-2">{stamps}</div>}
        <h3 className={cn("font-expanded text-lg leading-tight break-words", stamps && "pr-28")}>{title}</h3>
        <p className="mt-1.5 truncate font-mono text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-[0.08em] text-foreground">Subj · </span>
          {subject || "No subject"}
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 py-3 sm:px-5">
        {body !== undefined && (
          <p className="line-clamp-4 whitespace-pre-line text-sm leading-6 text-muted-foreground">
            {body.trim() || "Empty body."}
          </p>
        )}
        {meta}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t-2 border-border bg-muted px-3 py-2.5 sm:px-4">{footer}</div>
    </article>
  );
}

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2" aria-busy="true" aria-label="Loading templates">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
          <Skeleton className="h-2.5 w-full" />
          <div className="space-y-2 border-b-2 border-border p-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <div className="space-y-2 p-4">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-4/6" />
          </div>
          <div className="border-t-2 border-border p-3"><Skeleton className="h-9 w-40" /></div>
        </div>
      ))}
    </div>
  );
}

function TemplatesPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const listFn = useServerFn(listTemplates);
  const upsertFn = useServerFn(upsertTemplate);
  const delFn = useServerFn(deleteTemplate);
  const dupFn = useServerFn(duplicateTemplate);
  const resumesFn = useServerFn(listResumes);
  const defFn = useServerFn(setDefaultTemplate);
  const pubFn = useServerFn(setTemplatePublic);
  const pubListFn = useServerFn(listPublicTemplates);
  const saveFn = useServerFn(saveMarketplaceTemplate);
  const jdFn = useServerFn(updateTemplateByJD);

  const templatesQ = useQuery({ queryKey: ["templates"], queryFn: () => listFn() });
  const { data, isLoading } = templatesQ;
  const { data: resumes } = useQuery({ queryKey: ["resumes"], queryFn: () => resumesFn() });

  const [editing, setEditing] = useState<Partial<Tpl> | null>(null);
  const [tab, setTab] = useState<"mine" | "gallery">("mine");
  const [gallerySearch, setGallerySearch] = useState("");
  const [jdOpen, setJdOpen] = useState(false);
  const [jdText, setJdText] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [previewTpl, setPreviewTpl] = useState<{ name: string; subject: string; body: string } | null>(null);

  const gallery = useQuery({
    queryKey: ["gallery", gallerySearch],
    queryFn: () => pubListFn({ data: { search: gallerySearch } }),
    enabled: tab === "gallery",
  });

  const save = useMutation({
    mutationFn: (input: Partial<Tpl>) => upsertFn({ data: {
      id: input.id ?? null,
      name: input.name ?? "",
      subject: input.subject ?? "",
      body: input.body ?? "",
      preferredResumeId: input.preferred_resume_id ?? null,
    } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); toast.success("Template saved"); setEditing(null); },
    onError: (e) => toast.error("Save failed", { description: (e as Error).message }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); toast.success("Deleted"); },
    onError: (e) => toast.error("Delete failed", { description: (e as Error).message }),
  });
  const dup = useMutation({
    mutationFn: (id: string) => dupFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); toast.success("Duplicated"); },
    onError: (e) => toast.error("Duplicate failed", { description: (e as Error).message }),
  });
  const markDefault = useMutation({
    mutationFn: (id: string) => defFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); toast.success("Set as default"); },
    onError: (e) => toast.error("Couldn't set default", { description: (e as Error).message }),
  });
  const publish = useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) => pubFn({ data: { id, isPublic } }),
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ["templates"] }); toast.success(v.isPublic ? "Published to gallery" : "Unpublished"); },
    onError: (e) => toast.error("Publish failed", { description: (e as Error).message }),
  });
  const saveFromGallery = useMutation({
    mutationFn: (id: string) => saveFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); qc.invalidateQueries({ queryKey: ["gallery"] }); toast.success("Saved to My Templates"); },
    onError: (e) => toast.error("Save failed", { description: (e as Error).message }),
  });
  const jdUpdate = useMutation({
    mutationFn: () => jdFn({ data: { subject: editing?.subject ?? "", body: editing?.body ?? "", jobDescription: jdText } }),
    onSuccess: (r) => {
      setEditing((cur) => cur ? { ...cur, subject: r.subject, body: r.body } : cur);
      setJdOpen(false); setJdText("");
      toast.success("Template updated to match the JD");
    },
    onError: (e) => toast.error("AI update failed", { description: (e as Error).message }),
  });

  const newTemplate = () => setEditing({ name: "", subject: "", body: "" });
  const editingVars = editing ? extractVariables(`${editing.subject ?? ""}\n${editing.body ?? ""}`) : [];

  return (
    <Page>
      <PageHeader
        eyebrow="03 · Library"
        title="Templates"
        icon={LayoutTemplate}
        description={
          <>
            Your card file of reusable emails. Use{" "}
            <code className="border border-border bg-muted px-1 font-mono text-xs text-foreground">{`{{placeholder}}`}</code>{" "}
            syntax to insert dynamic fields.
          </>
        }
        actions={<Button onClick={newTemplate}><Plus aria-hidden />New template</Button>}
      />

      <SegmentedControl
        ariaLabel="Template source"
        value={tab}
        onValueChange={setTab}
        options={[
          { value: "mine", label: "My Templates", icon: LayoutTemplate, count: data?.length },
          { value: "gallery", label: "Gallery", icon: Library },
        ]}
      />

      {tab === "mine" ? (
      isLoading ? (
        <CardGridSkeleton />
      ) : templatesQ.isError ? (
        <ErrorState title="Couldn't load your templates" error={templatesQ.error} onRetry={() => templatesQ.refetch()} retrying={templatesQ.isFetching} />
      ) : data?.length ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {data.map((t, i) => {
            const vars = extractVariables(`${t.subject}\n${t.body}`);
            return (
              <IndexCard
                key={t.id}
                edge={t.is_default ? "bg-primary" : CARD_EDGES[i % CARD_EDGES.length]}
                title={t.name}
                subject={t.subject}
                body={t.body}
                stamps={
                  (t.is_default || t.is_public) && (
                    <>
                      {t.is_default && <span className="stamp bg-card px-1.5 py-0.5 text-xs text-destructive">Default</span>}
                      {t.is_public && <span className="stamp rotate-6 bg-card px-1.5 py-0.5 text-xs text-info">Published</span>}
                    </>
                  )
                }
                meta={<VariableChips vars={vars} />}
                footer={
                  <>
                    <Button size="sm" onClick={() => setEditing(t)}><Pencil aria-hidden />Edit</Button>
                    <div className="ml-auto flex items-center gap-1">
                      <IconButton
                        label={t.is_default ? "Default template" : "Set as default"}
                        aria-pressed={!!t.is_default}
                        onClick={() => markDefault.mutate(t.id)}
                      >
                        <Star className={cn(t.is_default && "fill-current")} aria-hidden />
                      </IconButton>
                      <IconButton
                        label={t.is_public ? "Unpublish from gallery" : "Publish to gallery"}
                        aria-pressed={!!t.is_public}
                        onClick={() => publish.mutate({ id: t.id, isPublic: !t.is_public })}
                      >
                        {t.is_public ? <GlobeLock aria-hidden /> : <Globe aria-hidden />}
                      </IconButton>
                      <IconButton label="Duplicate template" onClick={() => dup.mutate(t.id)}><Copy aria-hidden /></IconButton>
                      <IconButton
                        label="Delete template"
                        className="hover:bg-destructive-subtle"
                        onClick={async () => {
                          if (await confirm({ title: `Delete "${t.name}"?`, description: "This template will be removed from your library.", confirmLabel: "Delete template" })) remove.mutate(t.id);
                        }}
                      >
                        <Trash2 aria-hidden />
                      </IconButton>
                    </div>
                  </>
                }
              />
            );
          })}
        </div>
      ) : (
        <EmptyState icon={LayoutTemplate} title="No templates yet" description="Create your first template to get going." action={<Button onClick={newTemplate}><Plus aria-hidden />New template</Button>} />
      )
      ) : (
        <div className="space-y-5">
          <div className="relative max-w-xl">
            <label htmlFor="gallery-search" className="sr-only">Search public templates</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="gallery-search" value={gallerySearch} onChange={(e) => setGallerySearch(e.target.value)} placeholder="Search public templates…" className="pl-9" />
          </div>
          {gallery.isLoading ? (
            <CardGridSkeleton />
          ) : gallery.isError ? (
            <ErrorState title="Couldn't load the gallery" error={gallery.error} onRetry={() => gallery.refetch()} retrying={gallery.isFetching} />
          ) : gallery.data?.length ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {gallery.data.map((g, i) => (
                <IndexCard
                  key={g.id}
                  edge={CARD_EDGES[i % CARD_EDGES.length]}
                  title={g.name}
                  subject={g.subject}
                  body={g.body}
                  stamps={
                    <Badge variant="secondary" title="Times saved"><Download aria-hidden />{g.saves_count ?? 0}<span className="sr-only"> saves</span></Badge>
                  }
                  meta={
                    <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
                      by {g.author?.full_name ?? g.author?.email ?? "Anonymous"}
                      {g.category ? ` · ${g.category}` : ""}
                    </p>
                  }
                  footer={
                    <>
                      <Button size="sm" variant="outline" onClick={() => setPreviewTpl({ name: g.name, subject: g.subject, body: g.body })}>
                        <Eye aria-hidden /> Preview
                      </Button>
                      <Button size="sm" disabled={g.isSaved || g.isMine || saveFromGallery.isPending} onClick={() => saveFromGallery.mutate(g.id)}>
                        {g.isSaved || g.isMine ? <Check aria-hidden /> : <Download aria-hidden />} {g.isMine ? "Yours" : g.isSaved ? "Saved" : "Save to My Templates"}
                      </Button>
                    </>
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Library}
              title={gallerySearch ? "No matches in the gallery" : "Gallery is empty"}
              description={gallerySearch ? "Try a different search term." : "Publish one of your own to seed the marketplace."}
              action={
                gallerySearch ? (
                  <Button variant="outline" onClick={() => setGallerySearch("")}>Clear search</Button>
                ) : (
                  <Button variant="outline" onClick={() => setTab("mine")}><LayoutTemplate aria-hidden />Go to My Templates</Button>
                )
              }
            />
          )}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <p className="eyebrow">Index card</p>
            <DialogTitle>{editing?.id ? "Edit template" : "New template"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-6">
              <fieldset className="space-y-4">
                <legend className="eyebrow mb-3 w-full border-b-2 border-border pb-1.5 text-foreground">01 · Card</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name" htmlFor="tpl-name">
                    <Input id="tpl-name" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Job application" />
                  </Field>
                  <Field label="Preferred resume (optional)" htmlFor="tpl-resume" hint="Auto-attaches on the Send page when this template is selected.">
                    <Select
                      value={editing.preferred_resume_id ?? "none"}
                      onValueChange={(v) => setEditing({ ...editing, preferred_resume_id: v === "none" ? null : v })}
                    >
                      <SelectTrigger id="tpl-resume"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {resumes?.map((r) => (
                          <SelectItem key={r.id} value={r.id}>{r.name}{r.is_default ? " · Default" : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="eyebrow mb-3 w-full border-b-2 border-border pb-1.5 text-foreground">02 · Message</legend>
                <div className="flex flex-col gap-2 border-2 border-dashed border-border p-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <span className="font-mono text-xs font-semibold uppercase tracking-[0.08em] sm:mr-auto">AI assist</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => setAiOpen(true)}>
                    <Sparkles aria-hidden /> Generate subject & body with AI
                  </Button>
                  {editing?.id && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setJdOpen(true)}>
                      <Sparkles aria-hidden /> Update via JD
                    </Button>
                  )}
                </div>
                <Field label="Subject" htmlFor="tpl-subject">
                  <Input id="tpl-subject" className="font-mono" value={editing.subject ?? ""} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} placeholder="Application for {{position}}" />
                </Field>
                <Field label="Body" htmlFor="tpl-body">
                  <Textarea id="tpl-body" rows={10} value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} placeholder={"Hello {{name}},\n\nI'm interested in the {{position}} role at {{company}}.\n\nThanks,\n{{sender_name}}"} />
                </Field>
              </fieldset>

              <fieldset>
                <legend className="eyebrow mb-3 w-full border-b-2 border-border pb-1.5 text-foreground">03 · Detected variables</legend>
                <VariableChips vars={editingVars} empty={<p className="text-sm text-muted-foreground">None yet — type <code className="font-mono text-xs">{`{{name}}`}</code> in the subject or body.</p>} />
              </fieldset>
            </div>
          )}
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={jdOpen} onOpenChange={(o) => { setJdOpen(o); if (!o) setJdText(""); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Update template via Job Description</DialogTitle>
            <DialogDescription>Paste a JD — the AI will tweak the subject and body (~10%) to align with it. Your placeholders and structure stay intact.</DialogDescription>
          </DialogHeader>
          <Field label="Job description" htmlFor="tpl-jd">
            <Textarea id="tpl-jd" rows={10} value={jdText} onChange={(e) => setJdText(e.target.value)} placeholder="Paste the job description here…" />
          </Field>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button variant="ghost" onClick={() => setJdOpen(false)}>Cancel</Button>
            <Button onClick={() => jdUpdate.mutate()} disabled={jdUpdate.isPending}>
              <Sparkles aria-hidden /> {jdUpdate.isPending ? "Rewriting…" : "Update template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AiBodyDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        templateId={editing?.id ?? null}
        resumeVersionId={null}
        onUse={(r) => {
          setEditing((cur) =>
            cur
              ? {
                  ...cur,
                  subject: r.subject || cur.subject,
                  body: r.body,
                  name: cur.name?.trim() ? cur.name : (r.role ? `${r.role} outreach` : cur.name),
                }
              : cur,
          );
          toast.success("AI subject & body applied");
        }}
      />

      <Dialog open={!!previewTpl} onOpenChange={(o) => !o && setPreviewTpl(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <p className="eyebrow">Gallery preview</p>
            <DialogTitle>{previewTpl?.name}</DialogTitle>
          </DialogHeader>
          {previewTpl && (
            <div className="border-2 border-border text-sm">
              <div className="border-b-2 border-destructive px-4 py-3 font-mono text-xs">
                <span className="font-semibold uppercase tracking-[0.08em]">Subj · </span>
                {previewTpl.subject}
              </div>
              <div className="whitespace-pre-wrap px-4 py-3 leading-6">{previewTpl.body}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Page>
  );
}
