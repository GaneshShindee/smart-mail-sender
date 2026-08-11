import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyTemplate } from "./templating";
import { deriveNames, validateEmails, greetingFor, bodyHasGreeting, type SkippedRecipient } from "./recipients";

export type GmailAccount = {
  id: string;
  gmail_email: string;
  label: string | null;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_default: boolean;
  connected_at: string;
};

export const listGmailAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GmailAccount[]> => {
    const { data, error } = await context.supabase
      .from("gmail_connections")
      .select("id, gmail_email, label, full_name, display_name, avatar_url, is_default, connected_at")
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

export const updateGmailDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), displayName: z.string().trim().max(120).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("gmail_connections")
      .update({ display_name: data.displayName?.trim() || null })
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
  recipients: z.array(z.string()).min(1).max(2000),
  recipientMeta: z
    .array(z.object({ email: z.string(), name: z.string().max(200).optional(), company: z.string().max(200).optional() }))
    .max(2000)
    .optional(),
  subject: z.string().min(1).max(998),
  body: z.string().min(1).max(100_000),
  bodyHtml: z.string().max(200_000).optional().nullable(),
  variables: z.record(z.string(), z.string()).optional(),
  resumeIds: z.array(z.string().uuid()).max(10).optional(),
  uploads: z.array(z.object({
    filename: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(128),
    base64: z.string().min(1),
    size: z.number().int().positive().max(25 * 1024 * 1024),
  })).max(10).optional(),
  /** "bcc" (default): one message, all recipients hidden in Bcc. "individual": one message per recipient. */
  sendMode: z.enum(["bcc", "individual"]).optional(),
  /** ISO timestamp for a scheduled send. Omit / null to queue immediately. */
  scheduledAt: z.string().datetime().optional().nullable(),
  timezone: z.string().max(64).optional().nullable(),
});

function requestOrigin() {
  const proto = getRequestHeader("x-forwarded-proto") ?? "https";
  return `${proto}://${getRequestHost()}`;
}

/**
 * Queue a campaign. Nothing is sent inside this request: recipients, attachments
 * and the job row are persisted, then a background worker performs delivery, so
 * the browser can be closed immediately (and scheduled sends work at all).
 */
