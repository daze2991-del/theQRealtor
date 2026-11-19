-- ═══════════════════════════════════════════════════════════════════════════
-- 070 — Stop exposing properties.report_token to anon / authenticated.
--
-- PROBLEM: anon and authenticated hold table-wide SELECT on public.properties
-- and the "properties public read active" policy lets them read every active
-- row, so anyone with the public anon key could list every seller-report token
-- and open any agent's report.
--
-- FIX: replace the table-wide SELECT with a column-level SELECT on every column
-- EXCEPT report_token. RLS row rules are unchanged. Tokens are now read only
-- server-side with the service role:
--   • /api/report/[token]            — seller report (already service role)
--   • /api/properties/report-links   — the signed-in agent's OWN tokens
--   • /api/properties/[id]/regenerate-report-token — rotates (UPDATE only)
-- UPDATE/INSERT privileges are untouched, so rotation still works as an
-- RLS-checked UPDATE.
--
-- NOTE: any column ADDED to properties later must be granted explicitly to
-- anon/authenticated (grant select (new_col) on public.properties ...), and
-- client code must never `select('*')` on properties — use PROPERTY_COLUMNS
-- (lib/propertyColumns.ts).
--
-- Changes no rows; privileges only. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

revoke select on public.properties from anon, authenticated;

grant select (
  id, address, agent_name, created_at, user_id, active, city, state, price,
  beds, baths, description, agent_phone, deleted_at, deactivated_at, plan_locked_at
) on public.properties to anon, authenticated;

-- Belt and braces: no column-level grant on the token survives either.
revoke select (report_token) on public.properties from anon, authenticated;
