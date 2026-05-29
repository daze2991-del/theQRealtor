create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  address text not null,
  agent_name text,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.qrcodes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  label text not null,
  scan_count integer not null default 0,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  qr_id uuid not null references public.qrcodes(id) on delete cascade,
  name text not null,
  phone text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.scan_events (
  id uuid primary key default gen_random_uuid(),
  qr_id uuid not null references public.qrcodes(id) on delete cascade,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.qrcodes enable row level security;
alter table public.leads enable row level security;
alter table public.scan_events enable row level security;

create policy "profiles are owned by auth user" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "properties are owned by profile" on public.properties
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "qrcodes follow property owner" on public.qrcodes
  for all using (
    exists (
      select 1 from public.properties p
      where p.id = qrcodes.property_id and p.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.properties p
      where p.id = qrcodes.property_id and p.user_id = auth.uid()
    )
  );

create policy "leads follow property owner" on public.leads
  for select using (
    exists (
      select 1 from public.properties p
      where p.id = leads.property_id and p.user_id = auth.uid()
    )
  );

create policy "scan events follow qr property owner" on public.scan_events
  for select using (
    exists (
      select 1 from public.qrcodes q
      join public.properties p on p.id = q.property_id
      where q.id = scan_events.qr_id and p.user_id = auth.uid()
    )
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.increment_qr_scan_count(qr_code_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.qrcodes
  set scan_count = scan_count + 1
  where id = qr_code_id;
$$;
