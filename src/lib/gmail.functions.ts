import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyTemplate } from "./templating";

export const getGmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("gmail_connections")
      .select("gmail_email, connected_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { connected: !!data, email: data?.gmail_email ?? null, connectedAt: data?.connected_at ?? null };
  });

export const startGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { buildAuthUrl, signState, callbackRedirectUri, requireGmailEnv } = await import("./gmail.server");
    requireGmailEnv();
    const proto = getRequestHeader("x-forwarded-proto") ?? "https";
    const host = getRequestHost();
    const origin = `${proto}://${host}`;
    const state = signState(context.userId);
    const url = buildAuthUrl({ redirectUri: callbackRedirectUri(origin), state });
    return { url };
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("gmail_connections")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const sendSchema = z.object({
  templateId: z.string().uuid().optional().nullable(),
  recipient: z.string().min(3).max(2000), // comma-separated allowed
  subject: z.string().min(1).max(998),
  body: z.string().min(1).max(100_000),
  variables: z.record(z.string()).optional(),
});

export const sendEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sendSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: conn, error: connErr } = await supabase
      .from("gmail_connections")
      .select("gmail_email, refresh_token, access_token, expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (connErr) throw new Error(connErr.message);
    if (!conn) throw new Error("Gmail is not connected. Connect Gmail in Settings.");

    const { refreshAccessToken, buildRawEmail, gmailSend } = await import("./gmail.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let accessToken = conn.access_token ?? "";
    const expired = !conn.expires_at || new Date(conn.expires_at).getTime() < Date.now() + 30_000;
    if (!accessToken || expired) {
      const refreshed = await refreshAccessToken(conn.refresh_token);
      accessToken = refreshed.access_token;
      await supabaseAdmin
        .from("gmail_connections")
        .update({
          access_token: accessToken,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        })
        .eq("user_id", userId);
    }

    const vars = data.variables ?? {};
    const subject = applyTemplate(data.subject, vars);
    const body = applyTemplate(data.body, vars);
    const bcc = conn.gmail_email;

    let templateName: string | null = null;
    if (data.templateId) {
      const { data: t } = await supabase.from("templates").select("name").eq("id", data.templateId).maybeSingle();
      templateName = t?.name ?? null;
    }

    try {
      const raw = buildRawEmail({
        from: conn.gmail_email,
        to: data.recipient,
        bcc,
        subject,
        body,
      });
      const result = await gmailSend(accessToken, raw);
      await supabaseAdmin.from("email_history").insert({
        user_id: userId,
        template_id: data.templateId ?? null,
        template_name: templateName,
        recipient: data.recipient,
        bcc,
        subject,
        body,
        status: "sent",
      });
      return { ok: true, messageId: result.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin.from("email_history").insert({
        user_id: userId,
        template_id: data.templateId ?? null,
        template_name: templateName,
        recipient: data.recipient,
        bcc,
        subject,
        body,
        status: "failed",
        error: msg.slice(0, 1000),
      });
      throw new Error(msg);
    }
  });