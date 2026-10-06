-- 059 — Protect profiles.account_status and profiles.billing_interval.
--
-- RLS ("Users can update own profile") lets a signed-in agent update their own
-- row; trg_protect_profile_entitlements then rejects changes to billing and
-- entitlement columns. account_status and billing_interval were not on that
-- list, so an agent could change them on their own row (verified live,
-- 2026-10-06). Neither gates access in code, but both are shown in the admin
-- roster and are meant to be set only by the server / by hand.
--
-- Legitimate writers (all bypass this check because auth.role() is
-- service_role / unset, not 'authenticated' or 'anon'):
--   - app/api/auth/beta-signup/route.ts — service-role upsert, account_status='beta'
--   - manual edits in the Supabase dashboard / SQL editor
--
-- The only change from the live definition is the two added clauses below.
-- Same mechanism, same message, same errcode (insufficient_privilege, 42501).

create or replace function public.protect_profile_entitlements()
 returns trigger
 language plpgsql
as $function$
begin
  if auth.role() is distinct from 'authenticated'
     and auth.role() is distinct from 'anon' then
    return new;
  end if;

  if  new.plan                   is distinct from old.plan
   or new.subscription_status    is distinct from old.subscription_status
   or new.price_id               is distinct from old.price_id
   or new.stripe_customer_id     is distinct from old.stripe_customer_id
   or new.stripe_subscription_id is distinct from old.stripe_subscription_id
   or new.current_period_end     is distinct from old.current_period_end
   or new.cancel_at_period_end   is distinct from old.cancel_at_period_end
   or new.trial_end              is distinct from old.trial_end
   or new.is_founding            is distinct from old.is_founding
   or new.cancel_at              is distinct from old.cancel_at
   or new.cancellation_reason    is distinct from old.cancellation_reason
   or new.last_payment_failed_at is distinct from old.last_payment_failed_at
   or new.account_status         is distinct from old.account_status
   or new.billing_interval       is distinct from old.billing_interval
  then
    raise exception 'Billing and entitlement fields are managed by the system and cannot be changed here.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$function$;
