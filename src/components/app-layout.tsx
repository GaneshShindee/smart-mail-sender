import type { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full orbit-mesh text-foreground">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-2.5 border-b border-border/50 px-4 md:px-5 sticky top-0 glass-header z-10">
            <SidebarTrigger className="size-9 rounded-lg" />
            <div className="h-4 w-px bg-border/80" />
            <div className="text-sm font-medium text-muted-foreground truncate">Smart Email Sender</div>
          </header>
          <main className="flex-1 p-5 md:p-7 lg:p-8">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
