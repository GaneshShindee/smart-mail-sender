import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 border-[1.5px] border-border px-1.5 py-0.5 font-mono text-xs font-medium uppercase leading-4 tracking-wide whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        outline: "bg-transparent text-foreground",
        // Status tones — solid pastel surface + ink text (AA on every surface).
        success: "bg-success-subtle text-foreground",
        warning: "bg-warning-subtle text-foreground",
        info: "bg-info-subtle text-foreground",
        danger: "bg-destructive-subtle text-foreground",
        highlight: "bg-highlight-subtle text-foreground",
        muted: "border-border/40 bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
