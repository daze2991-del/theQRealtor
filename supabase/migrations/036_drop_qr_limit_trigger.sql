-- 036_drop_qr_limit_trigger.sql
-- Onboarding (app/dashboard/onboarding/page.tsx) was the last live code path
-- that inserted into public.qrcodes — it created a property-bound qrcode row
-- directly. It has been switched to the sign-based flow used everywhere else
-- in the product (/api/signs/create + /api/signs/assign, QR encodes
-- /p/{signId}). Confirmed by repo-wide grep: no remaining code path inserts
-- into public.qrcodes.
--
-- That makes trg_enforce_qr_limit (024) and its two support functions dead:
-- signs has no equivalent DB trigger — the plan limit is enforced in
-- app/api/signs/create/route.ts instead (see lib/plans.ts signLimitForPlan).
--
-- public.qrcodes itself, and its data, are NOT touched here. app/q/[qrId]/
-- route.ts is a permanent legacy bridge for already-printed pre-sign QR
-- codes and reads straight from this table indefinitely — dropping the
-- table would break every such code that's out in the wild on a yard sign.
-- Run once in the Supabase SQL editor, same as migration 024.

drop trigger if exists trg_enforce_qr_limit on public.qrcodes;
drop function if exists public.enforce_qr_limit();
drop function if exists public.qr_limit_for_plan(text);
