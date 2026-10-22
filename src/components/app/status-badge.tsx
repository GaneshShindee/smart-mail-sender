import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  Check,
  CircleDashed,
  Eye,
  Flame,
  Reply,
  Send,
  X,
} from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Variant = NonNullable<BadgeProps["variant"]>;

/**
 * Every status string used across campaigns, recipients and follow-ups, mapped to one
 * consistent stamp. Icon + text — never colour alone.
 */
const STATUS: Record<string, { label: string; variant: Variant; icon: LucideIcon }> = {
  sent: { label: "Sent", variant: "success", icon: Check },
  delivered: { label: "Delivered", variant: "success", icon: Check },
  opened: { label: "Opened", variant: "info", icon: Eye },
  replied: { label: "Replied", variant: "highlight", icon: Reply },
  hot: { label: "Hot", variant: "warning", icon: Flame },
  pending: { label: "Pending", variant: "warning", icon: CircleDashed },
  queued: { label: "Queued", variant: "warning", icon: CircleDashed },
  sending: { label: "Sending", variant: "info", icon: Send },
  approved: { label: "Scheduled", variant: "info", icon: CalendarClock },
  scheduled: { label: "Scheduled", variant: "info", icon: CalendarClock },
  partial: { label: "Partial", variant: "warning", icon: AlertTriangle },
  failed: { label: "Failed", variant: "danger", icon: X },
  bounced: { label: "Bounced", variant: "danger", icon: X },
  error: { label: "Error", variant: "danger", icon: X },
  rejected: { label: "Rejected", variant: "muted", icon: Ban },
  canceled: { label: "Canceled", variant: "muted", icon: Ban },
  cancelled: { label: "Canceled", variant: "muted", icon: Ban },
  skipped: { label: "Skipped", variant: "muted", icon: Ban },
  draft: { label: "Draft", variant: "muted", icon: CircleDashed },
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  /** Override the display text while keeping the status styling. */
  label?: string;
  className?: string;
}) {
  const key = status.toLowerCase();
  const s = STATUS[key];
  if (!s) {
    return (
      <Badge variant="outline" className={className}>
        {label ?? status.replace(/_/g, " ")}
      </Badge>
    );
  }
  const Icon = s.icon;
  return (
    <Badge variant={s.variant} className={cn(className)}>
      <Icon aria-hidden strokeWidth={2.6} />
      {label ?? s.label}
    </Badge>
  );
}
