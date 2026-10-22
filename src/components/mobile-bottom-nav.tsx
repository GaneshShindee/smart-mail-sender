import { Link, useRouterState } from "@tanstack/react-router";
import { Briefcase, FileText, History, LayoutDashboard, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const leftTabs = [
  { url: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { url: "/jobs", icon: Briefcase, label: "Jobs" },
] as const;

const rightTabs = [
  { url: "/history", icon: History, label: "History" },
  { url: "/resumes", icon: FileText, label: "Resumes" },
] as const;

/** URLs already reachable from the mobile bottom nav — used to avoid duplicating them elsewhere. */
export const BOTTOM_NAV_URLS = [...leftTabs, ...rightTabs, { url: "/send" }].map((t) => t.url);

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY.current;
        if (y < 24) setHidden(false);
        else if (delta > 8) setHidden(true);
        else if (delta < -8) setHidden(false);
        lastY.current = y;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");
  const sendActive = isActive("/send");

  return (
    <nav
      aria-label="Quick navigation"
      className={cn(
        "safe-bottom fixed inset-x-0 bottom-0 z-40 border-t-2 border-border bg-background transition-transform duration-300 ease-out md:hidden",
        hidden ? "translate-y-full" : "translate-y-0",
      )}
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pb-2 pt-1.5">
        {leftTabs.map((t) => (
          <TabLink key={t.url} {...t} active={isActive(t.url)} />
        ))}

        <Link
          to="/send"
          aria-label="Send email"
          aria-current={sendActive ? "page" : undefined}
          className="-mt-6 flex flex-col items-center gap-1"
        >
          <span
            className={cn(
              "brutal-press grid size-14 place-items-center border-2 border-border bg-primary text-primary-foreground shadow-[var(--shadow-brutal)]",
              sendActive && "bg-secondary text-secondary-foreground",
            )}
          >
            <Send className="size-6" strokeWidth={2.4} aria-hidden />
          </span>
          <span className="font-mono text-xs font-semibold uppercase tracking-wider">Send</span>
        </Link>

        {rightTabs.map((t) => (
          <TabLink key={t.url} {...t} active={isActive(t.url)} />
        ))}
      </div>
    </nav>
  );
}

function TabLink({
  url,
  icon: Icon,
  label,
  active,
}: {
  url: string;
  icon: typeof Briefcase;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={url}
      aria-current={active ? "page" : undefined}
      className="flex flex-col items-center gap-1 py-1"
    >
      <span
        className={cn(
          "grid h-8 w-11 place-items-center border-2 transition-colors",
          active ? "border-border bg-primary text-primary-foreground" : "border-transparent text-muted-foreground",
        )}
      >
        <Icon className="size-5" strokeWidth={active ? 2.4 : 2} aria-hidden />
      </span>
      <span
        className={cn(
          "font-mono text-xs uppercase tracking-wider",
          active ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </Link>
  );
}
