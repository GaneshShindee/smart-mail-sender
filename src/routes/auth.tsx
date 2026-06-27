import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Mail, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Smart Email Sender" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen bg-background text-foreground grid place-items-center px-4">
      <Link to="/" className="absolute left-6 top-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Mail className="h-4 w-4" /></div>
          <div>
            <div className="font-semibold">Smart Email Sender</div>
            <div className="text-xs text-muted-foreground">Sign in to continue</div>
          </div>
        </div>
        <Button onClick={signIn} disabled={loading} size="lg" className="w-full" variant="secondary">
          <GoogleIcon /> Continue with Google
        </Button>
        <p className="mt-6 text-xs text-muted-foreground text-center">
          We use Google only to identify you. You'll connect Gmail separately to grant send permission.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 mr-2" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1S8.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.9 3.5 14.7 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6 0-1.1-.1-1.6H12z"/>
    </svg>
  );
}