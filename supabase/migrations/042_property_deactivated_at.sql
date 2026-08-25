-- ═══════════════════════════════════════════════════════════════════════════
-- 042 — Record WHEN a listing went inactive, so seller reports can expire.
--
-- properties.active (001) is a bare boolean with no history: nothing anywhere
-- records when it last flipped. That makes "expire the seller report N days
-- after the listing goes inactive" uncomputable from the existing schema —
-- hence this column.
--
-- SEMANTICS (null is meaningful, not a placeholder):
--   null  = currently active, OR has never been toggled inactive, OR went
--           inactive before this column existed. Treated as "never expires".
--   set   = the UTC instant `active` last flipped true -> false. The report
--           expiry window (90 days) is measured from here.
--
-- Deliberately NOT backfilled. Every existing row — including listings that
-- are already inactive today — gets null, so nothing that was reachable
-- yesterday goes dark the moment this ships. We do not know how long those
-- listings have been offline (that history does not exist), and guessing a
-- timestamp would retroactively expire live seller links with no warning.
-- They stay reachable until their next active -> inactive transition stamps a
-- real value. See the report route's gate: expiry requires a NON-NULL
-- deactivated_at, so null can never expire.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.properties
  add column if not exists deactivated_at timestamptz;

comment on column public.properties.deactivated_at is
  'UTC instant properties.active last flipped true->false. NULL = active, never deactivated, or predates this column — all treated as "report never expires". Set by the property toggle/edit handlers; read by /api/report/[token] to expire seller reports 90 days after deactivation.';
