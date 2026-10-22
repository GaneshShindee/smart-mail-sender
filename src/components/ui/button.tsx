import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold cursor-pointer select-none disabled:pointer-events-none disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Postage yellow + ink: the one primary action on a surface.
        default:
          "brutal-press border-2 border-border bg-primary text-primary-foreground shadow-[var(--shadow-brutal-sm)]",
        destructive:
          "brutal-press border-2 border-border bg-destructive text-destructive-foreground shadow-[var(--shadow-brutal-sm)]",
        outline:
          "brutal-press border-2 border-border bg-card text-foreground shadow-[var(--shadow-brutal-sm)] hover:bg-accent",
        // Inverted ink block.
        secondary:
          "brutal-press border-2 border-border bg-secondary text-secondary-foreground shadow-[var(--shadow-brutal-sm)]",
        ghost:
          "border-2 border-transparent transition-colors hover:border-border hover:bg-accent hover:text-accent-foreground",
        link: "text-foreground underline decoration-2 underline-offset-4 hover:decoration-primary hover:bg-accent",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 px-3",
        lg: "h-12 px-6 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
