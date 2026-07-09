-- ═══════════════════════════════════════════════════════════════════════════
-- 028 — Sign/QR reassignment: FOUNDATION ONLY (steps 1-3 of the approved spec)
--
-- This migration is strictly ADDITIVE:
--   1. New tables: signs, sign_assignments (with RLS + partial unique index)
--   2. New nullable sign_id columns on scan_events and leads
--   3. Write-once immutability guard on scan_events.property_id and
--      leads.property_id
--
-- It does NOT migrate, backfill, or alter any existing data, and no
-- application code writes these columns yet. The backfill (creating sign rows
-- from existing qrcodes, stamping sign_id/property_id on historical rows) and
-- the buyer-page read-path switch are separate later passes.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1a — signs: a physical sign owned by an agent, independent of any
-- listing. The sign is the durable object; listings come and go.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.signs (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid not null references public.profiles(id),
  label      text not null,
  created_at timestamptz not null default now()
);

alter table public.signs enable row level security;

-- Same owner-all style as "properties are owned by profile" (001).
create policy "signs are owned by agent" on public.signs
  for all using (auth.uid() = agent_id) with check (auth.uid() = agent_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1b — sign_assignments: the full assignment history of a sign.
-- A row with unassigned_at IS NULL is the sign's currently-active assignment.
-- History rows (unassigned_at set) are never deleted on reassignment.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.sign_assignments (
  id            uuid primary key default gen_random_uuid(),
  sign_id       uuid not null references public.signs(id),
  property_id   uuid not null references public.properties(id),
  assigned_at   timestamptz not null default now(),
  unassigned_at timestamptz  -- NULL = currently active
);

alter table public.sign_assignments enable row level security;

-- Access follows sign ownership — same EXISTS-join style as
-- "qrcodes follow property owner" (001/012).
create policy "sign assignments follow sign owner" on public.sign_assignments
  for all using (
    exists (
      select 1 from public.signs s
      where s.id = sign_assignments.sign_id and s.agent_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.signs s
      where s.id = sign_assignments.sign_id and s.agent_id = auth.uid()
    )
  );

-- At most ONE active assignment per sign. Uniqueness is on sign_id ONLY —
-- property_id is deliberately unconstrained because multiple signs may point
-- at the same property at once (front-yard sign + open-house A-frame).
create unique index if not exists one_active_assignment_per_sign
  on public.sign_assignments (sign_id) where unassigned_at is null;

-- Lookup indexes for the common access paths (active assignment for a sign,
-- assignment history for a property).
create index if not exists sign_assignments_sign_id_idx
  on public.sign_assignments (sign_id);
create index if not exists sign_assignments_property_id_idx
  on public.sign_assignments (property_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — sign_id on scan_events and leads (nullable; existing rows keep
-- NULL until the later backfill pass).
--
-- property_id already exists on BOTH tables and becomes the stamped snapshot:
--   • leads.property_id       — since 001, NOT NULL
--   • scan_events.property_id — since 009, nullable
-- No property_id column is added here.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.scan_events
  add column if not exists sign_id uuid references public.signs(id);

alter table public.leads
  add column if not exists sign_id uuid references public.signs(id);

create index if not exists scan_events_sign_id_idx on public.scan_events (sign_id);
create index if not exists leads_sign_id_idx       on public.leads (sign_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Immutability guard: property_id is a WRITE-ONCE stamped snapshot.
--
-- WHY THIS EXISTS: when a sign is reassigned to a new listing, historical
-- scans and leads must keep pointing at the property that was live when the
-- buyer scanned. Reassignment must NEVER rewrite historical attribution —
-- neither by application code, nor by an admin script, nor by a future bug.
-- The guard enforces this at the database layer, beneath RLS and service-role
-- access alike (triggers fire for every role).
--
-- Semantics (write-once, not frozen-forever-including-NULL):
--   • INSERT may set property_id freely (the stamp).
--   • UPDATE may fill property_id when it is currently NULL — required so the
--     later backfill pass can stamp historical scan_events rows (nullable
--     since 009) exactly once.
--   • Once non-NULL, property_id can never be changed OR cleared by UPDATE.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.prevent_property_id_change()
returns trigger
language plpgsql
as $$
begin
  if old.property_id is not null
     and new.property_id is distinct from old.property_id then
    raise exception
      'property_id is a write-once historical snapshot on % and cannot be changed (row %, % -> %)',
      tg_table_name, old.id, old.property_id, coalesce(new.property_id::text, 'NULL')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists scan_events_property_id_immutable on public.scan_events;
create trigger scan_events_property_id_immutable
  before update on public.scan_events
  for each row execute function public.prevent_property_id_change();

drop trigger if exists leads_property_id_immutable on public.leads;
create trigger leads_property_id_immutable
  before update on public.leads
  for each row execute function public.prevent_property_id_change();
