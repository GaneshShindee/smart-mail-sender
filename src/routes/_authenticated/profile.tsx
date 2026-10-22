import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getFullProfile,
  saveProfileDetails,
  upsertProfileEntry,
  deleteProfileEntry,
  reorderProfileEntries,
  parseResumeToProfileDraft,
  saveImportedProfile,
} from "@/lib/user-profile.functions";
import { listResumeProjects } from "@/lib/resume-studio.functions";
import {
  PROFILE_SECTIONS,
  SECTION_META,
  EMPTY_DETAILS,
  emptyEntry,
  entrySummary,
  type ProfileDetails,
  type ProfileEntry,
  type ProfileSection,
} from "@/lib/user-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDown, ArrowUp, ListPlus, Pencil, Plus, Save, Sparkles, Trash2, UserRound, X } from "lucide-react";
import { Page, PageHeader } from "@/components/app/page";
import { SectionCard } from "@/components/app/section-card";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { IconButton } from "@/components/app/icon-button";
import { Field } from "@/components/app/field";
import { useConfirm } from "@/components/app/confirm-dialog";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your Profile — Smart Email Sender" },
      { name: "description", content: "Manage the master profile that powers every AI-generated resume, cover letter and email." },
      { property: "og:title", content: "Your Profile — Smart Email Sender" },
      { property: "og:description", content: "Your experience, skills and projects in one place — the single source of truth for AI generation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getFullProfile);
  const q = useQuery({ queryKey: ["full-profile"], queryFn: () => getFn() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["full-profile"] });

  const tabs: { value: string; label: string; count?: number }[] = [
    { value: "personal", label: "Personal" },
    ...PROFILE_SECTIONS.map((s) => ({
      value: s as string,
      label: SECTION_META[s].label,
      count: (q.data?.entries ?? []).filter((e) => e.section === s).length,
    })),
    { value: "import", label: "Import" },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="04 · You"
        title="Your Profile"
        icon={UserRound}
        description="The single source of truth for every AI-generated resume, cover letter and email. AI never invents anything that is not here."
      />

      {q.isLoading ? (
        <div className="space-y-5" aria-busy="true" aria-label="Loading profile">
          <div className="flex gap-1 border-b-2 border-border">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-28" />)}
          </div>
          <div className="border-2 border-border bg-card p-5 shadow-[var(--shadow-brutal)]">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-10 w-full" /></div>
              ))}
            </div>
          </div>
        </div>
      ) : q.isError ? (
        <ErrorState title="Couldn't load your profile" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />
      ) : (
        <Tabs defaultValue="personal">
          {/* File-folder tabs: one strip that scrolls sideways on narrow screens. */}
          <div className="-mx-1 overflow-x-auto px-1 pt-1">
            <TabsList className="h-auto w-max items-end gap-1 border-0 border-b-2 bg-transparent p-0 shadow-none [&>*+*]:border-l-2">
              {tabs.map((t, i) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="h-11 border-2 border-b-0 border-border bg-muted px-3 data-[state=active]:h-12"
                >
                  <span className="font-mono text-xs opacity-70">{String(i + 1).padStart(2, "0")}</span>
                  {t.label}
                  {t.count !== undefined && t.count > 0 && (
                    <span className="bg-card px-1 font-mono text-xs text-foreground">{t.count}</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="personal">
            <PersonalTab details={q.data?.details ?? EMPTY_DETAILS} onSaved={invalidate} />
          </TabsContent>

          {PROFILE_SECTIONS.map((s) => (
            <TabsContent key={s} value={s}>
              <SectionTab
                section={s}
                entries={(q.data?.entries ?? []).filter((e) => e.section === s)}
                onChanged={invalidate}
              />
            </TabsContent>
          ))}

          <TabsContent value="import">
            <ImportTab onImported={invalidate} />
          </TabsContent>
        </Tabs>
      )}
    </Page>
  );
}

/* ------------------------------------------------------------------ */

function PersonalTab({ details, onSaved }: { details: ProfileDetails; onSaved: () => void }) {
  const saveFn = useServerFn(saveProfileDetails);
  const [form, setForm] = useState<ProfileDetails>(details);
  useEffect(() => setForm(details), [details]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: form }),
    onSuccess: () => { toast.success("Profile saved"); onSaved(); },
    onError: (e) => toast.error("Save failed", { description: (e as Error).message }),
  });

  const field = (key: keyof ProfileDetails, label: string, placeholder?: string) => (
    <Field label={label} htmlFor={`profile-${key}`}>
      <Input id={`profile-${key}`} value={form[key]} placeholder={placeholder} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </Field>
  );

  return (
    <SectionCard
      title="Personal information"
      description="Name, contact details and links that head every generated resume."
      icon={UserRound}
    >
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
        <p className="eyebrow border-b border-border/20 pb-1.5 md:col-span-2">Identity</p>
        {field("first_name", "First name")}
        {field("last_name", "Last name")}
        {field("email", "Email")}
        {field("phone", "Phone")}
        {field("location", "Location")}
        <p className="eyebrow mt-2 border-b border-border/20 pb-1.5 md:col-span-2">Links</p>
        {field("linkedin", "LinkedIn")}
        {field("github", "GitHub")}
        {field("portfolio", "Portfolio")}
      </div>
      <Field label="Summary" htmlFor="profile-summary">
        <Textarea id="profile-summary" rows={5} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
      </Field>
      <div className="flex justify-end border-t-2 border-border pt-4">
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full sm:w-auto">
          <Save aria-hidden /> {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */

function SectionTab({
  section,
  entries,
  onChanged,
}: {
  section: ProfileSection;
  entries: ProfileEntry[];
  onChanged: () => void;
}) {
  const meta = SECTION_META[section];
  const upsertFn = useServerFn(upsertProfileEntry);
  const delFn = useServerFn(deleteProfileEntry);
  const reorderFn = useServerFn(reorderProfileEntries);
  const confirm = useConfirm();
  const [editing, setEditing] = useState<ProfileEntry | null>(null);

  const sorted = useMemo(() => [...entries].sort((a, b) => a.sort_order - b.sort_order), [entries]);

  const save = useMutation({
    mutationFn: (e: ProfileEntry) =>
      upsertFn({
        data: {
          id: e.id || null,
          section,
          title: e.title,
          subtitle: e.subtitle,
          location: e.location,
          start_date: e.start_date,
          end_date: e.end_date,
          is_current: e.is_current,
          description: e.description,
          bullets: e.bullets,
          tags: e.tags,
          url: e.url,
          sort_order: e.sort_order || sorted.length,
        },
      }),
    onSuccess: () => { toast.success("Saved"); setEditing(null); onChanged(); },
    onError: (e) => toast.error("Save failed", { description: (e as Error).message }),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); onChanged(); },
    onError: (e) => toast.error("Delete failed", { description: (e as Error).message }),
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderFn({ data: { ids } }),
    onSuccess: onChanged,
    onError: (e) => toast.error("Reorder failed", { description: (e as Error).message }),
  });

  const move = (index: number, dir: -1 | 1) => {
    const next = [...sorted];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next.map((e) => e.id));
  };

  return (
    <SectionCard
      title={meta.label}
      description={`${sorted.length} ${sorted.length === 1 ? "entry" : "entries"} · order here is the order on your resume`}
      actions={
        <Button size="sm" onClick={() => setEditing(emptyEntry(section))}>
          <Plus aria-hidden /> Add {meta.singular}
        </Button>
      }
      contentClassName="p-0 sm:p-0"
    >
      {sorted.length === 0 ? (
        <EmptyState
          framed={false}
          icon={ListPlus}
          title={`No ${meta.label.toLowerCase()} yet`}
          description="Add entries here, or extract them from an existing resume on the Import tab."
          action={
            <Button onClick={() => setEditing(emptyEntry(section))}>
              <Plus aria-hidden /> Add {meta.singular}
            </Button>
          }
        />
      ) : (
        <ol className="divide-y divide-border/20">
          {sorted.map((e, i) => (
            <li key={e.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
              <span className="hidden w-8 shrink-0 pt-0.5 font-mono text-xs font-bold text-muted-foreground sm:block" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <h3 className="font-expanded text-base leading-tight break-words">{e.title || "(untitled)"}</h3>
                {entrySummary(e) && <p className="font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">{entrySummary(e)}</p>}
                {e.description && <p className="text-sm text-muted-foreground line-clamp-2">{e.description}</p>}
                {e.bullets.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted-foreground marker:text-foreground">
                    {e.bullets.slice(0, 3).map((b, k) => <li key={k} className="truncate">{b}</li>)}
                  </ul>
                )}
                {e.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {e.tags.slice(0, 12).map((t, k) => <Badge key={k} variant="outline">{t}</Badge>)}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-1 self-end sm:self-start">
                <IconButton label={`Move ${e.title || "entry"} up`} onClick={() => move(i, -1)} disabled={i === 0 || reorder.isPending}><ArrowUp aria-hidden /></IconButton>
                <IconButton label={`Move ${e.title || "entry"} down`} onClick={() => move(i, 1)} disabled={i === sorted.length - 1 || reorder.isPending}><ArrowDown aria-hidden /></IconButton>
                <IconButton label={`Edit ${e.title || "entry"}`} onClick={() => setEditing(e)}><Pencil aria-hidden /></IconButton>
                <IconButton
                  label={`Delete ${e.title || "entry"}`}
                  className="text-destructive hover:bg-destructive-subtle hover:text-foreground"
                  onClick={async () => {
                    if (await confirm({ title: "Delete this entry?", description: e.title ? `"${e.title}" will be removed from your profile.` : undefined, confirmLabel: "Delete entry" })) del.mutate(e.id);
                  }}
                >
                  <Trash2 aria-hidden />
                </IconButton>
              </div>
            </li>
          ))}
        </ol>
      )}

      <EntryDialog
        section={section}
        entry={editing}
        onClose={() => setEditing(null)}
        onSave={(e) => save.mutate(e)}
        saving={save.isPending}
      />
    </SectionCard>
  );
}

