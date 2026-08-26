-- ═══════════════════════════════════════════════════════════════════════════
-- 043 — Separate agent-private notes from the buyer's submitted message.
--
-- THE BUG THIS FIXES: leads.notes has been serving two incompatible purposes.
-- 015_lead_notes.sql created it for "Agent notes on individual leads", but
-- submit-lead/route.ts writes the BUYER's submitted question into that same
-- column at lead creation. Both the inbox and the lead detail page then render
-- it inside an EDITABLE textarea placeholdered "Add private notes about this
-- lead…", auto-saving on a 1.5s debounce or on blur — so an agent typing a
-- note silently overwrote the buyer's original words, with no confirmation,
-- no versioning, and no recovery.
--
-- AFTER THIS MIGRATION:
--   leads.notes        — BUYER-AUTHORED, write-once at submission. Read-only
--                        everywhere in the UI from here on. Never edited.
--   leads.agent_notes  — AGENT-AUTHORED private notes. The only column the
--                        editable notes controls read from and write to.
--
-- NO BACKFILL, deliberately. Copying notes -> agent_notes would be wrong: for
-- rows never touched by an agent it would duplicate the buyer's message into a
-- field meaning "the agent wrote this", and for any row already overwritten we
-- cannot distinguish the agent's text from the buyer's lost original anyway.
-- Existing notes values are left exactly as-is and agent_notes starts null for
-- every row; agents begin with an empty private-notes field, which is honest.
--
-- NOTE ON EXISTING DATA: whatever a given leads.notes currently holds is now
-- frozen as "the buyer's message" by the UI, whether or not that is still
-- literally true for rows an agent may already have edited. That history is
-- unrecoverable — this migration stops the bleeding, it cannot undo it.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.leads
  add column if not exists agent_notes text;

comment on column public.leads.agent_notes is
  'Agent-authored private notes about this lead. Nullable. This is the ONLY column the editable notes UI writes to — leads.notes is the buyer''s own submitted message and is read-only after submission (see migration 043).';

comment on column public.leads.notes is
  'BUYER-AUTHORED message submitted with the lead form (submit-lead writes questionText here). Write-once at submission; the UI must render this read-only. Agent-authored notes belong in leads.agent_notes, NOT here (see migration 043).';
