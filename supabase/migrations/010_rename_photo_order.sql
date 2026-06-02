-- Rename the `order` column to `sort_order` to avoid the PostgreSQL reserved
-- word conflict that causes PostgREST to silently ignore the column in updates.
ALTER TABLE public.property_photos RENAME COLUMN "order" TO sort_order;
