-- Add engagement tracking columns to scan_events.
-- These are written on page-unload (via sendBeacon) and on form submit.
ALTER TABLE scan_events
  ADD COLUMN IF NOT EXISTS time_on_page_sec      integer,
  ADD COLUMN IF NOT EXISTS photos_viewed          integer,
  ADD COLUMN IF NOT EXISTS return_visit           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS days_since_first_visit integer,
  ADD COLUMN IF NOT EXISTS cta_clicked            text,
  ADD COLUMN IF NOT EXISTS converted              boolean NOT NULL DEFAULT false;
