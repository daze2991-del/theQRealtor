-- ═══════════════════════════════════════════════════════════════════════════
-- 044 — dashboard_dismissals
--
-- Backs the "mark handled" affordance for the upcoming "Needs Your Attention"
-- dashboard widget. scan_events has no state column of its own, so a
-- scan-based item (e.g. "buyer returned to 123 Main") can't be dismissed by
-- mutating the source row — this table records the dismissal as a separate
-- fact instead. item_type/item_key are a generic (kind, id) pair so future
-- item kinds (e.g. showing requests, once that data model exists) can reuse
-- the same table rather than adding a dismissal column per source table.
--
-- item_type is 'scan_return' for now; item_key is the dismissed property_id.
-- Run once in the Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.dashboard_dismissals (
  id            uuid        primary key default gen_random_uuid(),
  agent_id      uuid        not null references public.profiles(id) on delete cascade,
  item_type     text        not null,   -- 'scan_return' for now, may support other types later
  item_key      text        not null,   -- property_id for scan_return items
  dismissed_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists dashboard_dismissals_agent_item_idx
  on public.dashboard_dismissals (agent_id, item_type, item_key, dismissed_at desc);

alter table public.dashboard_dismissals enable row level security;

-- Agents may read and insert only their own dismissals. No UPDATE/DELETE
-- policy — a dismissal is a one-time, immutable fact, same as
-- feedback_responses (033).
drop policy if exists "dashboard_dismissals select own" on public.dashboard_dismissals;
create policy "dashboard_dismissals select own" on public.dashboard_dismissals
  for select to authenticated
  using (agent_id = auth.uid());

drop policy if exists "dashboard_dismissals insert own" on public.dashboard_dismissals;
create policy "dashboard_dismissals insert own" on public.dashboard_dismissals
  for insert to authenticated
  with check (agent_id = auth.uid());

grant select, insert on public.dashboard_dismissals to authenticated;
