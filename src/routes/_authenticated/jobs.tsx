import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listJobs,
  listJobFilterOptions,
  upsertJob,
  deleteJob,
  toggleJobBookmark,
  parseJobText,
  parseJobFromUrl,
  type Job,
} from "@/lib/jobs.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bookmark, BookmarkCheck, Briefcase, Building2, MapPin, Plus, Search, Send, Share2, Sparkles, Trash2, Wand2, ExternalLink, Pencil, CalendarDays, Link2, RefreshCw, MoreHorizontal, SearchX, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { relativeTime } from "@/lib/user-agent";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JobSourcesDialog } from "@/components/job-sources-dialog";
import { getLinkedResumeVersionId } from "@/lib/job-resume-link";
import { Page, PageHeader } from "@/components/app/page";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { SegmentedControl } from "@/components/app/segmented-control";
import { IconButton } from "@/components/app/icon-button";
import { Field } from "@/components/app/field";
import { Pager } from "@/components/app/pager";
import { useConfirm } from "@/components/app/confirm-dialog";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: () => ({ meta: [{ title: "Jobs Board — Smart Email Sender" }] }),
  component: JobsPage,
});

type EditForm = {
  id?: string | null;
  title: string;
  company: string;
  location: string;
  work_mode: string;
  employment_type: string;
  experience: string;
  salary: string;
  description: string;
  responsibilities: string;
  skills: string;
  technologies: string;
  tags: string;
  recruiter_email: string;
  apply_url: string;
  company_website: string;
  source_url: string;
  is_public: boolean;
};

const blankForm = (): EditForm => ({
  id: null, title: "", company: "", location: "", work_mode: "", employment_type: "",
  experience: "", salary: "", description: "", responsibilities: "", skills: "",
  technologies: "", tags: "", recruiter_email: "", apply_url: "", company_website: "",
  source_url: "", is_public: true,
});

function toArr(s: string): string[] {
  return s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
}

const JOBS_PAGE_SIZE = 30;

function JobsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const nav = useNavigate();
  const listFn = useServerFn(listJobs);
  const filterOptionsFn = useServerFn(listJobFilterOptions);
  const upsertFn = useServerFn(upsertJob);
  const delFn = useServerFn(deleteJob);
  const bookmarkFn = useServerFn(toggleJobBookmark);
  const parseFn = useServerFn(parseJobText);
  const parseUrlFn = useServerFn(parseJobFromUrl);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "mine" | "bookmarked" | "remote" | "hybrid" | "onsite">("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [experienceFilter, setExperienceFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [editOpen, setEditOpen] = useState(false);
  const [parseOpen, setParseOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [parseText, setParseText] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [form, setForm] = useState<EditForm>(blankForm());

  // Every filter/search setter resets back to page 1, since the current page may no longer exist.
  const setSearchAndReset = (v: string) => { setSearch(v); setPage(1); };
  const setFilterAndReset = (v: typeof filter) => { setFilter(v); setPage(1); };
  const setDateFilterAndReset = (v: typeof dateFilter) => { setDateFilter(v); setPage(1); };
  const setRoleFilterAndReset = (v: string) => { setRoleFilter(v); setPage(1); };
  const setExperienceFilterAndReset = (v: string) => { setExperienceFilter(v); setPage(1); };
  const clearAdvancedFilters = () => {
    setDateFilter("all");
    setRoleFilter("all");
    setExperienceFilter("all");
    setPage(1);
  };

  const onlyMine = filter === "mine" || undefined;
  const bookmarkedOnly = filter === "bookmarked" || undefined;
  const workMode = (filter === "remote" || filter === "hybrid" || filter === "onsite") ? filter : undefined;

  const jobsQ = useQuery({
    queryKey: ["jobs", filter, search, dateFilter, roleFilter, experienceFilter, page],
    queryFn: () => listFn({
      data: {
        search: search || undefined,
        onlyMine,
        bookmarkedOnly,
        workMode,
        dateFilter,
        role: roleFilter !== "all" ? roleFilter : undefined,
        experience: experienceFilter !== "all" ? experienceFilter : undefined,
        page,
        pageSize: JOBS_PAGE_SIZE,
      },
    }),
  });

  // Role/experience dropdown options: contextual to search/mine/bookmarked/date, but independent
  // of pagination (and of role/experience themselves) so a 30-row page doesn't starve the list.
  const filterOptionsQ = useQuery({
    queryKey: ["job-filter-options", filter, search, dateFilter],
    queryFn: () => filterOptionsFn({ data: { search: search || undefined, onlyMine, bookmarkedOnly, workMode, dateFilter } }),
  });

  const save = useMutation({
    mutationFn: (f: EditForm) => upsertFn({
      data: {
        id: f.id ?? undefined,
        title: f.title || "Untitled role",
        company: f.company || "Unknown company",
        location: f.location, work_mode: f.work_mode, employment_type: f.employment_type,
        experience: f.experience, salary: f.salary, description: f.description,
        responsibilities: toArr(f.responsibilities), skills: toArr(f.skills),
        technologies: toArr(f.technologies), tags: toArr(f.tags),
        recruiter_email: f.recruiter_email, apply_url: f.apply_url,
        company_website: f.company_website, source_url: f.source_url,
        is_public: f.is_public,
      },
    }),
    onSuccess: () => {
      toast.success("Job saved");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["job-filter-options"] });
    },
    onError: (e) => toast.error("Save failed", { description: (e as Error).message }),
  });

  const parse = useMutation({
    mutationFn: (text: string) => parseFn({ data: { text } }),
    onSuccess: (p) => {
      setForm({
        id: null,
        title: p.title, company: p.company, location: p.location,
        work_mode: p.work_mode, employment_type: p.employment_type,
        experience: p.experience, salary: p.salary, description: p.description,
        responsibilities: p.responsibilities.join("\n"),
        skills: p.skills.join(", "),
        technologies: p.technologies.join(", "),
        tags: p.tags.join(", "),
        recruiter_email: p.recruiter_email, apply_url: p.apply_url,
        company_website: p.company_website, source_url: "",
        is_public: true,
      });
      setParseOpen(false); setParseText(""); setEditOpen(true);
      toast.success("Parsed — review and publish");
    },
    onError: (e) => toast.error("AI parse failed", { description: (e as Error).message }),
  });

  const parseUrl = useMutation({
    mutationFn: (url: string) => parseUrlFn({ data: { url } }),
    onSuccess: (p) => {
      setForm({
        id: null,
        title: p.title, company: p.company, location: p.location,
        work_mode: p.work_mode, employment_type: p.employment_type,
        experience: p.experience, salary: p.salary, description: p.description,
        responsibilities: p.responsibilities.join("\n"),
        skills: p.skills.join(", "),
        technologies: p.technologies.join(", "),
        tags: p.tags.join(", "),
        recruiter_email: p.recruiter_email,
        apply_url: p.apply_url,
        company_website: p.company_website,
        source_url: p.source_url,
        is_public: true,
      });
      setUrlOpen(false);
      setImportUrl("");
      setEditOpen(true);
      toast.success("Imported from URL — review and publish");
    },
    onError: (e) => toast.error("URL import failed", { description: (e as Error).message }),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["job-filter-options"] });
      toast.success("Job removed");
    },
    onError: (e) => toast.error("Delete failed", { description: (e as Error).message }),
  });

  const bookmark = useMutation({
    mutationFn: ({ jobId, bookmark }: { jobId: string; bookmark: boolean }) =>
      bookmarkFn({ data: { jobId, bookmark } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["job-filter-options"] });
    },
    onError: (e) => toast.error("Bookmark failed", { description: (e as Error).message }),
  });

  const share = async (job: Job) => {
    const url = job.apply_url || job.source_url || window.location.href;
    const text = `${job.title} @ ${job.company}${job.location ? " · " + job.location : ""}`;
    try {
      if (navigator.share) await navigator.share({ title: text, text, url });
      else { await navigator.clipboard.writeText(`${text}\n${url}`); toast.success("Copied to clipboard"); }
    } catch { /* user canceled */ }
  };

  const openEdit = (j: Job) => {
    setForm({
      id: j.id, title: j.title, company: j.company, location: j.location,
      work_mode: j.work_mode, employment_type: j.employment_type,
      experience: j.experience, salary: j.salary, description: j.description,
      responsibilities: j.responsibilities.join("\n"),
      skills: j.skills.join(", "),
      technologies: j.technologies.join(", "),
      tags: j.tags.join(", "),
      recruiter_email: j.recruiter_email, apply_url: j.apply_url,
      company_website: j.company_website, source_url: j.source_url,
      is_public: j.is_public,
    });
    setEditOpen(true);
  };

  const generateResume = (j: Job) => {
    const linked = getLinkedResumeVersionId({ jobId: j.id, company: j.company, role: j.title });
    if (linked) {
      nav({
        to: "/resume-studio/$id",
        params: { id: linked },
      });
      return;
    }
    nav({
      to: "/resume-studio",
      search: {
        jobId: j.id,
        title: j.title,
        company: j.company,
      } as never,
    });
  };

  const generateEmail = (j: Job) => {
    nav({
      to: "/send",
      search: {
        to: j.recruiter_email || undefined,
        company: j.company,
        jobId: j.id,
      } as never,
    });
  };

  const filters: { key: typeof filter; label: string }[] = [
    { key: "all", label: "All" }, { key: "mine", label: "Mine" }, { key: "bookmarked", label: "Bookmarked" },
    { key: "remote", label: "Remote" }, { key: "hybrid", label: "Hybrid" }, { key: "onsite", label: "On-site" },
  ];

  const shown = jobsQ.data?.rows ?? [];
  const total = jobsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / JOBS_PAGE_SIZE));
  const roleOptions = filterOptionsQ.data?.roles ?? [];
  const experienceOptions = filterOptionsQ.data?.experiences ?? [];


  const hasAdvancedFilters = dateFilter !== "all" || roleFilter !== "all" || experienceFilter !== "all";
  const hasAnyFilter = !!search || filter !== "all" || hasAdvancedFilters;
  const clearAllFilters = () => {
    setSearchAndReset("");
    setFilterAndReset("all");
    clearAdvancedFilters();
  };
  const openPublish = () => { setForm(blankForm()); setEditOpen(true); };

  return (
    <Page>
      <PageHeader
        eyebrow="01 · Overview"
        title="Community Jobs Board"
        icon={Briefcase}
        description="The classifieds: roles posted and synced by the community. Turn any listing into a tailored resume or outreach email."
        meta={
          jobsQ.data && (
            <Badge variant="outline">{total} listing{total === 1 ? "" : "s"}</Badge>
          )
        }
        actions={
          <>
            <div className="hidden flex-wrap gap-3 sm:flex">
              <Button variant="outline" onClick={() => setSourcesOpen(true)}>
                <RefreshCw aria-hidden /> Sync sources
              </Button>
              <Button variant="outline" onClick={() => setUrlOpen(true)}>
                <Link2 aria-hidden /> Import URL
              </Button>
              <Button variant="outline" onClick={() => setParseOpen(true)}>
                <Sparkles aria-hidden /> AI Parse
              </Button>
            </div>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="sm:hidden">
                  <MoreHorizontal aria-hidden /> More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => setSourcesOpen(true)}><RefreshCw aria-hidden /> Sync sources</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setUrlOpen(true)}><Link2 aria-hidden /> Import URL</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setParseOpen(true)}><Sparkles aria-hidden /> AI Parse</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={openPublish}>
              <Plus aria-hidden /> Publish job
            </Button>
          </>
        }
      />

      {/* Filter rail */}
      <section aria-label="Filter jobs" className="space-y-4 border-2 border-border bg-card p-4 shadow-[var(--shadow-brutal-sm)] sm:p-5">
        <div className="relative">
          <label htmlFor="jobs-search" className="sr-only">Search jobs</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="jobs-search" className="pl-9" placeholder="Search by title, company, location…" value={search} onChange={(e) => setSearchAndReset(e.target.value)} />
        </div>
        <SegmentedControl
          ariaLabel="Listing type"
          size="sm"
          value={filter}
          onValueChange={setFilterAndReset}
          options={filters.map((f) => ({ value: f.key, label: f.label }))}
        />
        <div className="grid grid-cols-1 gap-3 border-t border-border/20 pt-4 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-end">
          <Field label="Added" htmlFor="jobs-date" className="lg:w-44">
            <Select value={dateFilter} onValueChange={(v) => setDateFilterAndReset(v as typeof dateFilter)}>
              <SelectTrigger id="jobs-date" className="gap-2">
                <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 text-left">
                  <SelectValue placeholder="Added" />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any date</SelectItem>
                <SelectItem value="today">Added today</SelectItem>
                <SelectItem value="week">Last 7 days</SelectItem>
                <SelectItem value="month">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Role" htmlFor="jobs-role" className="lg:w-56">
            <Select value={roleFilter} onValueChange={setRoleFilterAndReset}>
              <SelectTrigger id="jobs-role">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {roleOptions.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Experience" htmlFor="jobs-experience" className="lg:w-52">
            <Select value={experienceFilter} onValueChange={setExperienceFilterAndReset}>
              <SelectTrigger id="jobs-experience">
                <SelectValue placeholder="Experience" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All experience</SelectItem>
                {experienceOptions.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {hasAdvancedFilters && (
            <Button
              variant="ghost"
              className="w-full sm:col-span-3 sm:w-auto sm:justify-self-start"
              onClick={clearAdvancedFilters}
            >
              <X aria-hidden /> Clear filters
            </Button>
          )}
        </div>
      </section>

      {jobsQ.isLoading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2" aria-busy="true" aria-label="Loading jobs">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
              <div className="border-b-4 border-double border-border px-4 py-3"><Skeleton className="h-3 w-1/2" /></div>
              <div className="space-y-3 p-4">
                <Skeleton className="h-6 w-3/4" />
                <div className="flex gap-2"><Skeleton className="h-5 w-16" /><Skeleton className="h-5 w-20" /><Skeleton className="h-5 w-14" /></div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
              </div>
              <div className="border-t-2 border-border p-3"><Skeleton className="h-9 w-48" /></div>
            </div>
          ))}
        </div>
      ) : jobsQ.isError ? (
        <ErrorState title="Couldn't load jobs" error={jobsQ.error} onRetry={() => jobsQ.refetch()} retrying={jobsQ.isFetching} />
      ) : shown.length === 0 ? (
        hasAnyFilter ? (
          <EmptyState
            icon={SearchX}
            title="No jobs match these filters"
            description="Try a broader search, or clear the filters to see every listing."
            action={<Button variant="outline" onClick={clearAllFilters}><X aria-hidden /> Clear all filters</Button>}
          />
        ) : (
          <EmptyState
            icon={Briefcase}
            title="No jobs yet"
            description="Publish one, paste a job description into AI Parse, or sync a careers page."
            action={
              <>
                <Button onClick={openPublish}><Plus aria-hidden /> Publish job</Button>
                <Button variant="outline" onClick={() => setParseOpen(true)}><Sparkles aria-hidden /> AI Parse</Button>
              </>
            }
          />
        )
      ) : (
        <ol className="grid grid-cols-1 gap-5 md:grid-cols-2" aria-label="Job listings">
          {shown.map((j, i) => {
            const bookmarked = (j as Job & { bookmarked: boolean }).bookmarked;
            const isMine = (j as Job & { isMine: boolean }).isMine;
            const adNo = (page - 1) * JOBS_PAGE_SIZE + i + 1;
            return (
              <li key={j.id} className="flex min-w-0">
                <article className="flex w-full min-w-0 flex-col border-2 border-border bg-card shadow-[var(--shadow-brutal)]">
                  <div className="flex items-start justify-between gap-3 border-b-4 border-double border-border px-4 py-2.5">
                    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs font-semibold uppercase tracking-[0.08em]">
                      <span className="flex min-w-0 items-center gap-1"><Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{j.company}</span></span>
                      {j.location && <span className="flex min-w-0 items-center gap-1 text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{j.location}</span></span>}
                    </p>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground tabular">No.{String(adNo).padStart(3, "0")}</span>
                  </div>
                  <div className="flex flex-1 flex-col gap-3 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-expanded min-w-0 text-xl leading-tight break-words">{j.title}</h3>
                      {isMine && <span className="stamp shrink-0 px-1.5 py-0.5 text-xs text-info">Yours</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {j.work_mode && <Badge variant="secondary">{j.work_mode}</Badge>}
                      {j.employment_type && <Badge variant="outline">{j.employment_type}</Badge>}
                      {j.experience && <Badge variant="outline">{j.experience}</Badge>}
                      {j.salary && <Badge variant="success">{j.salary}</Badge>}
                      {j.technologies.slice(0, 6).map((t) => <Badge key={t} variant="muted">{t}</Badge>)}
                    </div>
                    {j.description && (
                      <p className="text-sm leading-6 text-muted-foreground line-clamp-3 whitespace-pre-line">{j.description}</p>
                    )}
                    <p className="mt-auto flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Added {relativeTime(j.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t-2 border-border bg-muted px-3 py-2.5">
                    <Button size="sm" onClick={() => generateResume(j)}><Wand2 aria-hidden /> Generate Resume</Button>
                    <Button size="sm" variant="outline" onClick={() => generateEmail(j)}><Send aria-hidden /> Generate Email</Button>
                    {j.apply_url && (
                      <Button size="sm" asChild variant="outline">
                        <a href={j.apply_url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden /> Apply<span className="sr-only"> (opens in new tab)</span></a>
                      </Button>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <IconButton label="Share job" onClick={() => share(j)}><Share2 aria-hidden /></IconButton>
                      <IconButton
                        label={bookmarked ? "Remove bookmark" : "Bookmark job"}
                        aria-pressed={!!bookmarked}
                        onClick={() => bookmark.mutate({ jobId: j.id, bookmark: !bookmarked })}
                      >
                        {bookmarked ? <BookmarkCheck className="fill-current" aria-hidden /> : <Bookmark aria-hidden />}
                      </IconButton>
                      {isMine && <>
                        <IconButton label="Edit job" onClick={() => openEdit(j)}><Pencil aria-hidden /></IconButton>
                        <IconButton
                          label="Delete job"
                          className="text-destructive hover:bg-destructive-subtle hover:text-foreground"
                          onClick={async () => {
                            if (await confirm({ title: "Delete this job?", description: `"${j.title}" at ${j.company} will be removed from the board.`, confirmLabel: "Delete job" })) del.mutate(j.id);
                          }}
                        >
                          <Trash2 aria-hidden />
                        </IconButton>
                      </>}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      )}

      {total > 0 && (
        <Pager page={page} totalPages={totalPages} totalItems={total} onPageChange={(p) => setPage(Math.min(totalPages, Math.max(1, p)))} />
      )}

      <Dialog open={urlOpen} onOpenChange={setUrlOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import job from URL</DialogTitle>
            <DialogDescription>
              Paste a Greenhouse, Lever, LinkedIn, or company careers link. We fetch the page, extract fields with AI, then you review before publishing.
            </DialogDescription>
          </DialogHeader>
          <Field label="Job posting URL" htmlFor="job-import-url">
            <Input
              id="job-import-url"
              type="url"
              className="font-mono"
              placeholder="https://boards.greenhouse.io/…/jobs/…"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && importUrl.trim()) parseUrl.mutate(importUrl.trim());
              }}
            />
          </Field>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button variant="ghost" onClick={() => setUrlOpen(false)}>Cancel</Button>
            <Button
              onClick={() => parseUrl.mutate(importUrl.trim())}
              disabled={parseUrl.isPending || !importUrl.trim()}
            >
              <Wand2 aria-hidden /> {parseUrl.isPending ? "Fetching…" : "Fetch & extract"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={parseOpen} onOpenChange={setParseOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Paste job info</DialogTitle>
            <DialogDescription>AI extracts the fields; you review them before publishing.</DialogDescription>
          </DialogHeader>
          <Field label="Job posting text" htmlFor="job-parse-text">
            <Textarea
              id="job-parse-text"
              rows={12}
              placeholder="Paste a LinkedIn / Greenhouse / Lever / email / raw JD…"
              value={parseText}
              onChange={(e) => setParseText(e.target.value)}
            />
          </Field>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button variant="ghost" onClick={() => setParseOpen(false)}>Cancel</Button>
            <Button onClick={() => parse.mutate(parseText)} disabled={parse.isPending || !parseText.trim()}>
              <Wand2 aria-hidden /> {parse.isPending ? "Parsing…" : "Extract fields"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl sm:p-0">
          <DialogHeader className="border-b-2 border-border px-5 py-4 sm:px-6">
            <p className="eyebrow">Classified ad</p>
            <DialogTitle>{form.id ? "Edit job" : "Publish new job"}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5 sm:px-6">
            <FormSection index="01" title="Role">
              <Field label="Title" htmlFor="job-title" className="md:col-span-2"><Input id="job-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
              <Field label="Work mode" htmlFor="job-work-mode"><Input id="job-work-mode" placeholder="remote / hybrid / onsite" value={form.work_mode} onChange={(e) => setForm({ ...form, work_mode: e.target.value })} /></Field>
              <Field label="Employment type" htmlFor="job-employment-type"><Input id="job-employment-type" placeholder="full-time / intern / contract" value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })} /></Field>
              <Field label="Experience" htmlFor="job-experience"><Input id="job-experience" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} /></Field>
              <Field label="Salary" htmlFor="job-salary"><Input id="job-salary" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></Field>
            </FormSection>
            <FormSection index="02" title="Company">
              <Field label="Company" htmlFor="job-company"><Input id="job-company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
              <Field label="Location" htmlFor="job-location"><Input id="job-location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
              <Field label="Company website" htmlFor="job-company-website" className="md:col-span-2"><Input id="job-company-website" value={form.company_website} onChange={(e) => setForm({ ...form, company_website: e.target.value })} /></Field>
            </FormSection>
            <FormSection index="03" title="Details">
              <Field label="Description" htmlFor="job-description" className="md:col-span-2"><Textarea id="job-description" rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
              <Field label="Responsibilities (one per line)" htmlFor="job-responsibilities" className="md:col-span-2"><Textarea id="job-responsibilities" rows={4} value={form.responsibilities} onChange={(e) => setForm({ ...form, responsibilities: e.target.value })} /></Field>
              <Field label="Skills (comma-separated)" htmlFor="job-skills"><Textarea id="job-skills" rows={2} value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></Field>
              <Field label="Technologies (comma-separated)" htmlFor="job-technologies"><Textarea id="job-technologies" rows={2} value={form.technologies} onChange={(e) => setForm({ ...form, technologies: e.target.value })} /></Field>
              <Field label="Tags (comma-separated)" htmlFor="job-tags" className="md:col-span-2"><Input id="job-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></Field>
            </FormSection>
            <FormSection index="04" title="How to apply">
              <Field label="Recruiter email" htmlFor="job-recruiter-email"><Input id="job-recruiter-email" value={form.recruiter_email} onChange={(e) => setForm({ ...form, recruiter_email: e.target.value })} /></Field>
              <Field label="Apply URL" htmlFor="job-apply-url"><Input id="job-apply-url" value={form.apply_url} onChange={(e) => setForm({ ...form, apply_url: e.target.value })} /></Field>
              <Field label="Source URL" htmlFor="job-source-url" className="md:col-span-2"><Input id="job-source-url" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} placeholder="Original posting link" /></Field>
              <div className="flex items-center justify-between gap-4 border-2 border-border bg-muted px-4 py-3 md:col-span-2">
                <Label htmlFor="job-is-public" className="cursor-pointer">Share publicly with the community</Label>
                <Switch id="job-is-public" checked={form.is_public} onCheckedChange={(v) => setForm({ ...form, is_public: v })} />
              </div>
            </FormSection>
          </div>
          <DialogFooter className="gap-2 sm:space-x-0 border-t-2 border-border px-5 py-3 sm:px-6">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
              {save.isPending ? "Saving…" : form.id ? "Save changes" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <JobSourcesDialog open={sourcesOpen} onOpenChange={setSourcesOpen} />
    </Page>
  );
}

function FormSection({ index, title, children }: { index: string; title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-4 flex w-full items-center gap-3 border-b-2 border-border pb-2">
        <span className="grid h-7 min-w-7 place-items-center bg-secondary px-1 font-mono text-xs font-bold text-secondary-foreground">{index}</span>
        <span className="font-expanded text-base leading-tight">{title}</span>
      </legend>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}
