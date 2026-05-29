-- Allow anonymous (public) SELECT on qrcodes so the /q/[qrId] redirect works
-- for scanned QR codes without requiring the user to be authenticated.
create policy "qrcodes public read for redirect" on public.qrcodes
  for select using (true);

-- Allow anonymous INSERT on leads (buyers submit the form without an account)
create policy "leads public insert" on public.leads
  for insert with check (true);

-- Allow anonymous INSERT on scan_events (track scans from buyers)
create policy "scan_events public insert" on public.scan_events
  for insert with check (true);
