import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * "Nothing here yet" block: a tilted icon stamp, expanded title, one-line explanation
 * and (ideally) a next step. Draws its own dashed frame, so it can sit on any surface.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  framed = true,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Dashed border around the block. Turn off when already inside a bordered container. */
  framed?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center px-6 py-14 text-center",
        framed && "border-2 border-dashed border-border/60",
        className,
      )}
    >
      <div className="grid size-16 -rotate-6 place-items-center border-2 border-border bg-primary text-primary-foreground shadow-[var(--shadow-brutal)]">
        <Icon className="size-7" strokeWidth={2.2} aria-hidden />
      </div>
      <h3 className="font-expanded mt-6 text-xl leading-tight">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
