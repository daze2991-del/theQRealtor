-- ═══════════════════════════════════════════════════════════════════════════
-- 056 — Tighten loose RLS policies on leads (critical), properties, qrcodes.
--
-- Postgres ORs permissive policies together, so one USING (true) policy
-- overrides every carefully-scoped policy beside it. And "anon" policies
-- only apply to logged-OUT visitors — a logged-in agent viewing another
-- agent's public page runs as "authenticated", so public reads must name both
-- roles.
--
-- Policies only. No GRANT is changed (anon/authenticated keep their existing
-- table privileges; RLS is what scopes them).
--
-- ── leads ─────────────────────────────────────────────────────────────────
-- "Allow all access" (ALL, anon+authenticated, true/true) let anyone holding
-- the public anon key read, edit and delete every buyer's name, phone and
-- email. Verified exploitable live before this migration (SET ROLE anon read
-- the lead and its phone).
--
-- Every lead INSERT goes through the service-role client
-- (app/api/submit-lead, app/api/open-house-checkin), which bypasses RLS, and
-- no browser or authenticated server path inserts leads — so both anon INSERT
-- policies are dropped too. The five owner-scoped policies stay unchanged;
-- they cover every dashboard read/update/delete (all scoped by agent_id or
-- property ownership).
--
-- ── properties ────────────────────────────────────────────────────────────
-- "Allow public property reads" (anon, true) exposed offline listings
-- (active = false). The documented design is the opposite: the sign resolver
-- (app/api/signs/resolve) routes a sign on an inactive listing to the
-- "not assigned" page because "anon RLS only exposes active listings", and
-- submit-lead refuses inactive listings.
--
-- ARCHIVED listings (deleted_at set) are deliberately NOT filtered out: the
-- buyer page (app/p/[propertyId]) intentionally renders them with a "Listing
-- Archived" banner and no lead capture (commit c3a87a8). Archiving sets only
-- deleted_at, so an archived listing normally stays active = true and remains
-- readable.
--
-- Also fixes a latent bug: there was NO policy letting a logged-in
-- non-owner read an active listing, so an agent scanning another agent's sign
-- while logged in got "Property not found". The public read now names both
-- roles and replaces the anon-only "properties anon read active".
-- Owners reading all their own listings (inactive/archived included) stays
-- covered by the existing "Users can view own properties".
--
-- ── qrcodes ───────────────────────────────────────────────────────────────
-- Legacy table (0 rows today). /q/[qrId] reads it with the RLS-bound server
-- client as anon OR authenticated, so reads stay open to both; the two
-- per-role read policies are merged into one. "Allow authenticated qr inserts"
-- (WITH CHECK true) let any agent create QR rows for any property; it is
-- replaced with an ownership check. No live code path inserts qrcodes
-- (components/QRCodeManager.tsx is unimported dead code).
--
-- ROLLBACK: recreate the originals —
--   create policy "Allow all access" on public.leads for all to anon, authenticated using (true) with check (true);
--   create policy "Allow public lead inserts" on public.leads for insert to anon with check (true);
--   create policy "Anon can insert leads" on public.leads for insert to anon with check (true);
--   drop policy "properties public read active" on public.properties;
--   create policy "Allow public property reads" on public.properties for select to anon using (true);
--   create policy "properties anon read active" on public.properties for select to anon using (active = true);
--   drop policy "qrcodes public read" on public.qrcodes;
--   drop policy "qrcodes insert own property" on public.qrcodes;
--   create policy "Allow public qr reads" on public.qrcodes for select to anon using (true);
--   create policy "Allow authenticated qr reads" on public.qrcodes for select to authenticated using (true);
--   create policy "Allow authenticated qr inserts" on public.qrcodes for insert to authenticated with check (true);
--
-- Applied to the live project on 2026-09-29.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── leads ────────────────────────────────────────────────────────────────────
drop policy if exists "Allow all access"          on public.leads;
drop policy if exists "Anon can insert leads"     on public.leads;
drop policy if exists "Allow public lead inserts" on public.leads;

-- ── properties ───────────────────────────────────────────────────────────────
drop policy if exists "Allow public property reads"  on public.properties;
drop policy if exists "properties anon read active"  on public.properties;

drop policy if exists "properties public read active" on public.properties;
create policy "properties public read active"
  on public.properties
  for select
  to anon, authenticated
  using (active = true);

-- ── qrcodes ──────────────────────────────────────────────────────────────────
drop policy if exists "Allow public qr reads"          on public.qrcodes;
drop policy if exists "Allow authenticated qr reads"   on public.qrcodes;
drop policy if exists "Allow authenticated qr inserts" on public.qrcodes;

drop policy if exists "qrcodes public read" on public.qrcodes;
create policy "qrcodes public read"
  on public.qrcodes
  for select
  to anon, authenticated
  using (true);

drop policy if exists "qrcodes insert own property" on public.qrcodes;
create policy "qrcodes insert own property"
  on public.qrcodes
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.properties p
      where p.id = qrcodes.property_id
        and p.user_id = auth.uid()
    )
  );
