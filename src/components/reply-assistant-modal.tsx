import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/app/field";
import { SegmentedControl } from "@/components/app/segmented-control";
import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";

export type ReplyTone = "professional" | "friendly" | "formal" | "confident" | "enthusiastic" | "neutral";
export type ReplyLength = "short" | "medium" | "detailed";

const TONES: ReplyTone[] = ["professional", "friendly", "formal", "confident", "enthusiastic", "neutral"];
const LENGTHS: ReplyLength[] = ["short", "medium", "detailed"];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function ReplyAssistantModal({
  open,
  onOpenChange,
  onGenerate,
  pending,
  recipientCount,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onGenerate: (opts: { tone: ReplyTone; length: ReplyLength; instruction: string }) => void;
  pending: boolean;
  /** When set, the draft is reused for this many individual replies. */
  recipientCount?: number;
}) {
  const [tone, setTone] = useState<ReplyTone>("professional");
  const [length, setLength] = useState<ReplyLength>("medium");
  const [instruction, setInstruction] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <p className="eyebrow">AI desk</p>
          <DialogTitle className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center border-2 border-border bg-primary text-primary-foreground">
              <Sparkles className="size-4" strokeWidth={2.4} aria-hidden />
            </span>
            Reply assistant
          </DialogTitle>
          <DialogDescription>
            {recipientCount
              ? `One draft, personalized and sent individually to ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}.`
              : "Pick a tone and length — the draft lands in your reply body for review."}
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-border/20 border-y-2 border-border">
          <div className="space-y-2 py-4">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em]">
              Tone
            </p>
            <SegmentedControl
              value={tone}
              onValueChange={setTone}
              ariaLabel="Tone"
              size="sm"
              options={TONES.map((t) => ({ value: t, label: cap(t) }))}
            />
          </div>
          <div className="space-y-2 py-4">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em]">Length</p>
            <SegmentedControl
              value={length}
              onValueChange={setLength}
              ariaLabel="Length"
              size="sm"
              options={LENGTHS.map((l) => ({ value: l, label: cap(l) }))}
            />
          </div>
          <div className="py-4">
            <Field label="Custom instructions (optional)" htmlFor="assist-instruction">
              <Textarea
                id="assist-instruction"
                rows={4}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="e.g. Politely decline and suggest reconnecting in Q4. Ask about interview timeline. Confirm availability next Tuesday."
              />
            </Field>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onGenerate({ tone, length, instruction: instruction.trim() })} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {pending ? "Drafting…" : "Generate draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
