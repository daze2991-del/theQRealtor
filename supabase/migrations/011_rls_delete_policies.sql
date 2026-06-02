-- Property owners need DELETE permission on leads and scan_events so that
-- manual ordered teardown (and ON DELETE CASCADE) can execute under RLS.
-- Without these, deleting a property returns 409 because the session-role
-- cascade is blocked when it tries to remove child rows.

CREATE POLICY "leads delete by owner"
  ON public.leads FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = leads.property_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "scan events delete by owner"
  ON public.scan_events FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.qrcodes q
      JOIN public.properties p ON p.id = q.property_id
      WHERE q.id = scan_events.qr_id AND p.user_id = auth.uid()
    )
  );
