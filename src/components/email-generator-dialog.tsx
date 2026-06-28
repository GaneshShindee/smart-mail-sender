import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { generateEmails, type GenerateResult } from "@/lib/email-generator.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_PROMPT = `Generate email addresses using this format:

firstname.lastname@company.com

Rules:
- Use first name and last name only.
- Ignore job titles, LinkedIn metadata, company names, badges.
- Remove prefixes like Mr, Mrs, Ms, Md, Mohd, Dr, Prof, Er.
- Skip incomplete names, names containing "...", names with only initials.
- Skip names where last name is only one or two letters.
- Lowercase the email. Remove accents and special characters.
- Return valid emails only. Return skipped names with a reason.`;

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUse: (emails: string[]) => void;
};

function copyText(t: string) {
  navigator.clipboard.writeText(t).then(
    () => toast.success("Copied"),
    () => toast.error("Copy failed"),
  );
}

export function EmailGeneratorDialog({ open, onOpenChange, onUse }: Props) {
  const fn = useServerFn(generateEmails);
  const [instructions, setInstructions] = useState(DEFAULT_PROMPT);
  const [data, setData] = useState("");
  const [batchSize, setBatchSize] = useState(100);
  const [result, setResult] = useState<GenerateResult | null>(null);

  const generate = useMutation({
    mutationFn: () => fn({ data: { instructions, data } }),
    onSuccess: (r) => setResult(r),
    onError: (e) => toast.error("Generation failed", { description: (e as Error).message }),
  });

  const emails = result?.emails ?? [];
  const skipped = result?.skipped ?? [];
  const totalLines = useMemo(() => data.split(/\r?\n/).filter((l) => l.trim()).length, [data]);
  const commaList = emails.join(", ");

  const batches = useMemo(() => {
    const size = Math.max(1, Math.min(1000, batchSize || 100));
    const out: string[][] = [];
    for (let i = 0; i < emails.length; i += size) out.push(emails.slice(i, i + size));
    return out;
  }, [emails, batchSize]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> AI Email Generator
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid md:grid-cols-2 gap-0 overflow-hidden">
          {/* Left: input */}
          <div className="flex flex-col gap-3 p-4 border-r min-h-0 overflow-y-auto">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Instructions</Label>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={10}
                className="font-mono text-xs mt-1"
              />
            </div>
            <div className="flex-1 min-h-[200px] flex flex-col">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Data</Label>
              <Textarea
                value={data}
                onChange={(e) => setData(e.target.value)}
                placeholder="Paste LinkedIn search results, company employee list, Excel data, CSV, or any text here..."
                className="font-mono text-xs mt-1 flex-1 min-h-[200px]"
              />
              <div className="text-xs text-muted-foreground mt-1">{totalLines} non-empty lines</div>
            </div>
            <Button
              onClick={() => generate.mutate()}
              disabled={generate.isPending || !data.trim() || instructions.trim().length < 10}
              className="w-full"
            >
              {generate.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Generate Emails</>
              )}
            </Button>
          </div>

          {/* Right: results */}
          <div className="flex flex-col min-h-0 overflow-hidden">
            <div className="grid grid-cols-4 gap-2 p-3 border-b text-center text-xs">
              <Stat label="Lines" value={totalLines} />
              <Stat label="Generated" value={emails.length} />
              <Stat label="Skipped" value={skipped.length} />
              <Stat label="Batches" value={batches.length} />
            </div>

            <Tabs defaultValue="list" className="flex-1 min-h-0 flex flex-col">
              <TabsList className="mx-3 mt-3 self-start">
                <TabsTrigger value="list">Emails</TabsTrigger>
                <TabsTrigger value="comma">Comma</TabsTrigger>
                <TabsTrigger value="batches">Batches</TabsTrigger>
                <TabsTrigger value="skipped">Skipped</TabsTrigger>
              </TabsList>

              <TabsContent value="list" className="flex-1 min-h-0 overflow-auto px-3 pb-3 mt-2">
                {emails.length === 0 ? (
                  <Empty />
                ) : (
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all">{emails.join("\n")}</pre>
                )}
              </TabsContent>

              <TabsContent value="comma" className="flex-1 min-h-0 overflow-auto px-3 pb-3 mt-2">
                <div className="flex justify-end mb-2">
                  <Button size="sm" variant="outline" disabled={!commaList} onClick={() => copyText(commaList)}>
                    <Copy className="h-3 w-3 mr-1" /> Copy all
                  </Button>
                </div>
                {commaList ? (
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all">{commaList}</pre>
                ) : (
                  <Empty />
                )}
              </TabsContent>

              <TabsContent value="batches" className="flex-1 min-h-0 overflow-auto px-3 pb-3 mt-2 space-y-3">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Batch size</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={batchSize}
                    onChange={(e) => setBatchSize(parseInt(e.target.value) || 100)}
                    className="h-7 w-24"
                  />
                </div>
                {batches.length === 0 && <Empty />}
                {batches.map((b, i) => {
                  const text = b.join(", ");
                  return (
                    <div key={i} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium">Part {i + 1} <Badge variant="secondary" className="ml-1">{b.length}</Badge></div>
                        <Button size="sm" variant="outline" onClick={() => copyText(text)}>
                          <Copy className="h-3 w-3 mr-1" /> Copy
                        </Button>
                      </div>
                      <pre className="text-xs font-mono whitespace-pre-wrap break-all max-h-32 overflow-auto">{text}</pre>
                    </div>
                  );
                })}
              </TabsContent>

              <TabsContent value="skipped" className="flex-1 min-h-0 overflow-auto px-3 pb-3 mt-2 space-y-2">
                {skipped.length === 0 && <Empty />}
                {skipped.map((s, i) => (
                  <div key={i} className="rounded-md border p-2 text-xs">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-muted-foreground">Reason: {s.reason}</div>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t">
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
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-1.5">
      <div className="text-base font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function Empty() {
  return (
    <div className="text-xs text-muted-foreground text-center py-8">
      No results yet. Paste data on the left and click Generate.
    </div>
  );
}