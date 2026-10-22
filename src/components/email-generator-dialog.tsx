import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { generateEmails, type GenerateResult } from "@/lib/email-generator.functions";
import {
  listInstructionTemplates,
  upsertInstructionTemplate,
  deleteInstructionTemplate,
  duplicateInstructionTemplate,
} from "@/lib/instruction-templates.functions";
import {
  EMAIL_PATTERN_OPTIONS,
  RULE_LIBRARY,
  DEFAULT_RULES,
  DEFAULT_PREFIXES,
  buildPrompt,
  previewEmail,
  newBlankTemplate,
  type InstructionTemplate,
  type EmailPattern,
} from "@/lib/instruction-templates";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TemplateCombobox } from "@/components/template-combobox";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Sparkles, Copy, Loader2, Plus, Pencil, Files, Trash2, ChevronDown, Settings2, X, ExternalLink, Search, Check, Inbox } from "lucide-react";
import { toast } from "sonner";
import { companyKeywordFromDomain, linkedInCompanyKeyword, linkedInCompanySearchUrl } from "@/lib/linkedin";
import { findEmailsByDomain, listEmailFinderStatus } from "@/lib/email-finder.functions";
import { EMAIL_FIND_PROVIDERS, EMAIL_VERIFY_PROVIDERS, type FoundEmail } from "@/lib/email-finder";
import { Field } from "@/components/app/field";
import { IconButton } from "@/components/app/icon-button";
import { StatCard } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/empty-state";
import { useConfirm } from "@/components/app/confirm-dialog";
import { cn } from "@/lib/utils";

const LAST_TPL_KEY = "ai-gen:last-template-id";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUse: (emails: string[]) => void;
  /** Company from Send page (job meta / {{company}} variable). */
  companyFromEmail?: string;
};

function copyText(t: string) {
  navigator.clipboard.writeText(t).then(
    () => toast.success("Copied"),
    () => toast.error("Copy failed"),
  );
}

