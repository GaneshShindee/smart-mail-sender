/**
 * Server-only sending engine shared by the enqueue path, the background worker
 * (scheduled + immediate campaigns), follow-ups and replies.
 *
 * Delivery rules enforced here:
 *  - mode "bcc"        -> ONE outgoing Gmail message, every recipient in Bcc,
 *                         no To header (recipients stay private, no self-copy).
 *  - mode "individual" -> one message per recipient, To = that recipient only,
 *                         unique open pixel + unique tracked resume link,
 *                         threaded with In-Reply-To/References/threadId when known.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { applyTemplate } from "./templating";
import { deriveNames, greetingFor, bodyHasGreeting } from "./recipients";
import {
  refreshAccessToken,
  buildRawEmailWithAttachments,
  gmailSend,
  formatFromHeader,
  gmailGetMessage,
  headerVal,
  type EmailAttachment,
} from "./gmail.server";

export type SendMode = "bcc" | "individual";

export type StoredUpload = { path: string; filename: string; mimeType: string; size: number };

export type SendJobPayload = {
  mode: SendMode;
  origin: string;
  gmailAccountId: string;
  subject: string;
  body: string;
  bodyHtml?: string | null;
  variables?: Record<string, string>;
  resumeIds?: string[];
  uploads?: StoredUpload[];
  trackingEnabled: boolean;
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
};

export type RecipientRow = {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  tracking_token: string | null;
  pdf_tracking_token: string | null;
};

export type Connection = {
  id: string;
  gmail_email: string;
  display_name: string | null;
  full_name: string | null;
  refresh_token: string;
  access_token: string | null;
  expires_at: string | null;
};

export async function loadConnection(userId: string, id?: string | null): Promise<Connection> {
  const base = supabaseAdmin
    .from("gmail_connections")
    .select("id, gmail_email, display_name, full_name, refresh_token, access_token, expires_at")
    .eq("user_id", userId);
  const { data, error } = id
    ? await base.eq("id", id).maybeSingle()
    : await base.order("is_default", { ascending: false }).order("connected_at", { ascending: true }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Gmail is not connected. Connect Gmail in Settings.");
  return data as Connection;
}

export async function accessTokenFor(conn: Connection): Promise<string> {
  const expired = !conn.expires_at || new Date(conn.expires_at).getTime() < Date.now() + 30_000;
  if (conn.access_token && !expired) return conn.access_token;
  const refreshed = await refreshAccessToken(conn.refresh_token);
  await supabaseAdmin
    .from("gmail_connections")
    .update({
      access_token: refreshed.access_token,
      expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    })
    .eq("id", conn.id);
  return refreshed.access_token;
}

export async function resolveAttachments(
  userId: string,
  resumeIds: string[] | undefined,
  uploads: StoredUpload[] | undefined,
): Promise<{ attachments: EmailAttachment[]; meta: Array<{ name: string; size: number; source: string }> }> {
  const attachments: EmailAttachment[] = [];
  const meta: Array<{ name: string; size: number; source: string }> = [];

  if (resumeIds && resumeIds.length > 0) {
    const { data: rows, error } = await supabaseAdmin
      .from("resumes")
      .select("id, storage_path, original_filename, mime_type, size_bytes")
      .in("id", resumeIds)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    for (const r of rows ?? []) {
      const { data: blob, error: dErr } = await supabaseAdmin.storage.from("resumes").download(r.storage_path);
      if (dErr || !blob) throw new Error(`Failed to read resume: ${dErr?.message ?? "missing"}`);
      attachments.push({
        filename: r.original_filename,
        mimeType: r.mime_type,
        data: Buffer.from(await blob.arrayBuffer()),
        size: r.size_bytes,
      });
      meta.push({ name: r.original_filename, size: r.size_bytes, source: "resume" });
    }
  }

  for (const u of uploads ?? []) {
    const { data: blob, error } = await supabaseAdmin.storage.from("draft-attachments").download(u.path);
    if (error || !blob) throw new Error(`Failed to read attachment: ${error?.message ?? "missing"}`);
    attachments.push({
      filename: u.filename,
      mimeType: u.mimeType,
      data: Buffer.from(await blob.arrayBuffer()),
      size: u.size,
    });
    meta.push({ name: u.filename, size: u.size, source: "upload" });
  }

  const total = attachments.reduce((n, a) => n + a.size, 0);
  if (total > 25 * 1024 * 1024) throw new Error("Attachments exceed 25 MB total.");
  return { attachments, meta };
}

function hasPdfAttachment(attachments: EmailAttachment[]) {
  return attachments.some((a) => /pdf/i.test(a.mimeType) || /\.pdf$/i.test(a.filename));
}

function baseVars(conn: Connection, globalVars: Record<string, string>) {
  const displayName = (conn.display_name ?? conn.full_name ?? "").trim() || null;
  return {
    displayName,
    vars: {
      first_name: "",
      last_name: "",
      full_name: "",
      name: "there",
      sender_name: displayName ?? conn.gmail_email,
      company: "",
      designation: "",
      location: "",
      date: new Date().toLocaleDateString(),
      ...globalVars,
    } as Record<string, string>,
  };
}

/** Append the tracked resume link (HTML + text) when a PDF is attached. */
function withPdfLink(text: string, html: string | null, url: string | null) {
  if (!url) return { text, html };
  return {
    text: `${text}\n\n📎 View attached resume: ${url}`,
    html: html ? `${html}<p style="margin-top:16px">📎 <a href="${url}">View attached resume</a></p>` : null,
  };
}

