-- 033_feedback.sql
-- Weekly in-app feedback prompt. Two tables:
--   feedback_responses    — one immutable row per submitted rating/comment
--   feedback_prompt_state — per-agent prompt bookkeeping (when last shown, when
--                           eligible again) that drives the cooldown logic
-- Run once in the Supabase SQL editor.
--
-- ROLE MODEL (same as 024): the untrusted client roles (authenticated, anon) are
-- constrained by RLS. service_role (the admin client used by the /api/feedback/*
-- routes) bypasses RLS, so all real writes happen server-side after the route has
-- derived the agent's identity from the session — a client-supplied agent_id is
-- never trusted.

-- ════════════════════════════════════════════════════════════════════════════
-- feedback_responses — immutable submissions
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.feedback_responses (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid not null references auth.users(id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  comment    text check (comment is null or char_length(comment) <= 2000),
  context    text not null default 'general_experience',
  created_at timestamptz not null default now()
);

create index if not exists feedback_responses_agent_idx
  on public.feedback_responses (agent_id, created_at);

alter table public.feedback_responses enable row level security;

-- Agents may insert only their own row. No SELECT/UPDATE/DELETE policy: rows are
-- immutable and only ever read back server-side via the admin client.
drop policy if exists "feedback insert own" on public.feedback_responses;
create policy "feedback insert own" on public.feedback_responses
  for insert to authenticated
  with check (agent_id = auth.uid());

grant insert on public.feedback_responses to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- feedback_prompt_state — per-agent cooldown bookkeeping
-- ════════════════════════════════════════════════════════════════════════════
-- last_shown_at    — last time the card was actually rendered to this agent
-- next_eligible_at — the agent is not prompted again until now() >= this. NULL
--                    means "no cooldown set yet" (eligible once the account is
--                    old enough). Set by shown (~3d), dismiss (~14d), and
--                    submit (~30d); a later action overwrites the shorter window.
create table if not exists public.feedback_prompt_state (
  agent_id         uuid primary key references auth.users(id) on delete cascade,
  last_shown_at    timestamptz,
  next_eligible_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.feedback_prompt_state enable row level security;

-- Agents may read their own state row (defensive / debuggability). All writes are
-- service_role only (the /api/feedback/* routes), so there is deliberately no
-- client INSERT/UPDATE policy — service_role bypasses RLS.
drop policy if exists "feedback state read own" on public.feedback_prompt_state;
create policy "feedback state read own" on public.feedback_prompt_state
  for select to authenticated
  using (agent_id = auth.uid());
