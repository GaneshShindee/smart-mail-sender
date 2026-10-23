import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/app/field";
import { PhoneCall } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createCallFollowup } from "@/lib/call-followups.functions";
import { toast } from "sonner";

export type CallFollowupTarget = {
  jobId?: string | null;
  phone?: string | null;
  company?: string;
  role?: string;
  /** True when the job belongs to the current user (so the phone can be saved back onto it). */
  canSavePhone?: boolean;
};

/** Default call deadline: two days from now. */
export const CALL_DEADLINE_DAYS = 2;

/** `Date` → value for `<input type="datetime-local">` in the viewer's timezone. */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function daysFromNow(days: number): Date {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return d;
}

const QUICK_DEADLINES = [
  { label: "In 3 hours", days: 3 / 24 },
  { label: "Tomorrow", days: 1 },
  { label: "In 2 days", days: 2 },
];

export function CallFollowupDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  target: CallFollowupTarget | null;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createCallFollowup);
  const [phone, setPhone] = useState("");
  const [contactName, setContactName] = useState("");
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState("");
  const [savePhone, setSavePhone] = useState(true);

  useEffect(() => {
    if (!open) return;
    setPhone(target?.phone ?? "");
    setContactName("");
    setNotes("");
    setDue(toLocalInputValue(daysFromNow(CALL_DEADLINE_DAYS)));
    setSavePhone(true);
  }, [open, target]);

  const phoneWasMissing = !target?.phone?.trim();
  const dueDate = due ? new Date(due) : null;
  const dueInvalid =
    !dueDate || Number.isNaN(dueDate.getTime()) || dueDate.getTime() < Date.now() - 60_000;

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          jobId: target?.jobId ?? null,
          phone: phone.trim(),
          contactName: contactName.trim(),
          company: target?.company ?? "",
          role: target?.role ?? "",
          notes,
          dueAt: (dueDate as Date).toISOString(),
          savePhoneToJob: !!target?.canSavePhone && phoneWasMissing && savePhone,
        },
      }),
    onSuccess: () => {
      toast.success("Call follow-up scheduled", {
        description: `Due ${(dueDate as Date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`,
      });
      qc.invalidateQueries({ queryKey: ["call-followups"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error("Couldn't schedule call", { description: (e as Error).message }),
  });

  const canSave = phone.trim().length >= 3 && !dueInvalid && !create.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <p className="eyebrow">Call desk</p>
          <DialogTitle className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center border-2 border-border bg-primary text-primary-foreground">
              <PhoneCall className="size-4" strokeWidth={2.4} aria-hidden />
            </span>
            Call follow-up
          </DialogTitle>
          <DialogDescription>
            {target?.role || target?.company
              ? `${target?.role || "Role"}${target?.company ? ` at ${target.company}` : ""}. `
              : ""}
            Set a deadline — it defaults to {CALL_DEADLINE_DAYS} days from now.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Phone number" htmlFor="call-phone">
            <Input
              id="call-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className="font-mono"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
          {target?.canSavePhone && phoneWasMissing && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="call-save-phone"
                checked={savePhone}
                onCheckedChange={(v) => setSavePhone(v === true)}
              />
              <Label htmlFor="call-save-phone" className="cursor-pointer text-sm font-normal">
                Also save this number on the job
              </Label>
            </div>
          )}
          <Field label="Contact name (optional)" htmlFor="call-contact">
            <Input
              id="call-contact"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </Field>
          <Field
            label="Call by"
            htmlFor="call-due"
            error={due && dueInvalid ? "Pick a time in the future." : undefined}
          >
            <Input
              id="call-due"
              type="datetime-local"
              value={due}
              min={toLocalInputValue(new Date())}
              onChange={(e) => setDue(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {QUICK_DEADLINES.map((q) => (
                <Button
                  key={q.label}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDue(toLocalInputValue(daysFromNow(q.days)))}
                >
                  {q.label}
                </Button>
              ))}
            </div>
          </Field>
          <Field label="Notes (optional)" htmlFor="call-notes">
            <Textarea
              id="call-notes"
              rows={3}
              placeholder="What to ask, who referred you, best time to call…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!canSave}>
            <PhoneCall aria-hidden /> {create.isPending ? "Scheduling…" : "Schedule call"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
