ALTER TABLE public.email_recipients
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS delivery_error TEXT,
  ADD COLUMN IF NOT EXISTS delivery_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_email_recipients_delivery ON public.email_recipients(user_id, delivery_status);

ALTER TABLE public.email_replies ADD COLUMN IF NOT EXISTS rfc_message_id TEXT;

CREATE TABLE IF NOT EXISTS public.email_bounces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email_history_id UUID REFERENCES public.email_history(id) ON DELETE SET NULL,
  email_recipient_id UUID REFERENCES public.email_recipients(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  bounce_type TEXT NOT NULL DEFAULT 'hard',
  reason TEXT,
  provider_response TEXT,
  gmail_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_bounces_user ON public.email_bounces(user_id, created_at DESC);
GRANT SELECT ON public.email_bounces TO authenticated;
GRANT ALL ON public.email_bounces TO service_role;
ALTER TABLE public.email_bounces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own bounces" ON public.email_bounces;
CREATE POLICY "Users can view their own bounces" ON public.email_bounces FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.variable_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  variable_name TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, variable_name, value)
);
CREATE INDEX IF NOT EXISTS idx_variable_options_user ON public.variable_options(user_id, variable_name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.variable_options TO authenticated;
GRANT ALL ON public.variable_options TO service_role;
ALTER TABLE public.variable_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own variable options" ON public.variable_options;
CREATE POLICY "Users manage their own variable options" ON public.variable_options FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);