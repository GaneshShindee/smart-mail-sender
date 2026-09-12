import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, History, LayoutTemplate } from "lucide-react";
import logoAsset from "@/assets/logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Smart Email Sender — Send Gmail emails from templates" },
      { name: "description", content: "Connect Gmail once, pick a template, fill the blanks, and send personalized emails from your own inbox in seconds." },
      { property: "og:title", content: "Smart Email Sender" },
      { property: "og:description", content: "Send personalized template emails directly from your Gmail in seconds." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen orbit-mesh text-foreground">
      <header className="border-b border-border/50 glass-header">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
            <img src={logoAsset.url} alt="Logo" className="h-8 w-8 rounded-xl ring-1 ring-border/70" />
            Smart Email Sender
          </div>
          <Button asChild size="sm"><Link to="/auth">Sign in</Link></Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-20 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground mb-6">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Lightweight mail-merge for Gmail
          </div>
          <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-[1.08]">
            Smart Email Sender
          </h1>
          <p className="mt-5 text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto">
            Connect Gmail once. Build templates with dynamic placeholders. Preview, send, and track — all from a clean dashboard.
          </p>
          <div className="mt-8 flex justify-center">
            <Button asChild size="lg"><Link to="/auth">Get started — it's free</Link></Button>
          </div>
        </div>
        <div className="mt-20 grid gap-4 md:grid-cols-3">
          {[
            { icon: LayoutTemplate, title: "Reusable templates", desc: "Save subjects and bodies once. Use {{placeholders}} that get filled at send time." },
            { icon: Send, title: "Sends from your inbox", desc: "Emails go through your Gmail account, so replies land where they should." },
            { icon: History, title: "Full history", desc: "Every send is logged with status, recipient, and timestamp." },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border/80 bg-card p-5 shadow-[var(--shadow-soft)] transition-orbit hover:border-primary/25 hover:shadow-[var(--shadow-lift)]"
            >
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-4 w-4" strokeWidth={1.85} />
              </div>
              <h3 className="mt-3.5 text-base font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
