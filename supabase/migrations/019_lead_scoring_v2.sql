-- Lead Scoring V2
-- Adds persistent intent_score (never decays), tier, score_breakdown JSON,
-- and supporting activity fields to the leads table.
-- call_priority is always derived at read time — never stored.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS intent_score       INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier               TEXT         NOT NULL DEFAULT 'cold',
  ADD COLUMN IF NOT EXISTS last_activity_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_visit_count INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS photo_view_count   INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_time_on_page INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_breakdown    JSONB        NOT NULL DEFAULT '{}'::jsonb;

-- tier must be one of the three V2 tiers
DO $$ BEGIN
  ALTER TABLE public.leads
    ADD CONSTRAINT leads_tier_v2_check CHECK (tier IN ('cold', 'warm', 'hot'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index for inbox sorting (call_priority = intent_score * decay, derived client-side)
CREATE INDEX IF NOT EXISTS leads_intent_activity_idx
  ON public.leads (intent_score DESC, last_activity_at DESC NULLS LAST);

-- Backfill existing rows from v1 motivation field.
-- Maps: cold->cold(2), warm->warm(7), motivated->hot(14), hot->hot(22)
UPDATE public.leads
SET
  intent_score = CASE
    WHEN motivation = 'hot'       THEN 22
    WHEN motivation = 'motivated' THEN 14
    WHEN motivation = 'warm'      THEN 7
    ELSE 2
  END,
  tier = CASE
    WHEN motivation IN ('hot', 'motivated') THEN 'hot'
    WHEN motivation = 'warm'                THEN 'warm'
    ELSE 'cold'
  END,
  last_activity_at   = created_at,
  return_visit_count = 0,
  photo_view_count   = 0,
  total_time_on_page = 0,
  score_breakdown    = jsonb_build_object(
    '_legacy',           true,
    'first_scan',        1,
    'return_visits',     jsonb_build_object('count', 0, 'points', 0),
    'photos',            jsonb_build_object('viewed', 'none', 'points', 0),
    'saved',             0,
    'requested_info',    CASE WHEN motivation IN ('warm', 'motivated', 'hot') THEN 5 ELSE 0 END,
    'requested_showing', CASE WHEN motivation IN ('motivated', 'hot')         THEN 15 ELSE 0 END,
    'time_on_page',      jsonb_build_object('seconds', 0, 'points', 0)
  )
WHERE intent_score = 0;
