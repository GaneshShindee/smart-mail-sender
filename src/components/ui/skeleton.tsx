import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "hazard border-2 border-border/15",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
