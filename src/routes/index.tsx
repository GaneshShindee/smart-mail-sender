import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/app/brand-mark";
import { Marquee } from "@/components/app/marquee";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  Check,
  Eye,
  FileText,
  Inbox,
  LayoutTemplate,
  Link2,
  ListChecks,
  Mail,
  Minus,
  Plus,
  Reply,
  Send,
  Sparkles,
  Wand2,
} from "lucide-react";

import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  loader: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      return redirect({ to: "/dashboard" });
    }
    return null;
  },
  head: () => ({
    meta: [
      { title: "Smart Email Sender — Send Gmail emails from templates" },
      {
        name: "description",
        content:
          "Connect Gmail once, pick a template, fill the blanks, and send personalized emails from your own inbox in seconds.",
      },
      { property: "og:title", content: "Smart Email Sender" },
      {
        property: "og:description",
        content: "Send personalized template emails directly from your Gmail in seconds.",
      },
    ],
  }),
  component: Index,
});

/* ── Content ─────────────────────────────────────────────────────────── */

const faqs = [
  {
    q: "Do emails send from my own Gmail?",
    a: "Yes. You connect Gmail once with send permission. Messages leave your inbox, so replies come straight back to you.",
  },
  {
    q: "What are placeholders?",
    a: "Tokens like {{name}} and {{company}} in your subject or body. At send time we fill them per recipient so every email feels personal.",
  },
  {
    q: "Can I track opens and resume views?",
    a: "Open tracking and PDF view signals are built in. Filter campaigns by who opened, replied, or still needs a follow-up.",
  },
  {
    q: "Is there a resume / AI studio?",
    a: "Yes. Upload a master resume, tailor versions to job descriptions, and attach the right PDF when you send.",
  },
];

const capabilities = [
  "Template variables {{name}}",
  "Send from your own Gmail",
  "Open tracking",
  "Resume PDF view signals",
  "AI reply drafts",
  "7-day follow-up tracker",
  "AI Resume Studio",
  "Full send history",
  "7 / 30 / 90-day analytics",
];

const route = [
  { n: "01", icon: Link2, title: "Connect Gmail", desc: "Grant send access once. Tokens refresh in the background." },
  { n: "02", icon: LayoutTemplate, title: "Write a template", desc: "Once, with {{placeholders}} for names, roles and companies." },
  { n: "03", icon: Send, title: "Post the batch", desc: "Attach the right resume and send from your own inbox." },
  { n: "04", icon: Eye, title: "Track & follow up", desc: "See opens and resume views; nudge the warm ones." },
];

/** A sheet of postage stamps — each one a feature. Colour + tilt vary on purpose. */
const stamps = [
  { icon: LayoutTemplate, title: "Templates", desc: "Subjects and bodies with {{placeholders}}, filled per recipient.", value: "1st", tone: "bg-primary text-primary-foreground", tilt: "-rotate-2" },
  { icon: Mail, title: "Your Gmail", desc: "Sent from your inbox, so replies land in your threads.", value: "Air", tone: "bg-info-subtle", tilt: "rotate-1" },
  { icon: Eye, title: "Open tracking", desc: "First and last seen, open counts, device and location.", value: "2nd", tone: "bg-highlight-subtle", tilt: "-rotate-1" },
  { icon: FileText, title: "Resume views", desc: "Know when a recruiter actually opens your PDF.", value: "PDF", tone: "bg-success-subtle", tilt: "rotate-2" },
  { icon: Wand2, title: "Resume Studio", desc: "Tailor your master .tex resume to each job description.", value: "AI", tone: "bg-secondary text-secondary-foreground", tilt: "rotate-1" },
  { icon: Inbox, title: "Reply center", desc: "Every reply matched to its campaign, with AI drafts.", value: "Re:", tone: "bg-warning-subtle", tilt: "-rotate-2" },
  { icon: ListChecks, title: "Follow-ups", desc: "A 7-day tracker per campaign so nobody slips.", value: "D+7", tone: "bg-card", tilt: "rotate-2" },
  { icon: BarChart3, title: "Analytics", desc: "Sends, open rate and top templates over 7, 30 or 90 days.", value: "%", tone: "bg-destructive-subtle", tilt: "-rotate-1" },
];

