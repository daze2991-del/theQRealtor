-- ═══════════════════════════════════════════════════════════════════════════
-- 045 — dashboard_dismissals service_role grant
--
-- 044 granted select/insert to `authenticated` but not `service_role`. RLS
-- bypass (service_role's bypassrls attribute) only skips policy checks, not
-- table-level privilege checks — so the admin client (createAdminSupabase())
-- got 42501 on this brand-new table, confirmed live. Same root cause as the
-- quiet-hours SMS grant gap: new tables in this project don't inherit
-- service_role privileges automatically and need this granted explicitly.
-- Run once in the Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════════════

grant select, insert on public.dashboard_dismissals to service_role;
