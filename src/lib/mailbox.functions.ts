import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Read-only view of a connected Gmail account's Inbox / Sent folders. */

export type MailboxFolder = "inbox" | "sent";

export type MailboxMessage = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string | null;
  snippet: string;
  unread: boolean;
};

export type MailboxPage = {
  accountEmail: string;
  messages: MailboxMessage[];
  nextPageToken: string | null;
};

export type MailboxMessageDetail = MailboxMessage & {
  cc: string;
  text: string;
  html: string | null;
  attachments: string[];
};

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const FOLDER_LABEL: Record<MailboxFolder, string> = { inbox: "INBOX", sent: "SENT" };

/** Resolve the requested (or default) Gmail account and return a fresh access token. */
async function gmailAccessToken(
  supabase: SupabaseClient<Database>,
  userId: string,
  accountId?: string | null,
) {
  const base = supabase
    .from("gmail_connections")
    .select("id, gmail_email, refresh_token, access_token, expires_at")
    .eq("user_id", userId);
  const { data: conn, error } = accountId
    ? await base.eq("id", accountId).maybeSingle()
    : await base
        .order("is_default", { ascending: false })
        .order("connected_at", { ascending: true })
        .limit(1)
        .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conn) throw new Error("Gmail is not connected. Connect Gmail in Settings.");

  let accessToken = conn.access_token ?? "";
  const expired = !conn.expires_at || new Date(conn.expires_at).getTime() < Date.now() + 30_000;
  if (!accessToken || expired) {
    const { refreshAccessToken } = await import("./gmail.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await refreshAccessToken(conn.refresh_token);
    accessToken = r.access_token;
    await supabaseAdmin
      .from("gmail_connections")
      .update({
        access_token: accessToken,
        expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(),
      })
      .eq("id", conn.id);
  }
  return { accessToken, email: conn.gmail_email };
}

async function gmailGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail request failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
};

type GmailRawMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};

function header(msg: GmailRawMessage, name: string): string {
  const hit = msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return hit?.value ?? "";
}

/** Gmail snippets arrive HTML-entity encoded (`&#39;`, `&amp;` …). */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function decodeB64Url(s: string): string {
  try {
    return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

function toSummary(msg: GmailRawMessage): MailboxMessage {
  const internal = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null;
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: header(msg, "From"),
    to: header(msg, "To"),
    subject: header(msg, "Subject"),
    date: internal,
    snippet: decodeEntities(msg.snippet ?? ""),
    unread: (msg.labelIds ?? []).includes("UNREAD"),
  };
}

/** Run `fn` over `items` with at most `limit` in flight, preserving order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export const listMailbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        accountId: z.string().uuid().optional().nullable(),
        folder: z.enum(["inbox", "sent"]).default("inbox"),
        pageToken: z.string().max(200).optional().nullable(),
        max: z.number().int().min(1).max(100).default(50),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<MailboxPage> => {
    const { accessToken, email } = await gmailAccessToken(
      context.supabase,
      context.userId,
      data.accountId,
    );
    const params = new URLSearchParams({
      maxResults: String(data.max),
      labelIds: FOLDER_LABEL[data.folder],
    });
    if (data.pageToken) params.set("pageToken", data.pageToken);
    const list = await gmailGet<{ messages?: Array<{ id: string }>; nextPageToken?: string }>(
      accessToken,
      `/messages?${params.toString()}`,
    );

    const meta = new URLSearchParams({ format: "metadata" });
    for (const h of ["From", "To", "Subject"]) meta.append("metadataHeaders", h);
    const messages = await mapLimit(list.messages ?? [], 10, (m) =>
      gmailGet<GmailRawMessage>(accessToken, `/messages/${m.id}?${meta.toString()}`).then(
        toSummary,
      ),
    );
    return { accountEmail: email, messages, nextPageToken: list.nextPageToken ?? null };
  });

export const getMailboxMessage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ accountId: z.string().uuid().optional().nullable(), id: z.string().min(1).max(64) })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<MailboxMessageDetail> => {
    const { accessToken } = await gmailAccessToken(
      context.supabase,
      context.userId,
      data.accountId,
    );
    const msg = await gmailGet<GmailRawMessage>(
      accessToken,
      `/messages/${encodeURIComponent(data.id)}?format=full`,
    );

    const body: { text: string; html: string | null } = { text: "", html: null };
    const attachments: string[] = [];
    const walk = (p: GmailPart) => {
      if (p.filename && p.body?.attachmentId) {
        attachments.push(p.filename);
        return;
      }
      if (p.mimeType === "text/plain" && p.body?.data && !body.text)
        body.text = decodeB64Url(p.body.data);
      else if (p.mimeType === "text/html" && p.body?.data && !body.html)
        body.html = decodeB64Url(p.body.data);
      for (const c of p.parts ?? []) walk(c);
    };
    if (msg.payload) walk(msg.payload);

    // Opening a message here counts as reading it, same as in Gmail. Best-effort.
    if ((msg.labelIds ?? []).includes("UNREAD")) {
      await fetch(`${GMAIL_API}/messages/${encodeURIComponent(data.id)}/modify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
      }).catch(() => undefined);
    }

    return {
      ...toSummary(msg),
      unread: false,
      cc: header(msg, "Cc"),
      text: body.text || (body.html ? "" : decodeEntities(msg.snippet ?? "")),
      html: body.html,
      attachments,
    };
  });
