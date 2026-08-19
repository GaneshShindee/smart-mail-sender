import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyTemplate } from "./templating";
import { deriveNames, greetingFor, bodyHasGreeting } from "./recipients";

export type DeliveryFilter = "all" | "delivered" | "bounced" | "unknown";
export type FollowupFilters = {
  campaignId?: string | null;
  opens: "all" | "1" | "2" | "3" | "5" | "10";
  pdf: "all" | "viewed" | "not_viewed" | "1" | "2" | "3";
  clicks: "all" | "clicked" | "not_clicked";
  reply: "all" | "replied" | "not_replied";
  delivery: DeliveryFilter;
  followup: "all" | "done" | "not_done";
  dateRange: "all" | "today" | "yesterday" | "7d" | "30d" | "custom";
  from?: string | null;
  to?: string | null;
  search?: string;
};

const filtersSchema = z.object({
  campaignId: z.string().uuid().nullable().optional(),
  opens: z.enum(["all", "1", "2", "3", "5", "10"]).default("all"),
  pdf: z.enum(["all", "viewed", "not_viewed", "1", "2", "3"]).default("all"),
  clicks: z.enum(["all", "clicked", "not_clicked"]).default("all"),
  reply: z.enum(["all", "replied", "not_replied"]).default("all"),
  delivery: z.enum(["all", "delivered", "bounced", "unknown"]).default("all"),
  followup: z.enum(["all", "done", "not_done"]).default("all"),
  dateRange: z.enum(["all", "today", "yesterday", "7d", "30d", "custom"]).default("all"),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  search: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(500).default(200),
  offset: z.number().int().min(0).default(0),
});

export type RecipientRow = {
  id: string;
  email_history_id: string;
  email: string;
  name: string | null;
  company: string | null;
  status: string;
  open_count: number;
  last_opened_at: string | null;
  click_count: number;
  pdf_view_count: number;
  last_pdf_view_at: string | null;
  replied_at: string | null;
  followup_sent_at: string | null;
  followup_count: number;
  delivery_status: string;
  delivery_error: string | null;
  created_at: string;
  gmail_thread_id: string | null;
  rfc_message_id: string | null;
};

const SELECT =
  "id, email_history_id, email, name, company, status, open_count, last_opened_at, click_count, pdf_view_count, last_pdf_view_at, replied_at, followup_sent_at, followup_count, delivery_status, delivery_error, created_at, gmail_thread_id, rfc_message_id";

function dateFloor(range: FollowupFilters["dateRange"], from?: string | null): string | null {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  switch (range) {
    case "today":
      return startOfToday.toISOString();
    case "yesterday":
      return new Date(startOfToday.getTime() - 24 * 3600_000).toISOString();
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 3600_000).toISOString();
    case "custom":
      return from ? new Date(from).toISOString() : null;
    default:
      return null;
  }
}

function dateCeil(range: FollowupFilters["dateRange"], to?: string | null): string | null {
  if (range === "custom") return to ? new Date(to).toISOString() : null;
  if (range === "yesterday") {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  }
  return null;
}

const DELIVERED = ["accepted", "delivered"];
const BOUNCED = ["bounced", "invalid", "failed"];

