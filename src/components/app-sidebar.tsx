import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, LogOut } from "lucide-react";
import { NAV_GROUPS, NAV_ITEMS } from "@/lib/nav-items";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { BrandMark } from "@/components/app/brand-mark";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/**
 * The ink rail: numbered sections (01 Overview … 05 You), active page as a yellow tab.
 * Collapses to an icon rail on desktop and becomes a sheet on mobile.
 */
export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <div aria-hidden className="airmail h-2 w-full shrink-0" />
      <SidebarHeader className={cn("px-4 pb-2 pt-4", collapsed && "items-center px-2")}>
        <Link
          to="/dashboard"
          onClick={closeMobile}
          className="text-sidebar-foreground"
          aria-label="Smart Email Sender — dashboard"
        >
          <BrandMark size={collapsed ? "sm" : "md"} withWordmark={!collapsed} />
        </Link>
      </SidebarHeader>

      <SidebarContent className={cn("gap-0 px-3 pb-2", collapsed && "px-2")}>
        {NAV_GROUPS.map((group) => {
          const items = NAV_ITEMS.filter((i) => i.group === group.id);
          return (
            <SidebarGroup key={group.id} className="px-0 py-1.5">
              <SidebarGroupLabel className="h-7 gap-2 px-1 font-mono text-xs uppercase tracking-[0.14em] text-sidebar-foreground/55">
                <span className="text-sidebar-primary">{group.index}</span>
                <span>{group.label}</span>
                <span aria-hidden className="h-px flex-1 bg-sidebar-border" />
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {items.map((item) => {
                    const active =
                      pathname === item.url ||
                      pathname.startsWith(item.url + "/") ||
                      (item.url === "/history" && /^\/(campaigns|recipients)\//.test(pathname));
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton
                          asChild
                          tooltip={item.title}
                          isActive={active}
                          className="h-10 group-data-[collapsible=icon]:!size-11"
                        >
                          <Link to={item.url} onClick={closeMobile} aria-current={active ? "page" : undefined}>
                            <item.icon strokeWidth={active ? 2.4 : 2} aria-hidden />
                            <span>{item.title}</span>
                            {active && !collapsed && (
                              <ArrowUpRight className="ml-auto !size-4" strokeWidth={2.5} aria-hidden />
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className={cn("border-t-2 border-sidebar-border px-3 py-3", collapsed && "px-2")}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sign out"
              onClick={signOut}
              className="h-10 text-sidebar-foreground/75 hover:!border-destructive hover:!bg-destructive hover:!text-destructive-foreground group-data-[collapsible=icon]:!size-11"
            >
              <LogOut strokeWidth={2} aria-hidden />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
