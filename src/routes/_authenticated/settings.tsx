import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGmailStatus, startGmailConnect, disconnectGmail } from "@/lib/gmail.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Mail, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Smart Email Sender" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const gmailFn = useServerFn(getGmailStatus);
  const startFn = useServerFn(startGmailConnect);
  const disconnectFn = useServerFn(disconnectGmail);
  const { data, isLoading } = useQuery({ queryKey: ["gmail-status"], queryFn: () => gmailFn() });

  const [profile, setProfile] = useState<{ email?: string; name?: string; avatar?: string }>({});
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setProfile({
        email: u.email ?? undefined,
        name: (u.user_metadata?.full_name as string) ?? (u.user_metadata?.name as string),
        avatar: u.user_metadata?.avatar_url as string,
      });
    });
  }, []);

  const connect = useMutation({
    mutationFn: () => startFn(),
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: (e) => toast.error("Couldn't start Gmail connection", { description: (e as Error).message }),
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gmail-status"] }); toast.success("Disconnected"); },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account and Gmail connection.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-4">
          {profile.avatar && <img src={profile.avatar} alt="" className="h-12 w-12 rounded-full" />}
          <div>
            <div className="font-medium">{profile.name ?? "—"}</div>
            <div className="text-sm text-muted-foreground">{profile.email}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" /> Gmail connection</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-12 w-full" /> : data?.connected ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4 text-emerald-500" />{data.email}</div>
                <div className="text-xs text-muted-foreground">Connected {data.connectedAt ? new Date(data.connectedAt).toLocaleString() : ""}</div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => connect.mutate()} disabled={connect.isPending}>Reconnect</Button>
                <Button variant="destructive" onClick={() => { if (confirm("Disconnect Gmail?")) disconnect.mutate(); }} disabled={disconnect.isPending}>Disconnect</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <Badge variant="outline">Not connected</Badge>
                <p className="text-sm text-muted-foreground mt-2">Grant Gmail send permission to start sending from your inbox.</p>
              </div>
              <Button onClick={() => connect.mutate()} disabled={connect.isPending}>{connect.isPending ? "Redirecting…" : "Connect Gmail"}</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}