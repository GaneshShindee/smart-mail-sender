import type { ErrorComponentProps } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmProvider } from "@/components/app/confirm-dialog";
import { THEME_INIT_SCRIPT } from "@/hooks/use-theme";
import { AlertTriangle, ArrowLeft, RotateCw } from "lucide-react";

function NotFoundComponent() {
  return (
    <main className="orbit-mesh flex min-h-screen flex-col">
      <div aria-hidden className="airmail h-2" />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 py-16">
        <p className="eyebrow">Error 404 · Return to sender</p>
        <h1 className="display-xl mt-4">
          Address
          <br />
          unknown.
        </h1>
        <div className="mt-8 grid gap-6 border-t-2 border-border pt-6 sm:grid-cols-[1fr_auto] sm:items-end">
          <p className="max-w-md text-base text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or has been moved. Check the address,
            or head back to somewhere familiar.
          </p>
          <Link to="/" className={buttonVariants({ size: "lg" })}>
            <ArrowLeft aria-hidden /> Go home
          </Link>
        </div>
      </div>
    </main>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <main className="orbit-mesh flex min-h-screen items-center justify-center px-4">
      <div role="alert" className="w-full max-w-lg border-2 border-border bg-card shadow-[var(--shadow-brutal-lg)]">
        <div className="flex items-center gap-2 border-b-2 border-border bg-destructive px-5 py-3 text-destructive-foreground">
          <AlertTriangle className="size-4" aria-hidden />
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.12em]">
            Delivery failed
          </span>
        </div>
        <div className="p-6">
          <h1 className="font-expanded text-2xl leading-tight">This page didn&apos;t load</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Something went wrong on our end. You can try again or head back home.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              onClick={() => {
                router.invalidate();
                reset();
              }}
            >
              <RotateCw aria-hidden /> Try again
            </Button>
            <Button asChild variant="outline">
              <a href="/">Go home</a>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Smart Email Sender" },
      { name: "description", content: "Smart Email Sender is a SaaS web app for sending personalized emails directly from your Gmail." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Smart Email Sender" },
      { property: "og:description", content: "Smart Email Sender is a SaaS web app for sending personalized emails directly from your Gmail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Smart Email Sender" },
      { name: "twitter:description", content: "Smart Email Sender is a SaaS web app for sending personalized emails directly from your Gmail." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/y4RpFYolNdSKudqN40lYoIFWvKA3/social-images/social-1782564396698-e442d0e3-12a3-4c31-bcba-37361f4ceafd.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/y4RpFYolNdSKudqN40lYoIFWvKA3/social-images/social-1782564396698-e442d0e3-12a3-4c31-bcba-37361f4ceafd.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=JetBrains+Mono:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint (light "paper" is the default). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <Outlet />
      </ConfirmProvider>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
