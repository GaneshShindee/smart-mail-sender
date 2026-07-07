import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyTemplate } from "./templating";

export type GmailAccount = {
  id: string;
  gmail_email: string;
  label: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_default: boolean;
  connected_at: string;
};

export const listGmailAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GmailAccount[]> => {
    const { data, error } = await context.supabase
      .from("gmail_connections")
      .select("id, gmail_email, label, full_name, avatar_url, is_default, connected_at")
      .eq("user_id", context.userId)
      .order("is_default", { ascending: false })
      .order("connected_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as GmailAccount[];
  });

// Back-compat: returns the default account in the old shape.
export const getGmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("gmail_connections")
      .select("gmail_email, connected_at")
      .eq("user_id", context.userId)
      .order("is_default", { ascending: false })
      .order("connected_at", { ascending: true })
      .limit(1)
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
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("gmail_connections").delete().eq("user_id", context.userId);
    if (data.id) q = q.eq("id", data.id);
    const { error } = await q;
    if (error) throw new Error(error.message);
    // Promote a remaining account to default if needed.
    const { data: remaining } = await context.supabase
      .from("gmail_connections")
      .select("id, is_default")
      .eq("user_id", context.userId)
      .order("connected_at", { ascending: true });
    if (remaining && remaining.length > 0 && !remaining.some((r) => r.is_default)) {
      await context.supabase
        .from("gmail_connections")
        .update({ is_default: true })
        .eq("id", remaining[0].id);
    }
    return { ok: true };
  });

export const setDefaultGmailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Clear current defaults for this user, then set the chosen one.
    const { error: clearErr } = await context.supabase
      .from("gmail_connections")
      .update({ is_default: false })
      .eq("user_id", context.userId)
      .eq("is_default", true);
    if (clearErr) throw new Error(clearErr.message);
    const { error } = await context.supabase
      .from("gmail_connections")
      .update({ is_default: true })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const renameGmailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), label: z.string().max(60).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("gmail_connections")
      .update({ label: data.label?.trim() || null })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testGmailConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: conn, error } = await context.supabase
      .from("gmail_connections")
      .select("refresh_token, access_token, expires_at, gmail_email")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !conn) throw new Error("Account not found");
    const { refreshAccessToken } = await import("./gmail.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await refreshAccessToken(conn.refresh_token);
    await supabaseAdmin
      .from("gmail_connections")
      .update({
        access_token: r.access_token,
        expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(),
      })
      .eq("id", data.id);
    return { ok: true, email: conn.gmail_email };
  });

const sendSchema = z.object({
  templateId: z.string().uuid().optional().nullable(),
  gmailAccountId: z.string().uuid().optional().nullable(),
  recipients: z.array(z.string().email()).min(1).max(500),
  subject: z.string().min(1).max(998),
  body: z.string().min(1).max(100_000),
  variables: z.record(z.string()).optional(),
  resumeIds: z.array(z.string().uuid()).max(10).optional(),
  uploads: z.array(z.object({
    filename: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(128),
    base64: z.string().min(1),
    size: z.number().int().positive().max(25 * 1024 * 1024),
  })).max(10).optional(),
});

