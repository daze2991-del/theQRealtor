-- ── SMS Automation ────────────────────────────────────────────────────────────
-- Outbound agent alerts + buyer confirmations, quiet-hours queueing, and inbound
-- reply forwarding. Run once in the Supabase SQL editor.

-- 1. leads: contact quality + per-lead notification bookkeeping
alter table public.leads
  add column if not exists contact_quality text        default 'none',
  add column if not exists hot_notified_at timestamptz,
  add column if not exists buyer_texted_at timestamptz;

-- contact_quality values: 'verified_phone' | 'phone' | 'email_only' | 'none'
-- ('verified_phone' reserved for a future SMS-verification flow)
do $$ begin
  alter table public.leads
    add constraint leads_contact_quality_check
    check (contact_quality in ('verified_phone', 'phone', 'email_only', 'none'));
exception when duplicate_object then null; end $$;

-- 2. profiles: agent phone (for alerts + inbound forwarding) + notification prefs
alter table public.profiles
  add column if not exists phone             text,
  add column if not exists notify_showing    boolean default true,
  add column if not exists notify_question   boolean default true,
  add column if not exists notify_hot_lead   boolean default true,
  add column if not exists quiet_hours_start time    default '21:00',
  add column if not exists quiet_hours_end   time    default '08:00';

-- 3. pending_notifications: agent alerts held during quiet hours, flushed at 8am
create table if not exists public.pending_notifications (
  id            uuid        primary key default gen_random_uuid(),
  agent_id      uuid        references public.profiles(id) on delete cascade,
  lead_id       uuid        references public.leads(id)    on delete cascade,
  message       text        not null,
  scheduled_for timestamptz not null,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);

-- Fast lookup of due, unsent notifications for the flush job
create index if not exists pending_notifications_due_idx
  on public.pending_notifications (scheduled_for)
  where sent_at is null;

-- 4. RLS — consistent with existing owner-scoped policies.
-- Writes/sends happen via the service role (admin client), which bypasses RLS;
-- agents may read their own queued notifications.
alter table public.pending_notifications enable row level security;

create policy "owner_select_pending_notifications"
  on public.pending_notifications for select
  to authenticated
  using (agent_id = auth.uid());
