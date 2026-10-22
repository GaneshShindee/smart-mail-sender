import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandMark } from "@/components/app/brand-mark";
import { Field } from "@/components/app/field";
import { SegmentedControl } from "@/components/app/segmented-control";
import { ArrowLeft, ArrowRight, KeyRound, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  // Redirect to dashboard if already authenticated
  loader: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      return redirect({ to: "/dashboard" });
    }
    return null;
  },
  head: () => ({ meta: [{ title: "Sign in — Smart Email Sender" }] }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

const modeOptions = [
  { value: "signin" as const, label: "Sign in", icon: LogIn },
  { value: "signup" as const, label: "Sign up", icon: UserPlus },
  { value: "forgot" as const, label: "Forgot", icon: KeyRound },
];

const textLink =
  "inline-flex min-h-10 items-center gap-1.5 px-1 font-mono text-xs font-semibold uppercase tracking-[0.08em] underline decoration-2 underline-offset-4 transition-colors hover:bg-accent";

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const signIn = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth",
    });
    if (result.error) {
      toast.error("Sign in failed", { description: String(result.error?.message ?? result.error) });
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin + "/auth",
            data: fullName ? { full_name: fullName } : undefined,
          },
        });
        if (error) throw error;
        toast.success("Check your email to confirm your account.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin + "/reset-password",
        });
        if (error) throw error;
        toast.success("Password reset email sent. Check your inbox.");
        setMode("signin");
      }
    } catch (err) {
      toast.error(mode === "forgot" ? "Reset failed" : "Sign in failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div aria-hidden className="airmail h-2 shrink-0" />

      <div className="grid flex-1 lg:grid-cols-2">
        {/* Poster panel */}
        <aside className="relative hidden flex-col justify-between gap-10 overflow-hidden border-r-2 border-border bg-secondary p-10 text-secondary-foreground lg:flex xl:p-14">
          <BrandMark />

          <div className="space-y-10">
            <p className="font-expanded text-5xl leading-[0.95] xl:text-6xl">
              <span className="block">Personal</span>
              <span className="block">mail,</span>
              <span className="block">posted</span>
              <span className="mt-3 inline-block -rotate-1 border-2 border-primary-foreground bg-primary px-3 pb-1 text-primary-foreground">
                by you.
              </span>
            </p>

            <PostcardIllustration />

            <ul className="max-w-md space-y-3 text-sm">
              {[
                "Templates with {{placeholders}} for every recipient",
                "Send from your own Gmail — replies stay in your inbox",
                "Track opens, resume views, and follow-ups",
              ].map((line) => (
                <li key={line} className="flex items-start gap-3">
                  <span aria-hidden className="mt-1.5 size-2.5 shrink-0 bg-primary" />
                  <span className="opacity-85">{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="font-mono text-xs uppercase tracking-[0.08em] opacity-70">
            Secure sign-in · Your data stays in your workspace
          </p>
        </aside>

        {/* Form panel */}
        <div className="orbit-mesh flex flex-col">
          <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-6">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">
                <ArrowLeft aria-hidden /> Back
              </Link>
            </Button>
            <BrandMark size="sm" className="lg:hidden" wordmarkClassName="hidden sm:block" />
          </div>

          {/* Compact masthead (mobile) */}
          <div className="px-4 pt-8 sm:px-6 lg:hidden">
            <p className="font-expanded text-3xl leading-none sm:text-4xl">
              Personal mail,{" "}
              <span className="inline-block bg-primary px-2 text-primary-foreground">posted by you.</span>
            </p>
          </div>

          <div className="flex flex-1 items-start justify-center px-4 pb-16 pt-8 sm:px-6 lg:items-center lg:py-10">
            <div className="w-full max-w-md border-2 border-border bg-card shadow-[var(--shadow-brutal-lg)]">
              <div className="border-b-2 border-border px-5 py-5 sm:px-6">
                <p className="eyebrow">Account · {mode === "signup" ? "New sender" : mode === "forgot" ? "Recovery" : "Returning"}</p>
                <h1 className="mt-2 font-expanded text-2xl leading-tight sm:text-3xl">
                  {mode === "signup" ? "Create account" : mode === "forgot" ? "Reset password" : "Welcome back"}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {mode === "signup" ? "Start sending in minutes" : mode === "forgot" ? "We'll email you a reset link" : "Sign in to continue"}
                </p>
              </div>

              <div className="space-y-5 px-5 py-6 sm:px-6">
                <SegmentedControl<Mode>
                  value={mode}
                  onValueChange={setMode}
                  options={modeOptions}
                  ariaLabel="Account action"
                />

                <Button onClick={signIn} disabled={loading} className="w-full" variant="outline" size="lg">
                  <GoogleIcon /> Continue with Google
                </Button>

                <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  <div className="h-0.5 flex-1 bg-border" /> or with email <div className="h-0.5 flex-1 bg-border" />
                </div>

                <form onSubmit={submitEmail} className="space-y-4">
                  {mode === "signup" && (
                    <Field label="Full name" htmlFor="fn">
                      <Input id="fn" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
                    </Field>
                  )}
                  <Field label="Email" htmlFor="em">
                    <Input id="em" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
                  </Field>
                  {mode !== "forgot" && (
                    <Field
                      label="Password"
                      htmlFor="pw"
                      hint={mode === "signup" ? "At least 6 characters." : undefined}
                      action={
                        mode === "signin" ? (
                          <button type="button" className={textLink} onClick={() => setMode("forgot")}>
                            Forgot password?
                          </button>
                        ) : undefined
                      }
                    >
                      <Input
                        id="pw"
                        type="password"
                        autoComplete={mode === "signup" ? "new-password" : "current-password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        placeholder="••••••••"
                      />
                    </Field>
                  )}
                  <Button type="submit" disabled={loading} className="w-full" size="lg">
                    {loading ? "Please wait…" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
                    {!loading && <ArrowRight aria-hidden />}
                  </Button>
                </form>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/20 pt-3 text-sm">
                  {mode === "signin" ? (
                    <>
                      <span className="text-muted-foreground">New here?</span>
                      <button type="button" className={textLink} onClick={() => setMode("signup")}>
                        Create an account
                      </button>
                    </>
                  ) : (
                    <button type="button" className={textLink} onClick={() => setMode("signin")}>
                      <ArrowLeft className="size-3.5" aria-hidden /> Back to sign in
                    </button>
                  )}
                </div>
              </div>

              <div className="border-t-2 border-border bg-muted px-5 py-3 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground sm:px-6 lg:hidden">
                Secure sign-in · Your data stays in your workspace
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Decorative CSS-only airmail postcard (no metrics, no images). */
function PostcardIllustration() {
  return (
    <div aria-hidden className="w-full max-w-md -rotate-2">
      <div className="airmail p-1.5 shadow-[8px_8px_0_0_var(--primary)]">
        <div className="grid grid-cols-5 gap-4 bg-card p-5 text-card-foreground">
          <div className="col-span-3 space-y-2.5 border-r-2 border-dashed border-border pr-4">
            <div className="font-mono text-xs font-semibold">Hi {"{{name}}"},</div>
            <div className="h-2 w-full bg-muted" />
            <div className="h-2 w-11/12 bg-muted" />
            <div className="h-2 w-4/5 bg-muted" />
            <div className="h-2 w-2/3 bg-muted" />
            <div className="pt-1 font-mono text-xs text-muted-foreground">— you</div>
          </div>
          <div className="col-span-2 flex flex-col justify-between gap-4">
            <div className="flex items-start justify-between gap-2">
              <span className="stamp px-1 text-xs text-destructive">Airmail</span>
              <span className="perforated grid size-12 shrink-0 place-items-center bg-primary p-1 text-primary-foreground">
                <span className="grid size-full place-items-center border-2 border-current font-expanded text-sm leading-none">
                  SE
                </span>
              </span>
            </div>
            <div className="space-y-2 font-mono text-xs">
              <div className="border-b border-border/40 pb-1">{"{{name}}"}</div>
              <div className="border-b border-border/40 pb-1">{"{{company}}"}</div>
              <div className="border-b border-border/40 pb-1">via Gmail</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1S8.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.9 3.5 14.7 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6 0-1.1-.1-1.6H12z"/>
    </svg>
  );
}
