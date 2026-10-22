import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shown when a query fails. Always offer a retry so users aren't stuck on a skeleton. */
export function ErrorState({
  title = "Something went wrong",
  error,
  onRetry,
  retrying,
  className,
}: {
  title?: string;
  error?: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center border-2 border-dashed border-destructive px-6 py-14 text-center",
        className,
      )}
    >
      <div className="grid size-16 rotate-6 place-items-center border-2 border-border bg-destructive text-destructive-foreground shadow-[var(--shadow-brutal)]">
        <AlertTriangle className="size-7" strokeWidth={2.2} aria-hidden />
      </div>
      <h3 className="font-expanded mt-6 text-xl leading-tight">{title}</h3>
      <p className="mt-2 max-w-sm break-words text-sm text-muted-foreground">
        {message ?? "We couldn't load this data. Check your connection and try again."}
      </p>
      {onRetry && (
        <Button variant="outline" className="mt-6" onClick={onRetry} disabled={retrying}>
          <RotateCw className={cn(retrying && "animate-spin")} aria-hidden />
          Try again
        </Button>
      )}
    </div>
  );
}
