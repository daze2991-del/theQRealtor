import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { normalizePhone } from '../../../../lib/phone'

// Generic failure message for anything that must not reveal which field or
// condition caused the failure (e.g. phone collisions). Must stay identical
// across the pre-check and constraint-violation paths.
const GENERIC_SIGNUP_ERROR =
  "We couldn't complete your signup. Please contact support if you believe this is an error."

export async function POST(req: Request) {
  const { name, email, password, phone, dre } = await req.json()

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  }
  if (!email || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email.trim())) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
  }

  // Phone is required and must normalize to E.164. This error is deliberately
  // specific: it's a format-validation failure, not a collision, so there is
  // no enumeration risk in naming the field.
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return NextResponse.json({ error: 'A phone number is required.' }, { status: 400 })
  }
  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone) {
    return NextResponse.json(
      { error: 'Please enter a valid phone number.' },
      { status: 400 }
    )
  }

  // DRE / license number is optional, stored as-is (trimmed) — collected for
  // future verification, not validated or deduplicated today.
  const normalizedDre =
    dre && typeof dre === 'string' && dre.trim() ? dre.trim() : null

  const e = email.trim().toLowerCase()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Check allowlist — service role bypasses RLS; anon/authenticated are locked out
  const { data: allowRow } = await supabase
    .from('beta_allowlist')
    .select('approved')
    .eq('email', e)
    .single()

  if (!allowRow || allowRow.approved !== true) {
    return NextResponse.json(
      { error: 'This is a private beta. Access is by invitation only.' },
      { status: 403 }
    )
  }

  // Enforce hard cap on enrolled beta agents
  const { count } = await supabase
    .from('beta_allowlist')
    .select('*', { count: 'exact', head: true })
    .not('joined_at', 'is', null)

  if (count !== null && count >= 25) {
    return NextResponse.json(
      { error: 'This is a private beta. Access is by invitation only.' },
      { status: 403 }
    )
  }

  // Pre-check phone uniqueness before creating the auth user. This is NOT the
  // security boundary — the partial unique index on profiles.phone is the real
  // source of truth, and the constraint-violation handler below covers the
  // race where two signups pass this check concurrently. The pre-check exists
  // purely to avoid creating an orphaned auth user in the common case, so we
  // don't have to create-then-delete on every duplicate attempt.
  const { data: phoneRow } = await supabase
    .from('profiles')
    .select('id')
    .eq('phone', normalizedPhone)
    .limit(1)
    .maybeSingle()

  if (phoneRow) {
    return NextResponse.json({ error: GENERIC_SIGNUP_ERROR }, { status: 400 })
  }

  // Create user server-side with email pre-confirmed
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: e,
    password,
    email_confirm: true,
    user_metadata: { name: name.trim() },
  })

  if (createError) {
    if (createError.status === 422 || createError.message.toLowerCase().includes('already')) {
      return NextResponse.json(
        { error: 'This email already has an account. Please sign in instead.' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'Something went wrong creating your account. Please try again.' },
      { status: 500 }
    )
  }

  const userId = created.user.id

  // UPSERT instead of UPDATE: creates the profile row if the trigger
  // on_auth_user_created does not exist (confirmed absent in the live DB), and
  // updates it idempotently if the trigger did create the row. This makes the
  // route correct regardless of trigger state.
  //
  // Columns we set explicitly:
  //   id            — required; PK, ties the profile to the auth user
  //   name          — from the signup form
  //   plan          — 'founding' is the source of truth for QR limits and UI
  //   account_status — 'beta' identifies beta cohort membership
  //   beta_joined_at — timestamp of this signup
  //   phone          — normalized E.164; unique index enforces anti-abuse constraint
  //   dre            — optional license number, nullable
  //
  // Columns we do NOT set (let DB defaults fill them on fresh insert):
  //   created_at, is_founding, has_seen_welcome, onboarding_completed,
  //   and all Stripe/subscription columns.
  //
  // ⚠️  PREREQUISITE: The plan CHECK constraint from migration 001 was defined as
  //   CHECK (plan IN ('free', 'pro')). If that constraint still exists in the live
  //   DB, this upsert will fail on plan='founding'. Verify and drop it first:
  //     SELECT pg_get_constraintdef(oid) FROM pg_constraint
  //     WHERE conrelid='public.profiles'::regclass AND contype='c';
  //   If the old constraint appears, run:
  //     ALTER TABLE public.profiles DROP CONSTRAINT profiles_plan_check;
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        name: name.trim(),
        plan: 'founding',
        account_status: 'beta',
        beta_joined_at: new Date().toISOString(),
        phone: normalizedPhone,
        dre: normalizedDre,
      },
      { onConflict: 'id' }
    )

  if (profileError) {
    // Roll back the auth user so a failed profile write never leaves a
    // half-created account behind.
    await supabase.auth.admin.deleteUser(userId)

    // 23505 = Postgres unique_violation. INSERT ... ON CONFLICT (id) DO UPDATE
    // handles PK conflicts internally and never surfaces a 23505 for the PK,
    // so a 23505 here can only originate from profiles_phone_unique_idx — a
    // phone number collision with a concurrent signup that beat the pre-check.
    // Response must be byte-identical to the pre-check rejection so the two
    // paths are indistinguishable to a caller.
    if (profileError.code === '23505') {
      return NextResponse.json({ error: GENERIC_SIGNUP_ERROR }, { status: 400 })
    }

    return NextResponse.json(
      { error: 'Something went wrong creating your account. Please try again.' },
      { status: 500 }
    )
  }

  // Record when this allowlist slot was claimed
  await supabase
    .from('beta_allowlist')
    .update({ joined_at: new Date().toISOString() })
    .eq('email', e)

  return NextResponse.json({ ok: true })
}
