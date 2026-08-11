-- 1. Campaign-level additions
ALTER TABLE public.email_history
  ADD COLUMN IF NOT EXISTS send_mode text NOT NULL DEFAULT 'bcc',
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'campaign',
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS gmail_thread_id text,
  ADD COLUMN IF NOT EXISTS gmail_message_id text,
  ADD COLUMN IF NOT EXISTS rfc_message_id text,
  ADD COLUMN IF NOT EXISTS parent_campaign_id uuid REFERENCES public.email_history(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS body_html text;

CREATE INDEX IF NOT EXISTS email_history_kind_idx ON public.email_history (user_id, kind, sent_at DESC);
CREATE INDEX IF NOT EXISTS email_history_parent_idx ON public.email_history (parent_campaign_id);

-- 2. Recipient-level additions
ALTER TABLE public.email_recipients
  ADD COLUMN IF NOT EXISTS pdf_view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_pdf_view_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_pdf_view_at timestamptz,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gmail_message_id text,
  ADD COLUMN IF NOT EXISTS gmail_thread_id text,
  ADD COLUMN IF NOT EXISTS rfc_message_id text;

CREATE INDEX IF NOT EXISTS email_recipients_history_idx ON public.email_recipients (email_history_id);
CREATE INDEX IF NOT EXISTS email_recipients_user_email_idx ON public.email_recipients (user_id, email);

-- 3. Background send queue
CREATE TABLE IF NOT EXISTS public.send_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_history_id uuid NOT NULL REFERENCES public.email_history(id) ON DELETE CASCADE,
  job_type text NOT NULL DEFAULT 'campaign',
  status text NOT NULL DEFAULT 'pending',
  run_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.send_jobs TO authenticated;
GRANT ALL ON public.send_jobs TO service_role;
ALTER TABLE public.send_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own send jobs" ON public.send_jobs
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS send_jobs_due_idx ON public.send_jobs (status, run_at);
CREATE INDEX IF NOT EXISTS send_jobs_user_idx ON public.send_jobs (user_id, created_at DESC);

CREATE TRIGGER send_jobs_touch_updated_at
  BEFORE UPDATE ON public.send_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Per-user saved locations
CREATE TABLE IF NOT EXISTS public.user_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_locations TO authenticated;
GRANT ALL ON public.user_locations TO service_role;
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own locations" ON public.user_locations
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5. Mark recipients as replied automatically
CREATE OR REPLACE FUNCTION public.mark_recipient_replied()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.email_recipient_id IS NOT NULL THEN
    UPDATE public.email_recipients
       SET replied_at = COALESCE(replied_at, NEW.received_at),
           status = 'replied'
     WHERE id = NEW.email_recipient_id;
  ELSE
    UPDATE public.email_recipients
       SET replied_at = COALESCE(replied_at, NEW.received_at),
           status = 'replied'
     WHERE user_id = NEW.user_id
       AND lower(email) = lower(NEW.from_email)
       AND replied_at IS NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS email_replies_mark_recipient ON public.email_replies;
CREATE TRIGGER email_replies_mark_recipient
  AFTER INSERT ON public.email_replies
  FOR EACH ROW EXECUTE FUNCTION public.mark_recipient_replied();

-- 6. Roll up PDF view events onto the recipient
CREATE OR REPLACE FUNCTION public.rollup_pdf_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.email_recipient_id IS NOT NULL THEN
    UPDATE public.email_recipients
       SET pdf_view_count = pdf_view_count + 1,
           first_pdf_view_at = COALESCE(first_pdf_view_at, NEW.created_at),
           last_pdf_view_at = NEW.created_at,
           click_count = click_count + 1,
           last_clicked_at = NEW.created_at
     WHERE id = NEW.email_recipient_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pdf_events_rollup ON public.pdf_events;
CREATE TRIGGER pdf_events_rollup
  AFTER INSERT ON public.pdf_events
  FOR EACH ROW EXECUTE FUNCTION public.rollup_pdf_event();