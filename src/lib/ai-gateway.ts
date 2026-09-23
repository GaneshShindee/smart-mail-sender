import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Shared chat-completion caller: uses the caller's own Gemini API key (Settings → AI)
 *  when they've connected one, otherwise falls back to the shared Lovable AI gateway. */

const LOVABLE_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_MODEL = "google/gemini-3-flash-preview";

const GEMINI_DIRECT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_DIRECT_MODEL = "gemini-flash-latest";

type ChatCompletion = { choices?: { message?: { content?: string } }[] };

export async function getUserGeminiKey(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("gemini_api_key")
    .eq("id", userId)
    .maybeSingle();
  const key = data?.gemini_api_key;
  return key && key.trim() ? key.trim() : null;
}

/** POST a chat-completion request (system + user message, JSON response) and
 *  return the raw content string. Prefers the user's own Gemini key when set. */
export async function aiChatJson(params: {
  supabase: SupabaseClient<Database>;
  userId: string;
  system: string;
  user: string;
}): Promise<string> {
  const { supabase, userId, system, user } = params;
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const userKey = await getUserGeminiKey(supabase, userId);
  if (userKey) {
    const res = await fetch(GEMINI_DIRECT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${userKey}` },
      body: JSON.stringify({
        model: GEMINI_DIRECT_MODEL,
        messages,
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) throw new Error("Your Gemini API key hit its rate limit. Try again shortly.");
    if (res.status === 401 || res.status === 403) {
      throw new Error("Your Gemini API key was rejected. Check it in Settings → AI.");
    }
    if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = (await res.json()) as ChatCompletion;
    return j.choices?.[0]?.message?.content ?? "";
  }

  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI gateway not configured");
  const res = await fetch(LOVABLE_GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: LOVABLE_MODEL,
      messages,
      response_format: { type: "json_object" },
    }),
  });
  if (res.status === 429) {
    throw new Error("AI rate limit reached. Try again shortly, or connect your own Gemini API key in Settings → AI.");
  }
  if (res.status === 402) {
    throw new Error("AI credits exhausted. Connect your own Gemini API key in Settings → AI to keep using AI features.");
  }
  if (!res.ok) throw new Error(`AI error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as ChatCompletion;
  return j.choices?.[0]?.message?.content ?? "";
}

/** Validates a Gemini API key by making a minimal live request against it. */
export async function verifyGeminiApiKey(apiKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(GEMINI_DIRECT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GEMINI_DIRECT_MODEL,
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
        max_tokens: 5,
      }),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Invalid API key." };
    if (res.status === 429) return { ok: false, error: "Key is valid, but is currently rate-limited." };
    if (!res.ok) return { ok: false, error: `Gemini API error ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach Gemini API." };
  }
}
