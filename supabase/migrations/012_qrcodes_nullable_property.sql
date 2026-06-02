-- QR codes are reusable physical signs. When a property is deleted, unlink
-- the QR codes (set property_id = NULL) rather than deleting them so agents
-- can reassign them to a new listing without reprinting.

-- 1. Make property_id nullable
ALTER TABLE public.qrcodes ALTER COLUMN property_id DROP NOT NULL;

-- 2. Update the RLS policy to allow setting property_id to NULL.
--    USING (old-row check): still requires the qrcode belongs to the user's property.
--    WITH CHECK (new-row check): allows NULL (unlink) or a property the user owns.
DROP POLICY IF EXISTS "qrcodes follow property owner" ON public.qrcodes;
CREATE POLICY "qrcodes follow property owner" ON public.qrcodes
  FOR ALL
  USING (
    property_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = qrcodes.property_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    property_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = qrcodes.property_id AND p.user_id = auth.uid()
    )
  );
