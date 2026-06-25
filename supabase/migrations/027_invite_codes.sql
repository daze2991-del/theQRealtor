-- Invite codes gate for beta access
-- Codes are inserted manually via the Supabase SQL editor.
-- All access goes through /api/validate-invite (service-role key);
-- no browser-level read or write is permitted.

CREATE TABLE IF NOT EXISTS invite_codes (
  code           TEXT        PRIMARY KEY,
  used           BOOLEAN     NOT NULL DEFAULT false,
  used_by_email  TEXT,
  used_at        TIMESTAMPTZ
);

ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
-- No policies → anon and authenticated roles cannot touch this table directly.
-- The service-role key used in the API route bypasses RLS entirely.
