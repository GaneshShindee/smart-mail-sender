import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { IconButton } from "@/components/app/icon-button";
import { SegmentedControl } from "@/components/app/segmented-control";
import { EmptyState } from "@/components/app/empty-state";
import {
  Loader2, RefreshCw, Download, FileText, AlertTriangle, CheckCircle2,
  ZoomIn, ZoomOut, Maximize2, Printer, RotateCw, SlidersHorizontal, ChevronDown,
} from "lucide-react";
import { PdfViewer } from "@/components/pdf-viewer";

type CompileError = { line: number | null; message: string; suggestion?: string };
type CompileResponse =
  | { success: true; pdfBase64: string; log: string; errors: [] }
  | { success: false; errors: CompileError[]; log: string };

type Status = "idle" | "compiling" | "success" | "error";

export function LatexPreview({
  tex,
  filename = "resume.tex",
  downloadName,
  onCompiled,
  onErrors,
  autoCompile = true,
  debounceMs = 10_000,
}: {
  tex: string;
  filename?: string;
  downloadName?: string;
  onCompiled?: (pdfBase64: string) => void;
  onErrors?: (errors: CompileError[]) => void;
  autoCompile?: boolean;
  debounceMs?: number;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<CompileError[]>([]);
  const [log, setLog] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  // Fill the pane width by default (scroll inside the pane); "Page" fit is under Options.
  const [fitMode, setFitMode] = useState<"width" | "page" | "custom">("width");
  const [containerWidth, setContainerWidth] = useState(600);
  const [containerHeight, setContainerHeight] = useState(0);
  const [showOptions, setShowOptions] = useState(false);
  const viewerWrapRef = useRef<HTMLDivElement | null>(null);
  const lastTexRef = useRef<string>("");
  const inflightRef = useRef<AbortController | null>(null);

  const baseName = useMemo(() => {
    const raw = (downloadName ?? filename).replace(/\.(tex|pdf)$/i, "");
    return raw || "resume";
  }, [downloadName, filename]);
  const pdfDownloadName = `${baseName}.pdf`;
  const texDownloadName = `${baseName}.tex`;

  const compile = useCallback(async () => {
    if (!tex.trim()) return;
    inflightRef.current?.abort();
    const ac = new AbortController();
    inflightRef.current = ac;
    setStatus("compiling");
    try {
      const res = await fetch("/api/latex/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex: tex, filename }),
        signal: ac.signal,
      });
      const data = (await res.json()) as CompileResponse;
      if (data.success) {
        const bytes = base64ToBytes(data.pdfBase64);
        const blob = new Blob([bytes.slice().buffer], { type: "application/pdf" });
        setPdfBytes(new Uint8Array(bytes));
        const url = URL.createObjectURL(blob);
        setPdfUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
        setStatus("success");
        setErrors([]);
        setLog("");
        lastTexRef.current = tex;
        onCompiled?.(data.pdfBase64);
        onErrors?.([]);
      } else {
        setStatus("error");
        setErrors(data.errors);
        setLog(data.log ?? "");
        onErrors?.(data.errors);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setStatus("error");
      setErrors([{ line: null, message: (e as Error).message }]);
    }
  }, [tex, filename, onCompiled, onErrors]);

  // Debounced auto-compile
  useEffect(() => {
    if (!autoCompile) return;
    if (!tex || tex === lastTexRef.current) return;
    const t = setTimeout(() => { void compile(); }, debounceMs);
    return () => clearTimeout(t);
  }, [tex, autoCompile, debounceMs, compile]);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const iframeSrc = useMemo(() => {
    if (!pdfUrl) return null;
    const zoomParam = fitMode === "width" ? "page-width" : fitMode === "page" ? "page-fit" : String(zoom);
    return `${pdfUrl}#zoom=${zoomParam}&toolbar=1&navpanes=0`;
  }, [pdfUrl, zoom, fitMode]);

  const triggerDownload = (blob: Blob, name: string) => {
    if (!blob.size) return false;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  };

  const downloadPdf = () => {
    if (!pdfBytes || !pdfBytes.length) return;
    const blob = new Blob([pdfBytes.slice().buffer], { type: "application/pdf" });
    triggerDownload(blob, pdfDownloadName);
  };

  const downloadTex = () => {
    if (!tex.trim()) return;
    const blob = new Blob([tex], { type: "application/x-tex;charset=utf-8" });
    triggerDownload(blob, texDownloadName);
  };

  const print = () => {
    if (!pdfUrl) return;
    const w = window.open(pdfUrl, "_blank");
    w?.addEventListener("load", () => w.print());
  };
  const fullscreen = () => { viewerWrapRef.current?.requestFullscreen().catch(() => {}); };
  const applyZoom = (next: number) => { setFitMode("custom"); setZoom(Math.max(25, Math.min(400, next))); };

  useLayoutEffect(() => {
    const el = viewerWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerWidth(el.clientWidth);
      setContainerHeight(el.clientHeight);
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    setContainerHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {/* Slim header: status + Compile + Options toggle. View/download controls stay tucked away
          so the PDF gets the vertical space. */}
      <div className="border-b-2 border-border bg-background">
        <div className="flex h-11 items-center justify-between gap-2 px-2">
          <div className="flex min-w-0 items-center gap-2 pl-1">
            <StatusPill status={status} />
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="secondary" className="h-8" onClick={() => void compile()} disabled={status === "compiling"}>
              <RefreshCw className={status === "compiling" ? "animate-spin" : undefined} aria-hidden />
              Compile
            </Button>
            <Button
              size="sm"
              variant={showOptions ? "secondary" : "outline"}
              className="h-8"
              aria-expanded={showOptions}
              aria-controls="latex-preview-options"
              onClick={() => setShowOptions((v) => !v)}
            >
              <SlidersHorizontal aria-hidden />
              Options
              <ChevronDown className={showOptions ? "rotate-180 transition-transform" : "transition-transform"} aria-hidden />
            </Button>
          </div>
        </div>
        {showOptions && (
          <div
            id="latex-preview-options"
            className="flex flex-wrap items-center gap-1.5 border-t-2 border-dashed border-border/40 px-2 py-2"
          >
            <IconButton label="Zoom out" size="sm" onClick={() => applyZoom(zoom - 25)}>
              <ZoomOut aria-hidden />
            </IconButton>
            <SegmentedControl
              size="sm"
              ariaLabel="Fit preview to"
              className="pb-0"
              value={fitMode}
              onValueChange={(v) => setFitMode(v)}
              options={[
                { value: "width", label: "Width" },
                { value: "page", label: "Page" },
              ]}
            />
            {fitMode === "custom" && (
              <span className="min-w-12 text-center font-mono text-xs tabular-nums" aria-live="polite">
                {zoom}%
              </span>
            )}
            <IconButton label="Zoom in" size="sm" onClick={() => applyZoom(zoom + 25)}>
              <ZoomIn aria-hidden />
            </IconButton>
            <span className="mx-0.5 h-6 w-0.5 bg-border" aria-hidden />
            <IconButton label="Rotate 90°" size="sm" onClick={() => setRotation((r) => (r + 90) % 360)}>
              <RotateCw aria-hidden />
            </IconButton>
            <IconButton label="Print PDF" size="sm" onClick={print} disabled={!pdfUrl}>
              <Printer aria-hidden />
            </IconButton>
            <IconButton label="Fullscreen preview" size="sm" onClick={fullscreen} disabled={!pdfUrl}>
              <Maximize2 aria-hidden />
            </IconButton>
            <span className="mx-0.5 h-6 w-0.5 bg-border" aria-hidden />
            <Button size="sm" variant="outline" className="h-8" onClick={downloadTex} title="Download .tex source">
              <Download aria-hidden />.tex
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={downloadPdf} disabled={!pdfUrl} title="Download the latest compiled PDF">
              <Download aria-hidden />PDF
            </Button>
          </div>
        )}
      </div>

      <div ref={viewerWrapRef} className="orbit-dots relative min-h-0 flex-1 overflow-hidden bg-muted">
        {pdfBytes ? (
          <div className="w-full h-full" style={{ transform: rotation && fitMode !== "custom" ? undefined : undefined }}>
            <PdfViewer
              data={pdfBytes}
              zoom={zoom}
              fitMode={fitMode}
              rotation={rotation}
              containerWidth={containerWidth}
              containerHeight={containerHeight}
            />
          </div>
        ) : status === "compiling" ? (
          <div className="flex h-full flex-col items-center gap-4 overflow-hidden p-4" role="status">
            <p className="eyebrow inline-flex items-center gap-2 text-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Compiling…
            </p>
            <Skeleton className="aspect-[1/1.414] w-full max-w-md" />
          </div>
        ) : (
          <div className="grid h-full place-items-center overflow-auto p-4">
            <EmptyState
              icon={FileText}
              title="No preview yet"
              className="bg-card"
              description="Edit the LaTeX source to see a live PDF preview. Compilation runs on a TeX Live server — no local install required."
              action={
                <Button variant="secondary" onClick={() => void compile()} disabled={!tex.trim()}>
                  <RefreshCw aria-hidden /> Compile now
                </Button>
              }
            />
          </div>
        )}
        {status === "compiling" && pdfUrl && (
          <div
            role="status"
            className="absolute right-3 top-3 inline-flex items-center gap-1.5 border-2 border-border bg-card px-2 py-1 font-mono text-xs uppercase tracking-[0.08em] shadow-[var(--shadow-brutal-sm)]"
          >
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Compiling…
          </div>
        )}
        {status === "error" && errors.length > 0 && (
          <div
            role="alert"
            className="absolute inset-x-0 bottom-0 flex max-h-[55%] flex-col border-t-2 border-border bg-card shadow-[0_-4px_0_0_var(--shadow-ink)]"
          >
            <div className="flex items-center gap-2 bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              Compilation failed · {errors.length} error{errors.length > 1 ? "s" : ""}
            </div>
            <div className="min-h-0 overflow-auto p-3">
              <ul className="space-y-3">
                {errors.slice(0, 20).map((e, i) => (
                  <li key={i} className="border-l-4 border-destructive pl-3">
                    {e.line !== null && (
                      <span className="mb-1 inline-block border-[1.5px] border-border bg-destructive-subtle px-1.5 font-mono text-xs font-semibold uppercase">
                        Line {e.line}
                      </span>
                    )}
                    <div className="text-sm text-foreground">{e.message}</div>
                    {e.suggestion && <div className="mt-0.5 text-xs text-muted-foreground">{e.suggestion}</div>}
                  </li>
                ))}
              </ul>
              {log && (
                <details className="mt-3 border-2 border-border">
                  <summary className="cursor-pointer bg-muted px-2 py-1.5 font-mono text-xs font-semibold uppercase tracking-[0.08em]">
                    Full compiler log
                  </summary>
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap border-t-2 border-border bg-background p-2 font-mono text-xs text-muted-foreground">{log}</pre>
                </details>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  if (status === "compiling") return <Badge variant="info"><Loader2 className="animate-spin" aria-hidden /> Compiling</Badge>;
  if (status === "success")   return <Badge variant="success"><CheckCircle2 aria-hidden /> Compiled</Badge>;
  if (status === "error")     return <Badge variant="danger"><AlertTriangle aria-hidden /> Failed</Badge>;
  return <Badge variant="muted"><FileText aria-hidden /> Live preview</Badge>;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
