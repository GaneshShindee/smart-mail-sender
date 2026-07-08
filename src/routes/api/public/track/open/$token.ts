import { createFileRoute } from "@tanstack/react-router";

// 1x1 transparent GIF.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pixelResponse() {
  return new Response(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
    },
  });
}

export const Route = createFileRoute("/api/public/track/open/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token ?? "").replace(/\.gif$/i, "");
        if (!UUID_RE.test(token)) return pixelResponse();
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const now = new Date().toISOString();

          // Preferred path: per-recipient tracking token.
          const { data: rec } = await supabaseAdmin
            .from("email_recipients")
            .select("id, email_history_id, open_count, first_opened_at")
            .eq("tracking_token", token)
            .maybeSingle();

          if (rec) {
            const newCount = (rec.open_count ?? 0) + 1;
            await supabaseAdmin
              .from("email_recipients")
              .update({
                open_count: newCount,
                last_opened_at: now,
                first_opened_at: rec.first_opened_at ?? now,
                status: "opened",
              })
              .eq("id", rec.id);

            // Roll up totals to the parent campaign row.
            const { data: agg } = await supabaseAdmin
              .from("email_recipients")
              .select("open_count, first_opened_at, last_opened_at")
              .eq("email_history_id", rec.email_history_id);
            const rows = (agg ?? []) as Array<{ open_count: number | null; first_opened_at: string | null; last_opened_at: string | null }>;
            const totalOpens = rows.reduce((n, r) => n + (r.open_count ?? 0), 0);
            const firsts = rows.map((r) => r.first_opened_at).filter(Boolean) as string[];
            const lasts = rows.map((r) => r.last_opened_at).filter(Boolean) as string[];
            const firstOpened = firsts.length ? firsts.sort()[0] : null;
            const lastOpened = lasts.length ? lasts.sort()[lasts.length - 1] : null;
            await supabaseAdmin
              .from("email_history")
              .update({
                open_count: totalOpens,
                first_opened_at: firstOpened,
                last_opened_at: lastOpened,
              })
              .eq("id", rec.email_history_id);
          } else {
            // Back-compat: legacy campaign-level tokens.
            const { data: row } = await supabaseAdmin
              .from("email_history")
              .select("id, open_count, first_opened_at, tracking_enabled")
              .eq("tracking_token", token)
              .maybeSingle();
            if (row && row.tracking_enabled) {
              await supabaseAdmin
                .from("email_history")
                .update({
                  open_count: (row.open_count ?? 0) + 1,
                  last_opened_at: now,
                  first_opened_at: row.first_opened_at ?? now,
                })
                .eq("id", row.id);
            }
          }
        } catch {
          // Never fail the pixel — clients would show a broken image.
        }
        return pixelResponse();
      },
    },
  },
});