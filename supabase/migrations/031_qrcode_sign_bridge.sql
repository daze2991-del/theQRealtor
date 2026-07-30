-- ═══════════════════════════════════════════════════════════════════════════
-- 031 — Legacy QR → sign bridge (Stage 2B).
--
-- Printed pre-sign QR codes encode /q/{qrcode.id}, which resolved through
-- qrcodes.property_id — a property-bound URL that breaks on reassignment.
-- This migration maps every legacy qrcode to a durable sign so /q/{qrId}
-- can resolve through sign_assignments (the sign's CURRENT property) and
-- survive reassignment forever. The /q route stays live indefinitely.
--
--   1. qrcodes.sign_id — the qrcode → sign mapping (nullable FK).
--   2. Backfill: one new sign per unmapped qrcode that has a property,
--      owned by that property's agent, with an active assignment to it.
--
-- Idempotent: the backfill only touches rows where sign_id IS NULL, so
-- re-running is a no-op. qrcodes with property_id NULL (unlinked since 012)
-- get no sign; the /q route keeps its legacy redirect-home behavior for them.
--
-- Out of scope here (Stage 2A): scan_events/leads schema, RLS, the
-- write-once trigger, deleted_at, lead-read filtering.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.qrcodes
  add column if not exists sign_id uuid references public.signs(id);

create index if not exists qrcodes_sign_id_idx on public.qrcodes (sign_id);

-- One sign per qrcode (not per property): several qrcodes for the same
-- property are several physical signs, and each printed QR must keep its own
-- identity/history. A loop keeps the sign→qrcode mapping explicit; volumes
-- are tiny (no real agents yet).
do $$
declare
  q record;
  new_sign_id uuid;
begin
  for q in
    select qc.id as qrcode_id,
           qc.label,
           qc.property_id,
           p.user_id
    from public.qrcodes qc
    join public.properties p on p.id = qc.property_id
    where qc.sign_id is null
  loop
    insert into public.signs (agent_id, label)
    values (q.user_id, coalesce(nullif(trim(q.label), ''), 'Imported QR sign'))
    returning id into new_sign_id;

    update public.qrcodes
    set sign_id = new_sign_id
    where id = q.qrcode_id;

    -- Fresh sign → no active assignment exists, so the partial unique index
    -- one_active_assignment_per_sign (028) cannot be violated.
    insert into public.sign_assignments (sign_id, property_id)
    values (new_sign_id, q.property_id);
  end loop;
end $$;
