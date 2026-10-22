import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listGmailAccounts,
  startGmailConnect,
  disconnectGmail,
  setDefaultGmailAccount,
  renameGmailAccount,
  testGmailConnection,
  type GmailAccount,
} from "@/lib/gmail.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Page, PageHeader } from "@/components/app/page";
import { SectionCard } from "@/components/app/section-card";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { SegmentedControl } from "@/components/app/segmented-control";
import { useConfirm } from "@/components/app/confirm-dialog";
import { Mail, CheckCircle2, Star, Plus, Pencil, Trash2, Zap, Settings as SettingsIcon, ShieldCheck, KeyRound, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getUserPreferences, setUserPreferences } from "@/lib/profile.functions";
import {
  getAiKeyStatus,
  setActiveAiProvider,
  setGeminiApiKey,
  clearGeminiApiKey,
  testGeminiApiKey,
  setGrokApiKey,
  clearGrokApiKey,
  testGrokApiKey,
  setClaudeApiKey,
  clearClaudeApiKey,
  testClaudeApiKey,
} from "@/lib/ai-settings.functions";
import type { AiProvider } from "@/lib/ai-provider";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Smart Email Sender" }] }),
  component: SettingsPage,
});

function providerLabel(p: AiProvider): string {
  return p === "gemini" ? "Gemini" : p === "grok" ? "Grok" : p === "claude" ? "Claude" : "Lovable (shared)";
}

type ProviderKeyStatus = { hasKey: boolean; maskedKey: string | null };

function useApiKeyField(opts: {
  setFn: (args: { data: { apiKey: string } }) => Promise<{ ok: boolean }>;
  clearFn: () => Promise<{ ok: boolean }>;
  testFn: (args: { data: { apiKey: string } }) => Promise<{ ok: boolean; error?: string }>;
  label: string;
  onChanged: () => void;
}) {
  const [input, setInput] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const test = useMutation({
    mutationFn: (apiKey: string) => opts.testFn({ data: { apiKey } }),
    onSuccess: (r) => {
      setTestResult(r);
      if (r.ok) toast.success(`Key works — connected to ${opts.label} successfully.`);
      else toast.error("Key test failed", { description: r.error });
    },
    onError: (e) => toast.error("Couldn't test key", { description: (e as Error).message }),
  });
  const save = useMutation({
    mutationFn: (apiKey: string) => opts.setFn({ data: { apiKey } }),
    onSuccess: () => {
      opts.onChanged();
      setInput("");
      setTestResult(null);
      toast.success(`${opts.label} API key saved.`);
    },
    onError: (e) => toast.error("Couldn't save key", { description: (e as Error).message }),
  });
  const remove = useMutation({
    mutationFn: () => opts.clearFn(),
    onSuccess: () => {
      opts.onChanged();
      setTestResult(null);
      toast.success(`${opts.label} API key removed.`);
    },
    onError: (e) => toast.error("Couldn't remove key", { description: (e as Error).message }),
  });

  return { input, setInput, testResult, setTestResult, test, save, remove };
}