async function readRfcMessageId(accessToken: string, messageId: string): Promise<string | null> {
  try {
    const msg = await gmailGetMessage(accessToken, messageId);
    return headerVal(msg, "Message-ID") ?? headerVal(msg, "Message-Id") ?? null;
  } catch {
    return null;
  }
}

/**
 * Send a single individual message (follow-up, reply, or one recipient of an
 * individual-mode campaign) and persist threading identifiers.
 */
export async function sendIndividual(opts: {
  accessToken: string;
  fromHeader: string;
  to: string;
  subject: string;
  text: string;
  html?: string | null;
  attachments: EmailAttachment[];
  pixelUrl?: string;
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
}) {
  const raw = buildRawEmailWithAttachments({
    from: opts.fromHeader,
    to: opts.to,
    subject: opts.subject,
    body: opts.text,
    html: opts.html ?? null,
    attachments: opts.attachments,
    trackingPixelUrl: opts.pixelUrl,
    inReplyTo: opts.inReplyTo ?? null,
    references: opts.references ?? null,
  });
  const res = await gmailSend(opts.accessToken, raw, opts.threadId ?? null);
  const rfcId = await readRfcMessageId(opts.accessToken, res.id);
  return { messageId: res.id, threadId: res.threadId, rfcMessageId: rfcId };
}

