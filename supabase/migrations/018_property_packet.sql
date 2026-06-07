-- ── Property Packet feature ───────────────────────────────────────────────────

-- 1. New columns on properties
alter table properties
  add column if not exists packet_enabled boolean not null default false,
  add column if not exists packet_files   text[]  not null default '{}';

-- 2. packet_requests table
create table if not exists packet_requests (
  id          uuid        primary key default gen_random_uuid(),
  property_id uuid        not null references properties(id) on delete cascade,
  email       text        not null,
  name        text,
  created_at  timestamptz not null default now()
);

-- 3. Indexes
create index if not exists packet_requests_property_id_idx on packet_requests(property_id);
create index if not exists packet_requests_created_at_idx  on packet_requests(created_at desc);

-- 4. RLS
alter table packet_requests enable row level security;

-- Anon / buyers can insert
create policy "anon_insert_packet_requests"
  on packet_requests for insert
  to anon, authenticated
  with check (true);

-- Authenticated agents can read their own property's requests
create policy "owner_select_packet_requests"
  on packet_requests for select
  to authenticated
  using (
    property_id in (
      select id from properties where user_id = auth.uid()
    )
  );
