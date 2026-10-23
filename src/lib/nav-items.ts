import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  UserRound,
  Briefcase,
  LayoutTemplate,
  FileText,
  Wand2,
  Send,
  History,
  Inbox,
  Mail,
  PhoneCall,
  Bell,
  BarChart3,
  Settings,
} from "lucide-react";

export type NavGroupId = "overview" | "outreach" | "library" | "you";

export type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  description: string;
  group: NavGroupId;
};

/** Sidebar sections, in display order. `index` is the mono section number shown in the rail. */
export const NAV_GROUPS: Array<{ id: NavGroupId; index: string; label: string }> = [
  { id: "overview", index: "01", label: "Overview" },
  { id: "outreach", index: "02", label: "Outreach" },
  { id: "library", index: "03", label: "Library" },
  { id: "you", index: "04", label: "You" },
];

export const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, description: "Overview of your sending activity", group: "overview" },
  { title: "Jobs", url: "/jobs", icon: Briefcase, description: "Community jobs board", group: "overview" },
  { title: "Notifications", url: "/notifications", icon: Bell, description: "Opens, replies and alerts", group: "overview" },
  { title: "Send Email", url: "/send", icon: Send, description: "Compose and send a campaign", group: "outreach" },
  { title: "History", url: "/history", icon: History, description: "Every campaign you've sent", group: "outreach" },
  { title: "Replies", url: "/replies", icon: Inbox, description: "Incoming replies from recipients", group: "outreach" },
  { title: "Mailbox", url: "/mailbox", icon: Mail, description: "Latest Gmail inbox and sent mail", group: "outreach" },
  { title: "Call Follow-ups", url: "/calls", icon: PhoneCall, description: "Recruiter calls with deadlines", group: "outreach" },
  { title: "My Templates", url: "/templates", icon: LayoutTemplate, description: "Reusable email templates", group: "library" },
  { title: "Resumes", url: "/resumes", icon: FileText, description: "Your resume library", group: "library" },
  { title: "AI Resume Studio", url: "/resume-studio", icon: Wand2, description: "Generate tailored resumes with AI", group: "library" },
  { title: "Profile", url: "/profile", icon: UserRound, description: "Your name, contact details and links", group: "you" },
  { title: "Analytics", url: "/analytics", icon: BarChart3, description: "Sends, opens and trends over time", group: "you" },
  { title: "Settings", url: "/settings", icon: Settings, description: "Gmail accounts and preferences", group: "you" },
];

/** Nav item matching a pathname (exact or nested), used for titles and breadcrumbs. */
export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => pathname === i.url || pathname.startsWith(i.url + "/"));
}
