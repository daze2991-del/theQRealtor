-- ─── 1. profiles: add Stripe billing columns ──────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- ─── 2. properties: add missing detail columns ─────────────────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS agent_phone text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS beds integer,
  ADD COLUMN IF NOT EXISTS baths numeric,
  ADD COLUMN IF NOT EXISTS description text;

-- ─── 3. leads: make qr_id nullable ─────────────────────────────────────────
-- Buyers can access the property page via a direct URL (no QR scan),
-- so qr_id must be optional.
ALTER TABLE public.leads ALTER COLUMN qr_id DROP NOT NULL;

-- ─── 4. Public buyer-page access to active properties ──────────────────────
-- Anonymous visitors (buyers) need to read property details to display the
-- lead-capture form.  Restrict to active listings only — deactivated
-- properties return "not found" to buyers.
CREATE POLICY "properties anon read active" ON public.properties
  FOR SELECT TO anon USING (active = true);
