import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTemplates, upsertTemplate, deleteTemplate, duplicateTemplate } from "@/lib/templates.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Copy, LayoutTemplate } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "./dashboard";
import { extractVariables } from "@/lib/templating";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({ meta: [{ title: "My Templates — Smart Email Sender" }] }),
  component: TemplatesPage,
});

type Tpl = { id: string; name: string; subject: string; body: string };

function TemplatesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTemplates);
  const upsertFn = useServerFn(upsertTemplate);
  const delFn = useServerFn(deleteTemplate);
  const dupFn = useServerFn(duplicateTemplate);
  const { data, isLoading } = useQuery({ queryKey: ["templates"], queryFn: () => listFn() });

  const [editing, setEditing] = useState<Partial<Tpl> | null>(null);

  const save = useMutation({
    mutationFn: (input: Partial<Tpl>) => upsertFn({ data: { id: input.id ?? null, name: input.name ?? "", subject: input.subject ?? "", body: input.body ?? "" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); toast.success("Template saved"); setEditing(null); },
    onError: (e) => toast.error("Save failed", { description: (e as Error).message }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); toast.success("Deleted"); },
  });
  const dup = useMutation({
    mutationFn: (id: string) => dupFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); toast.success("Duplicated"); },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Templates</h1>
          <p className="text-sm text-muted-foreground">Use <code className="text-xs bg-muted px-1 py-0.5 rounded">{`{{placeholder}}`}</code> syntax to insert dynamic fields.</p>
        </div>
        <Button onClick={() => setEditing({ name: "", subject: "", body: "" })}><Plus className="h-4 w-4 mr-2" />New template</Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
      ) : data?.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((t) => {
            const vars = extractVariables(`${t.subject}\n${t.body}`);
            return (
              <Card key={t.id}>
                <CardContent className="py-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{t.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{t.subject || "No subject"}</div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEditing(t)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => dup.mutate(t.id)}><Copy className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Delete "${t.name}"?`)) remove.mutate(t.id); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  {vars.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {vars.map((v) => <span key={v} className="text-xs bg-accent text-accent-foreground rounded-full px-2 py-0.5">{`{{${v}}}`}</span>)}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card><CardContent><EmptyState icon={LayoutTemplate} title="No templates yet" desc="Create your first template to get going." action={<Button onClick={() => setEditing({ name: "", subject: "", body: "" })}><Plus className="h-4 w-4 mr-2" />New template</Button>} /></CardContent></Card>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit template" : "New template"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Job application" /></div>
              <div><Label>Subject</Label><Input value={editing.subject ?? ""} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} placeholder="Application for {{position}}" /></div>
              <div>
                <Label>Body</Label>
                <Textarea rows={10} value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} placeholder={"Hello {{name}},\n\nI'm interested in the {{position}} role at {{company}}.\n\nThanks,\n{{sender_name}}"} />
              </div>
              <p className="text-xs text-muted-foreground">Detected variables: {extractVariables(`${editing.subject ?? ""}\n${editing.body ?? ""}`).map((v) => `{{${v}}}`).join(", ") || "none"}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={save.isPending || !editing?.name?.trim()}>{save.isPending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}