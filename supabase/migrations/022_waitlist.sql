-- 022_waitlist.sql
-- Founding Agent beta cap + overflow waitlist.
-- Run once in the Supabase SQL editor.

-- 1. waitlist table — overflow emails collected once the beta is full
create table if not exists public.waitlist (
  id         uuid        primary key default gen_random_uuid(),
  email      text        not null,
  created_at timestamptz not null default now()
);

create index if not exists waitlist_created_at_idx on public.waitlist(created_at desc);

-- 2. RLS
alter table public.waitlist enable row level security;

-- Anyone hitting the signup page (anonymous) can add themselves to the waitlist.
-- No select policy — overflow emails are read server-side / in the dashboard only.
create policy "anon_insert_waitlist"
  on public.waitlist for insert
  to anon, authenticated
  with check (true);

-- 3. Account count for the signup cap.
-- SECURITY DEFINER so it counts every profile regardless of the per-row RLS on
-- profiles (an anonymous visitor would otherwise see 0 rows). Returns only an
-- integer — never any profile data.
create or replace function public.signup_count()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::int from public.profiles;
$$;

grant execute on function public.signup_count() to anon, authenticated;
