-- Adds Claude (Anthropic) as a selectable AI provider alongside Gemini and Grok.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS claude_api_key TEXT;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_active_ai_provider_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_active_ai_provider_check
  CHECK (active_ai_provider IN ('lovable', 'gemini', 'grok', 'claude'));