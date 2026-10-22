import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { updateResumeWithInstructions, rewriteResumeSelection } from "@/lib/resume-studio.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Check, Loader2, Sparkles, Wand2, Plus, X } from "lucide-react";
import { Field } from "@/components/app/field";
import { IconButton } from "@/components/app/icon-button";
import { Kbd } from "@/components/app/kbd";
import { useModKey } from "@/hooks/use-mod-key";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { EditorSelection } from "@/components/latex-editor";
import { DEFAULT_RESUME_AI_PRESETS } from "@/lib/resume-ai-presets";

/** Full-document AI update driven by free-form instructions. */
export function UpdateResumeDialog({
  open,
  onOpenChange,
  versionId,
  onApplied,
  presets,
  onPresetsChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  versionId: string;
  onApplied: (tex: string, notes: string) => void;
  /** User's saved preset instructions; falls back to the built-in defaults while unset. */
  presets?: string[];
  /** Persists the updated preset list (add/remove). */
  onPresetsChange?: (presets: string[]) => void;
}) {
  const [instructions, setInstructions] = useState("");
  const [jd, setJd] = useState("");
  const [addingPreset, setAddingPreset] = useState(false);
  const [newPreset, setNewPreset] = useState("");
  const fn = useServerFn(updateResumeWithInstructions);
  const presetList = presets ?? DEFAULT_RESUME_AI_PRESETS;

  const addPreset = () => {
    const text = newPreset.trim();
    if (!text || presetList.includes(text)) { setAddingPreset(false); setNewPreset(""); return; }
    onPresetsChange?.([...presetList, text]);
    setNewPreset("");
    setAddingPreset(false);
  };

  const removePreset = (p: string) => {
    onPresetsChange?.(presetList.filter((x) => x !== p));
  };

  const run = useMutation({
    mutationFn: () =>
      fn({ data: { id: versionId, instructions: instructions.trim(), jobDescription: jd.trim() || null } }),
    onSuccess: (r) => {
      onApplied(r.tex, r.notes ?? "");
      onOpenChange(false);
      setInstructions("");
      toast.success("Resume updated", { description: r.notes || undefined });
    },
    onError: (e) => toast.error("AI update failed", { description: (e as Error).message }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !run.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="size-5" aria-hidden /> Update resume with AI</DialogTitle>
          <DialogDescription>
            The AI rewrites content only — layout, packages and macros stay untouched, and nothing is invented beyond your profile.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <Field label="What should change?" htmlFor="update-resume-instructions">
            <Textarea
              id="update-resume-instructions"
              rows={4}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Emphasise backend and cloud work, drop the older internships…"
            />
          </Field>
          <div className="space-y-2">
            <p className="eyebrow" id="resume-ai-presets-label">Presets · tap to add</p>
            <ul className="flex flex-wrap gap-2" aria-labelledby="resume-ai-presets-label">
              {presetList.map((p) => {
                const already = instructions
                  .split(/\n/)
                  .map((l) => l.trim())
                  .includes(p);
                return (
                  <li
                    key={p}
                    className={cn(
                      "flex max-w-full items-stretch border-2 border-border shadow-[var(--shadow-brutal-sm)]",
                      already ? "bg-secondary text-secondary-foreground" : "bg-card",
                    )}
                  >
                    <button
                      type="button"
                      disabled={already}
                      aria-pressed={already}
                      onClick={() =>
                        setInstructions((cur) => {
                          const lines = cur
                            .split(/\n/)
                            .map((l) => l.trim())
                            .filter(Boolean);
                          if (lines.includes(p)) return cur;
                          return lines.length ? `${lines.join("\n")}\n${p}` : p;
                        })
                      }
                      className="flex min-h-9 min-w-0 items-center gap-1.5 px-2.5 py-1.5 text-left text-xs font-medium transition-colors enabled:hover:bg-accent enabled:hover:text-accent-foreground disabled:cursor-default"
                    >
                      {already ? (
                        <Check className="size-3.5 shrink-0" aria-hidden />
                      ) : (
                        <Plus className="size-3.5 shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0">{p}</span>
                      {already && <span className="sr-only">(added)</span>}
                    </button>
                    {onPresetsChange && (
                      <>
                        <span aria-hidden className="w-0.5 shrink-0 self-stretch bg-border" />
                        <IconButton
                          label={`Remove preset: ${p}`}
                          size="sm"
                          onClick={() => removePreset(p)}
                          className="h-auto w-9 shrink-0 self-stretch border-0 hover:bg-destructive-subtle hover:text-foreground"
                        >
                          <X aria-hidden />
                        </IconButton>
                      </>
                    )}
                  </li>
                );
              })}
              {onPresetsChange && !addingPreset && (
                <li>
                  <button
                    type="button"
                    onClick={() => setAddingPreset(true)}
                    className="inline-flex min-h-9 items-center gap-1.5 border-2 border-dashed border-border bg-background px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-accent"
                  >
                    <Plus className="size-3.5" aria-hidden /> Add preset
                  </button>
                </li>
              )}
            </ul>
            {onPresetsChange && addingPreset && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  autoFocus
                  aria-label="New preset instruction"
                  value={newPreset}
                  onChange={(e) => setNewPreset(e.target.value)}
                  placeholder="New preset instruction…"
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addPreset(); }
                    if (e.key === "Escape") { setAddingPreset(false); setNewPreset(""); }
                  }}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={addPreset} disabled={!newPreset.trim()}>Save</Button>
                  <Button size="sm" variant="outline" onClick={() => { setAddingPreset(false); setNewPreset(""); }}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
          <Field
            label="Job description (optional)"
            htmlFor="update-resume-jd"
            hint="The saved job description is used when this is empty."
          >
            <Textarea id="update-resume-jd" rows={4} value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the job description…" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={run.isPending}>Cancel</Button>
          <Button onClick={() => run.mutate()} disabled={run.isPending || instructions.trim().length < 3}>
            {run.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {run.isPending ? "Updating…" : "Update resume"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cursor-style inline "Ask AI": a floating button anchored to the current
 * Monaco selection that rewrites just that fragment.
 */
export function InlineAskAi({
  selection,
  versionId,
  document,
  onReplace,
}: {
  selection: EditorSelection | null;
  versionId: string;
  document: string;
  onReplace: (start: number, end: number, text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [frozen, setFrozen] = useState<EditorSelection | null>(null);
  const fn = useServerFn(rewriteResumeSelection);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const mod = useModKey();

  // Keep the floating "Ask AI" button inside the editor's bounds (UI-only clamp).
  useLayoutEffect(() => {
    const el = anchorRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent || !selection) return;
    const maxLeft = Math.max(8, parent.clientWidth - el.offsetWidth - 8);
    const maxTop = Math.max(4, parent.clientHeight - el.offsetHeight - 4);
    el.style.left = `${Math.min(Math.max(8, selection.left - 20), maxLeft)}px`;
    el.style.top = `${Math.min(Math.max(4, selection.top - 42), maxTop)}px`;
  }, [selection, open]);

  useEffect(() => {
    if (!open) setFrozen(null);
  }, [open]);

  const target = frozen ?? selection;

  const run = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("Nothing selected");
      return fn({
        data: {
          id: versionId,
          selection: target.text,
          instructions: instructions.trim(),
          context: document.slice(Math.max(0, target.start - 1500), target.end + 1500),
        },
      });
    },
    onSuccess: (r) => {
      if (target) onReplace(target.start, target.end, r.replacement);
      setOpen(false);
      setInstructions("");
      toast.success("Selection rewritten");
    },
    onError: (e) => toast.error("AI failed", { description: (e as Error).message }),
  });

  return (
    <>
      {selection && !open && (
        <div
          ref={anchorRef}
          className="absolute z-20"
          style={{ top: Math.max(4, selection.top - 42), left: Math.max(8, selection.left - 20) }}
        >
          <Button
            size="sm"
            className="shadow-[var(--shadow-brutal)]"
            onClick={() => { setFrozen(selection); setOpen(true); }}
          >
            <Sparkles aria-hidden /> Ask AI
          </Button>
        </div>
      )}
      <Dialog open={open} onOpenChange={(o) => !run.isPending && setOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="size-5" aria-hidden /> Rewrite selection</DialogTitle>
            <DialogDescription>Only the highlighted LaTeX is replaced — the rest of the file is untouched.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="eyebrow mb-1.5">Selected LaTeX</p>
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap border-2 border-border bg-muted p-3 font-mono text-xs">
                {target?.text ?? ""}
              </pre>
            </div>
            <Field label="Instruction" htmlFor="inline-ask-ai-instruction" hint={<>Press <Kbd>{mod}</Kbd> <Kbd>↵</Kbd> to rewrite.</>}>
              <Textarea
                id="inline-ask-ai-instruction"
                rows={3}
                autoFocus
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Make this bullet quantified and ATS-friendly"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && instructions.trim().length > 1) run.mutate();
                }}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={run.isPending}>Cancel</Button>
            <Button onClick={() => run.mutate()} disabled={run.isPending || instructions.trim().length < 2}>
              {run.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
              {run.isPending ? "Rewriting…" : "Rewrite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}