function ProviderKeyPanel({
  label,
  title,
  placeholder,
  docsUrl,
  docsLabel,
  status,
  loading,
  active,
  field,
}: {
  label: string;
  /** Visible heading, e.g. "Grok (xAI) API key". */
  title: string;
  placeholder: string;
  docsUrl: string;
  docsLabel: string;
  status: ProviderKeyStatus | undefined;
  loading: boolean;
  active: boolean;
  field: ReturnType<typeof useApiKeyField>;
}) {
  const confirm = useConfirm();
  const inputId = `${label.toLowerCase()}-api-key`;

  return (
    <div className="border-2 border-border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-border px-3 py-2">
        <Label htmlFor={status?.hasKey ? undefined : inputId} className="font-mono text-xs font-semibold uppercase tracking-[0.08em]">
          {title}
        </Label>
        <div className="flex items-center gap-1.5">
          {active && <Badge variant="default">Active</Badge>}
          {loading ? null : status?.hasKey ? (
            <Badge variant="success"><ShieldCheck aria-hidden />Key saved</Badge>
          ) : (
            <Badge variant="muted">No key</Badge>
          )}
        </div>
      </div>
      <div className="p-3">
        {loading ? (
          <Skeleton className="h-10 w-full" />
        ) : status?.hasKey ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="min-w-0 truncate font-mono text-sm">{status.maskedKey}</span>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={async () => {
                if (
                  await confirm({
                    title: `Remove your ${label} API key?`,
                    description: "AI features will fall back to the shared Lovable pool if this provider is active.",
                    confirmLabel: "Remove key",
                  })
                ) {
                  field.remove.mutate();
                }
              }}
              disabled={field.remove.isPending}
            >
              <Trash2 aria-hidden />{field.remove.isPending ? "Removing…" : "Remove"}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={inputId}
                type="password"
                value={field.input}
                onChange={(e) => { field.setInput(e.target.value); field.setTestResult(null); }}
                placeholder={placeholder}
                className="min-w-0 flex-1 basis-56 font-mono"
                autoComplete="off"
              />
              <Button
                variant="outline"
                className="shrink-0"
                onClick={() => field.test.mutate(field.input)}
                disabled={!field.input.trim() || field.test.isPending}
              >
                {field.test.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Zap aria-hidden />}
                {field.test.isPending ? "Testing…" : "Test"}
              </Button>
              <Button
                className="shrink-0"
                onClick={() => field.save.mutate(field.input)}
                disabled={!field.input.trim() || field.save.isPending}
              >
                {field.save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
            {field.testResult && !field.testResult.ok && (
              <p className="text-xs text-destructive" role="alert">{field.testResult.error}</p>
            )}
            {field.testResult?.ok && (
              <p className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-3.5" aria-hidden />Key works — save it to use it.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Get a key at{" "}
              <a href={docsUrl} target="_blank" rel="noreferrer" className="font-medium text-foreground underline decoration-2 underline-offset-2">{docsLabel}</a>.
              Stored on your account and only used for your own AI requests.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function initials(source: string): string {
  const parts = source.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || source.charAt(0).toUpperCase();
}

function SettingsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listGmailAccounts);
  const startFn = useServerFn(startGmailConnect);
  const disconnectFn = useServerFn(disconnectGmail);
  const setDefaultFn = useServerFn(setDefaultGmailAccount);
  const renameFn = useServerFn(renameGmailAccount);
  const testFn = useServerFn(testGmailConnection);
  const accountsQ = useQuery({ queryKey: ["gmail-accounts"], queryFn: () => listFn() });
  const { data: accounts, isLoading } = accountsQ;
  const confirm = useConfirm();

  const prefsGet = useServerFn(getUserPreferences);
  const prefsSet = useServerFn(setUserPreferences);
  const prefs = useQuery({ queryKey: ["user-prefs"], queryFn: () => prefsGet() });
  const updatePref = useMutation({
    mutationFn: (v: boolean) => prefsSet({ data: { trackingOpenEnabled: v } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["user-prefs"] }); toast.success("Preference saved"); },
    onError: (e) => toast.error((e as Error).message),
  });

  const [profile, setProfile] = useState<{ email?: string; name?: string; avatar?: string }>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const aiKeyStatusFn = useServerFn(getAiKeyStatus);
  const setActiveProviderFn = useServerFn(setActiveAiProvider);
  const aiKeyStatus = useQuery({ queryKey: ["ai-key-status"], queryFn: () => aiKeyStatusFn() });

  const setActiveProvider = useMutation({
    mutationFn: (provider: AiProvider) => setActiveProviderFn({ data: { provider } }),
    onSuccess: (_r, provider) => {
      qc.invalidateQueries({ queryKey: ["ai-key-status"] });
      toast.success(
        provider === "lovable" ? "Using the shared Lovable gateway" : `Using your ${providerLabel(provider)} key`,
      );
    },
    onError: (e) => toast.error("Couldn't update AI provider", { description: (e as Error).message }),
  });

  const geminiKey = useApiKeyField({
    setFn: useServerFn(setGeminiApiKey),
    clearFn: useServerFn(clearGeminiApiKey),
    testFn: useServerFn(testGeminiApiKey),
    label: "Gemini",
    onChanged: () => qc.invalidateQueries({ queryKey: ["ai-key-status"] }),
  });
  const grokKey = useApiKeyField({
    setFn: useServerFn(setGrokApiKey),
    clearFn: useServerFn(clearGrokApiKey),
    testFn: useServerFn(testGrokApiKey),
    label: "Grok",
    onChanged: () => qc.invalidateQueries({ queryKey: ["ai-key-status"] }),
  });
  const claudeKey = useApiKeyField({
    setFn: useServerFn(setClaudeApiKey),
    clearFn: useServerFn(clearClaudeApiKey),
    testFn: useServerFn(testClaudeApiKey),
    label: "Claude",
    onChanged: () => qc.invalidateQueries({ queryKey: ["ai-key-status"] }),
  });

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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["gmail-accounts"] });
    qc.invalidateQueries({ queryKey: ["gmail-status"] });
  };

  const connect = useMutation({
    mutationFn: () => startFn(),
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: (e) => toast.error("Couldn't start Gmail connection", { description: (e as Error).message }),
  });
  const disconnect = useMutation({
    mutationFn: (id: string) => disconnectFn({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Disconnected"); },
    onError: (e) => toast.error("Disconnect failed", { description: (e as Error).message }),
  });
  const setDefault = useMutation({
    mutationFn: (id: string) => setDefaultFn({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Default updated"); },
    onError: (e) => toast.error("Couldn't set default", { description: (e as Error).message }),
  });
  const rename = useMutation({
    mutationFn: (input: { id: string; label: string | null }) => renameFn({ data: input }),
    onSuccess: () => { invalidate(); setRenamingId(null); toast.success("Renamed"); },
    onError: (e) => toast.error("Rename failed", { description: (e as Error).message }),
  });
  const test = useMutation({
    mutationFn: (id: string) => testFn({ data: { id } }),
    onSuccess: (r) => toast.success(`Connected: ${r.email}`),
    onError: (e) => toast.error("Test failed", { description: (e as Error).message }),
  });

  const activeProvider = aiKeyStatus.data?.activeProvider ?? "lovable";

  return (
    <Page size="narrow">
      <PageHeader
        eyebrow="04 · You · Control panel"
        title="Settings"
        icon={SettingsIcon}
        description="Manage your account and connected Gmail accounts."
      />

      <SectionCard index="01" title="Profile" description="From your sign-in provider">
        <div className="flex items-center gap-4">
          {profile.avatar ? (
            <img src={profile.avatar} alt="" className="size-14 shrink-0 border-2 border-border object-cover" />
          ) : (
            <div className="grid size-14 shrink-0 place-items-center border-2 border-border bg-secondary font-expanded text-lg text-secondary-foreground" aria-hidden>
              {initials(profile.name ?? profile.email ?? "?")}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-lg font-bold">{profile.name ?? "—"}</div>
            <div className="truncate font-mono text-sm text-muted-foreground">{profile.email}</div>
          </div>
        </div>
      </SectionCard>

      <SectionCard index="02" title="Open tracking" description="Applies to new sends only">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="track-opens" className="text-sm">Track email opens</Label>
            <p id="track-opens-hint" className="mt-1 text-xs text-muted-foreground">
              Adds an invisible pixel so we can tell you when a recipient opens your email.
              Applies to new sends only.
            </p>
            {prefs.isError && (
              <p className="mt-1 text-xs text-destructive">Couldn't load your preference — showing the default.</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase" aria-hidden>
              {(prefs.data?.trackingOpenEnabled ?? true) ? "On" : "Off"}
            </span>
            <Switch
              id="track-opens"
              aria-describedby="track-opens-hint"
              checked={prefs.data?.trackingOpenEnabled ?? true}
              disabled={prefs.isLoading || updatePref.isPending}
              onCheckedChange={(v) => updatePref.mutate(!!v)}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard index="03" title="AI provider" description="Bring your own key, or use the shared pool">
        <p className="text-sm text-muted-foreground">
          AI features (drafting, resume tailoring, job parsing, etc.) use the shared Lovable pool by default, which
          can hit rate limits or run out of credits. Save your own Gemini, Grok and/or Claude API key below, then
          pick which one to use. If you don't pick a provider — or the one you pick has no key saved, or its request
          fails — AI features automatically fall back to the shared Lovable pool.
        </p>

        {aiKeyStatus.isError ? (
          <ErrorState
            title="Couldn't load AI settings"
            error={aiKeyStatus.error}
            onRetry={() => aiKeyStatus.refetch()}
            retrying={aiKeyStatus.isFetching}
          />
        ) : (
          <>
            <div className="space-y-2">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em]">Active provider</p>
              {aiKeyStatus.isLoading ? (
                <Skeleton className="h-10 w-full max-w-md" />
              ) : (
                <fieldset disabled={setActiveProvider.isPending} className="min-w-0">
                  <SegmentedControl<AiProvider>
                    value={activeProvider}
                    onValueChange={(v) => setActiveProvider.mutate(v)}
                    ariaLabel="Active AI provider"
                    options={[
                      { value: "lovable", label: "Lovable (shared)" },
                      { value: "gemini", label: `Gemini${aiKeyStatus.data?.gemini.hasKey ? "" : " · no key"}` },
                      { value: "grok", label: `Grok${aiKeyStatus.data?.grok.hasKey ? "" : " · no key"}` },
                      { value: "claude", label: `Claude${aiKeyStatus.data?.claude.hasKey ? "" : " · no key"}` },
                    ]}
                  />
                </fieldset>
              )}
            </div>

            <div className="space-y-3">
              <ProviderKeyPanel
                label="Gemini"
                title="Gemini API key"
                placeholder="AIza..."
                docsUrl="https://aistudio.google.com/apikey"
                docsLabel="aistudio.google.com/apikey"
                status={aiKeyStatus.data?.gemini}
                loading={aiKeyStatus.isLoading}
                active={activeProvider === "gemini"}
                field={geminiKey}
              />
              <ProviderKeyPanel
                label="Grok"
                title="Grok (xAI) API key"
                placeholder="xai-..."
                docsUrl="https://console.x.ai"
                docsLabel="console.x.ai"
                status={aiKeyStatus.data?.grok}
                loading={aiKeyStatus.isLoading}
                active={activeProvider === "grok"}
                field={grokKey}
              />
              <ProviderKeyPanel
                label="Claude"
                title="Claude (Anthropic) API key"
                placeholder="sk-ant-..."
                docsUrl="https://console.anthropic.com/settings/keys"
                docsLabel="console.anthropic.com"
                status={aiKeyStatus.data?.claude}
                loading={aiKeyStatus.isLoading}
                active={activeProvider === "claude"}
                field={claudeKey}
              />
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard
        index="04"
        title="Gmail accounts"
        description="Where your emails are sent from"
        actions={
          accounts && accounts.length > 0 ? (
            <Button size="sm" onClick={() => connect.mutate()} disabled={connect.isPending}>
              <Plus aria-hidden />{connect.isPending ? "Redirecting…" : "Connect another"}
            </Button>
          ) : undefined
        }
      >
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        ) : accountsQ.isError ? (
          <ErrorState
            title="Couldn't load Gmail accounts"
            error={accountsQ.error}
            onRetry={() => accountsQ.refetch()}
            retrying={accountsQ.isFetching}
          />
        ) : !accounts || accounts.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No Gmail connected"
            description="Grant Gmail send permission to start sending from your inbox."
            action={
              <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
                <KeyRound aria-hidden />{connect.isPending ? "Redirecting…" : "Connect Gmail"}
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {accounts.map((acc: GmailAccount) => (
              <li
                key={acc.id}
                className={`border-2 border-border ${acc.is_default ? "bg-accent shadow-[var(--shadow-brutal-sm)]" : "bg-background"}`}
              >
                <div className="flex items-start gap-3 p-3 sm:p-4">
                  {acc.avatar_url ? (
                    <img src={acc.avatar_url} alt="" className="size-12 shrink-0 border-2 border-border object-cover" />
                  ) : (
                    <div className="grid size-12 shrink-0 place-items-center border-2 border-border bg-secondary font-expanded text-base text-secondary-foreground" aria-hidden>
                      {initials(acc.full_name ?? acc.gmail_email)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    {renamingId === acc.id ? (
                      <div className="space-y-2">
                        <Label htmlFor={`rename-${acc.id}`} className="font-mono text-xs uppercase tracking-[0.08em]">
                          Label for {acc.gmail_email}
                        </Label>
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            id={`rename-${acc.id}`}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            placeholder="Label (e.g. Recruiter)"
                            className="min-w-0 flex-1 basis-48"
                            autoFocus
                          />
                          <Button size="sm" className="shrink-0" disabled={rename.isPending} onClick={() => rename.mutate({ id: acc.id, label: renameValue })}>
                            {rename.isPending ? "Saving…" : "Save"}
                          </Button>
                          <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setRenamingId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 truncate font-bold">{acc.label ?? acc.full_name ?? acc.gmail_email}</span>
                          {acc.is_default && <Badge variant="secondary"><Star aria-hidden />Default</Badge>}
                          <Badge variant="success"><CheckCircle2 aria-hidden />Connected</Badge>
                        </div>
                        <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                          {acc.gmail_email} · since {new Date(acc.connected_at).toLocaleDateString()}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {renamingId !== acc.id && (
                  <div className="flex flex-wrap gap-2 border-t-2 border-dashed border-border/40 px-3 py-2.5 sm:px-4">
                    {!acc.is_default && (
                      <Button size="sm" variant="outline" onClick={() => setDefault.mutate(acc.id)} disabled={setDefault.isPending}>
                        <Star aria-hidden />Set default
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { setRenamingId(acc.id); setRenameValue(acc.label ?? ""); }}>
                      <Pencil aria-hidden />Rename
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => test.mutate(acc.id)} disabled={test.isPending}>
                      <Zap aria-hidden />Test
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive sm:ml-auto"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: `Disconnect ${acc.gmail_email}?`,
                            description: "You won't be able to send from this account until you reconnect it.",
                            confirmLabel: "Disconnect",
                          })
                        ) {
                          disconnect.mutate(acc.id);
                        }
                      }}
                      disabled={disconnect.isPending}
                    >
                      <Trash2 aria-hidden />Disconnect
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </Page>
  );
}
