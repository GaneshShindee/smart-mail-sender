import { createFileRoute } from "@tanstack/react-router";

/**
 * Background send worker. Called immediately after a campaign is queued and
 * every minute by the database scheduler, so delivery never depends on the
 * browser staying open.
 */
export const Route = createFileRoute("/api/public/hooks/process-sends")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected =
          process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
        const provided =
          request.headers.get("apikey") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        if (!expected || provided !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const { processDueJobs } = await import("@/lib/send-core.server");
          const result = await processDueJobs(5);
          return Response.json({ ok: true, ...result });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("process-sends failed:", message);
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
