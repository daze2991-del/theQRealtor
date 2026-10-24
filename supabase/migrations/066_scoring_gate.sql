-- 066 — Scoring gate: views that strip lead-scoring and return-visit data for
-- agents whose plan doesn't include it (Free), so the data never leaves the
-- database for them — not just hidden in the UI.
--
-- plan_can_score(plan) mirrors lib/plans.ts featuresForPlan(plan).leadScoring
-- exactly: true only for the 5 known plan ids whose PLAN_CONFIG entry has
-- leadScoring=true (founding, alpha, trial, starter, pro). Deliberately an
-- allow-list, not "anything that isn't the literal string 'free'" — the
-- latter would say an unrecognized/typo'd plan value (e.g. a corrupted
-- profiles.plan) CAN score, while lib/plans.ts's planConfig() falls back to
-- Free (cannot score) for that same value. Tested for parity the same way
-- migration 060's plan_limits() is.
--
-- leads_scoped: every leads column, with tier / intent_score / motivation /
-- motivation_level / return_visit_count / photo_view_count /
-- total_time_on_page / hot_notified_at nulled, and score_breakdown trimmed to
-- just the two counters Free explicitly keeps (showing-request and question
-- counts — requestedShowing() in lib/leadScoringV2.ts reads
-- score_breakdown.requested_showing; the question count reads .requested_info
-- the same way) — everything else in the breakdown (return visits, photos,
-- saved, time on page) dropped. contact_quality is NOT nulled: it only
-- records whether a verified phone, a phone, or only an email was provided
-- ('verified_phone' | 'phone' | 'email_only' | 'none', migration 020) — it is
-- about contact-method validity, not behavior/scoring, so Free keeps it the
-- same way it keeps the contact details themselves.
--
-- scan_events_scoped: every scan_events column, with return_visit forced to
-- false (not null — the base column is NOT NULL boolean) and
-- days_since_first_visit / time_on_page_sec / photos_viewed nulled (all three
-- are nullable already) when the owning agent's plan can't score — consistent
-- with nulling the equivalent per-lead aggregates (photo_view_count,
-- total_time_on_page) in leads_scoped above. cta_clicked is kept: it is how
-- the showing-request/question signal is read before a lead row even exists.
-- Ownership is resolved via property_id first, falling back to sign_id for a
-- scan not yet linked to a property (same two paths the live scan_events RLS
-- policy already uses).
--
-- Both views are WITH (security_invoker = true): they run with the querying
-- user's own role, so the EXISTING RLS policies on leads/scan_events still
-- apply — this only adds column-level nulling on top, it does not widen who
-- can read which rows. Verified live, rolled back, with two throwaway
-- accounts: agent A cannot read agent B's rows through either view.
--
-- Grants are explicit rather than left to Supabase's default privileges
-- (which can otherwise hand a newly created view broader default access than
-- intended): revoke everything from public/anon/authenticated first, then
-- grant select back to authenticated only. anon gets nothing — no buyer-facing
-- code reads either view, and anon has no SELECT RLS policy on the base
-- tables to inherit through security_invoker anyway, so this is belt-and-
-- suspenders, not a behavior change.
--
-- No changes to the leads or scan_events tables themselves, their RLS, or
-- their grants. No DROP, no DELETE, no data touched.

-- ── plan_can_score() ──────────────────────────────────────────────────────────
create or replace function public.plan_can_score(p_plan text)
returns boolean
language sql immutable
set search_path = public
as $$
  select coalesce(p_plan, 'free') in ('founding', 'alpha', 'trial', 'starter', 'pro')
$$;

revoke all on function public.plan_can_score(text) from public, anon, authenticated;
grant execute on function public.plan_can_score(text) to authenticated, service_role;

-- ── leads_scoped ──────────────────────────────────────────────────────────────
create or replace view public.leads_scoped
  with (security_invoker = true) as
select
  l.id, l.property_id, l.qr_id, l.name, l.phone, l.email, l.created_at,
  case when public.plan_can_score(pr.plan) then l.motivation_level else null end as motivation_level,
  case when public.plan_can_score(pr.plan) then l.motivation else null end as motivation,
  l.agent_id, l.notes, l.contact_preference, l.status, l.last_contacted_at,
  case when public.plan_can_score(pr.plan) then l.intent_score else null end as intent_score,
  case when public.plan_can_score(pr.plan) then l.tier else null end as tier,
  l.last_activity_at,
  case when public.plan_can_score(pr.plan) then l.return_visit_count else null end as return_visit_count,
  case when public.plan_can_score(pr.plan) then l.photo_view_count else null end as photo_view_count,
  case when public.plan_can_score(pr.plan) then l.total_time_on_page else null end as total_time_on_page,
  case when public.plan_can_score(pr.plan)
       then l.score_breakdown
       else jsonb_build_object(
         'requested_showing', coalesce((l.score_breakdown ->> 'requested_showing')::int, 0),
         'requested_info',    coalesce((l.score_breakdown ->> 'requested_info')::int, 0)
       )
  end as score_breakdown,
  l.contact_quality,
  case when public.plan_can_score(pr.plan) then l.hot_notified_at else null end as hot_notified_at,
  l.buyer_texted_at, l.source, l.working_with_agent,
  l.do_not_contact, l.sms_consent, l.spam, l.sign_id, l.sms_consent_at, l.sms_consent_text,
  l.agent_notes, l.phone_e164, l.buyer_texted_from
from public.leads l
left join public.profiles pr on pr.id = l.agent_id;

revoke all on public.leads_scoped from public, anon, authenticated;
grant select on public.leads_scoped to authenticated;

-- ── scan_events_scoped ────────────────────────────────────────────────────────
create or replace view public.scan_events_scoped
  with (security_invoker = true) as
select
  se.id, se.qr_id, se.lat, se.lng, se.created_at, se.property_id,
  case when public.plan_can_score(coalesce(owner_via_prop.plan, owner_via_sign.plan))
       then se.time_on_page_sec else null end as time_on_page_sec,
  case when public.plan_can_score(coalesce(owner_via_prop.plan, owner_via_sign.plan))
       then se.photos_viewed else null end as photos_viewed,
  case when public.plan_can_score(coalesce(owner_via_prop.plan, owner_via_sign.plan))
       then se.return_visit else false end as return_visit,
  case when public.plan_can_score(coalesce(owner_via_prop.plan, owner_via_sign.plan))
       then se.days_since_first_visit else null end as days_since_first_visit,
  se.cta_clicked, se.converted, se.sign_id
from public.scan_events se
left join public.properties p             on p.id = se.property_id
left join public.profiles   owner_via_prop on owner_via_prop.id = p.user_id
left join public.signs      sg             on sg.id = se.sign_id
left join public.profiles   owner_via_sign on owner_via_sign.id = sg.agent_id;

-- authenticated only: this view is for the agent dashboard. Buyer-facing scan
-- creation goes through /api/scan-events with the admin client, not this view,
-- and anon has no SELECT RLS policy on scan_events to inherit anyway.
revoke all on public.scan_events_scoped from public, anon, authenticated;
grant select on public.scan_events_scoped to authenticated;
