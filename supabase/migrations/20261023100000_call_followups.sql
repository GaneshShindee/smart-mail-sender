-- Recruiter phone on jobs (optional) + per-user call follow-up reminders.

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS recruiter_phone text;

CREATE TABLE IF NOT EXISTS public.call_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  phone text NOT NULL,
  contact_name text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'canceled')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS call_followups_user_status_due_idx
  ON public.call_followups (user_id, status, due_at);

ALTER TABLE public.call_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS call_followups_owner_all ON public.call_followups;
CREATE POLICY call_followups_owner_all ON public.call_followups
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_followups TO authenticated;
GRANT ALL ON public.call_followups TO service_role;
