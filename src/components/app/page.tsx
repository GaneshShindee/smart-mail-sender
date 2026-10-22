import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const PAGE_WIDTHS = {
  narrow: "max-w-3xl",
  default: "max-w-6xl",
  wide: "max-w-7xl",
  full: "max-w-none",
} as const;

/** Standard page container: consistent max-width and vertical rhythm for every app page. */
export function Page({
  size = "default",
  className,
  children,
}: {
  size?: keyof typeof PAGE_WIDTHS;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full space-y-8", PAGE_WIDTHS[size], className)}>{children}</div>
  );
}

/**
 * Poster-style page header: mono eyebrow, oversized expanded title, description,
 * and actions. Sits on a thick rule so every page opens with the same "masthead".
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  icon: Icon,
  actions,
  meta,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Small mono label above the title, e.g. "02 · Outreach". */
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  /** Optional row under the description (badges, counts, back links). */
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-5 border-b-2 border-border pb-6 lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-4">
        {Icon && (
          <div className="hidden size-14 shrink-0 place-items-center border-2 border-border bg-primary text-primary-foreground shadow-[var(--shadow-brutal)] sm:grid">
            <Icon className="size-7" strokeWidth={2.2} aria-hidden />
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
          <h1 className="page-title">{title}</h1>
          {description && <p className="page-subtitle">{description}</p>}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-3 lg:shrink-0 lg:justify-end">{actions}</div>
      )}
    </header>
  );
}
