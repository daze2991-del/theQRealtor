-- 021_open_house_checkin.sql
-- Adds open-house check-in fields to leads.
-- Run once in the Supabase SQL editor.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source             text,
  ADD COLUMN IF NOT EXISTS working_with_agent boolean,
  ADD COLUMN IF NOT EXISTS do_not_contact     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_consent        boolean NOT NULL DEFAULT false;

-- Index for filtering check-in leads in the inbox
CREATE INDEX IF NOT EXISTS leads_source_idx ON public.leads (source)
  WHERE source IS NOT NULL;
