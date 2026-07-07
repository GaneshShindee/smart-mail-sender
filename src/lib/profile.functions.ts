import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getUserPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("tracking_open_enabled")
      .eq("id", context.userId)
      .maybeSingle();
    return { trackingOpenEnabled: data?.tracking_open_enabled ?? true };
  });

export const setUserPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ trackingOpenEnabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ tracking_open_enabled: data.trackingOpenEnabled })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });