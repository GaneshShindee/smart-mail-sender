import { createFileRoute } from "@tanstack/react-router";
import { parseUserAgent } from "@/lib/user-agent";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/track/pdf/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const token = String(params.token ?? "");
        if (!UUID_RE.test(token)) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rec } = await supabaseAdmin
          .from("email_recipients")
          .select("id, user_id, email_history_id")
          .eq("pdf_tracking_token", token)
          .maybeSingle();
        if (!rec) return new Response("Not found", { status: 404 });

        // Look up the primary attached resume for this campaign.
        const { data: hist } = await supabaseAdmin
          .from("email_history")
          .select("attachments")
          .eq("id", rec.email_history_id)
          .maybeSingle();
        const atts = Array.isArray(hist?.attachments) ? (hist!.attachments as Array<{ name?: string; source?: string }>) : [];
        const pdfName = atts.find((a) => /\.pdf$/i.test(a.name ?? ""))?.name ?? atts[0]?.name ?? null;

        // Log the event (never fail the redirect).
        try {
          const h = request.headers;
          const uaRaw = h.get("user-agent");
          const ua = parseUserAgent(uaRaw);
          const ip =
            h.get("cf-connecting-ip") ??
            h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            h.get("x-real-ip") ??
            null;
          await supabaseAdmin.from("pdf_events").insert({
            user_id: rec.user_id,
            email_history_id: rec.email_history_id,
            email_recipient_id: rec.id,
            tracking_token: token,
            filename: pdfName,
            event_type: "view",
            ip,
            user_agent: uaRaw ?? null,
            device_type: ua.deviceType,
            browser: ua.browser,
            os: ua.os,
            country: h.get("cf-ipcountry") ?? null,
            city: h.get("cf-ipcity") ?? null,
            region: h.get("cf-region") ?? null,
          });
        } catch { /* ignore */ }

        // Try to return a signed URL redirect for the first PDF resume from this user.
        try {
          const { data: resumes } = await supabaseAdmin
            .from("resumes")
            .select("storage_path, original_filename, mime_type")
            .eq("user_id", rec.user_id)
            .eq("original_filename", pdfName ?? "");
          const row = resumes?.[0];
          if (row && row.storage_path.startsWith(`${rec.user_id}/`) && !row.storage_path.includes("..")) {
            const signed = await supabaseAdmin.storage.from("resumes").createSignedUrl(row.storage_path, 60 * 30);
            if (signed.data?.signedUrl) {
              return new Response(null, { status: 302, headers: { Location: signed.data.signedUrl } });
            }
          }
        } catch { /* ignore */ }

        return new Response(
          `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resume opened</title>
<style>
:root{--paper:#f3eedf;--card:#fdfbf4;--ink:#1a1a17;--muted:#5c574b;--red:#d8412f;--blue:#2f4fd1;--dot:rgba(26,26,23,.12);color-scheme:light}
@media (prefers-color-scheme:dark){:root{--paper:#191815;--card:#24231f;--ink:#ece8dc;--muted:#bab4a6;--red:#ef6b55;--blue:#8fa4f2;--dot:rgba(236,232,220,.14);color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background-color:var(--paper);background-image:radial-gradient(var(--dot) 1px,transparent 1.2px);background-size:20px 20px;color:var(--ink)}
.airmail{height:8px;flex:none;background-image:repeating-linear-gradient(-45deg,var(--red) 0 10px,var(--paper) 10px 20px,var(--blue) 20px 30px,var(--paper) 30px 40px)}
main{flex:1;display:grid;place-items:center;padding:32px 16px}
.card{width:100%;max-width:440px;background:var(--card);border:2px solid var(--ink);box-shadow:6px 6px 0 0 var(--ink);padding:24px}
h2{font-stretch:125%;font-weight:800;letter-spacing:-.02em;font-size:26px;line-height:1.1;margin:0 0 12px}
p{color:var(--muted);font-size:15px;line-height:1.55;margin:0}
</style></head><body><div class="airmail" aria-hidden="true"></div><main><div class="card"><h2>Resume opened</h2><p>Thanks — the sender has been notified you viewed the attachment.</p></div></main></body></html>`,
          { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
        );
      },
    },
  },
});