/** Example only — shown as a specimen tracking slip, clearly labelled. */
const trackingEvents = [
  { time: "09:02", icon: Send, label: "Posted from your Gmail", note: "to priya@northwind.example" },
  { time: "11:47", icon: Eye, label: "Opened", note: "Chrome · macOS · Bengaluru" },
  { time: "14:10", icon: FileText, label: "Resume viewed ×3", note: "Priya_Resume_Northwind.pdf" },
  { time: "16:35", icon: Reply, label: "Reply received", note: "“Free for a quick call Thursday?”" },
];

const companies = ["Northwind", "Acme Labs", "Globex"];
const roles = ["Product Designer", "Backend Engineer", "Data Analyst"];

const navLinks = [
  { href: "#try", label: "Try it" },
  { href: "#route", label: "How it works" },
  { href: "#stamps", label: "Features" },
  { href: "#mailbag", label: "FAQ" },
];

/** Stagger helper for scroll-reveal children. */
const revealDelay = (i: number, step = 80): CSSProperties =>
  ({ "--reveal-delay": `${i * step}ms` }) as CSSProperties;

/* ── Pieces ──────────────────────────────────────────────────────────── */

/** Section label: a mono index tab sitting on a thick rule. */
function SectionTab({ index, label, id, title }: { index: string; label: string; id: string; title: string }) {
  return (
    <div className="reveal mb-10 md:mb-14">
      <div className="flex items-end gap-3 border-b-2 border-border">
        <span className="bg-secondary px-2.5 py-1 font-mono text-xs font-semibold text-secondary-foreground">
          {index}
        </span>
        <span className="pb-1 font-mono text-xs font-semibold uppercase tracking-[0.14em]">{label}</span>
      </div>
      <h2 id={id} className="mt-5 max-w-3xl font-expanded text-3xl leading-[0.95] sm:text-5xl">
        {title}
      </h2>
    </div>
  );
}

/** Postmark: circular cancellation with date + wavy lines. Decorative. */
function Postmark({ className }: { className?: string }) {
  const today = new Date();
  const date = today.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  return (
    <div aria-hidden className={cn("pointer-events-none flex items-center", className)}>
      <div className="grid size-24 -rotate-12 place-items-center rounded-full border-2 border-border/70 text-center font-mono text-xs uppercase leading-tight text-foreground/70 sm:size-28">
        <div>
          <div className="tracking-[0.2em]">Par avion</div>
          <div className="my-1 border-y border-border/50 py-0.5 font-semibold">{date}</div>
          <div className="tracking-[0.2em]">Gmail</div>
        </div>
      </div>
      <svg viewBox="0 0 120 60" className="-ml-3 h-14 w-28 text-foreground/60 sm:h-16 sm:w-32" fill="none">
        {[10, 22, 34, 46].map((y) => (
          <path
            key={y}
            d={`M0 ${y} q 7.5 -6 15 0 t 15 0 t 15 0 t 15 0 t 15 0 t 15 0 t 15 0 t 15 0`}
            stroke="currentColor"
            strokeWidth="2"
          />
        ))}
      </svg>
    </div>
  );
}

/** A merge field: shows the filled value (flips in on change) or the raw {{token}} when empty. */
function Slot({ token, value }: { token: string; value: string }) {
  return value.trim() ? (
    <mark
      key={value}
      className="merge-flip inline-block bg-primary px-1 font-semibold text-primary-foreground"
      title={token}
    >
      {value}
    </mark>
  ) : (
    <span className="border-[1.5px] border-dashed border-border px-1 font-mono text-sm text-muted-foreground">
      {token}
    </span>
  );
}

