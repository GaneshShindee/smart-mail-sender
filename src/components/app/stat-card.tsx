import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type StatTone = "default" | "success" | "warning" | "danger" | "info" | "primary" | "highlight";

/** Whole-tile surface per tone. Text stays ink on every tone for contrast. */
const SURFACE: Record<StatTone, string> = {
  default: "bg-card",
  primary: "bg-primary text-primary-foreground",
  success: "bg-success-subtle",
  warning: "bg-warning-subtle",
  danger: "bg-destructive-subtle",
  info: "bg-info-subtle",
  highlight: "bg-highlight-subtle",
};

/**
 * A metric tile: mono label on top, oversized number below. `size="hero"` makes the
 * number poster-sized — use it for the single most important metric on a page.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default",
  size = "default",
  loading,
  flat,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  hint?: ReactNode;
  tone?: StatTone;
  size?: "default" | "hero" | "compact";
  loading?: boolean;
  /** Drop the hard shadow (e.g. when tiles sit inside a dialog or a joined grid). */
  flat?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col justify-between gap-3 border-2 border-border p-4",
        !flat && "shadow-[var(--shadow-brutal)]",
        size === "hero" && "p-5 sm:p-6",
        size === "compact" && "gap-2 p-3",
        SURFACE[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-xs font-semibold uppercase leading-4 tracking-[0.1em]">
          {label}
        </span>
        {Icon && <Icon className="size-5 shrink-0" strokeWidth={2.2} aria-hidden />}
      </div>
      {loading ? (
        <Skeleton className={size === "hero" ? "h-16 w-32" : "h-9 w-20"} />
      ) : (
        <div
          className={cn(
            "font-expanded min-w-0 truncate leading-none tabular-nums",
            size === "hero"
              ? "text-6xl sm:text-7xl"
              : size === "compact"
                ? "text-2xl"
                : "text-3xl sm:text-4xl",
          )}
        >
          {value}
        </div>
      )}
      {hint && <div className="truncate font-mono text-xs opacity-75">{hint}</div>}
    </div>
  );
}