/** Execute a queued campaign: one BCC message, or one message per recipient. */
export async function runCampaign(historyId: string): Promise<{ sent: number; failed: number; status: string }> {
  const { data: hist, error: hErr } = await supabaseAdmin
    .from("email_history")
    .select("id, user_id, send_mode, subject, body, body_html, tracking_token, tracking_enabled, gmail_account_id, gmail_thread_id, rfc_message_id")
    .eq("id", historyId)
    .maybeSingle();
  if (hErr || !hist) throw new Error(hErr?.message ?? "Campaign not found");

  const { data: job } = await supabaseAdmin
    .from("send_jobs")
    .select("payload")
    .eq("email_history_id", historyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const payload = (job?.payload ?? {}) as SendJobPayload;

  const userId = hist.user_id as string;
  const conn = await loadConnection(userId, hist.gmail_account_id ?? payload.gmailAccountId);
  const accessToken = await accessTokenFor(conn);
  const { attachments } = await resolveAttachments(userId, payload.resumeIds, payload.uploads);
  const hasPdf = hasPdfAttachment(attachments);
  const { displayName, vars } = baseVars(conn, payload.variables ?? {});
  const fromHeader = formatFromHeader(conn.gmail_email, displayName);
  const trackingEnabled = hist.tracking_enabled !== false && payload.trackingEnabled !== false;
  const origin = payload.origin;

  const { data: recipients, error: rErr } = await supabaseAdmin
    .from("email_recipients")
    .select("id, email, name, company, tracking_token, pdf_tracking_token")
    .eq("email_history_id", historyId);
  if (rErr) throw new Error(rErr.message);
  const rows = (recipients ?? []) as RecipientRow[];
  if (rows.length === 0) throw new Error("No recipients to send to");

  await supabaseAdmin.from("email_history").update({ status: "sending" }).eq("id", historyId);

  let sent = 0;
  let failed = 0;
  let firstError: string | null = null;

  if ((hist.send_mode ?? "bcc") === "bcc") {
    // ONE message, all recipients in Bcc. Campaign-level tracking token drives the pixel.
    const subject = applyTemplate(payload.subject ?? hist.subject, vars);
    let text = applyTemplate(payload.body ?? hist.body, vars);
    let html = payload.bodyHtml ? applyTemplate(payload.bodyHtml, vars) : null;
    const token = hist.tracking_token as string | null;
    const pixelUrl = trackingEnabled && token ? `${origin}/api/public/track/open/${token}` : undefined;
    const pdfUrl = hasPdf && token ? `${origin}/api/public/track/pdf/${token}` : null;
    ({ text, html } = withPdfLink(text, html, pdfUrl));

    try {
      const raw = buildRawEmailWithAttachments({
        from: fromHeader,
        to: null, // recipients stay private; no self-copy
        bcc: rows.map((r) => r.email).join(", "),
        subject,
        body: text,
        html,
        attachments,
        trackingPixelUrl: pixelUrl,
      });
      const res = await gmailSend(accessToken, raw, null);
      const rfcId = await readRfcMessageId(accessToken, res.id);
      sent = rows.length;
      await supabaseAdmin
        .from("email_recipients")
        .update({ status: "sent", gmail_message_id: res.id, gmail_thread_id: res.threadId, rfc_message_id: rfcId })
        .eq("email_history_id", historyId);
      await supabaseAdmin
        .from("email_history")
        .update({ gmail_message_id: res.id, gmail_thread_id: res.threadId, rfc_message_id: rfcId })
        .eq("id", historyId);
    } catch (err) {
      failed = rows.length;
      firstError = err instanceof Error ? err.message : String(err);
      await supabaseAdmin.from("email_recipients").update({ status: "failed" }).eq("email_history_id", historyId);
    }
  } else {
    // Individual messages — unique pixel and tracked resume link per recipient.
    const CONCURRENCY = 4;
    const queue = [...rows];
    const one = async (row: RecipientRow) => {
      const names = deriveNames(row.email, row.name);
      const greeting = greetingFor(row.email, row.name);
      const perVars: Record<string, string> = {
        ...vars,
        first_name: names.first_name || "there",
        last_name: names.last_name,
        full_name: names.full_name || names.first_name || "there",
        name: names.full_name || names.first_name || "there",
        greeting,
        company: row.company ?? vars.company ?? "",
      };
      const subject = applyTemplate(payload.subject ?? hist.subject, perVars);
      let text = applyTemplate(payload.body ?? hist.body, perVars);
      let html = payload.bodyHtml ? applyTemplate(payload.bodyHtml, perVars) : null;
      if (!bodyHasGreeting(payload.body ?? hist.body)) {
        text = `${greeting}\n\n${text}`;
        if (html) html = `<p>${greeting}</p>${html}`;
      }
      const pixelUrl =
        trackingEnabled && row.tracking_token ? `${origin}/api/public/track/open/${row.tracking_token}` : undefined;
      const pdfUrl = hasPdf && row.pdf_tracking_token ? `${origin}/api/public/track/pdf/${row.pdf_tracking_token}` : null;
      ({ text, html } = withPdfLink(text, html, pdfUrl));

      try {
        const res = await sendIndividual({
          accessToken,
          fromHeader,
          to: row.email,
          subject,
          text,
          html,
          attachments,
          pixelUrl,
          threadId: payload.threadId ?? null,
          inReplyTo: payload.inReplyTo ?? null,
          references: payload.references ?? null,
        });
        sent += 1;
        await supabaseAdmin
          .from("email_recipients")
          .update({
            status: "sent",
            gmail_message_id: res.messageId,
            gmail_thread_id: res.threadId,
            rfc_message_id: res.rfcMessageId,
          })
          .eq("id", row.id);
      } catch (err) {
        failed += 1;
        if (!firstError) firstError = err instanceof Error ? err.message : String(err);
        await supabaseAdmin.from("email_recipients").update({ status: "failed" }).eq("id", row.id);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        for (;;) {
          const next = queue.shift();
          if (!next) return;
          await one(next);
        }
      }),
    );
  }

  const status = failed === 0 ? "sent" : sent === 0 ? "failed" : "partial";
  await supabaseAdmin
    .from("email_history")
    .update({ status, error: firstError ? firstError.slice(0, 1000) : null, sent_at: new Date().toISOString() })
    .eq("id", historyId);
  return { sent, failed, status };
}

/** Claim and run every due job. Safe to call concurrently: claims are atomic per row. */
export async function processDueJobs(limit = 5): Promise<{ processed: number }> {
  const nowIso = new Date().toISOString();
  const { data: due } = await supabaseAdmin
    .from("send_jobs")
    .select("id, email_history_id, attempts")
    .eq("status", "pending")
    .lte("run_at", nowIso)
    .order("run_at", { ascending: true })
    .limit(limit);

  let processed = 0;
  for (const job of due ?? []) {
    // Atomic claim — only one worker transitions pending -> processing.
    const { data: claimed } = await supabaseAdmin
      .from("send_jobs")
      .update({ status: "processing", locked_at: new Date().toISOString(), attempts: (job.attempts ?? 0) + 1 })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    try {
      await runCampaign(job.email_history_id as string);
      await supabaseAdmin.from("send_jobs").update({ status: "done", last_error: null }).eq("id", job.id);
      processed += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const attempts = (job.attempts ?? 0) + 1;
      const giveUp = attempts >= 3;
      await supabaseAdmin
        .from("send_jobs")
        .update({
          status: giveUp ? "failed" : "pending",
          run_at: giveUp ? nowIso : new Date(Date.now() + 60_000).toISOString(),
          last_error: msg.slice(0, 1000),
        })
        .eq("id", job.id);
      if (giveUp) {
        await supabaseAdmin
          .from("email_history")
          .update({ status: "failed", error: msg.slice(0, 1000) })
          .eq("id", job.email_history_id as string);
      }
    }
  }
  return { processed };
}
