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
          const { data: row } = await supabaseAdmin
            .from("email_history")
            .select("id, open_count, first_opened_at, tracking_enabled")
            .eq("tracking_token", token)
            .maybeSingle();
          if (row && row.tracking_enabled) {
            const now = new Date().toISOString();
            await supabaseAdmin
              .from("email_history")
              .update({
                open_count: (row.open_count ?? 0) + 1,
                last_opened_at: now,
                first_opened_at: row.first_opened_at ?? now,
              })
              .eq("id", row.id);
          }
        } catch {
          // Never fail the pixel — clients would show a broken image.
        }
        return pixelResponse();
      },
    },
  },
});