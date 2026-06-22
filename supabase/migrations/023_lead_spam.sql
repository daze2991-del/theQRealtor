-- 023_lead_spam.sql
-- Adds a spam flag to leads so agents can hide bot/junk submissions from the
-- main inbox and review/restore them under a Spam tab.
-- Run once in the Supabase SQL editor.

alter table public.leads
  add column if not exists spam boolean not null default false;

-- Partial index — only spam rows, used by the Spam tab.
create index if not exists leads_spam_idx on public.leads (spam) where spam = true;
