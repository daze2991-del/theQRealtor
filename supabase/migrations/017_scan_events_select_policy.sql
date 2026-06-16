-- Restore SELECT on scan_events for the owning agent.
--
-- Root cause of "0 SCANS" on the lead-detail page: scan_events has RLS enabled
-- but no working SELECT policy for authenticated owners in this project (the
-- policy from migration 001 was never live here). Default-deny means every
-- browser-client read of scan_events returns 0 rows — regardless of whether the
-- query filters by property_id or qr_id. This also silently zeroed the inbox
-- signal line, the detail timeline, and the "Last active" field.
--
-- Verified against the live DB: as the property owner, count(scan_events) = 0 via
-- the API, while the service role (RLS bypassed) sees 4. The owner CAN see the
-- qrcode and the property, so the EXISTS below evaluates TRUE → count becomes 4.
--
-- Run once in the Supabase SQL editor.

drop policy if exists "scan events follow qr property owner" on public.scan_events;
drop policy if exists "scan events readable by owner"        on public.scan_events;

create policy "scan events readable by owner"
  on public.scan_events
  for select
  to authenticated
  using (
    -- own via the scan's qr code (qr_id is NOT NULL on every row)
    exists (
      select 1
      from public.qrcodes q
      join public.properties p on p.id = q.property_id
      where q.id = scan_events.qr_id
        and p.user_id = auth.uid()
    )
    -- …or via the direct property_id FK added in migration 009
    or exists (
      select 1
      from public.properties p
      where p.id = scan_events.property_id
        and p.user_id = auth.uid()
    )
  );