export const sendEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sendSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadConnection, kickWorker } = await import("./send-core.server");

    const conn = await loadConnection(userId, data.gmailAccountId);
    const mode = data.sendMode ?? "bcc";
    const origin = requestOrigin();

    const { data: prof } = await supabase
      .from("profiles")
      .select("tracking_open_enabled")
      .eq("id", userId)
      .maybeSingle();
    const trackingEnabled = (prof as { tracking_open_enabled?: boolean } | null)?.tracking_open_enabled ?? true;

    // Validate + dedupe recipients server-side. Skipped ones are recorded, campaign continues.
    const metaByEmail = new Map<string, { name?: string; company?: string }>();
    for (const m of data.recipientMeta ?? []) {
      metaByEmail.set(m.email.trim().toLowerCase(), { name: m.name, company: m.company });
    }
    const totalRequested = data.recipients.length;
    const { valid: deduped, skipped: preSkipped } = validateEmails(data.recipients, metaByEmail);
    const skippedReport: SkippedRecipient[] = [...preSkipped];
    if (deduped.length === 0) {
      throw new Error(
        "No valid recipients. All addresses were skipped (invalid syntax, duplicates, or unroutable domains).",
      );
    }

    let templateName: string | null = null;
    if (data.templateId) {
      const { data: t } = await supabase.from("templates").select("name").eq("id", data.templateId).maybeSingle();
      templateName = t?.name ?? null;
    }

    const displayName = (conn.display_name ?? conn.full_name ?? "").trim() || null;
    const previewNames = deriveNames("preview@example.com", displayName);
    const previewVars: Record<string, string> = {
      first_name: previewNames.first_name,
      last_name: previewNames.last_name,
      full_name: previewNames.full_name,
      name: previewNames.full_name || "there",
      sender_name: displayName ?? conn.gmail_email,
      company: "",
      designation: "",
      location: "",
      date: new Date().toLocaleDateString(),
      ...(data.variables ?? {}),
    };
    const subject = applyTemplate(data.subject, previewVars);
    const body = applyTemplate(data.body, previewVars);

    // Attachment metadata (resumes are read at send time from storage).
    const attachmentMeta: Array<{ name: string; size: number; source: "resume" | "upload" }> = [];
    let hasPdf = false;
    if (data.resumeIds && data.resumeIds.length > 0) {
      const { data: rows, error } = await supabase
        .from("resumes")
        .select("id, original_filename, mime_type, size_bytes")
        .in("id", data.resumeIds)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      for (const r of rows ?? []) {
        attachmentMeta.push({ name: r.original_filename, size: r.size_bytes, source: "resume" });
        if (/pdf/i.test(r.mime_type) || /\.pdf$/i.test(r.original_filename)) hasPdf = true;
      }
    }
    const totalAttachSize =
      attachmentMeta.reduce((n, a) => n + a.size, 0) + (data.uploads ?? []).reduce((n, u) => n + u.size, 0);
    if (totalAttachSize > 25 * 1024 * 1024) throw new Error("Attachments exceed 25 MB total.");

    const scheduled = data.scheduledAt ? new Date(data.scheduledAt) : null;
    if (scheduled && Number.isNaN(scheduled.getTime())) throw new Error("Invalid schedule time");

    const campaignToken = trackingEnabled ? crypto.randomUUID() : null;
    const { data: historyRow, error: hErr } = await supabaseAdmin
      .from("email_history")
      .insert({
        user_id: userId,
        template_id: data.templateId ?? null,
        template_name: templateName,
        recipient: deduped.join(", "),
        bcc: mode === "bcc" ? deduped.join(", ") : null,
        subject,
        body,
        body_html: data.bodyHtml ?? null,
        status: scheduled ? "scheduled" : "queued",
        kind: "campaign",
        send_mode: mode,
        scheduled_at: scheduled ? scheduled.toISOString() : null,
        timezone: data.timezone ?? null,
        gmail_account_id: conn.id,
        sender_email: conn.gmail_email,
        attachments: attachmentMeta,
        recipient_count: deduped.length,
        tracking_enabled: trackingEnabled,
        tracking_token: campaignToken,
        skipped: skippedReport,
      })
      .select("id")
      .single();
    if (hErr || !historyRow) throw new Error(hErr?.message ?? "Failed to queue campaign");

    // Persist inline uploads to storage so the background worker can read them.
    const storedUploads: Array<{ path: string; filename: string; mimeType: string; size: number }> = [];
    for (const [i, u] of (data.uploads ?? []).entries()) {
      const path = `${userId}/campaign/${historyRow.id}/${i}-${u.filename}`;
      const { error } = await supabaseAdmin.storage
        .from("draft-attachments")
        .upload(path, Buffer.from(u.base64, "base64"), { contentType: u.mimeType, upsert: true });
      if (error) throw new Error(`Failed to store attachment: ${error.message}`);
      storedUploads.push({ path, filename: u.filename, mimeType: u.mimeType, size: u.size });
      if (/pdf/i.test(u.mimeType) || /\.pdf$/i.test(u.filename)) hasPdf = true;
      attachmentMeta.push({ name: u.filename, size: u.size, source: "upload" });
    }
    if (storedUploads.length > 0) {
      await supabaseAdmin.from("email_history").update({ attachments: attachmentMeta }).eq("id", historyRow.id);
    }

    const recipientRows = deduped.map((email) => {
      const m = metaByEmail.get(email) ?? {};
      return {
        user_id: userId,
        email_history_id: historyRow.id,
        email,
        name: m.name ?? null,
        company: m.company ?? null,
        status: "pending" as const,
        tracking_token: trackingEnabled ? crypto.randomUUID() : null,
        pdf_tracking_token: hasPdf ? crypto.randomUUID() : null,
      };
    });
    const { error: rInsErr } = await supabaseAdmin.from("email_recipients").insert(recipientRows);
    if (rInsErr) throw new Error(rInsErr.message);

    const { error: jErr } = await supabaseAdmin.from("send_jobs").insert({
      user_id: userId,
      email_history_id: historyRow.id,
      job_type: "campaign",
      status: "pending",
      run_at: scheduled ? scheduled.toISOString() : new Date().toISOString(),
      payload: {
        mode,
        origin,
        gmailAccountId: conn.id,
        subject: data.subject,
        body: data.body,
        bodyHtml: data.bodyHtml ?? null,
        variables: data.variables ?? {},
        resumeIds: data.resumeIds ?? [],
        uploads: storedUploads,
        trackingEnabled,
      },
    });
    if (jErr) throw new Error(jErr.message);

    if (!scheduled) await kickWorker(origin);

    return {
      ok: true,
      historyId: historyRow.id,
      queued: true,
      scheduled: scheduled ? scheduled.toISOString() : null,
      sendMode: mode,
      recipientCount: deduped.length,
      total: totalRequested,
      skipped: skippedReport,
    };
  });

const scheduleActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["cancel", "send_now", "reschedule"]),
  scheduledAt: z.string().datetime().optional().nullable(),
});

/** Manage a scheduled campaign before it goes out. */
export const manageScheduledCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scheduleActionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: hist } = await context.supabase
      .from("email_history")
      .select("id, status")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!hist) throw new Error("Campaign not found");
    if (!["scheduled", "queued"].includes(hist.status)) throw new Error("This campaign has already started sending.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.action === "cancel") {
      await supabaseAdmin.from("send_jobs").update({ status: "canceled" }).eq("email_history_id", data.id).eq("status", "pending");
      await supabaseAdmin.from("email_history").update({ status: "canceled" }).eq("id", data.id);
      return { ok: true, status: "canceled" };
    }
    if (data.action === "reschedule") {
      if (!data.scheduledAt) throw new Error("A new time is required");
      const iso = new Date(data.scheduledAt).toISOString();
      await supabaseAdmin.from("send_jobs").update({ run_at: iso, status: "pending" }).eq("email_history_id", data.id);
      await supabaseAdmin.from("email_history").update({ scheduled_at: iso, status: "scheduled" }).eq("id", data.id);
      return { ok: true, status: "scheduled" };
    }
    const { kickWorker } = await import("./send-core.server");
    const now = new Date().toISOString();
    await supabaseAdmin.from("send_jobs").update({ run_at: now, status: "pending" }).eq("email_history_id", data.id);
    await supabaseAdmin.from("email_history").update({ scheduled_at: null, status: "queued" }).eq("id", data.id);
    await kickWorker(requestOrigin());
    return { ok: true, status: "queued" };
  });

/** Scheduled + queued campaigns that have not gone out yet. */
export const listPendingCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("email_history")
      .select("id, subject, recipient_count, status, scheduled_at, timezone, sender_email, send_mode, created_at:sent_at")
      .eq("user_id", context.userId)
      .in("status", ["scheduled", "queued", "sending"])
      .order("scheduled_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
