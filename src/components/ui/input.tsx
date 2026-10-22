import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full border-2 border-input bg-card px-3 py-2 text-sm transition-[box-shadow,background-color] duration-150 file:mr-3 file:border-0 file:border-r-2 file:border-border file:bg-muted file:px-2 file:text-sm file:font-semibold file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:shadow-[var(--shadow-brutal-sm)] focus-visible:bg-card disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
