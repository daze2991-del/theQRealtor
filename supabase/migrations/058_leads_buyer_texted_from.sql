-- ═══════════════════════════════════════════════════════════════════════════
-- 058 — leads.buyer_texted_from: which of OUR numbers sent the buyer
-- confirmation text.
--
-- Written by app/api/submit-lead alongside buyer_texted_at, only when the
-- confirmation actually went out. NULL when no text was sent (no consent, no
-- phone, suppressed, failed) — and also when Twilio hadn't yet reported a
-- sender at send time: via a Messaging Service, Twilio picks the sending
-- number from the pool AFTER accepting the message, so the create response's
-- "from" is usually empty.
--
-- Same E.164 CHECK as migration 055. Column only: no index, no grant or
-- policy change (leads has no column-level grants, so existing table grants
-- and RLS cover it unchanged).
--
-- Applied to the live project on 2026-09-30.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.leads
  add column if not exists buyer_texted_from text;

do $$ begin
  alter table public.leads
    add constraint leads_buyer_texted_from_check
    check (buyer_texted_from ~ '^\+[1-9][0-9]{7,14}$');
exception when duplicate_object then null; end $$;

comment on column public.leads.buyer_texted_from is
  'E.164 number of ours that sent the buyer confirmation text, as reported by Twilio at send time. NULL if no text was sent, or if Twilio had not yet selected a sender from the Messaging Service pool.';
