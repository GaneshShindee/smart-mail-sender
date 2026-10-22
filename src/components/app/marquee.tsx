import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A scrolling ticker band (decorative). Content is duplicated for a seamless loop and
 * hidden from assistive tech; pass `label` for the accessible text. Stops under reduced motion.
 */
export function Marquee({
  items,
  label,
  className,
}: {
  items: ReactNode[];
  label: string;
  className?: string;
}) {
  const row = (
    <div className="flex shrink-0 items-center">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-6 px-6">
          {item}
          <span aria-hidden>✦</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className={cn("overflow-hidden border-y-2 border-border", className)}>
      <span className="sr-only">{label}</span>
      <div aria-hidden className="marquee-track flex w-max py-2.5 font-mono text-sm font-semibold uppercase tracking-[0.12em]">
        {row}
        {row}
      </div>
    </div>
  );
}
