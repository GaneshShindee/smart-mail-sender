import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Previous / next pagination with a mono "Page 2 of 9" readout. 1-based `page`. */
export function Pager({
  page,
  totalPages,
  onPageChange,
  totalItems,
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-between gap-3 border-t-2 border-border pt-4", className)}
    >
      <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        <ArrowLeft aria-hidden /> Prev
      </Button>
      <p className="font-mono text-xs uppercase tracking-[0.1em]" aria-live="polite">
        Page <strong>{page}</strong> / {totalPages}
        {totalItems !== undefined && (
          <span className="hidden text-muted-foreground sm:inline"> · {totalItems} total</span>
        )}
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
      >
        Next <ArrowRight aria-hidden />
      </Button>
    </nav>
  );
}