/** Live mail-merge demo — purely client-side, no account needed. */
function MergeDemo() {
  const [name, setName] = useState("Priya");
  const [company, setCompany] = useState(companies[0]);
  const [role, setRole] = useState(roles[0]);

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
      {/* Controls */}
      <div className="reveal space-y-6 lg:col-span-5">
        <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
          One template, any number of recipients. Change the details and watch the letter rewrite
          itself — that&apos;s exactly what happens for every person in your batch.
        </p>
        <div className="space-y-2">
          <Label htmlFor="demo-name"><span className="normal-case">{"{{name}}"}</span> · recipient</Label>
          <Input
            id="demo-name"
            value={name}
            maxLength={28}
            onChange={(e) => setName(e.target.value)}
            placeholder="Type a name…"
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="font-mono text-xs font-semibold tracking-[0.08em]">{"{{company}}"}</legend>
          <div className="flex flex-wrap gap-2">
            {companies.map((c) => (
              <Button
                key={c}
                type="button"
                size="sm"
                variant={company === c ? "secondary" : "outline"}
                aria-pressed={company === c}
                onClick={() => setCompany(c)}
              >
                {c}
              </Button>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="font-mono text-xs font-semibold tracking-[0.08em]">{"{{role}}"}</legend>
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <Button
                key={r}
                type="button"
                size="sm"
                variant={role === r ? "secondary" : "outline"}
                aria-pressed={role === r}
                onClick={() => setRole(r)}
              >
                {r}
              </Button>
            ))}
          </div>
        </fieldset>
      </div>

      {/* The letter */}
      <div className="reveal lg:col-span-7" style={revealDelay(1, 150)}>
        <article
          aria-live="polite"
          aria-label="Merged email preview"
          className="relative border-2 border-border bg-card shadow-[var(--shadow-brutal-lg)]"
        >
          <div className="flex items-center justify-between gap-3 border-b-2 border-border bg-secondary px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] text-secondary-foreground">
            <span>Merged · ready to post</span>
            <span className="flex gap-1.5" aria-hidden>
              <span className="size-2.5 bg-destructive" />
              <span className="size-2.5 bg-primary" />
              <span className="size-2.5 bg-info" />
            </span>
          </div>
          <dl className="space-y-1 border-b-2 border-dashed border-border/50 px-5 py-3 font-mono text-xs">
            <div className="flex gap-3">
              <dt className="w-16 uppercase text-muted-foreground">To</dt>
              <dd className="min-w-0 truncate">
                {(name.trim() || "name").toLowerCase().replace(/\s+/g, ".")}@{company.toLowerCase().replace(/\s+/g, "")}.example
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-16 uppercase text-muted-foreground">Subject</dt>
              <dd className="min-w-0">
                Quick intro — <Slot token="{{role}}" value={role} /> at <Slot token="{{company}}" value={company} />
              </dd>
            </div>
          </dl>
          <div
            className="space-y-4 px-5 py-6 text-base leading-[1.9]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, transparent 0 calc(1.9em - 1px), color-mix(in oklab, var(--foreground) 10%, transparent) calc(1.9em - 1px) 1.9em)",
            }}
          >
            <p>
              Hi <Slot token="{{name}}" value={name} />,
            </p>
            <p>
              I noticed <Slot token="{{company}}" value={company} /> is hiring a{" "}
              <Slot token="{{role}}" value={role} />. I&apos;ve attached a resume tailored to the role —
              happy to chat if it&apos;s useful.
            </p>
            <p>— Sent from your Gmail</p>
          </div>
          <span
            aria-hidden
            className="perforated absolute -right-4 -top-5 grid size-16 rotate-6 place-items-center bg-primary p-1.5 text-primary-foreground"
          >
            <span className="grid size-full place-items-center border-2 border-current font-mono text-xs font-bold uppercase">
              Live
            </span>
          </span>
        </article>
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────── */

