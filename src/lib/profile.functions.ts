import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { DEFAULT_RESUME_AI_PRESETS } from "@/lib/resume-ai-presets";

export const getUserPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("tracking_open_enabled, default_template_id, follow_up_template_id, compose_prefs, full_name, avatar_url, email, resume_ai_presets")
      .eq("id", context.userId)
      .maybeSingle();
    const resumeAiPresets = Array.isArray(data?.resume_ai_presets)
      ? (data.resume_ai_presets as unknown[]).filter((p): p is string => typeof p === "string")
      : DEFAULT_RESUME_AI_PRESETS;
    return {
      trackingOpenEnabled: data?.tracking_open_enabled ?? true,
      defaultTemplateId: data?.default_template_id ?? null,
      followUpTemplateId: data?.follow_up_template_id ?? null,
      composePrefs: (data?.compose_prefs ?? {}) as Json,
      fullName: data?.full_name ?? null,
      avatarUrl: data?.avatar_url ?? null,
      email: data?.email ?? null,
      resumeAiPresets,
    };
  });

export const setUserPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        trackingOpenEnabled: z.boolean().optional(),
        defaultTemplateId: z.string().uuid().nullable().optional(),
        followUpTemplateId: z.string().uuid().nullable().optional(),
        composePrefs: z.record(z.string(), z.any()).optional(),
        resumeAiPresets: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const update: {
      tracking_open_enabled?: boolean;
      default_template_id?: string | null;
      follow_up_template_id?: string | null;
      compose_prefs?: Json;
      resume_ai_presets?: Json;
    } = {};
    if (data.trackingOpenEnabled !== undefined) update.tracking_open_enabled = data.trackingOpenEnabled;
    if (data.defaultTemplateId !== undefined) update.default_template_id = data.defaultTemplateId;
    if (data.followUpTemplateId !== undefined) update.follow_up_template_id = data.followUpTemplateId;
    if (data.composePrefs !== undefined) update.compose_prefs = data.composePrefs as Json;
    if (data.resumeAiPresets !== undefined) update.resume_ai_presets = data.resumeAiPresets as Json;
    if (Object.keys(update).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("profiles")
      .update(update)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });