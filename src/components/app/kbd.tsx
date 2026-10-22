import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Keyboard key hint, e.g. <Kbd>⌘</Kbd><Kbd>↵</Kbd>. Pair with `useModKey()` for the modifier. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center border-2 border-b-[3px] border-border bg-card px-1 font-mono text-xs font-semibold text-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
