import { cn } from "@/lib/utils";

/**
 * The brand: a perforated postage stamp with an "SE" monogram, plus an optional wordmark.
 * Pure CSS — no image asset needed, so it renders everywhere (including local dev).
 */
export function BrandMark({
  size = "md",
  withWordmark = true,
  className,
  wordmarkClassName,
}: {
  size?: "sm" | "md" | "lg";
  withWordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
}) {
  const box = size === "lg" ? "size-14 text-xl" : size === "sm" ? "size-9 text-sm" : "size-11 text-base";
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <span
        aria-hidden
        className={cn(
          "perforated grid shrink-0 place-items-center bg-primary p-1 text-primary-foreground",
          box,
        )}
      >
        <span className="grid size-full place-items-center border-2 border-current font-expanded leading-none">
          SE
        </span>
      </span>
      {withWordmark && (
        <span className={cn("min-w-0 leading-none", wordmarkClassName)}>
          <span className="block font-expanded text-[0.95rem] uppercase tracking-tight">
            Smart Email
          </span>
          <span className="mt-1 block font-mono text-xs uppercase tracking-[0.2em] opacity-70">
            Sender ✦ Post
          </span>
        </span>
      )}
      <span className="sr-only">Smart Email Sender</span>
    </span>
  );
}
