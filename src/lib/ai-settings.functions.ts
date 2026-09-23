import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { verifyGeminiApiKey } from "@/lib/ai-gateway";

function maskKey(key: string): string {
  const tail = key.slice(-4);
  return `••••••••${tail}`;
}

/** Whether the current user has connected their own Gemini API key, so AI
 *  features run on their own quota instead of the shared gateway. */
export const getAiKeyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("gemini_api_key")
      .eq("id", context.userId)
      .maybeSingle();
    const key = data?.gemini_api_key ?? null;
    return { hasKey: !!key, maskedKey: key ? maskKey(key) : null };
  });

/** Validates a Gemini API key against the live API without saving it. */
export const testGeminiApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ apiKey: z.string().trim().min(10).max(200) }).parse(d))
  .handler(async ({ data }) => verifyGeminiApiKey(data.apiKey));

export const setGeminiApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ apiKey: z.string().trim().min(10).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ gemini_api_key: data.apiKey })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearGeminiApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ gemini_api_key: null })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
