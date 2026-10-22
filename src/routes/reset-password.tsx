import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandMark } from "@/components/app/brand-mark";
import { Field } from "@/components/app/field";
import { toast } from "sonner";
import { ArrowLeft, MailOpen } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — Smart Email Sender" }] }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) {
      toast.error("Passwords don't match");
      return;
    }
    if (pw.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) {
      toast.error("Reset failed", { description: error.message });
      return;
    }
    toast.success("Password updated");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="orbit-mesh flex min-h-screen flex-col text-foreground">
      <div aria-hidden className="airmail h-2 shrink-0" />
      <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-6">
        <Button asChild variant="ghost" size="sm">
          <Link to="/auth">
            <ArrowLeft aria-hidden /> Back to sign in
          </Link>
        </Button>
        <BrandMark size="sm" wordmarkClassName="hidden sm:block" />
      </div>

      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-10 sm:items-center sm:px-6">
        <div className="w-full max-w-md border-2 border-border bg-card shadow-[var(--shadow-brutal-lg)]">
          <div className="border-b-2 border-border px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">Account · Recovery</p>
              <span className="stamp px-1.5 text-xs text-destructive">Registered</span>
            </div>
            <h1 className="mt-2 font-expanded text-2xl leading-tight sm:text-3xl">Reset password</h1>
            <p className="mt-1 text-sm text-muted-foreground">Choose a new password for your account.</p>
          </div>

          <div className="px-5 py-6 sm:px-6">
            {!ready ? (
              <div className="space-y-4" role="status">
                <div aria-hidden className="hazard h-3 border-2 border-border" />
                <p className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
                  <MailOpen className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
                  Waiting for the reset link to load. Open this page from the email link we sent you.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <Field label="New password" htmlFor="new-password" hint="At least 6 characters.">
                  <Input id="new-password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} />
                </Field>
                <Field label="Confirm password" htmlFor="confirm-password">
                  <Input id="confirm-password" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={6} />
                </Field>
                <Button type="submit" disabled={loading} className="w-full" size="lg">
                  {loading ? "Updating…" : "Update password"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