export function EmailGeneratorDialog({ open, onOpenChange, onUse, companyFromEmail = "" }: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const listFn = useServerFn(listInstructionTemplates);
  const upsertFn = useServerFn(upsertInstructionTemplate);
  const deleteFn = useServerFn(deleteInstructionTemplate);
  const dupFn = useServerFn(duplicateInstructionTemplate);
  const genFn = useServerFn(generateEmails);
  const findFn = useServerFn(findEmailsByDomain);
  const finderStatusFn = useServerFn(listEmailFinderStatus);

  const templates = useQuery({
    queryKey: ["instruction-templates"],
    queryFn: () => listFn(),
    enabled: open,
  });

  const finderStatus = useQuery({
    queryKey: ["email-finder-status"],
    queryFn: () => finderStatusFn(),
    enabled: open,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<InstructionTemplate | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [data, setData] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [foundSamples, setFoundSamples] = useState<FoundEmail[]>([]);
  const [finderMeta, setFinderMeta] = useState<{
    domain: string;
    pattern: string | null;
    sampleEmail: string | null;
    providers: Array<{ provider: string; status: string; message?: string; webUrl: string; count: number }>;
  } | null>(null);

  useEffect(() => {
    if (!open || !templates.data) return;
    if (templates.data.length === 0) {
      setSelectedId(null);
      return;
    }
    const last = typeof window !== "undefined" ? localStorage.getItem(LAST_TPL_KEY) : null;
    const found = last && templates.data.find((t) => t.id === last);
    setSelectedId((cur) => cur ?? (found ? found.id : templates.data[0].id));
  }, [open, templates.data]);

  useEffect(() => {
    if (selectedId && typeof window !== "undefined") localStorage.setItem(LAST_TPL_KEY, selectedId);
  }, [selectedId]);

  const selected = useMemo(
    () => templates.data?.find((t) => t.id === selectedId) ?? null,
    [templates.data, selectedId],
  );

  // Working copy for live domain/rule tweaks without saving.
  // Prefer company from the Send email form — do NOT default to the template domain.
  const [working, setWorking] = useState<InstructionTemplate | null>(null);
  useEffect(() => {
    if (!selected) {
      setWorking(null);
      setPromptOverride(null);
      return;
    }
    const fromEmail = companyFromEmail.trim();
    setWorking({
      ...selected,
      company_domain: fromEmail || "",
    });
    setPromptOverride(null);
    setFoundSamples([]);
    setFinderMeta(null);
  }, [selected, companyFromEmail, open]);

  const generatedPrompt = useMemo(() => (working ? buildPrompt(working) : ""), [working]);
  const effectivePrompt = promptOverride ?? generatedPrompt;

  const totalLines = useMemo(
    () => data.split(/\r?\n/).filter((l) => l.trim()).length,
    [data],
  );

  const generate = useMutation({
    mutationFn: () => genFn({ data: { instructions: effectivePrompt, data } }),
    onSuccess: (r) => setResult(r),
    onError: (e) => toast.error("Generation failed", { description: (e as Error).message }),
  });

  const findEmails = useMutation({
    mutationFn: () => {
      const company = working?.company_domain?.trim();
      if (!company) throw new Error("Enter a company / domain first");
      return findFn({ data: { companyOrDomain: company } });
    },
    onSuccess: (r) => {
      setFoundSamples(r.emails);
      setFinderMeta({
        domain: r.domain,
        pattern: r.pattern,
        sampleEmail: r.sampleEmail,
        providers: r.providers.map((p) => ({
          provider: p.provider,
          status: p.status,
          message: p.message,
          webUrl: p.webUrl,
          count: p.emails.length,
        })),
      });

      if (working && r.mappedPattern) {
        setWorking({
          ...working,
          company_domain: r.domain,
          email_pattern: r.mappedPattern as EmailPattern,
          custom_pattern:
            r.mappedPattern === "custom" && r.pattern
              ? r.pattern
              : working.custom_pattern,
        });
      } else if (working && r.domain) {
        setWorking({ ...working, company_domain: r.domain });
      }

      // Merge sample emails into generator results
      if (r.emails.length) {
        setResult((cur) => {
          const existing = new Set((cur?.emails ?? []).map((e) => e.toLowerCase()));
          const added = r.emails.map((e) => e.email).filter((e) => !existing.has(e));
          return {
            emails: [...(cur?.emails ?? []), ...added],
            skipped: cur?.skipped ?? [],
          };
        });
        toast.success(`Added ${r.emails.length} sample email${r.emails.length === 1 ? "" : "s"}`, {
          description: r.sampleEmail
            ? `Sample: ${r.sampleEmail}${r.pattern ? ` · pattern ${r.pattern}` : ""}`
            : r.domain,
        });
      } else {
        const anyConfigured = r.providers.some((p) => p.status === "ok" || p.status === "error");
        toast.message(anyConfigured ? "No emails found for that domain" : "No API keys configured", {
          description: anyConfigured
            ? "Try opening Hunter / Snov in the browser links below."
            : "Add HUNTER_API_KEY (or Apollo / Prospeo / Snov) to .env, or open web tools.",
        });
      }
    },
    onError: (e) => toast.error("Email search failed", { description: (e as Error).message }),
  });

  const upsert = useMutation({
    mutationFn: (t: InstructionTemplate) =>
      upsertFn({
        data: {
          id: t.id || null,
          name: t.name,
          email_pattern: t.email_pattern,
          custom_pattern: t.custom_pattern,
          company_domain: t.company_domain,
          batch_size: t.batch_size,
          rules: t.rules,
          prefixes: t.prefixes,
          custom_rules: t.custom_rules,
          surname_min_length: t.surname_min_length,
        },
      }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["instruction-templates"] });
      setSelectedId(row.id);
      setEditorOpen(false);
      toast.success("Template saved");
    },
    onError: (e) => toast.error("Save failed", { description: (e as Error).message }),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instruction-templates"] });
      setSelectedId(null);
      toast.success("Template deleted");
    },
    onError: (e) => toast.error("Delete failed", { description: (e as Error).message }),
  });

  const dup = useMutation({
    mutationFn: (id: string) => dupFn({ data: { id } }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["instruction-templates"] });
      setSelectedId(row.id);
      toast.success("Duplicated");
    },
    onError: (e) => toast.error("Duplicate failed", { description: (e as Error).message }),
  });

  const emails = result?.emails ?? [];
  const skipped = result?.skipped ?? [];
  const batchSize = working?.batch_size ?? 100;
  const batches = useMemo(() => {
    const size = Math.max(1, Math.min(1000, batchSize || 100));
    const out: string[][] = [];
    for (let i = 0; i < emails.length; i += size) out.push(emails.slice(i, i + size));
    return out;
  }, [emails, batchSize]);
  const commaList = emails.join(", ");


  const preview = working ? previewEmail("Ganesh Shinde", working) : "";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[92dvh] w-[calc(100%-1.25rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:w-[95vw] sm:p-0">
          <DialogHeader className="border-b-2 border-border px-5 py-4 sm:px-6">
            <p className="eyebrow flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" aria-hidden /> Address finder</p>
            <DialogTitle>AI Email Generator</DialogTitle>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:grid md:grid-cols-2 md:overflow-hidden">
            {/* Left: template + data */}
            <div className="flex min-h-0 flex-col gap-5 p-4 sm:p-5 md:overflow-y-auto md:border-r-2 md:border-border">
              {/* Template selector */}
              <section aria-labelledby="eg-template-title" className="space-y-2">
                <h3 id="eg-template-title" className="eyebrow border-b-2 border-border pb-1.5 text-foreground">01 · Instruction template</h3>
                {templates.isError ? (
                  <div className="flex flex-wrap items-center gap-3 border-2 border-dashed border-destructive px-3 py-2.5 text-sm" role="alert">
                    <span>Couldn't load instruction templates.</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => templates.refetch()}>Try again</Button>
                  </div>
                ) : (
                <div className="flex gap-2">
                  <TemplateCombobox
                    className="min-w-0 flex-1"
                    templates={(templates.data ?? []).map((t) => ({ id: t.id, name: t.name }))}
                    value={selectedId ?? ""}
                    onValueChange={(v) => setSelectedId(v || null)}
                    placeholder={templates.isLoading ? "Loading templates…" : templates.data?.length ? "Select template" : "No templates yet"}
                    searchPlaceholder="Search instruction templates…"
                    emptyText="No templates found."
                    disabled={!templates.data?.length}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="shrink-0 px-3" aria-label="Template actions">
                        <span className="hidden sm:inline">Manage</span>
                        <ChevronDown aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditing({ id: "", ...newBlankTemplate() } as InstructionTemplate); setEditorOpen(true); }}>
                        <Plus aria-hidden /> New Template
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={!selected} onClick={() => { if (selected) { setEditing({ ...selected }); setEditorOpen(true); } }}>
                        <Pencil aria-hidden /> Edit Template
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={!selected} onClick={() => selected && dup.mutate(selected.id)}>
                        <Files aria-hidden /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={!selected}
                        onClick={async () => {
                          const target = selected;
                          if (target && (await confirm({ title: `Delete "${target.name}"?`, description: "This instruction template will be removed.", confirmLabel: "Delete template" }))) del.mutate(target.id);
                        }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 aria-hidden /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                )}
                {templates.data && !templates.data.length && (
                  <Button variant="secondary" size="sm" className="w-full" onClick={() => { setEditing({ id: "", ...newBlankTemplate("My Template") } as InstructionTemplate); setEditorOpen(true); }}>
                    <Plus aria-hidden /> Create your first template
                  </Button>
                )}
              </section>

              {/* Quick controls bound to working copy */}
              {working && (
                <section aria-labelledby="eg-pattern-title" className="space-y-4">
                  <h3 id="eg-pattern-title" className="eyebrow border-b-2 border-border pb-1.5 text-foreground">02 · Pattern & company</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Email pattern" htmlFor="eg-pattern">
                      <Select
                        value={working.email_pattern}
                        onValueChange={(v) => setWorking({ ...working, email_pattern: v as EmailPattern })}
                      >
                        <SelectTrigger id="eg-pattern"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {EMAIL_PATTERN_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field
                      label="Company"
                      htmlFor="eg-company"
                      action={
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          disabled={!linkedInCompanyKeyword(working.company_domain)}
                          onClick={() => {
                            const kw = linkedInCompanyKeyword(working.company_domain);
                            if (!kw) {
                              toast.message("Enter a company name first");
                              return;
                            }
                            window.open(linkedInCompanySearchUrl(kw), "_blank", "noopener,noreferrer");
                          }}
                        >
                          <ExternalLink aria-hidden /> LinkedIn
                        </Button>
                      }
                    >
                      <Input
                        id="eg-company"
                        placeholder="From email form, or type e.g. Nvidia / nvidia.com"
                        value={working.company_domain}
                        onChange={(e) => setWorking({ ...working, company_domain: e.target.value })}
                      />
                    </Field>
                  </div>

                  {working.email_pattern === "custom" && (
                    <Field label="Custom pattern" htmlFor="eg-custom-pattern">
                      <Input
                        id="eg-custom-pattern"
                        className="font-mono"
                        placeholder="{first}.{last}"
                        value={working.custom_pattern}
                        onChange={(e) => setWorking({ ...working, custom_pattern: e.target.value })}
                      />
                    </Field>
                  )}

                  <div className="flex flex-col gap-3 border-2 border-border bg-muted px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="min-w-0 text-sm">
                      <span className="font-mono text-xs font-semibold uppercase tracking-[0.08em]">Live preview · </span>
                      <span className="font-mono text-xs">Ganesh Shinde → </span>
                      <span className="break-all bg-primary px-1 font-mono text-xs font-semibold text-primary-foreground">{preview || "—"}</span>
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {Object.values(working.rules).filter(Boolean).length}/{RULE_LIBRARY.length} rules on · {working.custom_rules.length} custom
                      </span>
                      <Button variant="outline" size="sm" onClick={() => { setEditing({ ...working }); setEditorOpen(true); }}>
                        <Settings2 aria-hidden /> Rules
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3 border-2 border-dashed border-border p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">Find sample emails from databases</p>
                        <p className="text-xs text-muted-foreground">
                          Hunter, Snov, GetProspect, Clearout, Skrapp, Findymail & more — API keys in .env when set
                          {(finderStatus.data?.filter((p) => p.configured).length ?? 0) > 0
                            ? ` · ${finderStatus.data!.filter((p) => p.configured).length} API ready`
                            : " · no API keys yet (web links still work)"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="shrink-0"
                        disabled={findEmails.isPending || !working.company_domain.trim()}
                        onClick={() => findEmails.mutate()}
                      >
                        {findEmails.isPending ? (
                          <><Loader2 className="animate-spin" aria-hidden /> Searching…</>
                        ) : (
                          <><Search aria-hidden /> Search databases</>
                        )}
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <p className="eyebrow">Search</p>
                      <div className="flex flex-wrap gap-1.5">
                        {EMAIL_FIND_PROVIDERS.map((p) => {
                          const st = finderStatus.data?.find((x) => x.id === p.id);
                          const run = finderMeta?.providers.find((x) => x.provider === p.id);
                          const openProvider = () => {
                            const domainHint = (finderMeta?.domain || working.company_domain.trim() || "allen.in")
                              .toLowerCase()
                              .replace(/^https?:\/\//, "")
                              .split("/")[0]!;
                            const domain = domainHint.includes(".")
                              ? domainHint
                              : `${domainHint.replace(/[^a-z0-9]+/g, "")}.com`;
                            window.open(run?.webUrl || p.webSearchUrl(domain), "_blank", "noopener,noreferrer");
                          };
                          return (
                            <button
                              key={p.id}
                              type="button"
                              title={st?.configured ? `${p.name} API ready` : p.freeNote}
                              className={cn(
                                "inline-flex h-8 cursor-pointer items-center gap-1.5 border-2 border-border px-2 text-xs font-semibold transition-colors hover:bg-accent",
                                st?.configured ? "bg-success-subtle text-foreground" : "bg-card text-muted-foreground",
                              )}
                              onClick={openProvider}
                            >
                              {st?.configured && <Check className="h-3.5 w-3.5" aria-hidden />}
                              {p.name}
                              {st?.configured && <span className="sr-only"> (API ready)</span>}
                              {run && run.count > 0 ? <span className="font-mono"> · {run.count}</span> : ""}
                              <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden />
                              <span className="sr-only"> (opens in new tab)</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="eyebrow pt-1">Verify</p>
                      <div className="flex flex-wrap gap-1.5">
                        {EMAIL_VERIFY_PROVIDERS.map((p) => {
                          const openProvider = () => {
                            const domainHint = (finderMeta?.domain || working.company_domain.trim() || "")
                              .toLowerCase()
                              .replace(/^https?:\/\//, "")
                              .split("/")[0]!;
                            const domain = domainHint.includes(".")
                              ? domainHint
                              : domainHint
                                ? `${domainHint.replace(/[^a-z0-9]+/g, "")}.com`
                                : "";
                            window.open(p.webSearchUrl(domain), "_blank", "noopener,noreferrer");
                          };
                          return (
                            <button
                              key={p.id}
                              type="button"
                              title={p.freeNote}
                              className="inline-flex h-8 cursor-pointer items-center gap-1.5 border-2 border-border bg-card px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent"
                              onClick={openProvider}
                            >
                              {p.name}
                              <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden />
                              <span className="sr-only"> (opens in new tab)</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {finderMeta?.sampleEmail && (
                      <div className="flex flex-wrap items-center gap-2 border-t border-border/20 pt-2 text-xs">
                        <span className="text-muted-foreground">Sample:</span>
                        <span className="break-all bg-primary px-1 font-mono font-semibold text-primary-foreground">{finderMeta.sampleEmail}</span>
                        {finderMeta.pattern && (
                          <Badge variant="secondary">pattern {finderMeta.pattern}</Badge>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          onClick={() => copyText(finderMeta.sampleEmail!)}
                        >
                          <Copy aria-hidden /> Copy<span className="sr-only"> sample email</span>
                        </Button>
                      </div>
                    )}

                    {foundSamples.length > 0 && (
                      <ul className="max-h-28 divide-y divide-border/20 overflow-auto border-t border-border/20 pt-1 font-mono text-xs" aria-label="Sample emails found">
                        {foundSamples.slice(0, 12).map((e) => (
                          <li key={e.email} className="flex items-center justify-between gap-2 py-1">
                            <span className="truncate">{e.email}</span>
                            <span className="shrink-0 text-muted-foreground">{e.provider}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              )}

              <section aria-labelledby="eg-data-title" className="shrink-0 space-y-2">
                <div className="flex items-baseline justify-between gap-2 border-b-2 border-border pb-1.5">
                  <h3 id="eg-data-title" className="eyebrow text-foreground"><label htmlFor="eg-data">03 · Data</label></h3>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">{totalLines} non-empty lines</span>
                </div>
                <Textarea
                  id="eg-data"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  placeholder="Paste LinkedIn search results, employee list, Excel data, CSV, or any text…"
                  className="min-h-40 font-mono text-xs"
                />
              </section>

              {/* Advanced */}
              <div className="shrink-0 border-2 border-border">
                <button
                  type="button"
                  aria-expanded={advancedOpen}
                  aria-controls="eg-advanced"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  className="flex h-10 w-full cursor-pointer items-center justify-between gap-2 px-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] hover:bg-accent"
                >
                  <span>Advanced · generated prompt</span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", advancedOpen && "rotate-180")} aria-hidden />
                </button>
                {advancedOpen && (
                  <div id="eg-advanced" className="space-y-2 border-t-2 border-border p-3">
                    <label htmlFor="eg-prompt" className="sr-only">Generated prompt</label>
                    <Textarea
                      id="eg-prompt"
                      value={effectivePrompt}
                      onChange={(e) => setPromptOverride(e.target.value)}
                      rows={8}
                      className="font-mono text-xs"
                    />
                    {promptOverride !== null && (
                      <Button variant="ghost" size="sm" onClick={() => setPromptOverride(null)}>
                        Reset to generated
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <Button
                onClick={() => generate.mutate()}
                disabled={generate.isPending || !data.trim() || !working}
                className="w-full"
                size="lg"
              >
                {generate.isPending ? (
                  <><Loader2 className="animate-spin" aria-hidden /> Generating…</>
                ) : (
                  <><Sparkles aria-hidden /> Generate Emails</>
                )}
              </Button>
            </div>

            {/* Right: results */}
            <div className="flex min-h-[28rem] flex-col border-t-2 border-border bg-background md:min-h-0 md:overflow-hidden md:border-t-0">
              <div className="grid grid-cols-2 gap-2 border-b-2 border-border p-3 sm:grid-cols-4">
                <StatCard flat size="compact" label="Lines" value={totalLines} />
                <StatCard flat size="compact" label="Generated" value={emails.length} tone={emails.length ? "success" : "default"} />
                <StatCard flat size="compact" label="Skipped" value={skipped.length} tone={skipped.length ? "warning" : "default"} />
                <StatCard flat size="compact" label="Batches" value={batches.length} />
              </div>

              <Tabs defaultValue="list" className="flex min-h-0 flex-1 flex-col">
                <div className="overflow-x-auto px-3 pt-3">
                  <TabsList>
                    <TabsTrigger value="list">Emails</TabsTrigger>
                    <TabsTrigger value="comma">Comma</TabsTrigger>
                    <TabsTrigger value="batches">Batches</TabsTrigger>
                    <TabsTrigger value="skipped">Skipped</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="list" className="mt-3 min-h-0 flex-1 overflow-auto px-3 pb-3">
                  {emails.length === 0 ? <Empty /> : (
                    <pre className="whitespace-pre-wrap break-all border-2 border-border bg-card p-3 font-mono text-xs leading-5">{emails.join("\n")}</pre>
                  )}
                </TabsContent>

                <TabsContent value="comma" className="mt-3 min-h-0 flex-1 overflow-auto px-3 pb-3">
                  <div className="mb-2 flex justify-end">
                    <Button size="sm" variant="outline" disabled={!commaList} onClick={() => copyText(commaList)}>
                      <Copy aria-hidden /> Copy all
                    </Button>
                  </div>
                  {commaList ? (
                    <pre className="whitespace-pre-wrap break-all border-2 border-border bg-card p-3 font-mono text-xs leading-5">{commaList}</pre>
                  ) : <Empty />}
                </TabsContent>

                <TabsContent value="batches" className="mt-3 min-h-0 flex-1 space-y-3 overflow-auto px-3 pb-3">
                  <div className="flex items-center gap-3">
                    <Label htmlFor="eg-batch-size">Batch size</Label>
                    <Input
                      id="eg-batch-size"
                      type="number"
                      min={1}
                      max={1000}
                      value={batchSize}
                      onChange={(e) => working && setWorking({ ...working, batch_size: parseInt(e.target.value) || 100 })}
                      className="h-9 w-28 font-mono"
                    />
                  </div>
                  {batches.length === 0 && <Empty />}
                  {batches.map((b, i) => {
                    const text = b.join(", ");
                    return (
                      <div key={i} className="border-2 border-border bg-card">
                        <div className="flex items-center justify-between gap-2 border-b-2 border-border px-3 py-2">
                          <div className="flex items-center gap-2 text-sm font-semibold">Part {i + 1} <Badge variant="secondary">{b.length}</Badge></div>
                          <Button size="sm" variant="outline" onClick={() => copyText(text)}>
                            <Copy aria-hidden /> Copy<span className="sr-only"> part {i + 1}</span>
                          </Button>
                        </div>
                        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-xs leading-5">{text}</pre>
                      </div>
                    );
                  })}
                </TabsContent>

                <TabsContent value="skipped" className="mt-3 min-h-0 flex-1 overflow-auto px-3 pb-3">
                  {skipped.length === 0 && <Empty />}
                  {skipped.length > 0 && (
                    <ul className="divide-y divide-border/20 border-2 border-border bg-card">
                      {skipped.map((s, i) => (
                        <li key={i} className="px-3 py-2 text-sm">
                          <div className="font-semibold">{s.name}</div>
                          <div className="text-xs text-muted-foreground">Reason: {s.reason}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t-2 border-border px-5 py-3 sm:space-x-0 sm:px-6">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              disabled={emails.length === 0}
              onClick={() => {
                onUse(emails);
                onOpenChange(false);
                toast.success(`Inserted ${emails.length} recipients`);
              }}
            >
              Use {emails.length} Generated Email{emails.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemplateEditorDialog
        open={editorOpen}
        template={editing}
        onOpenChange={setEditorOpen}
        onSave={(t) => upsert.mutate(t)}
        saving={upsert.isPending}
      />
    </>
  );
}

function Empty() {
  return (
    <EmptyState
      framed={false}
      icon={Inbox}
      title="No results yet"
      description="Paste data on the left and click Generate."
      className="py-10"
    />
  );
}

function TemplateEditorDialog({
  open,
  onOpenChange,
  template,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: InstructionTemplate | null;
  onSave: (t: InstructionTemplate) => void;
  saving: boolean;
}) {
  const [t, setT] = useState<InstructionTemplate | null>(template);
  const [newPrefix, setNewPrefix] = useState("");
  const [newRule, setNewRule] = useState("");

  useEffect(() => { setT(template ? { ...template } : null); }, [template]);

  if (!t) return null;

  const rules = { ...DEFAULT_RULES, ...t.rules };
  const setRule = (k: string, v: boolean) => setT({ ...t, rules: { ...rules, [k]: v } });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:p-0">
        <DialogHeader className="border-b-2 border-border px-5 py-4 sm:px-6">
          <p className="eyebrow">Instruction template</p>
          <DialogTitle>{template?.id ? "Edit Template" : "New Template"}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          <fieldset className="min-w-0">
            <legend className="eyebrow mb-3 w-full border-b-2 border-border pb-1.5 text-foreground">01 · Basics</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="it-name" className="sm:col-span-2">
                <Input id="it-name" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
              </Field>
              <Field label="Email pattern" htmlFor="it-pattern">
                <Select value={t.email_pattern} onValueChange={(v) => setT({ ...t, email_pattern: v as EmailPattern })}>
                  <SelectTrigger id="it-pattern"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EMAIL_PATTERN_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Company domain"
                htmlFor="it-domain"
                action={
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    disabled={!companyKeywordFromDomain(t.company_domain)}
                    onClick={() => {
                      const kw = companyKeywordFromDomain(t.company_domain);
                      if (!kw) {
                        toast.message("Enter a company domain first");
                        return;
                      }
                      window.open(linkedInCompanySearchUrl(kw), "_blank", "noopener,noreferrer");
                    }}
                  >
                    <ExternalLink aria-hidden /> LinkedIn search
                  </Button>
                }
              >
                <Input id="it-domain" placeholder="milliman.com" value={t.company_domain} onChange={(e) => setT({ ...t, company_domain: e.target.value })} />
              </Field>
              {t.email_pattern === "custom" && (
                <Field
                  label="Custom pattern"
                  htmlFor="it-custom-pattern"
                  className="sm:col-span-2"
                  hint={<>Tokens: <span className="font-mono">{"{first}"} {"{last}"} {"{f}"} {"{l}"}</span></>}
                >
                  <Input id="it-custom-pattern" className="font-mono" placeholder="{first}.{last}" value={t.custom_pattern} onChange={(e) => setT({ ...t, custom_pattern: e.target.value })} />
                </Field>
              )}
              <Field label="Batch size" htmlFor="it-batch">
                <Input id="it-batch" className="font-mono" type="number" min={1} max={1000} value={t.batch_size} onChange={(e) => setT({ ...t, batch_size: parseInt(e.target.value) || 100 })} />
              </Field>
              <Field label="Surname min length" htmlFor="it-surname">
                <Input id="it-surname" className="font-mono" type="number" min={0} max={20} value={t.surname_min_length} onChange={(e) => setT({ ...t, surname_min_length: parseInt(e.target.value) || 0 })} />
              </Field>
            </div>
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="eyebrow mb-3 w-full border-b-2 border-border pb-1.5 text-foreground">02 · Rule library</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {RULE_LIBRARY.map((r) => (
                <label key={r.key} className="flex min-h-11 cursor-pointer items-start gap-3 border-2 border-border bg-card p-2.5 text-sm transition-colors hover:bg-accent has-[[data-state=checked]]:bg-muted">
                  <Checkbox className="mt-0.5" checked={rules[r.key] !== false} onCheckedChange={(v) => setRule(r.key, !!v)} />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="eyebrow mb-3 w-full border-b-2 border-border pb-1.5 text-foreground">03 · Prefixes to strip</legend>
            <div className="flex flex-wrap items-center gap-2">
              {t.prefixes.map((p, i) => (
                <span key={`${p}-${i}`} className="inline-flex items-stretch border-2 border-border bg-card font-mono text-xs">
                  <span className="flex items-center px-2">{p}</span>
                  <button
                    type="button"
                    aria-label={`Remove prefix ${p}`}
                    className="grid size-8 cursor-pointer place-items-center border-l-2 border-border transition-colors hover:bg-destructive-subtle"
                    onClick={() => setT({ ...t, prefixes: t.prefixes.filter((_, idx) => idx !== i) })}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              ))}
              <div className="flex gap-2">
                <label htmlFor="it-new-prefix" className="sr-only">New prefix</label>
                <Input
                  id="it-new-prefix"
                  className="h-9 w-28 font-mono text-xs"
                  placeholder="Add…"
                  value={newPrefix}
                  onChange={(e) => setNewPrefix(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newPrefix.trim()) {
                      e.preventDefault();
                      setT({ ...t, prefixes: [...t.prefixes, newPrefix.trim()] });
                      setNewPrefix("");
                    }
                  }}
                />
                <Button size="sm" variant="outline" type="button" onClick={() => { if (newPrefix.trim()) { setT({ ...t, prefixes: [...t.prefixes, newPrefix.trim()] }); setNewPrefix(""); } }}>
                  Add
                </Button>
              </div>
            </div>
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="eyebrow mb-3 w-full border-b-2 border-border pb-1.5 text-foreground">04 · Custom rules</legend>
            <div className="space-y-2">
              {t.custom_rules.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <label htmlFor={`it-rule-${i}`} className="sr-only">Custom rule {i + 1}</label>
                  <Input id={`it-rule-${i}`} className="min-w-0 flex-1" value={r} onChange={(e) => {
                    const next = [...t.custom_rules]; next[i] = e.target.value;
                    setT({ ...t, custom_rules: next });
                  }} />
                  <IconButton label={`Delete custom rule ${i + 1}`} className="shrink-0 hover:bg-destructive-subtle" onClick={() => setT({ ...t, custom_rules: t.custom_rules.filter((_, idx) => idx !== i) })}>
                    <Trash2 aria-hidden />
                  </IconButton>
                </div>
              ))}
              <div className="flex flex-col gap-2 sm:flex-row">
                <label htmlFor="it-new-rule" className="sr-only">New custom rule</label>
                <Input
                  id="it-new-rule"
                  className="min-w-0 flex-1"
                  placeholder='e.g. Skip names ending with " Jr"'
                  value={newRule}
                  onChange={(e) => setNewRule(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newRule.trim()) {
                      e.preventDefault();
                      setT({ ...t, custom_rules: [...t.custom_rules, newRule.trim()] });
                      setNewRule("");
                    }
                  }}
                />
                <Button variant="outline" type="button" className="shrink-0" onClick={() => { if (newRule.trim()) { setT({ ...t, custom_rules: [...t.custom_rules, newRule.trim()] }); setNewRule(""); } }}>
                  <Plus aria-hidden /> Add Rule
                </Button>
              </div>
            </div>
          </fieldset>
        </div>

        <DialogFooter className="gap-2 border-t-2 border-border px-5 py-3 sm:space-x-0 sm:px-6">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving || !t.name.trim()} onClick={() => onSave(t)}>
            {saving ? <><Loader2 className="animate-spin" aria-hidden /> Saving…</> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
