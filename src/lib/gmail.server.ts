// Server-only helpers for Gmail OAuth + API.
import { createHmac, timingSafeEqual } from "crypto";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "openid",
  "email",
  "profile",
].join(" ");

export function gmailScopes() { return GMAIL_SCOPES; }

export function requireGmailEnv() {
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Gmail OAuth is not configured. Add GOOGLE_GMAIL_CLIENT_ID and GOOGLE_GMAIL_CLIENT_SECRET secrets.");
  }
  return { clientId, clientSecret };
}

function signingSecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "dev-signing-secret";
}

export function signState(userId: string): string {
  const ts = Date.now().toString();
  const payload = `${userId}.${ts}`;
  const sig = createHmac("sha256", signingSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyState(state: string): { userId: string } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const [userId, ts, sig] = decoded.split(".");
    if (!userId || !ts || !sig) return null;
    const expected = createHmac("sha256", signingSecret()).update(`${userId}.${ts}`).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    if (Date.now() - Number(ts) > 15 * 60 * 1000) return null;
    return { userId };
  } catch {
    return null;
  }
}

export function buildAuthUrl(opts: { redirectUri: string; state: string }) {
  const { clientId } = requireGmailEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: opts.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const { clientId, clientSecret } = requireGmailEnv();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
    id_token?: string;
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = requireGmailEnv();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { access_token: string; expires_in: number; scope: string };
}

export async function fetchUserEmail(accessToken: string): Promise<string> {
  const info = await fetchUserInfo(accessToken);
  return info.email;
}

export async function fetchUserInfo(accessToken: string): Promise<{ email: string; name?: string; picture?: string }> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch userinfo");
  const json = (await res.json()) as { email: string; name?: string; picture?: string };
  return { email: json.email, name: json.name, picture: json.picture };
}

function base64url(input: string) {
  return Buffer.from(input, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function htmlEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function textToHtml(text: string, pixelUrl?: string) {
  const body = htmlEscape(text).replace(/\r?\n/g, "<br>\n");
  const pixel = pixelUrl
    ? `\n<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;border:0;height:1px;width:1px" />`
    : "";
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;white-space:normal">${body}${pixel}</body></html>`;
}

/** Returns headers + body for the message body — plain text, or multipart/alternative when a pixel is present. */
function buildBodyMime(text: string, pixelUrl?: string): { contentType: string; body: string } {
  if (!pixelUrl) {
    return { contentType: `text/plain; charset="UTF-8"`, body: text };
  }
  const boundary = `=_alt_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  const html = textToHtml(text, pixelUrl);
  const body = [
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    text,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    html,
    `--${boundary}--`,
  ].join("\r\n");
  return { contentType: `multipart/alternative; boundary="${boundary}"`, body };
}

export function buildRawEmail(opts: {
  from: string; to: string; bcc?: string; subject: string; body: string; trackingPixelUrl?: string;
}) {
  const mime = buildBodyMime(opts.body, opts.trackingPixelUrl);
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    opts.bcc ? `Bcc: ${opts.bcc}` : null,
    `Subject: ${encodeHeader(opts.subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: ${mime.contentType}`,
    ``,
    mime.body,
  ].filter(Boolean).join("\r\n");
  return base64url(lines);
}

export type EmailAttachment = {
  filename: string;
  mimeType: string;
  /** Raw bytes as a Buffer. */
  data: Buffer;
};

function wrapBase64(b64: string, width = 76) {
  const out: string[] = [];
  for (let i = 0; i < b64.length; i += width) out.push(b64.slice(i, i + width));
  return out.join("\r\n");
}

function encodeHeader(value: string) {
  // RFC 2047 encoded-word for non-ASCII filenames/subjects.
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
    : value;
}

export function buildRawEmailWithAttachments(opts: {
  from: string;
  to: string;
  bcc?: string;
  subject: string;
  body: string;
  attachments: EmailAttachment[];
  trackingPixelUrl?: string;
}) {
  if (!opts.attachments || opts.attachments.length === 0) {
    return buildRawEmail({
      from: opts.from, to: opts.to, bcc: opts.bcc, subject: opts.subject, body: opts.body,
      trackingPixelUrl: opts.trackingPixelUrl,
    });
  }
  const boundary = `=_ses_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    opts.bcc ? `Bcc: ${opts.bcc}` : null,
    `Subject: ${encodeHeader(opts.subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].filter(Boolean);

  const bodyMime = buildBodyMime(opts.body, opts.trackingPixelUrl);
  const parts: string[] = [];
  parts.push(`--${boundary}`);
  parts.push(`Content-Type: ${bodyMime.contentType}`);
  if (!opts.trackingPixelUrl) parts.push(`Content-Transfer-Encoding: 7bit`);
  parts.push("");
  parts.push(bodyMime.body);

  for (const att of opts.attachments) {
    const fname = encodeHeader(att.filename);
    parts.push(`--${boundary}`);
    parts.push(`Content-Type: ${att.mimeType}; name="${fname}"`);
    parts.push(`Content-Disposition: attachment; filename="${fname}"`);
    parts.push(`Content-Transfer-Encoding: base64`);
    parts.push("");
    parts.push(wrapBase64(att.data.toString("base64")));
  }
  parts.push(`--${boundary}--`);

  const message = headers.join("\r\n") + "\r\n\r\n" + parts.join("\r\n");
  return Buffer.from(message, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function gmailSend(accessToken: string, raw: string) {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`Gmail send failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; threadId: string };
}

export function callbackRedirectUri(origin: string) {
  return `${origin}/api/public/gmail/callback`;
}