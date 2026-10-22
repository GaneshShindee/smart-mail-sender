import { forwardRef } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Icon-only button. `label` is required: it becomes the accessible name and the tooltip,
 * so icon buttons are never unlabeled. Needs a TooltipProvider ancestor (AppLayout's
 * SidebarProvider supplies one for every authenticated page).
 */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "size" | "aria-label"> & { label: string; size?: "sm" | "default" }
>(({ label, size = "default", variant = "ghost", className, children, ...props }, ref) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        ref={ref}
        type="button"
        size="icon"
        variant={variant}
        aria-label={label}
        className={cn(size === "sm" && "size-8", className)}
        {...props}
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
));
IconButton.displayName = "IconButton";
