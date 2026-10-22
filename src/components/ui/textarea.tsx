import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-20 w-full border-2 border-input bg-card px-3 py-2.5 text-sm transition-[box-shadow,background-color] duration-150 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:shadow-[var(--shadow-brutal-sm)] focus-visible:bg-card disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