/** Campaigns the user can pick in the Follow-up center. */
export const listCampaignOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("email_history")
      .select("id, subject, sent_at, recipient_count, status, send_mode, kind, template_name")
      .eq("user_id", context.userId)
      .eq("kind", "campaign")
      .order("sent_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Server-side filtered recipient list + live summary counts for the active campaign scope. */
export const listFollowupRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filtersSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const floor = dateFloor(data.dateRange, data.from);
    const ceil = dateCeil(data.dateRange, data.to);

    // ── Filtered page of rows ────────────────────────────────────────────────
    let q = supabase.from("email_recipients").select(SELECT, { count: "exact" }).eq("user_id", userId);
    if (data.campaignId) q = q.eq("email_history_id", data.campaignId);
    if (floor) q = q.gte("created_at", floor);
    if (ceil) q = q.lt("created_at", ceil);
    if (data.opens !== "all") q = q.gte("open_count", Number(data.opens));
    if (data.pdf === "viewed") q = q.gt("pdf_view_count", 0);
    else if (data.pdf === "not_viewed") q = q.eq("pdf_view_count", 0);
    else if (data.pdf !== "all") q = q.gte("pdf_view_count", Number(data.pdf));
    if (data.clicks === "clicked") q = q.gt("click_count", 0);
    else if (data.clicks === "not_clicked") q = q.eq("click_count", 0);
    if (data.reply === "replied") q = q.not("replied_at", "is", null);
    else if (data.reply === "not_replied") q = q.is("replied_at", null);
    if (data.delivery === "delivered") q = q.in("delivery_status", DELIVERED);
    else if (data.delivery === "bounced") q = q.in("delivery_status", BOUNCED);
    else if (data.delivery === "unknown") q = q.eq("delivery_status", "unknown");
    if (data.followup === "done") q = q.not("followup_sent_at", "is", null);
    else if (data.followup === "not_done") q = q.is("followup_sent_at", null);
    if (data.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = q.or(`email.ilike.%${s}%,name.ilike.%${s}%,company.ilike.%${s}%`);
    }
    const { data: rows, error, count } = await q
      .order("open_count", { ascending: false })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error(error.message);

    // ── Summary counts over the campaign/date scope (filters excluded) ───────
    let sq = supabase
      .from("email_recipients")
      .select("open_count, click_count, pdf_view_count, replied_at, followup_sent_at, delivery_status")
      .eq("user_id", userId)
      .limit(5000);
    if (data.campaignId) sq = sq.eq("email_history_id", data.campaignId);
    if (floor) sq = sq.gte("created_at", floor);
    if (ceil) sq = sq.lt("created_at", ceil);
    const { data: scope, error: sErr } = await sq;
    if (sErr) throw new Error(sErr.message);
    const list = scope ?? [];
    const summary = {
      all: list.length,
      opened: list.filter((r) => (r.open_count ?? 0) > 0).length,
      opened2: list.filter((r) => (r.open_count ?? 0) >= 2).length,
      pdfViewed: list.filter((r) => (r.pdf_view_count ?? 0) > 0).length,
      clicked: list.filter((r) => (r.click_count ?? 0) > 0).length,
      replied: list.filter((r) => r.replied_at).length,
      bounced: list.filter((r) => BOUNCED.includes(r.delivery_status)).length,
      followedUp: list.filter((r) => r.followup_sent_at).length,
      eligible: list.filter(
        (r) =>
          (r.open_count ?? 0) >= 2 &&
          !r.replied_at &&
          !r.followup_sent_at &&
          DELIVERED.includes(r.delivery_status),
      ).length,
    };

    return { rows: (rows ?? []) as unknown as RecipientRow[], total: count ?? 0, summary };
  });

const sendSchema = z.object({
  recipientIds: z.array(z.string().uuid()).min(1).max(500),
  subject: z.string().min(1).max(998),
  body: z.string().min(1).max(100_000),
  templateId: z.string().uuid().nullable().optional(),
  gmailAccountId: z.string().uuid().nullable().optional(),
  variables: z.record(z.string(), z.string()).optional(),
  resumeIds: z.array(z.string().uuid()).max(10).optional(),
});

/** Send an INDIVIDUAL follow-up to each selected recipient, threaded onto their
 *  original campaign conversation whenever Gmail supports it. Never BCC. */
