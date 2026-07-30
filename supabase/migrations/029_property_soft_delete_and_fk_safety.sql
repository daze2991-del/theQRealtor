-- ═══════════════════════════════════════════════════════════════════════════
-- 029 — Deletion safety (STAGE 1 of 2): soft-delete column + history-preserving
-- FK behavior. Additive/safety only.
--
-- Goal: a property delete must NEVER destroy historical scan_events / leads /
-- sign_assignments. The real delete path (a later stage) will be the soft
-- deleted_at flag added here; the FK SET NULL changes are the safety net so
-- that even an accidental HARD delete preserves history rows (nulling their
-- reference) instead of cascade-deleting them.
--
-- This migration does NOT touch Sign Studio, the print flow, buyer-page reads,
-- or the dashboard read paths. No delete UI is wired to deleted_at yet.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Soft-delete column on properties (NULL = active). Column only; no
-- code reads or writes it yet.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.properties
  add column if not exists deleted_at timestamptz;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Make the stamped-snapshot columns nullable so ON DELETE SET NULL can
-- clear them. scan_events.property_id is already nullable (migration 009).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.leads
  alter column property_id drop not null;

alter table public.sign_assignments
  alter column property_id drop not null;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Flip the three property_id FKs from history-destroying to
-- history-preserving:
--   leads.property_id            CASCADE   → SET NULL
--   scan_events.property_id      CASCADE   → SET NULL
--   sign_assignments.property_id NO ACTION → SET NULL   (also unblocks delete)
--
-- Constraint names are the PostgreSQL defaults (<table>_<column>_fkey) from the
-- inline `references` clauses in 001 / 009 / 028.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.leads
  drop constraint if exists leads_property_id_fkey;
alter table public.leads
  add constraint leads_property_id_fkey
  foreign key (property_id) references public.properties(id)
  on delete set null;

alter table public.scan_events
  drop constraint if exists scan_events_property_id_fkey;
alter table public.scan_events
  add constraint scan_events_property_id_fkey
  foreign key (property_id) references public.properties(id)
  on delete set null;

alter table public.sign_assignments
  drop constraint if exists sign_assignments_property_id_fkey;
alter table public.sign_assignments
  add constraint sign_assignments_property_id_fkey
  foreign key (property_id) references public.properties(id)
  on delete set null;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4 — Reconcile the write-once guard (028) with the new SET NULL behavior.
--
-- The 028 trigger blocks ANY change to a non-NULL property_id, including
-- clearing it — which would reject the ON DELETE SET NULL cascade above and
-- abort the whole delete. We relax it by exactly ONE permitted transition:
-- clearing to NULL when the parent property no longer exists.
--
-- Why "property no longer exists" is the right gate: an ON DELETE SET NULL
-- cascade is implemented as an internal AFTER-DELETE action on the parent, so
-- by the time this BEFORE-UPDATE fires on the child, the parent property row is
-- already deleted. Its absence uniquely identifies a delete-driven NULL. A
-- normal (buggy) UPDATE that tries to null property_id while the property is
-- still alive still finds the row → still blocked. Re-pointing to a DIFFERENT
-- property is still blocked in all cases. NULL→value backfill (009 rows) is
-- unaffected (outer guard only fires when old.property_id is non-NULL).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.prevent_property_id_change()
returns trigger
language plpgsql
as $$
begin
  if old.property_id is not null
     and new.property_id is distinct from old.property_id then

    -- Permitted: delete-driven clear (parent property already gone).
    if new.property_id is null
       and not exists (
         select 1 from public.properties where id = old.property_id
       ) then
      return new;
    end if;

    -- Everything else (re-point, or clear while the property still exists)
    -- remains a write-once violation.
    raise exception
      'property_id is a write-once historical snapshot on % and cannot be changed (row %, % -> %)',
      tg_table_name, old.id, old.property_id, coalesce(new.property_id::text, 'NULL')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Triggers themselves are unchanged (still BEFORE UPDATE on both tables); only
-- the function body above is updated, so no trigger re-creation is needed.
