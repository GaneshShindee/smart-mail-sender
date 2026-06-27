import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ search: z.string().optional(), status: z.string().optional(), limit: z.number().int().min(1).max(500).default(200) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("email_history")
      .select("id, recipient, subject, template_name, status, sent_at, error")
      .eq("user_id", context.userId)
      .order("sent_at", { ascending: false })
      .limit(data.limit);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.search) q = q.or(`recipient.ilike.%${data.search}%,subject.ilike.%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const dashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ count: total }, { count: sent }, { count: failed }, { data: recent }, { count: templateCount }] =
      await Promise.all([
        context.supabase.from("email_history").select("id", { count: "exact", head: true }).eq("user_id", context.userId),
        context.supabase.from("email_history").select("id", { count: "exact", head: true }).eq("user_id", context.userId).eq("status", "sent"),
        context.supabase.from("email_history").select("id", { count: "exact", head: true }).eq("user_id", context.userId).eq("status", "failed"),
        context.supabase
          .from("email_history")
          .select("id, recipient, subject, status, sent_at, template_name")
          .eq("user_id", context.userId)
          .order("sent_at", { ascending: false })
          .limit(5),
        context.supabase.from("templates").select("id", { count: "exact", head: true }).eq("user_id", context.userId),
      ]);
    return {
      total: total ?? 0,
      sent: sent ?? 0,
      failed: failed ?? 0,
      templates: templateCount ?? 0,
      recent: recent ?? [],
    };
  });