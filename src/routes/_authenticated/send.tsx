import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTemplates } from "@/lib/templates.functions";
import { sendEmail, listGmailAccounts } from "@/lib/gmail.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useEffect, useMemo, useState } from "react";
import { extractVariables, applyTemplate } from "@/lib/templating";
import { parseRecipients } from "@/lib/recipients";
import { toast } from "sonner";
import { Send, Sparkles, AlertCircle, Users } from "lucide-react";
import { EmailGeneratorDialog } from "@/components/email-generator-dialog";

export const Route = createFileRoute("/_authenticated/send")({
  head: () => ({ meta: [{ title: "Send Email — Smart Email Sender" }] }),
  component: SendPage,
});

function SendPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTemplates);
  const sendFn = useServerFn(sendEmail);
  const accountsFn = useServerFn(listGmailAccounts);

  const templates = useQuery({ queryKey: ["templates"], queryFn: () => listFn() });
  const accounts = useQuery({ queryKey: ["gmail-accounts"], queryFn: () => accountsFn() });

  const [tplId, setTplId] = useState<string>("");
  const [senderId, setSenderId] = useState<string>("");
  const [recipientText, setRecipientText] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [genOpen, setGenOpen] = useState(false);

  // Auto-select default sender once accounts load.
  useEffect(() => {
    if (!senderId && accounts.data && accounts.data.length > 0) {
      const def = accounts.data.find((a) => a.is_default) ?? accounts.data[0];
      setSenderId(def.id);
    }
  }, [accounts.data, senderId]);

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
    if (t) { setSubject(t.subject); setBody(t.body); }
  };

  const send = useMutation({
    mutationFn: () => sendFn({
      data: {
        templateId: tplId || null,
        gmailAccountId: senderId || null,
        recipients: parsed.valid,
        subject, body, variables: vars,
      },
    }),
    onSuccess: (r) => {
      toast.success(`Email sent to ${r.recipientCount} recipient${r.recipientCount === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      setRecipientText("");
    },
    onError: (e) => toast.error("Send failed", { description: (e as Error).message }),
  });

  if (accounts.data && accounts.data.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <h2 className="text-lg font-semibold">Connect Gmail first</h2>
            <p className="text-sm text-muted-foreground">You need to grant Gmail send permission before you can send emails.</p>
            <Button asChild><Link to="/settings">Go to Settings</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Send Email</h1>
        <p className="text-sm text-muted-foreground">Recipients go into BCC automatically — your Gmail address is the only visible TO.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">1. Compose</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Send from</Label>
              <Select value={senderId} onValueChange={setSenderId}>
                <SelectTrigger><SelectValue placeholder="Select a Gmail account" /></SelectTrigger>
                <SelectContent>
                  {accounts.data?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {(a.label ?? a.full_name ?? a.gmail_email)}{a.is_default ? " · Default" : ""} — {a.gmail_email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Template</Label>
              <Select value={tplId} onValueChange={selectTemplate}>
                <SelectTrigger><SelectValue placeholder="Choose a template (optional)" /></SelectTrigger>
                <SelectContent>
                  {templates.data?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>To (read-only)</Label>
              <Input value={selectedSender?.gmail_email ?? ""} readOnly className="bg-muted/40" />
              <p className="text-xs text-muted-foreground mt-1">Always set to your selected Gmail account. Pasted recipients become BCC.</p>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>Recipients (BCC)</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setGenOpen(true)}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" /> Generate Emails
                </Button>
              </div>
              <Textarea
                rows={4}
                value={recipientText}
                onChange={(e) => setRecipientText(e.target.value)}
                placeholder={"hr@company.com, recruiter@company.com\nperson@example.com"}
                className="font-mono text-sm"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary" className="gap-1"><Users className="h-3 w-3" />{parsed.valid.length} valid</Badge>
                {parsed.duplicates > 0 && <Badge variant="outline">{parsed.duplicates} duplicate{parsed.duplicates === 1 ? "" : "s"} removed</Badge>}
                {parsed.invalid.length > 0 && (
                  <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />{parsed.invalid.length} invalid</Badge>
                )}
                <span className="text-muted-foreground">Separate with commas, semicolons, spaces, or new lines.</span>
              </div>
              {parsed.invalid.length > 0 && (
                <div className="mt-2 text-xs text-destructive truncate" title={parsed.invalid.join(", ")}>
                  Ignored: {parsed.invalid.slice(0, 5).join(", ")}{parsed.invalid.length > 5 ? ` +${parsed.invalid.length - 5} more` : ""}
                </div>
              )}
            </div>
            <div><Label>Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
            <div><Label>Body</Label><Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} /></div>
            {variables.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Variables</div>
                {variables.map((v) => (
                  <div key={v} className="grid grid-cols-[120px_1fr] items-center gap-2">
                    <Label className="text-xs">{`{{${v}}}`}</Label>
                    <Input value={vars[v] ?? ""} onChange={(e) => setVars({ ...vars, [v]: e.target.value })} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">2. Preview & send</CardTitle></CardHeader>
          <CardContent>
            <Tabs defaultValue="preview">
              <TabsList><TabsTrigger value="preview">Preview</TabsTrigger><TabsTrigger value="raw">Raw template</TabsTrigger></TabsList>
              <TabsContent value="preview">
                <div className="rounded-lg border border-border bg-background p-4 text-sm space-y-2">
                  <div><span className="text-muted-foreground">From:</span> {selectedSender?.gmail_email ?? "—"}</div>
                  <div><span className="text-muted-foreground">To:</span> {selectedSender?.gmail_email ?? "—"}</div>
                  <div className="break-words">
                    <span className="text-muted-foreground">Bcc ({parsed.valid.length}):</span>{" "}
                    {parsed.valid.length ? parsed.valid.slice(0, 8).join(", ") + (parsed.valid.length > 8 ? ` +${parsed.valid.length - 8} more` : "") : "—"}
                  </div>
                  <div><span className="text-muted-foreground">Subject:</span> {previewSubject || "—"}</div>
                  <div className="border-t border-border pt-2 whitespace-pre-wrap">{previewBody || "—"}</div>
                </div>
              </TabsContent>
              <TabsContent value="raw">
                <div className="rounded-lg border border-border bg-background p-4 text-sm whitespace-pre-wrap">{body || "—"}</div>
              </TabsContent>
            </Tabs>
            <Button
              onClick={() => send.mutate()}
              disabled={send.isPending || parsed.valid.length === 0 || !subject.trim() || !body.trim() || !senderId}
              className="mt-4 w-full"
              size="lg"
            >
              <Send className="h-4 w-4 mr-2" />
              {send.isPending ? "Sending…" : `Send to ${parsed.valid.length} recipient${parsed.valid.length === 1 ? "" : "s"}`}
            </Button>
          </CardContent>
        </Card>
      </div>
      <EmailGeneratorDialog
        open={genOpen}
        onOpenChange={setGenOpen}
        onUse={(emails) => {
          const existing = parsed.valid;
          const merged = Array.from(new Set([...existing, ...emails.map((e) => e.toLowerCase())]));
          setRecipientText(merged.join(", "));
        }}
      />
    </div>
  );
}