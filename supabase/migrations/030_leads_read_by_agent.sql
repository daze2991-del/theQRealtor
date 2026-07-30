-- ═══════════════════════════════════════════════════════════════════════════
-- 030 — Read leads by agent ownership (STAGE 2A).
--
-- After 029, a property's leads/scan_events.property_id can be nulled when the
-- property is hard-deleted, and (via soft-delete) a lead's property is archived
-- out of the agent's active property set. In both cases the old SELECT policy —
-- keyed on "does the owner still own leads.property_id's property" — would hide
-- the lead. leads.agent_id (migration 006) is the durable owner stamp, so reads
-- move to it.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Defensive backfill. agent_id is set on every lead at capture time
-- (submit-lead), so this is expected to touch 0 rows today; it exists so any
-- legacy row with a NULL agent_id but an intact property_id is recovered before
-- the read path starts filtering on agent_id.
-- ─────────────────────────────────────────────────────────────────────────────
update public.leads l
set agent_id = p.user_id
from public.properties p
where l.property_id = p.id
  and l.agent_id is null;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Replace the leads SELECT policy. Primary key is agent_id (survives
-- property archive/hard-delete). The property-owner branch is kept as a
-- belt-and-suspenders fallback so a lead can never vanish during transition
-- (e.g. a legacy NULL agent_id whose property still exists).
--
-- Only the SELECT policy changes here. INSERT (002), UPDATE (015), and
-- DELETE (011) policies are untouched.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "leads follow property owner" on public.leads;
drop policy if exists "leads readable by owning agent" on public.leads;

create policy "leads readable by owning agent" on public.leads
  for select
  using (
    agent_id = auth.uid()
    or exists (
      select 1 from public.properties p
      where p.id = leads.property_id and p.user_id = auth.uid()
    )
  );
