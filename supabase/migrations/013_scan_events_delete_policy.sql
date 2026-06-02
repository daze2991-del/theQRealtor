-- scan_events has a direct property_id FK (added in migration 009).
-- Without this policy, ON DELETE CASCADE on that FK is blocked by RLS
-- when the authenticated role tries to delete a property, causing a 409.
-- Also needed so manual deletes by property_id work in the delete flow.
CREATE POLICY "scan events delete by property owner"
  ON public.scan_events FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = scan_events.property_id AND p.user_id = auth.uid()
    )
  );
