import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Moon, PenLine, Sun } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { IconButton } from "@/components/app/icon-button";
import { NAV_GROUPS, findNavItem } from "@/lib/nav-items";
import { useTheme } from "@/hooks/use-theme";
import { useModEnterSubmit } from "@/hooks/use-mod-enter-submit";

const DETAIL_ROUTES = [
  { prefix: "/campaigns/", parent: "/history", label: "Campaign" },
  { prefix: "/recipients/", parent: "/history", label: "Recipient" },
];

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";
  return (
    <IconButton
      label={dark ? "Switch to paper (light) theme" : "Switch to night shift (dark) theme"}
      variant="outline"
      onClick={toggleTheme}
    >
      {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </IconButton>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  // Detail routes that live outside the nav belong under History in the breadcrumb.
  const alias = DETAIL_ROUTES.find((d) => pathname.startsWith(d.prefix));
  const item = alias ? findNavItem(alias.parent) : findNavItem(pathname);
  const group = item ? NAV_GROUPS.find((g) => g.id === item.group) : undefined;
  const nested = item && pathname !== item.url;
  const detailLabel = alias?.label ?? "Detail";
  useModEnterSubmit();

  return (
    <SidebarProvider>
      <div className="flex min-h-svh w-full max-w-[100vw] overflow-x-clip orbit-mesh text-foreground">
        <a
          href="#main"
          className="sr-only z-50 border-2 border-border bg-primary px-3 py-2 font-semibold focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to content
        </a>
        <AppSidebar />
        <div className="flex min-w-0 max-w-full flex-1 flex-col">
          <header className="safe-top sticky top-0 z-20 flex h-16 items-center gap-3 border-b-2 border-border bg-background px-3 sm:px-5 md:px-6">
            <SidebarTrigger
              className="size-10 shrink-0 border-2 border-border bg-card hover:bg-accent"
              aria-label="Toggle navigation"
            />
            <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
              <ol className="flex min-w-0 items-center gap-2 font-mono text-xs uppercase tracking-[0.12em]">
                {group && (
                  <li className="hidden shrink-0 items-center gap-2 text-muted-foreground sm:flex">
                    <span className="bg-secondary px-1.5 py-0.5 text-secondary-foreground">{group.index}</span>
                    <span>{group.label}</span>
                    <span aria-hidden>/</span>
                  </li>
                )}
                <li className="min-w-0 truncate font-semibold">
                  {nested ? (
                    <Link to={item.url} className="underline decoration-2 underline-offset-4 hover:bg-accent">
                      {item.title}
                    </Link>
                  ) : (
                    <span aria-current="page">{item?.title ?? "Smart Email Sender"}</span>
                  )}
                </li>
                {nested && (
                  <li className="hidden shrink-0 items-center gap-2 text-muted-foreground sm:flex" aria-current="page">
                    <span aria-hidden>/</span>
                    <span>{detailLabel}</span>
                  </li>
                )}
              </ol>
            </nav>
            <div className="flex shrink-0 items-center gap-2">
              {!pathname.startsWith("/send") && (
                <Button asChild className="hidden md:inline-flex">
                  <Link to="/send">
                    <PenLine aria-hidden /> Compose
                  </Link>
                </Button>
              )}
              <ThemeToggle />
            </div>
          </header>
          <main
            id="main"
            className="w-full min-w-0 flex-1 p-4 pb-28 sm:p-6 md:p-8 md:pb-10 lg:p-10"
          >
            {children}
          </main>
        </div>
        <MobileBottomNav />
      </div>
    </SidebarProvider>
  );
}
