import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Shared chat-completion caller. A user can save a Gemini and/or Grok API key
 *  and pick one as their active provider in Settings → AI. If they haven't
 *  picked one (or the picked provider has no key saved, or that key's request
 *  fails for any reason), AI features fall back to the shared Lovable gateway. */

export type AiProvider = "lovable" | "gemini" | "grok";
export const AI_PROVIDERS: AiProvider[] = ["lovable", "gemini", "grok"];

const LOVABLE_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_MODEL = "google/gemini-3-flash-preview";

const GEMINI_DIRECT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_DIRECT_MODEL = "gemini-flash-latest";

const GROK_DIRECT_URL = "https://api.x.ai/v1/chat/completions";
const GROK_DIRECT_MODEL = "grok-4-fast";

type ChatCompletion = { choices?: { message?: { content?: string } }[] };
type ChatMessage = { role: string; content: string };

/** Providers occasionally return 503 "model overloaded" for a moment —
 *  retry a couple of times with backoff before surfacing an error. */
const OVERLOAD_RETRY_DELAYS_MS = [400, 1200];

async function postChatCompletion(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<Response> {
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, response_format: { type: "json_object" } }),
    });
    if (res.status !== 503 || attempt >= OVERLOAD_RETRY_DELAYS_MS.length) return res;
    await new Promise((r) => setTimeout(r, OVERLOAD_RETRY_DELAYS_MS[attempt]));
  }
}

export async function getUserAiConfig(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ provider: AiProvider; geminiKey: string | null; grokKey: string | null }> {
  const { data } = await supabase
    .from("profiles")
    .select("gemini_api_key, grok_api_key, active_ai_provider")
    .eq("id", userId)
    .maybeSingle();
  const provider = (data?.active_ai_provider as AiProvider | undefined) ?? "lovable";
  const gemini = data?.gemini_api_key;
  const grok = data?.grok_api_key;
  return {
    provider: AI_PROVIDERS.includes(provider) ? provider : "lovable",
    geminiKey: gemini && gemini.trim() ? gemini.trim() : null,
    grokKey: grok && grok.trim() ? grok.trim() : null,
  };
}

async function callOpenAiCompatible(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  label: string,
): Promise<string> {
  const res = await postChatCompletion(url, apiKey, model, messages);
  if (res.status === 429) throw new Error(`Your ${label} API key hit its rate limit.`);
  if (res.status === 401 || res.status === 403) throw new Error(`Your ${label} API key was rejected.`);
  if (res.status === 503) throw new Error(`${label} is temporarily overloaded with high demand.`);
  if (!res.ok) throw new Error(`${label} API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as ChatCompletion;
  return j.choices?.[0]?.message?.content ?? "";
}

const callDirectGemini = (apiKey: string, messages: ChatMessage[]) =>
  callOpenAiCompatible(GEMINI_DIRECT_URL, apiKey, GEMINI_DIRECT_MODEL, messages, "Gemini");

const callDirectGrok = (apiKey: string, messages: ChatMessage[]) =>
  callOpenAiCompatible(GROK_DIRECT_URL, apiKey, GROK_DIRECT_MODEL, messages, "Grok");

async function callLovableGateway(messages: ChatMessage[]): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI gateway not configured");
  const res = await postChatCompletion(LOVABLE_GATEWAY_URL, key, LOVABLE_MODEL, messages);
  if (res.status === 429) {
    throw new Error("AI rate limit reached. Try again shortly, or select your own API key in Settings → AI.");
  }
  if (res.status === 402) {
    throw new Error("AI credits exhausted. Select your own API key in Settings → AI to keep using AI features.");
  }
  if (res.status === 503) {
    throw new Error("AI is temporarily overloaded with high demand. Please try again in a moment.");
  }
  if (!res.ok) throw new Error(`AI error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as ChatCompletion;
  return j.choices?.[0]?.message?.content ?? "";
}

/** POST a chat-completion request (system + user message, JSON response) and
 *  return the raw content string. Uses the user's selected provider/key when
 *  one is set; if that fails for any reason (invalid key, rate limit,
 *  overloaded, or no key saved for the selected provider), falls back to the
 *  shared Lovable gateway as a last resort so AI features never hard-fail. */
export async function aiChatJson(params: {
  supabase: SupabaseClient<Database>;
  userId: string;
  system: string;
  user: string;
}): Promise<string> {
  const { supabase, userId, system, user } = params;
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const cfg = await getUserAiConfig(supabase, userId);
  const attempt =
    cfg.provider === "gemini" && cfg.geminiKey
      ? () => callDirectGemini(cfg.geminiKey!, messages)
      : cfg.provider === "grok" && cfg.grokKey
        ? () => callDirectGrok(cfg.grokKey!, messages)
        : null;

  if (attempt) {
    try {
      return await attempt();
    } catch (e) {
      console.error(
        `[ai-gateway] User ${cfg.provider} key failed, falling back to shared gateway:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return callLovableGateway(messages);
}

/** Validates a Gemini API key by making a minimal live request against it. */
export async function verifyGeminiApiKey(apiKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return verifyApiKey(GEMINI_DIRECT_URL, GEMINI_DIRECT_MODEL, apiKey, "Gemini");
}

/** Validates a Grok (xAI) API key by making a minimal live request against it. */
export async function verifyGrokApiKey(apiKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return verifyApiKey(GROK_DIRECT_URL, GROK_DIRECT_MODEL, apiKey, "Grok");
}

async function verifyApiKey(
  url: string,
  model: string,
  apiKey: string,
  label: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
        max_tokens: 5,
      }),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Invalid API key." };
    if (res.status === 429) return { ok: false, error: "Key is valid, but is currently rate-limited." };
    if (!res.ok) return { ok: false, error: `${label} API error ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : `Could not reach ${label} API.` };
  }
}
