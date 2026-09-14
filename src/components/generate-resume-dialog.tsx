import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { listResumeProjects, generateResumeVersion } from "@/lib/resume-studio.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialCompany?: string;
  initialRole?: string;
  /** Full community-job dump (skills, location, salary, etc.). */
  initialJobContext?: string;
  initialInstructions?: string;
};

/** Standalone “Generate Resume” from Send Email — uses full job community context. */
export function GenerateResumeDialog({
  open,
  onOpenChange,
  initialCompany = "",
  initialRole = "",
  initialJobContext = "",
  initialInstructions = "",
}: Props) {
  const navigate = useNavigate();
  const [company, setCompany] = useState(initialCompany);
  const [role, setRole] = useState(initialRole);
  const [jobContext, setJobContext] = useState(initialJobContext);
  const [instructions, setInstructions] = useState(initialInstructions);
  const [masterId, setMasterId] = useState("");

  const projectsFn = useServerFn(listResumeProjects);
  const genFn = useServerFn(generateResumeVersion);

  const projects = useQuery({
    queryKey: ["resume-projects"],
    queryFn: () => projectsFn(),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setCompany(initialCompany);
    setRole(initialRole);
    setJobContext(initialJobContext);
    setInstructions(initialInstructions);
  }, [open, initialCompany, initialRole, initialJobContext, initialInstructions]);

  useEffect(() => {
    if (!open || !projects.data?.length) return;
    const preferred = projects.data.find((p) => p.is_default)?.id ?? projects.data[0]?.id ?? "";
    setMasterId((cur) => cur || preferred);
  }, [open, projects.data]);

  const gen = useMutation({
    mutationFn: () => {
      if (!masterId) throw new Error("Pick a master resume first");
      const blob = jobContext.trim();
      if (!blob && !role.trim()) throw new Error("Add job details or a role first");
      return genFn({
        data: {
          projectId: masterId,
          jobDescription: blob || `Role: ${role.trim()}${company.trim() ? `\nCompany: ${company.trim()}` : ""}`,
          jobContext: blob || null,
          jobTitle: role.trim() || null,
          company: company.trim() || null,
          customInstructions: instructions.trim() || null,
        },
      });
    },
    onSuccess: (row) => {
      toast.success("Resume generated — opening editor. Compile PDF, then Save to Resumes.");
      onOpenChange(false);
      void navigate({ to: "/resume-studio/$id", params: { id: row.id } });
    },
    onError: (e) => toast.error("Resume generation failed", { description: (e as Error).message }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !gen.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl max-h-[min(92dvh,900px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Generate resume for this job
          </DialogTitle>
          <DialogDescription>
            All Jobs Community fields (skills, location, salary, responsibilities, etc.) are included so the resume can match the posting closely.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Company</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Corp" />
            </div>
            <div>
              <Label>Role</Label>
              <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Backend Engineer" />
            </div>
          </div>
          <div>
            <Label>Full job posting</Label>
            <Textarea
              rows={10}
              value={jobContext}
              onChange={(e) => setJobContext(e.target.value)}
              placeholder="Paste or load from Jobs Community…"
              className="text-xs font-mono"
            />
          </div>
          <div>
            <Label>Extra instructions (optional)</Label>
            <Textarea
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Keep to one page, emphasise React"
            />
          </div>
          {(projects.data?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground">
              No master resume yet.{" "}
              <Link to="/resume-studio" className="underline text-foreground" onClick={() => onOpenChange(false)}>
                Upload one in Resume Studio
              </Link>
              .
            </p>
          ) : (
            <div>
              <Label>Master resume</Label>
              <Select value={masterId} onValueChange={setMasterId}>
                <SelectTrigger className="w-full mt-1.5">
                  <SelectValue placeholder="Master resume…" />
                </SelectTrigger>
                <SelectContent>
                  {(projects.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.is_default ? " · Default" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gen.isPending}>
            Cancel
          </Button>
          <Button
            disabled={gen.isPending || !masterId || (!jobContext.trim() && !role.trim())}
            onClick={() => gen.mutate()}
          >
            {gen.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
            {gen.isPending ? "Generating…" : "Generate & edit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