export const sendEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sendSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Pick the requested Gmail account, or fall back to the user's default.
    const baseSelect = supabase
      .from("gmail_connections")
      .select("id, gmail_email, refresh_token, access_token, expires_at")
      .eq("user_id", userId);
    const { data: conn, error: connErr } = data.gmailAccountId
      ? await baseSelect.eq("id", data.gmailAccountId).maybeSingle()
      : await baseSelect.order("is_default", { ascending: false }).order("connected_at", { ascending: true }).limit(1).maybeSingle();
    if (connErr) throw new Error(connErr.message);
    if (!conn) throw new Error("Gmail is not connected. Connect Gmail in Settings.");

    const { refreshAccessToken, buildRawEmailWithAttachments, gmailSend } = await import("./gmail.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Per-user tracking preference (defaults on).
    const { data: prof } = await supabase
      .from("profiles")
      .select("tracking_open_enabled")
      .eq("id", userId)
      .maybeSingle();
    const trackingEnabled = (prof as { tracking_open_enabled?: boolean } | null)?.tracking_open_enabled ?? true;

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
        .eq("id", conn.id);
    }

    const vars = data.variables ?? {};
    const subject = applyTemplate(data.subject, vars);
    const body = applyTemplate(data.body, vars);

    // New TO/BCC flow:
    //   TO  = the connected Gmail account (sender)
    //   BCC = all pasted recipients
    const deduped = Array.from(new Set(data.recipients.map((r) => r.trim().toLowerCase()).filter(Boolean)));
    const to = conn.gmail_email;
    const bcc = deduped.join(", ");

    let templateName: string | null = null;
    if (data.templateId) {
      const { data: t } = await supabase.from("templates").select("name").eq("id", data.templateId).maybeSingle();
      templateName = t?.name ?? null;
    }

    // Resolve attachments: saved resumes fetched server-side from storage, plus inline uploads.
    type Att = { filename: string; mimeType: string; data: Buffer; size: number; source: "resume" | "upload" };
    const attachments: Att[] = [];
    const attachmentMeta: Array<{ name: string; size: number; source: "resume" | "upload" }> = [];

    if (data.resumeIds && data.resumeIds.length > 0) {
      const { data: rows, error: rErr } = await supabase
        .from("resumes")
        .select("id, storage_path, original_filename, mime_type, size_bytes")
        .in("id", data.resumeIds)
        .eq("user_id", userId);
      if (rErr) throw new Error(rErr.message);
      for (const r of rows ?? []) {
        const { data: blob, error: dErr } = await supabaseAdmin.storage.from("resumes").download(r.storage_path);
        if (dErr || !blob) throw new Error(`Failed to read resume: ${dErr?.message ?? "missing"}`);
        const ab = await blob.arrayBuffer();
        attachments.push({
          filename: r.original_filename,
          mimeType: r.mime_type,
          data: Buffer.from(ab),
          size: r.size_bytes,
          source: "resume",
        });
        attachmentMeta.push({ name: r.original_filename, size: r.size_bytes, source: "resume" });
      }
    }
    for (const u of data.uploads ?? []) {
      const buf = Buffer.from(u.base64, "base64");
      attachments.push({ filename: u.filename, mimeType: u.mimeType, data: buf, size: u.size, source: "upload" });
      attachmentMeta.push({ name: u.filename, size: u.size, source: "upload" });
    }
    const totalAttachSize = attachments.reduce((n, a) => n + a.size, 0);
    if (totalAttachSize > 25 * 1024 * 1024) {
      throw new Error("Attachments exceed 25 MB total.");
    }

    // Pre-create the history row so we have a stable tracking token to embed.
    const proto = getRequestHeader("x-forwarded-proto") ?? "https";
    const host = getRequestHost();
    const origin = `${proto}://${host}`;
    const { data: historyRow, error: hErr } = await supabaseAdmin
      .from("email_history")
      .insert({
        user_id: userId,
        template_id: data.templateId ?? null,
        template_name: templateName,
        recipient: deduped.join(", "),
        bcc,
        subject,
        body,
        status: "pending",
        gmail_account_id: conn.id,
        sender_email: conn.gmail_email,
        attachments: attachmentMeta,
        recipient_count: deduped.length,
        tracking_enabled: trackingEnabled,
      })
      .select("id, tracking_token")
      .single();
    if (hErr || !historyRow) throw new Error(hErr?.message ?? "Failed to log send");
    const pixelUrl = trackingEnabled
      ? `${origin}/api/public/track/open/${historyRow.tracking_token}`
      : undefined;

    try {
      const raw = buildRawEmailWithAttachments({
        from: conn.gmail_email,
        to,
        bcc,
        subject,
        body,
        attachments,
        trackingPixelUrl: pixelUrl,
      });
      const result = await gmailSend(accessToken, raw);
      await supabaseAdmin
        .from("email_history")
        .update({ status: "sent" })
        .eq("id", historyRow.id);
      return { ok: true, messageId: result.id, recipientCount: deduped.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from("email_history")
        .update({ status: "failed", error: msg.slice(0, 1000) })
        .eq("id", historyRow.id);
      throw new Error(msg);
    }
  });