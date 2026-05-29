-- Buyer-facing property pages are public, so anon users need table-level
-- SELECT privilege in addition to the permissive RLS policy.
grant select on public.property_photos to anon, authenticated;
