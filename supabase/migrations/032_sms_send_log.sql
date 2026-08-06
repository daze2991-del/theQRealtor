-- 032 — Internal SMS send log for volume monitoring
-- Server-side (service-role) only. RLS enabled with no public policies means
-- no anon/authenticated role can read or write this table.

CREATE TABLE public.sms_send_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_send_log ENABLE ROW LEVEL SECURITY;

-- Daily count per agent — the only query pattern used by the alarm check.
CREATE INDEX sms_send_log_agent_day_idx
  ON public.sms_send_log (agent_id, created_at);
