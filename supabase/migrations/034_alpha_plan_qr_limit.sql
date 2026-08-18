-- 034_alpha_plan_qr_limit.sql
-- Adds 'alpha' as a recognized plan in qr_limit_for_plan(), mapped to the same
-- QR limit as 'founding' (10). Needed before renaming the founder/admin
-- account's profiles.plan from 'founding' to 'alpha' (id
-- 9fd0805c-c50b-46f7-818d-1f8edfd1e5ae) — without this, the unknown-plan
-- fallback in this function would silently drop that account's QR limit
-- from 10 to 3. Run once in the Supabase SQL editor, same as migration 024.

create or replace function public.qr_limit_for_plan(p text)
returns integer
language plpgsql
as $$
begin
  case p
    when 'founding' then return 10;
    when 'alpha'    then return 10;
    when 'starter'  then return 3;
    when 'pro'      then return 10;
    when 'elite'    then return null;            -- unlimited
    else
      -- legacy / unknown plans (e.g. 'free', null) default safely; never lock out
      raise notice 'qr_limit_for_plan: unknown/legacy plan %, defaulting to 3', coalesce(p, '(null)');
      return 3;
  end case;
end;
$$;
