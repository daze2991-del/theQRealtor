-- Change qrcodes.property_id FK from ON DELETE CASCADE to ON DELETE SET NULL.
-- When a property is deleted, Postgres automatically sets qrcodes.property_id = NULL
-- within the same transaction (while the property row is still visible), so the
-- RLS USING check passes and no manual unlink step is needed.
--
-- Requires: migration 012 must have run first (drops NOT NULL on property_id
-- and updates the qrcodes RLS WITH CHECK to allow NULL).

ALTER TABLE public.qrcodes
  DROP CONSTRAINT IF EXISTS qrcodes_property_id_fkey;

ALTER TABLE public.qrcodes
  ADD CONSTRAINT qrcodes_property_id_fkey
  FOREIGN KEY (property_id)
  REFERENCES public.properties(id)
  ON DELETE SET NULL;