function Index() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const navigate = useNavigate();

  // Signed-in visitors go straight to the app. The loader can't see the session during SSR
  // (it lives in browser storage), so check again on the client.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) navigate({ to: "/dashboard", replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Scroll reveal for everything marked `.reveal`.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("js-reveal");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      root.classList.remove("js-reveal");
    };
  }, []);

  return (
    <div className="overflow-x-hidden bg-background text-foreground md:min-h-screen">
      <div aria-hidden className="airmail airmail-animated h-2" />
      <header className="sticky top-0 z-30 border-b-2 border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="shrink-0" aria-label="Smart Email Sender home">
            <BrandMark size="sm" wordmarkClassName="hidden sm:block" />
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="px-3 py-2 font-mono text-xs font-semibold uppercase tracking-[0.08em] decoration-2 underline-offset-4 transition-colors hover:bg-accent hover:underline"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero: the page is an envelope ─────────────────────────── */}
        <section aria-labelledby="hero-title" className="orbit-mesh relative overflow-hidden px-3 py-8 sm:px-6 md:py-14">
          <span
            aria-hidden
            className="plane-fly pointer-events-none absolute left-0 top-[12%] z-0 hidden size-11 place-items-center border-2 border-border bg-primary text-primary-foreground shadow-[var(--shadow-brutal-sm)] md:grid"
          >
            <Send className="size-5" strokeWidth={2.4} />
          </span>

          <div className="landing-rise relative z-10 mx-auto max-w-6xl">
            <div className="airmail airmail-animated p-2.5 shadow-[var(--shadow-brutal-lg)] sm:p-4">
              <div className="relative overflow-hidden border-2 border-border bg-card">
                {/* Envelope flap fold lines */}
                <svg
                  aria-hidden
                  viewBox="0 0 100 40"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-x-0 top-0 h-28 w-full text-border/25 sm:h-40"
                  fill="none"
                >
                  <polyline points="0,0 50,38 100,0" stroke="currentColor" strokeWidth="0.5" strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" />
                </svg>

                <div className="relative grid gap-8 p-5 sm:p-8 md:p-10 lg:grid-cols-12">
                  {/* Return address */}
                  <div className="font-mono text-xs uppercase leading-relaxed tracking-[0.1em] lg:col-span-6">
                    <p className="font-semibold">From: Smart Email Sender</p>
                    <p className="text-muted-foreground">c/o your Gmail outbox</p>
                    <p className="text-muted-foreground">Mail-merge · Tracking · Resumes</p>
                    <span className="stamp stamp-thunk mt-4 inline-block px-2 py-0.5 text-destructive">
                      Priority · Airmail
                    </span>
                  </div>

                  {/* Stamp + postmark */}
                  <div className="flex items-start justify-end gap-2 lg:col-span-6">
                    <Postmark className="mt-6 hidden sm:flex" />
                    <div className="perforated rotate-3 bg-primary p-2 text-primary-foreground shadow-[var(--shadow-brutal)] transition-transform duration-300 hover:rotate-0">
                      <div className="grid h-36 w-28 grid-rows-[auto_1fr_auto] border-2 border-current p-2 sm:h-44 sm:w-36">
                        <span className="font-mono text-xs font-bold uppercase">1st class</span>
                        <span className="grid place-items-center font-expanded text-5xl leading-none sm:text-6xl">SE</span>
                        <span className="flex items-end justify-between font-mono text-xs font-bold uppercase">
                          <span>Gmail</span>
                          <span>₹0</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Delivery address = headline */}
                  <div className="lg:col-span-9 lg:col-start-3">
                    <p className="eyebrow mb-3 text-foreground">Deliver to → every inbox you&apos;re writing to</p>
                    <h1 id="hero-title" className="display-xl">
                      <span className="landing-rise block border-b-2 border-dashed border-border/40 pb-2">Write once.</span>
                      <span className="landing-rise landing-rise-delay-1 block border-b-2 border-dashed border-border/40 py-2">
                        Send from
                      </span>
                      <span className="block pt-3">
                        <span className="wipe-in inline-block -rotate-1 border-2 border-border bg-primary px-3 pb-2 pt-1 text-primary-foreground shadow-[var(--shadow-brutal)]">
                          your Gmail.
                        </span>
                      </span>
                    </h1>
                    <p className="mt-8 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                      Personalised job-application emails from your own inbox — templates with
                      placeholders, tailored resumes, and tracking that tells you who opened.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center gap-3">
                      <Button asChild size="lg">
                        <Link to="/auth">
                          Post your first letter <ArrowRight className="nudge-x" aria-hidden />
                        </Link>
                      </Button>
                      <Button asChild size="lg" variant="outline">
                        <a href="#try">
                          Try the mail-merge <ArrowDown aria-hidden />
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Barcode strip */}
                <div className="flex items-center justify-between gap-4 border-t-2 border-border px-5 py-3 sm:px-8">
                  <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    SES-2026 · Free to start
                  </span>
                  <span
                    aria-hidden
                    className="h-8 w-40 sm:w-56"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(90deg, var(--foreground) 0 2px, transparent 2px 4px, var(--foreground) 4px 5px, transparent 5px 9px, var(--foreground) 9px 12px, transparent 12px 14px)",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <Marquee
          items={capabilities}
          label={`Capabilities: ${capabilities.join(", ")}`}
          className="bg-secondary text-secondary-foreground"
        />

        {/* ── 01 Try it: live merge ─────────────────────────────────── */}
        <section id="try" aria-labelledby="try-title" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 md:py-24">
          <SectionTab index="01" label="Try it — no account needed" id="try-title" title="Watch a template become a letter." />
          <MergeDemo />
        </section>

        {/* ── 02 The route ──────────────────────────────────────────── */}
        <section id="route" aria-labelledby="route-title" className="scroll-mt-24 border-y-2 border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
            <SectionTab index="02" label="How it works" id="route-title" title="Four stops on the route." />

            <div className="relative">
              {/* The line + the envelope travelling along it (desktop) */}
              <div aria-hidden className="absolute inset-x-0 top-9 hidden border-t-[3px] border-dashed border-border md:block">
                <span className="route-travel absolute -top-[19px] grid size-9 place-items-center border-2 border-border bg-primary text-primary-foreground shadow-[var(--shadow-brutal-sm)]">
                  <Mail className="size-4" strokeWidth={2.4} />
                </span>
              </div>
              <ol className="relative grid gap-8 md:grid-cols-4 md:gap-6">
                {route.map((s, i) => (
                  <li key={s.n} className="reveal group relative flex gap-4 md:block" style={revealDelay(i, 120)}>
                    <span className="relative z-10 grid size-[4.5rem] shrink-0 place-items-center border-2 border-border bg-background shadow-[var(--shadow-brutal)] transition-transform duration-200 group-hover:-translate-y-1 group-hover:-rotate-6">
                      <s.icon className="size-7" strokeWidth={2} aria-hidden />
                    </span>
                    <div className="md:mt-6">
                      <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Stop {s.n}
                      </p>
                      <h3 className="mt-1 font-expanded text-xl leading-tight">{s.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ── 03 Tracking slip ──────────────────────────────────────── */}
        <section aria-labelledby="track-title" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <SectionTab index="03" label="Tracking" id="track-title" title="Know exactly where your letter is." />
          <div className="grid items-start gap-10 lg:grid-cols-12">
            <div className="reveal relative lg:col-span-5">
              <div className="relative mx-auto max-w-sm rotate-1 border-2 border-border bg-card p-5 font-mono text-sm shadow-[var(--shadow-brutal-lg)] transition-transform duration-300 hover:rotate-0">
                <div className="flex items-start justify-between border-b-2 border-dashed border-border pb-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Tracking slip</p>
                    <p className="mt-1 font-semibold">№ SES-00128</p>
                  </div>
                  <span className="stamp px-1.5 py-0.5 text-xs text-info">Example</span>
                </div>
                <ol className="relative mt-4 space-y-4 border-l-2 border-border pl-5">
                  {trackingEvents.map((e, i) => (
                    <li key={e.label} className="reveal relative" style={revealDelay(i + 1, 180)}>
                      <span className="absolute -left-[31px] top-0 grid size-5 place-items-center border-2 border-border bg-primary text-primary-foreground">
                        <e.icon className="size-3" strokeWidth={2.6} aria-hidden />
                      </span>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold">{e.label}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{e.time}</span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{e.note}</p>
                    </li>
                  ))}
                </ol>
                <div
                  aria-hidden
                  className="mt-5 h-10 border-t-2 border-dashed border-border pt-3"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, var(--foreground) 0 1px, transparent 1px 3px, var(--foreground) 3px 5px, transparent 5px 6px)",
                    backgroundClip: "content-box",
                  }}
                />
              </div>
            </div>
            <div className="reveal space-y-6 lg:col-span-7" style={revealDelay(1, 150)}>
              <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
                Every campaign logs who it went to, when they opened it, whether they looked at
                your resume, and whether they replied. Warm leads surface on their own.
              </p>
              <ul className="grid gap-0.5 border-2 border-border bg-border sm:grid-cols-2">
                {[
                  { icon: Eye, t: "Opens", d: "First / last seen, count, device" },
                  { icon: FileText, t: "Resume views", d: "PDF signals per recipient" },
                  { icon: Reply, t: "Replies", d: "Matched to the right campaign" },
                  { icon: Sparkles, t: "AI drafts", d: "Reply suggestions in one click" },
                ].map((x, i) => (
                  <li key={x.t} className="reveal flex items-start gap-3 bg-card p-4 transition-colors hover:bg-accent" style={revealDelay(i, 90)}>
                    <span className="grid size-9 shrink-0 place-items-center border-2 border-border bg-background">
                      <x.icon className="size-4" aria-hidden />
                    </span>
                    <span>
                      <span className="block font-expanded text-sm">{x.t}</span>
                      <span className="block text-sm text-muted-foreground">{x.d}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── 04 Sheet of stamps ────────────────────────────────────── */}
        <section id="stamps" aria-labelledby="stamps-title" className="scroll-mt-24 border-t-2 border-border orbit-mesh">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
            <SectionTab index="04" label="Features" id="stamps-title" title="A full sheet of stamps." />
            <ul className="grid grid-cols-2 gap-5 sm:gap-7 lg:grid-cols-4">
              {stamps.map((s, i) => (
                <li key={s.title} className="reveal" style={revealDelay(i % 4, 90)}>
                  <div
                    className={cn(
                      "perforated h-full p-2 shadow-[var(--shadow-brutal)] transition-transform duration-300 hover:-translate-y-1.5 hover:rotate-0",
                      s.tone,
                      s.tilt,
                    )}
                  >
                    <div className="flex h-full flex-col border-2 border-current p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-2">
                        <s.icon className="size-6 sm:size-7" strokeWidth={2} aria-hidden />
                        <span className="font-expanded text-lg leading-none sm:text-xl">{s.value}</span>
                      </div>
                      <h3 className="mt-6 font-expanded text-base leading-tight sm:text-lg">{s.title}</h3>
                      <p className="mt-1.5 text-xs leading-relaxed opacity-80 sm:text-sm">{s.desc}</p>
                      <span aria-hidden className="mt-auto pt-3 font-mono text-xs uppercase tracking-[0.14em] opacity-60">
                        No. {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── 05 Mailbag (FAQ) ──────────────────────────────────────── */}
        <section id="mailbag" aria-labelledby="faq-title" className="scroll-mt-24 border-t-2 border-border">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
            <SectionTab index="05" label="Mailbag" id="faq-title" title="Letters we get a lot." />
            <div className="reveal mx-auto max-w-3xl space-y-4">
              {faqs.map((item, i) => {
                const open = openFaq === i;
                return (
                  <div
                    key={item.q}
                    className={cn(
                      "border-2 border-border bg-card transition-transform duration-200",
                      open ? "shadow-[var(--shadow-brutal)]" : i % 2 ? "rotate-[0.6deg]" : "-rotate-[0.6deg]",
                    )}
                  >
                    <h3>
                      <button
                        type="button"
                        id={`faq-q-${i}`}
                        aria-controls={`faq-a-${i}`}
                        aria-expanded={open}
                        onClick={() => setOpenFaq(open ? null : i)}
                        className="flex min-h-14 w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-accent"
                      >
                        <span className="flex items-baseline gap-3">
                          <span className="font-mono text-xs font-semibold uppercase text-muted-foreground">Q.</span>
                          <span className="text-base font-bold">{item.q}</span>
                        </span>
                        <span
                          aria-hidden
                          className={cn(
                            "grid size-8 shrink-0 place-items-center border-2 border-border",
                            open ? "bg-secondary text-secondary-foreground" : "bg-card",
                          )}
                        >
                          {open ? <Minus className="size-4" /> : <Plus className="size-4" />}
                        </span>
                      </button>
                    </h3>
                    {open && (
                      <div
                        id={`faq-a-${i}`}
                        role="region"
                        aria-labelledby={`faq-q-${i}`}
                        className="landing-rise border-t-2 border-dashed border-border/50 px-5 pb-5 pt-4"
                      >
                        <p className="mb-1 font-mono text-xs font-semibold uppercase text-muted-foreground">Re:</p>
                        <p className="text-sm leading-relaxed">{item.a}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Postbox CTA ───────────────────────────────────────────── */}
        <section aria-labelledby="cta-title" className="border-t-2 border-border bg-destructive px-4 py-16 text-destructive-foreground sm:px-6 md:py-24">
          <div className="reveal mx-auto max-w-4xl border-2 border-border bg-secondary text-secondary-foreground shadow-[var(--shadow-brutal-lg)]">
            {/* The slot */}
            <div className="border-b-2 border-border p-5 sm:p-8">
              <div className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.2em] opacity-80">
                <span>Letters</span>
                <span>Next collection: now</span>
              </div>
              <div aria-hidden className="mt-3 h-5 border-2 border-current bg-black/60 shadow-[inset_0_6px_0_0_rgba(0,0,0,0.5)]" />
            </div>
            <div className="grid gap-8 p-6 sm:p-10 md:grid-cols-12 md:items-end">
              <div className="md:col-span-8">
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] opacity-80">
                  Postage paid · free to start
                </p>
                <h2 id="cta-title" className="display-xl mt-4">
                  Drop in your first letter.
                </h2>
              </div>
              <div className="flex flex-wrap gap-3 md:col-span-4 md:justify-end">
                <Button asChild size="lg">
                  <Link to="/auth">
                    Create free account <ArrowRight className="nudge-x" aria-hidden />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/auth">Sign in</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-secondary text-secondary-foreground">
        <div aria-hidden className="airmail airmail-animated h-2" />
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div>
            <BrandMark size="sm" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed opacity-75">
              Personalised Gmail campaigns with templates, tracking and resume tooling.
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="decoration-2 underline-offset-4 hover:underline">
                {l.label}
              </a>
            ))}
            <Link to="/auth" className="decoration-2 underline-offset-4 hover:underline">
              Sign in
            </Link>
            <Link to="/auth" className="decoration-2 underline-offset-4 hover:underline">
              Create account
            </Link>
          </nav>
          <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.12em] opacity-70">
            <Check className="size-3.5" aria-hidden /> Sent with care · {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}

