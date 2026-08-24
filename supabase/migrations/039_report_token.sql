-- ═══════════════════════════════════════════════════════════════════════════
-- 039 — Separate the seller-report access credential from the property's
-- public id.
--
-- WHY: /api/report/[...] is unauthenticated by design (sellers open a shared
-- link). Until now its only credential was properties.id — but that same UUID
-- is handed to BUYERS: open-house QR codes resolve through /q/{qrId} and
-- redirect to /open-house/{propertyId}, and /api/signs/resolve returns it.
-- An identifier that is printed on signage and sent to buyers cannot also be
-- a private access credential, so the two roles are split here.
--
-- report_token is never shown to a buyer. It appears only in the link an agent
-- chooses to send their seller, and — unlike a primary key — it can be rotated,
-- which is what makes a leaked/forwarded report link revocable.
--
-- STRICTLY ADDITIVE: one new column plus its unique index. properties.id is
-- untouched, and every existing consumer of it (buyer pages, QR resolution,
-- sign assignment, dashboard reads) is unaffected.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — The column.
--
-- gen_random_uuid() comes from pgcrypto, enabled in 001_realtqr.sql:1.
--
-- ON THE BACKFILL: gen_random_uuid() is VOLATILE, so PostgreSQL cannot use the
-- fast "store one constant in the catalog" path for the default. It rewrites
-- the table and evaluates the default once PER ROW, which is exactly what we
-- need — every pre-existing property gets its own distinct token. No separate
-- backfill statement is required, and NOT NULL is satisfiable immediately.
-- (A non-volatile default would have given every existing row the SAME value
-- and collided against the unique index in STEP 2.)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.properties
  add column if not exists report_token uuid not null default gen_random_uuid();


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Uniqueness. This is the lookup key for an unauthenticated endpoint,
-- so a duplicate must be impossible rather than merely unlikely: the index is
-- what guarantees one token resolves to exactly one property, and it makes the
-- .eq('report_token', …).single() lookup an index scan rather than a seq scan.
-- ─────────────────────────────────────────────────────────────────────────────
create unique index if not exists properties_report_token_key
  on public.properties (report_token);


comment on column public.properties.report_token is
  'Private access credential for the public seller report (/report/{token}). NOT the property id — properties.id is semi-public (printed on QR signage, handed to buyers via /open-house/{propertyId}). Rotate via POST /api/properties/{id}/regenerate-report-token to invalidate a forwarded link. Never expose this to buyers.';
