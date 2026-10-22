import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

export const Route = createFileRoute("/api/public/gmail/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const origin = `${url.protocol}//${url.host}`;

        const finish = (msg: string, ok: boolean) =>
          new Response(html(msg, ok, origin), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

        if (error) return finish(`Google returned: ${error}`, false);
        if (!code || !state) return finish("Missing code or state.", false);

        const { verifyState, exchangeCode, fetchUserInfo, callbackRedirectUri } = await import("@/lib/gmail.server");
        const parsed = verifyState(state);
        if (!parsed) return finish("Invalid or expired authorization state.", false);

        try {
          const tokens = await exchangeCode(code, callbackRedirectUri(origin));
          if (!tokens.refresh_token) {
            return finish("Google did not return a refresh token. Try again and approve all requested permissions.", false);
          }
          const info = await fetchUserInfo(tokens.access_token);
          const email = info.email;
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Does this user already have any accounts? If not, this one becomes default.
          const { count: existingCount } = await supabaseAdmin
            .from("gmail_connections")
            .select("id", { count: "exact", head: true })
            .eq("user_id", parsed.userId);
          const shouldBeDefault = !existingCount || existingCount === 0;

          const { error: upErr } = await supabaseAdmin
            .from("gmail_connections")
            .upsert(
              {
                user_id: parsed.userId,
                gmail_email: email,
                refresh_token: tokens.refresh_token,
                access_token: tokens.access_token,
                expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
                scope: tokens.scope,
                full_name: info.name ?? null,
                avatar_url: info.picture ?? null,
                is_default: shouldBeDefault,
                reads_enabled: /gmail\.readonly/.test(tokens.scope ?? ""),
              },
              { onConflict: "user_id,gmail_email" },
            );
          if (upErr) return finish(`Failed to save Gmail connection: ${upErr.message}`, false);
          return finish(`Connected ${email}. You can close this tab.`, true);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return finish(`Connection failed: ${msg}`, false);
        }
      },
    },
  },
});

function html(message: string, ok: boolean, origin: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gmail connection</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=JetBrains+Mono:wght@500;700&display=swap">
<style>
:root{--paper:#f3eedf;--card:#fdfbf4;--ink:#1a1a17;--muted:#5c574b;--yellow:#ffd93d;--red:#d8412f;--blue:#2f4fd1;--dot:rgba(26,26,23,.12);--ok:#bfe8c9;--bad:#f5c3b8;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--paper:#191815;--card:#24231f;--ink:#ece8dc;--muted:#bab4a6;--red:#ef6b55;--blue:#8fa4f2;--dot:rgba(236,232,220,.14);--ok:#2f5a3a;--bad:#6b2e25;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;font-family:"Archivo",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background-color:var(--paper);background-image:radial-gradient(var(--dot) 1px,transparent 1.2px);background-size:20px 20px;color:var(--ink);-webkit-font-smoothing:antialiased}
.airmail{height:8px;flex:none;background-image:repeating-linear-gradient(-45deg,var(--red) 0 10px,var(--paper) 10px 20px,var(--blue) 20px 30px,var(--paper) 30px 40px)}
main{flex:1;display:grid;place-items:center;padding:32px 16px}
.card{width:100%;max-width:440px;background:var(--card);border:2px solid var(--ink);box-shadow:6px 6px 0 0 var(--ink)}
.head{border-bottom:2px solid var(--ink);padding:20px 24px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.eyebrow{font-family:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0}
.stamp{font-family:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:2px 6px;border:2px solid currentColor;outline:1px solid currentColor;outline-offset:2px;transform:rotate(-4deg);color:var(--red)}
.stamp.ok{color:var(--ink);background:var(--ok)}
.body{padding:24px}
h1{font-stretch:125%;font-weight:800;letter-spacing:-.02em;font-size:28px;line-height:1.05;margin:0 0 12px}
p{color:var(--muted);font-size:15px;line-height:1.55;margin:0 0 24px;overflow-wrap:anywhere}
a{display:inline-flex;align-items:center;gap:8px;min-height:44px;background:var(--yellow);color:#1a1a17;border:2px solid var(--ink);box-shadow:3px 3px 0 0 var(--ink);padding:0 18px;font-weight:700;font-size:15px;text-decoration:none;transition:transform 140ms,box-shadow 140ms}
a:hover{transform:translate(-2px,-2px);box-shadow:5px 5px 0 0 var(--ink)}
a:active{transform:translate(3px,3px);box-shadow:0 0 0 0 var(--ink)}
a:focus-visible{outline:3px solid var(--blue);outline-offset:2px}
@media (prefers-reduced-motion:reduce){a{transition:none}}
</style>
</head><body><div class="airmail" aria-hidden="true"></div><main><div class="card">
<div class="head"><p class="eyebrow">Smart Email Sender · Gmail</p><span class="stamp${ok ? " ok" : ""}" aria-hidden="true">${ok ? "Delivered" : "Returned"}</span></div>
<div class="body">
<h1>${ok ? "Gmail connected" : "Connection issue"}</h1>
<p>${escapeHtml(message)}</p>
<a href="${origin}/settings">Back to Settings</a>
</div></div></main></body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}