export const sendFollowupBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sendSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: recipients, error: rErr } = await supabase
      .from("email_recipients")
      .select(SELECT)
      .eq("user_id", userId)
      .in("id", data.recipientIds);
    if (rErr) throw new Error(rErr.message);
    const targets = (recipients ?? []) as unknown as RecipientRow[];

    const skipped: Array<{ email: string; reason: string }> = [];
    const sendable = targets.filter((r) => {
      if (r.replied_at) { skipped.push({ email: r.email, reason: "replied" }); return false; }
      if (BOUNCED.includes(r.delivery_status)) { skipped.push({ email: r.email, reason: "bounced" }); return false; }
      return true;
    });
    if (sendable.length === 0) throw new Error("No eligible recipients — everyone selected replied or bounced.");

    const baseSelect = supabase
      .from("gmail_connections")
      .select("id, gmail_email, display_name, full_name, refresh_token, access_token, expires_at")
      .eq("user_id", userId);
    const { data: conn, error: cErr } = data.gmailAccountId
      ? await baseSelect.eq("id", data.gmailAccountId).maybeSingle()
      : await baseSelect.order("is_default", { ascending: false }).order("connected_at", { ascending: true }).limit(1).maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!conn) throw new Error("Gmail is not connected.");

    const { refreshAccessToken, buildRawEmailWithAttachments, gmailSend, gmailRfcMessageId, formatFromHeader } =
      await import("./gmail.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let accessToken = conn.access_token ?? "";
    const expired = !conn.expires_at || new Date(conn.expires_at).getTime() < Date.now() + 30_000;
    if (!accessToken || expired) {
      const r = await refreshAccessToken(conn.refresh_token);
      accessToken = r.access_token;
      await supabaseAdmin
        .from("gmail_connections")
        .update({ access_token: accessToken, expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString() })
        .eq("id", conn.id);
    }

    const { data: prof } = await supabase
      .from("profiles").select("tracking_open_enabled").eq("id", userId).maybeSingle();
    const trackingEnabled = (prof as { tracking_open_enabled?: boolean } | null)?.tracking_open_enabled ?? true;

    // Attachments (saved resumes only — follow-ups reuse library files).
    type Att = { filename: string; mimeType: string; data: Buffer; size: number };
    const attachments: Att[] = [];
    if (data.resumeIds && data.resumeIds.length > 0) {
      const { data: files, error: fErr } = await supabase
        .from("resumes")
        .select("id, storage_path, original_filename, mime_type, size_bytes")
        .in("id", data.resumeIds)
        .eq("user_id", userId);
      if (fErr) throw new Error(fErr.message);
      for (const f of files ?? []) {
        const { data: blob, error: dErr } = await supabaseAdmin.storage.from("resumes").download(f.storage_path);
        if (dErr || !blob) throw new Error(`Failed to read resume: ${dErr?.message ?? "missing"}`);
        attachments.push({
          filename: f.original_filename,
          mimeType: f.mime_type,
          data: Buffer.from(await blob.arrayBuffer()),
          size: f.size_bytes,
        });
      }
    }
    const hasPdf = attachments.some((a) => /pdf/i.test(a.mimeType) || /\.pdf$/i.test(a.filename));

    const proto = getRequestHeader("x-forwarded-proto") ?? "https";
    const origin = `${proto}://${getRequestHost()}`;
    const displayName = (conn.display_name ?? conn.full_name ?? "").trim() || null;
    const fromHeader = formatFromHeader(conn.gmail_email, displayName);
    const globalVars = data.variables ?? {};

    // Child campaign row so the follow-up batch shows up in History.
    const { data: child } = await supabaseAdmin
      .from("email_history")
      .insert({
        user_id: userId,
        template_id: data.templateId ?? null,
        recipient: sendable.map((r) => r.email).join(", "),
        subject: data.subject,
        body: data.body,
        status: "sending",
        kind: "followup",
        send_mode: "individual",
        gmail_account_id: conn.id,
        sender_email: conn.gmail_email,
        recipient_count: sendable.length,
        tracking_enabled: trackingEnabled,
        parent_campaign_id: sendable[0]?.email_history_id ?? null,
      })
      .select("id")
      .single();

    let sent = 0;
    let failed = 0;
    let firstError: string | null = null;

    const one = async (row: RecipientRow) => {
      // Ensure tracking tokens exist so follow-up engagement is measurable.
      let trackToken: string | null = null;
      let pdfToken: string | null = null;
      const { data: cur } = await supabaseAdmin
        .from("email_recipients")
        .select("tracking_token, pdf_tracking_token")
        .eq("id", row.id)
        .maybeSingle();
      trackToken = cur?.tracking_token ?? null;
      pdfToken = cur?.pdf_tracking_token ?? null;
      const patch: { tracking_token?: string; pdf_tracking_token?: string } = {};
      if (trackingEnabled && !trackToken) { trackToken = crypto.randomUUID(); patch.tracking_token = trackToken; }
      if (hasPdf && !pdfToken) { pdfToken = crypto.randomUUID(); patch.pdf_tracking_token = pdfToken; }
      if (Object.keys(patch).length) await supabaseAdmin.from("email_recipients").update(patch).eq("id", row.id);

      const names = deriveNames(row.email, row.name);
      const greeting = greetingFor(row.email, row.name);
      const vars: Record<string, string> = {
        first_name: names.first_name || "there",
        last_name: names.last_name,
        full_name: names.full_name || names.first_name || "there",
        name: names.full_name || names.first_name || "there",
        greeting,
        company: row.company ?? "",
        sender_name: displayName ?? conn.gmail_email,
        date: new Date().toLocaleDateString(),
        ...globalVars,
      };
      let subject = applyTemplate(data.subject, vars);
      let body = applyTemplate(data.body, vars);
      if (!bodyHasGreeting(data.body)) body = `${greeting}\n\n${body}`;
      if (hasPdf && pdfToken) {
        body = `${body}\n\n📎 View attached resume: ${origin}/api/public/track/pdf/${pdfToken}`;
      }
      // Threaded reply → keep the original subject with a single Re: prefix.
      if (row.rfc_message_id && !/^re:/i.test(subject)) subject = `Re: ${subject}`;

      try {
        const raw = buildRawEmailWithAttachments({
          from: fromHeader,
          to: row.name ? formatFromHeader(row.email, row.name) : row.email,
          subject,
          body,
          attachments,
          trackingPixelUrl:
            trackingEnabled && trackToken ? `${origin}/api/public/track/open/${trackToken}` : undefined,
          inReplyTo: row.rfc_message_id,
          references: row.rfc_message_id,
        });
        const msg = await gmailSend(accessToken, raw, row.gmail_thread_id);
        sent += 1;
        const rfc = row.rfc_message_id ?? (await gmailRfcMessageId(accessToken, msg.id));
        await supabaseAdmin
          .from("email_recipients")
          .update({
            followup_sent_at: new Date().toISOString(),
            followup_count: (row.followup_count ?? 0) + 1,
            gmail_thread_id: row.gmail_thread_id ?? msg.threadId ?? null,
            rfc_message_id: rfc,
            delivery_status: BOUNCED.includes(row.delivery_status) ? row.delivery_status : "accepted",
          })
          .eq("id", row.id);
        await supabaseAdmin.from("followup_queue").insert({
          user_id: userId,
          recipient_id: row.id,
          campaign_id: row.email_history_id,
          recipient_email: row.email,
          recipient_name: row.name ?? "",
          company: row.company ?? "",
          condition: (row.pdf_view_count ?? 0) > 0 ? "clicked_pdf" : (row.open_count ?? 0) >= 2 ? "opened_multi" : "opened",
          open_count: row.open_count ?? 0,
          last_open_at: row.last_opened_at,
          pdf_click_at: row.last_pdf_view_at,
          priority: (row.pdf_view_count ?? 0) * 10 + (row.open_count ?? 0),
          status: "sent",
          sent_at: new Date().toISOString(),
          gmail_connection_id: conn.id,
          suggested_template_id: data.templateId ?? null,
        });
      } catch (err) {
        failed += 1;
        const m = err instanceof Error ? err.message : String(err);
        if (!firstError) firstError = m;
      }
    };

    const queue = [...sendable];
    const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) return;
        await one(next);
      }
    });
    await Promise.all(workers);

    if (child) {
      await supabaseAdmin
        .from("email_history")
        .update({
          status: failed === 0 ? "sent" : sent === 0 ? "failed" : "partial",
          error: firstError ? String(firstError).slice(0, 1000) : null,
        })
        .eq("id", child.id);
    }

    if (sent === 0) throw new Error(firstError ?? "All follow-ups failed");
    return { ok: true, sent, failed, skipped, historyId: child?.id ?? null };
  });