function EntryDialog({
  section,
  entry,
  onClose,
  onSave,
  saving,
}: {
  section: ProfileSection;
  entry: ProfileEntry | null;
  onClose: () => void;
  onSave: (e: ProfileEntry) => void;
  saving: boolean;
}) {
  const meta = SECTION_META[section];
  const [form, setForm] = useState<ProfileEntry>(entry ?? emptyEntry(section));
  useEffect(() => { if (entry) setForm(entry); }, [entry]);
  const has = (k: string) => meta.fields.includes(k as never);

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <p className="eyebrow">{meta.label}</p>
          <DialogTitle>{form.id ? `Edit ${meta.singular}` : `Add ${meta.singular}`}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {has("title") && (
            <Field label={meta.titleLabel} htmlFor="entry-title" className="md:col-span-2">
              <Input id="entry-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
          )}
          {has("subtitle") && (
            <Field label={meta.subtitleLabel ?? "Subtitle"} htmlFor="entry-subtitle">
              <Input id="entry-subtitle" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
            </Field>
          )}
          {has("location") && (
            <Field label="Location" htmlFor="entry-location">
              <Input id="entry-location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </Field>
          )}
          {has("url") && (
            <Field label="Link" htmlFor="entry-url">
              <Input id="entry-url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </Field>
          )}
          {has("start_date") && (
            <Field label="Start" htmlFor="entry-start">
              <Input id="entry-start" placeholder="Jan 2023" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </Field>
          )}
          {has("end_date") && (
            <Field label="End" htmlFor="entry-end">
              <Input id="entry-end" placeholder="Dec 2024" value={form.end_date} disabled={form.is_current} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </Field>
          )}
          {has("is_current") && (
            <div className="flex items-center gap-3 self-end border-2 border-border bg-muted px-3 py-2.5">
              <Switch id="entry-current" checked={form.is_current} onCheckedChange={(v) => setForm({ ...form, is_current: v })} />
              <Label htmlFor="entry-current" className="cursor-pointer">Currently here</Label>
            </div>
          )}
          {has("description") && (
            <Field label="Description" htmlFor="entry-description" className="md:col-span-2">
              <Textarea id="entry-description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          )}
          {has("bullets") && (
            <Field label={meta.bulletsLabel ?? "Bullets (one per line)"} htmlFor="entry-bullets" className="md:col-span-2">
              <Textarea
                id="entry-bullets"
                rows={5}
                value={form.bullets.join("\n")}
                onChange={(e) => setForm({ ...form, bullets: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })}
              />
            </Field>
          )}
          {has("tags") && (
            <Field label={meta.tagsLabel ?? "Tags (comma-separated)"} htmlFor="entry-tags" className="md:col-span-2">
              <Textarea
                id="entry-tags"
                rows={2}
                value={form.tags.join(", ")}
                onChange={(e) => setForm({ ...form, tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
              />
            </Field>
          )}
        </div>
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={saving || !form.title.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

function ImportTab({ onImported }: { onImported: () => void }) {
  const parseFn = useServerFn(parseResumeToProfileDraft);
  const saveFn = useServerFn(saveImportedProfile);
  const projectsFn = useServerFn(listResumeProjects);
  const projects = useQuery({ queryKey: ["resume-projects"], queryFn: () => projectsFn() });

  const [text, setText] = useState("");
  const [projectId, setProjectId] = useState("");
  const [draft, setDraft] = useState<{ details: ProfileDetails; entries: Omit<ProfileEntry, "id">[] } | null>(null);
  const [replace, setReplace] = useState(true);

  const parse = useMutation({
    mutationFn: () => parseFn({ data: { text: text || null, resumeProjectId: projectId || null } }),
    onSuccess: (d) => { setDraft(d as never); toast.success("Extracted — review before saving"); },
    onError: (e) => toast.error("Import failed", { description: (e as Error).message }),
  });

  const commit = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          details: draft?.details,
          entries: (draft?.entries ?? []).map((e) => ({ ...e })),
          replaceSections: replace
            ? Array.from(new Set((draft?.entries ?? []).map((e) => e.section)))
            : [],
        },
      }),
    onSuccess: () => { toast.success("Profile updated"); setDraft(null); onImported(); },
    onError: (e) => toast.error("Save failed", { description: (e as Error).message }),
  });

  const onFile = async (f: File | null) => {
    if (!f) return;
    try {
      setText(await f.text());
      toast.success(`${f.name} loaded — click Extract`);
    } catch {
      toast.error("Could not read that file — paste the text instead");
    }
  };

  const draftSections = draft ? Array.from(new Set(draft.entries.map((e) => e.section))) : [];

  return (
    <div className="space-y-6">
      <SectionCard
        index="01"
        title="Pick a source"
        description="A master resume from Resume Studio, pasted text, or a .tex / .txt / .md file."
      >
        {projects.isError ? (
          <div className="flex flex-wrap items-center gap-3 border-2 border-dashed border-destructive px-3 py-2.5 text-sm" role="alert">
            <span>Couldn't load your Resume Studio resumes.</span>
            <Button size="sm" variant="outline" onClick={() => projects.refetch()}>Try again</Button>
          </div>
        ) : projects.isLoading ? (
          <div className="space-y-2"><Skeleton className="h-3 w-56" /><Skeleton className="h-10 w-full" /></div>
        ) : projects.data && projects.data.length > 0 && (
          <Field label="Use a master resume from Resume Studio" htmlFor="import-project">
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="import-project"><SelectValue placeholder="Select a master resume (optional)" /></SelectTrigger>
              <SelectContent>
                {projects.data.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="…or paste your resume text" htmlFor="import-text">
          <Textarea id="import-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your resume here…" />
        </Field>
        <Field label="…or upload a .tex, .txt or .md file" htmlFor="import-file">
          <input
            id="import-file"
            type="file"
            accept=".tex,.txt,.md"
            className="block w-full cursor-pointer text-sm text-muted-foreground file:mr-3 file:h-10 file:cursor-pointer file:border-2 file:border-border file:bg-card file:px-4 file:text-sm file:font-semibold file:text-foreground file:shadow-[var(--shadow-brutal-sm)] hover:file:bg-accent"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        <div className="flex flex-col gap-3 border-t-2 border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Nothing is saved until you review and confirm below.</p>
          <Button onClick={() => parse.mutate()} disabled={parse.isPending || (!text.trim() && !projectId)} className="w-full sm:w-auto">
            <Sparkles aria-hidden /> {parse.isPending ? "Extracting…" : "Extract profile"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        index="02"
        title="Review the draft"
        description={draft ? `${draft.entries.length} entries extracted — remove anything you don't want.` : "Your extracted profile appears here."}
      >
        {!draft ? (
          <p className="border-2 border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
            {parse.isPending ? "Extracting your profile…" : "Run step 01 to see the extracted profile."}
          </p>
        ) : (
          <>
            <div className="border-b-2 border-border pb-3">
              <p className="font-expanded text-lg leading-tight">
                {[draft.details.first_name, draft.details.last_name].filter(Boolean).join(" ") || "(no name found)"}
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {[draft.details.email, draft.details.phone, draft.details.location].filter(Boolean).join(" · ")}
              </p>
              {draft.details.summary && <p className="mt-2 text-sm text-muted-foreground">{draft.details.summary}</p>}
            </div>
            <ul className="max-h-96 divide-y divide-border/20 overflow-auto border-2 border-border">
              {draft.entries.map((e, i) => (
                <li key={i} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{SECTION_META[e.section].label}</Badge>
                      <span className="min-w-0 truncate font-semibold">{e.title}</span>
                    </div>
                    {e.subtitle && <div className="text-muted-foreground">{e.subtitle}</div>}
                    {e.tags.length > 0 && <div className="text-xs text-muted-foreground">{e.tags.join(", ")}</div>}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="self-start"
                    onClick={() => setDraft({ ...draft, entries: draft.entries.filter((_, k) => k !== i) })}
                  >
                    <X aria-hidden /> Remove<span className="sr-only"> {e.title}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </SectionCard>

      <SectionCard index="03" title="Save to profile" description="Write the reviewed draft into your profile.">
        <div className="flex items-start gap-3 border-2 border-border bg-muted px-3 py-3">
          <Switch id="import-replace" checked={replace} onCheckedChange={setReplace} disabled={!draft} />
          <div className="space-y-1">
            <Label htmlFor="import-replace" className="cursor-pointer">Replace existing entries in the imported sections</Label>
            {draft && draftSections.length > 0 && (
              <p className="text-xs text-muted-foreground">Sections: {draftSections.map((sec) => SECTION_META[sec].label).join(", ")}</p>
            )}
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => setDraft(null)} disabled={!draft}>Discard</Button>
          <Button onClick={() => commit.mutate()} disabled={commit.isPending || !draft}>
            <Save aria-hidden /> {commit.isPending ? "Saving…" : "Save to profile"}
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
