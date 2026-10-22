import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SectionTone = "plain" | "primary" | "info" | "highlight" | "success" | "ink";

const HEADER_TONE: Record<SectionTone, string> = {
  plain: "bg-card",
  primary: "bg-primary text-primary-foreground",
  info: "bg-info-subtle",
  highlight: "bg-highlight-subtle",
  success: "bg-success-subtle",
  ink: "bg-secondary text-secondary-foreground",
};

/**
 * A titled block with a ruled header band. Use `index` ("01") for step-like sequences
 * and `tone` to colour-code the band. Keep at most one or two coloured bands per page.
 */
export function SectionCard({
  title,
  description,
  icon: Icon,
  index,
  tone = "plain",
  actions,
  children,
  className,
  contentClassName,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  index?: string;
  tone?: SectionTone;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        "border-2 border-border bg-card text-card-foreground shadow-[var(--shadow-brutal)]",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b-2 border-border px-4 py-3 sm:px-5",
          HEADER_TONE[tone],
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {index && (
            <span className="grid h-8 min-w-8 shrink-0 place-items-center bg-secondary px-1 font-mono text-xs font-bold text-secondary-foreground">
              {index}
            </span>
          )}
          {Icon && !index && <Icon className="size-5 shrink-0" strokeWidth={2.2} aria-hidden />}
          <div className="min-w-0">
            <h2 id={headingId} className="font-expanded text-base leading-tight">
              {title}
            </h2>
            {description && (
              <p
                className={cn(
                  "mt-0.5 text-xs leading-4",
                  tone === "plain" ? "text-muted-foreground" : "opacity-80",
                )}
              >
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className={cn("min-w-0 space-y-5 p-4 sm:p-5", contentClassName)}>{children}</div>
    </section>
  );
}
