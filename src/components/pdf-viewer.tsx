import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Loader2 } from "lucide-react";
import { ErrorState } from "@/components/app/error-state";
import { Skeleton } from "@/components/ui/skeleton";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Paper sheet styling for each rendered page canvas. The canvas itself stays white (it is the
 * printed page); the frame uses an outline so it never changes the computed layout width.
 */
const PAGE_SHEET_CLASS =
  "mx-auto mb-6 block bg-white [outline:2px_solid_var(--border)] shadow-[6px_6px_0_0_var(--shadow-ink)]";

/**
 * Renders a PDF from raw bytes using PDF.js into canvases.
 * Reliable inside nested iframes (e.g. Lovable preview) where the browser's
 * built-in PDF plugin often refuses to render blob: URLs.
 */
export function PdfViewer({
  data,
  zoom,
  fitMode,
  rotation,
  containerWidth,
  containerHeight,
}: {
  data: Uint8Array | null;
  zoom: number; // percent, only used when fitMode === "custom"
  fitMode: "width" | "page" | "custom";
  rotation: number;
  containerWidth: number;
  /** Height of the visible pane; used by "page" fit so a whole page is visible. */
  containerHeight?: number;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!data) { setDoc(null); return; }
    let cancelled = false;
    setError(null);
    // pdfjs mutates the buffer — clone so React state stays intact.
    const copy = new Uint8Array(data);
    const task = pdfjsLib.getDocument({ data: copy });
    task.promise
      .then((d) => { if (!cancelled) setDoc(d); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; task.destroy(); };
  }, [data]);

  useEffect(() => {
    if (!doc || !containerRef.current) return;
    const container = containerRef.current;
    container.innerHTML = "";
    let cancelled = false;
    setRendering(true);

    (async () => {
      for (let i = 1; i <= doc.numPages; i++) {
        if (cancelled) return;
        const page = await doc.getPage(i);
        const baseViewport = page.getViewport({ scale: 1, rotation });
        let scale = 1;
        if (fitMode === "width") {
          // 32px padding + the vertical scrollbar + the sheet's border/shadow, so no sideways scroll.
          scale = Math.max(0.25, (containerWidth - 52) / baseViewport.width);
        } else if (fitMode === "page") {
          // 32px padding + room for the sheet's border/shadow so the full page fits without scrolling.
          const h = containerHeight || container.clientHeight || 800;
          scale = Math.max(0.2, Math.min((containerWidth - 40) / baseViewport.width, (h - 58) / baseViewport.height));
        } else {
          scale = zoom / 100;
        }
        const viewport = page.getViewport({ scale, rotation });
        const canvas = document.createElement("canvas");
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.className = PAGE_SHEET_CLASS;
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `Page ${i} of ${doc.numPages}`);
        const ctx = canvas.getContext("2d")!;
        ctx.scale(dpr, dpr);
        container.appendChild(canvas);
        try {
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        } catch (e) {
          if (!cancelled) console.error("pdf render failed", e);
        }
      }
      if (!cancelled) setRendering(false);
    })();

    return () => { cancelled = true; setRendering(false); };
  }, [doc, zoom, fitMode, rotation, containerWidth, containerHeight]);

  if (error) {
    return (
      <div className="grid h-full place-items-center overflow-auto p-4">
        <ErrorState title="Couldn't render the PDF" error={error} className="w-full max-w-md bg-card" />
      </div>
    );
  }

  const loadingDoc = !!data && !doc;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full overflow-auto p-4" />
      {loadingDoc && (
        <div className="pointer-events-none absolute inset-0 p-4" aria-hidden>
          <Skeleton className="mx-auto aspect-[1/1.414] w-full max-w-xl" />
        </div>
      )}
      {(loadingDoc || rendering) && (
        <div
          role="status"
          className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 border-2 border-border bg-card px-2 py-1 font-mono text-xs uppercase tracking-[0.08em] shadow-[var(--shadow-brutal-sm)]"
        >
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Rendering pages…
        </div>
      )}
    </div>
  );
}
