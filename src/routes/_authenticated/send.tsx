import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTemplates } from "@/lib/templates.functions";
import { sendEmail, getGmailStatus } from "@/lib/gmail.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMemo, useState } from "react";
import { extractVariables, applyTemplate } from "@/lib/templating";
import { toast } from "sonner";
import { Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/send")({
  head: () => ({ meta: [{ title: "Send Email — Smart Email Sender" }] }),
  component: SendPage,
});

function SendPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTemplates);
  const sendFn = useServerFn(sendEmail);
  const gmailFn = useServerFn(getGmailStatus);

  const templates = useQuery({ queryKey: ["templates"], queryFn: () => listFn() });
  const gmail = useQuery({ queryKey: ["gmail-status"], queryFn: () => gmailFn() });

  const [tplId, setTplId] = useState<string>("");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});

  const variables = useMemo(() => extractVariables(`${subject}\n${body}`), [subject, body]);
  const previewSubject = applyTemplate(subject, vars);
  const previewBody = applyTemplate(body, vars);

  const selectTemplate = (id: string) => {
    setTplId(id);
    const t = templates.data?.find((x) => x.id === id);
    if (t) { setSubject(t.subject); setBody(t.body); }
  };

  const send = useMutation({
    mutationFn: () => sendFn({ data: { templateId: tplId || null, recipient, subject, body, variables: vars } }),
    onSuccess: () => {
      toast.success("Email sent");
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      setRecipient("");
    },
    onError: (e) => toast.error("Send failed", { description: (e as Error).message }),
  });

  if (gmail.data && !gmail.data.connected) {
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
        <p className="text-sm text-muted-foreground">Pick a template, fill variables, preview, send.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">1. Compose</CardTitle></CardHeader>
          <CardContent className="space-y-4">
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
              <Label>Recipient(s)</Label>
              <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="hr@company.com, recruiter@company.com" />
              <p className="text-xs text-muted-foreground mt-1">Comma-separate to send to multiple addresses. Your Gmail will be BCC'd automatically.</p>
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
                  <div><span className="text-muted-foreground">From:</span> {gmail.data?.email ?? "your gmail"}</div>
                  <div><span className="text-muted-foreground">To:</span> {recipient || "—"}</div>
                  <div><span className="text-muted-foreground">Bcc:</span> {gmail.data?.email ?? ""}</div>
                  <div><span className="text-muted-foreground">Subject:</span> {previewSubject || "—"}</div>
                  <div className="border-t border-border pt-2 whitespace-pre-wrap">{previewBody || "—"}</div>
                </div>
              </TabsContent>
              <TabsContent value="raw">
                <div className="rounded-lg border border-border bg-background p-4 text-sm whitespace-pre-wrap">{body || "—"}</div>
              </TabsContent>
            </Tabs>
            <Button onClick={() => send.mutate()} disabled={send.isPending || !recipient.trim() || !subject.trim() || !body.trim()} className="mt-4 w-full" size="lg">
              <Send className="h-4 w-4 mr-2" />{send.isPending ? "Sending…" : "Send email"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}