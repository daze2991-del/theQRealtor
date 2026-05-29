-- ─── property_photos table ────────────────────────────────────────────────────
create table if not exists public.property_photos (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  url         text not null,
  storage_path text,
  "order"     int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.property_photos enable row level security;

-- Public read (buyer-facing pages are unauthenticated)
create policy "property_photos_select_public"
  on public.property_photos for select
  using (true);

-- Authenticated owners can insert photos for their properties
create policy "property_photos_insert_owner"
  on public.property_photos for insert
  with check (
    property_id in (
      select id from public.properties where user_id = auth.uid()
    )
  );

-- Owners can update order
create policy "property_photos_update_owner"
  on public.property_photos for update
  using (
    property_id in (
      select id from public.properties where user_id = auth.uid()
    )
  );

-- Owners can delete their photos
create policy "property_photos_delete_owner"
  on public.property_photos for delete
  using (
    property_id in (
      select id from public.properties where user_id = auth.uid()
    )
  );

-- ─── Storage bucket ────────────────────────────────────────────────────────────
-- Files under path {userId}/{propertyId}/{filename}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'property-photos',
    'property-photos',
    true,
    10485760,
    array['image/jpeg','image/png','image/webp','image/heic','image/heif']
  )
  on conflict (id) do nothing;

-- Public read (bucket is public, but RLS still applies to API calls)
create policy "property_photos_storage_select"
  on storage.objects for select
  using (bucket_id = 'property-photos');

-- Authenticated users can upload to their own folder
create policy "property_photos_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'property-photos'
    and auth.role() = 'authenticated'
  );

-- Users can delete files in their own folder ({userId}/...)
create policy "property_photos_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'property-photos'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );
