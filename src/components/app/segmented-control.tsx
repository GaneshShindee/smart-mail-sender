import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SegmentOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
  /** Optional count shown as a small mono tab. */
  count?: number;
};

/**
 * Single-choice segmented control (filters, modes, status tabs). Keyboard + aria handled
 * by Radix ToggleGroup. Scrolls horizontally on narrow screens instead of wrapping.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  size = "default",
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentOption<T>[];
  ariaLabel: string;
  size?: "sm" | "default";
  className?: string;
}) {
  return (
    <div className={cn("max-w-full overflow-x-auto pb-1", className)}>
      <ToggleGroupPrimitive.Root
        type="single"
        value={value}
        onValueChange={(v) => v && onValueChange(v as T)}
        aria-label={ariaLabel}
        className="inline-flex border-2 border-border bg-card shadow-[var(--shadow-brutal-sm)] [&>*+*]:border-l-2 [&>*+*]:border-border"
      >
        {options.map((o) => (
          <ToggleGroupPrimitive.Item
            key={o.value}
            value={o.value}
            className={cn(
              "group inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap px-3 font-semibold transition-colors hover:bg-accent data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground focus-visible:outline-offset-[-3px]",
              size === "sm" ? "h-8 text-xs" : "h-10 text-sm",
            )}
          >
            {o.icon && <o.icon className="size-4" strokeWidth={2.2} aria-hidden />}
            {o.label}
            {o.count !== undefined && (
              <span className="bg-muted px-1 font-mono text-xs text-muted-foreground group-data-[state=on]:bg-primary group-data-[state=on]:text-primary-foreground">
                {o.count}
              </span>
            )}
          </ToggleGroupPrimitive.Item>
        ))}
      </ToggleGroupPrimitive.Root>
    </div>
  );
}
