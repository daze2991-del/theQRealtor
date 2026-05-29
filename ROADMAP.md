# RealtQR MVP Roadmap
_Last updated: May 23, 2026_

---

## PHASE 1 — CORE PRODUCT ✅
- ✅ Next.js project setup
- ✅ Supabase connected
- ✅ Auth (signup / login)
- ✅ Dashboard loads properties
- ✅ QR code generation per property
- ✅ Public buyer landing page (`/p/[propertyId]`)
- ✅ Scan event tracking
- ✅ Lead capture form
- ✅ Leads saving to Supabase with `property_id` and `qr_id`
- ✅ Twilio SMS to agent on new lead

---

## PHASE 2 — ANALYTICS ✅
- ✅ Scan count per property on dashboard
- ✅ Lead count per property on dashboard
- ✅ Per-property leaderboard (most scans / leads)
- ✅ Open house traffic over time (bar charts, last 30 days)
- ✅ Dedicated `/dashboard/analytics` page with KPI cards, bar charts, motivation donut

---

## PHASE 3 — CSV EXPORT ✅
- ✅ Download Leads CSV button on dashboard
- ✅ CSV fields: Name, Phone, Email, Property, QR Code, Motivation, Created At
- ✅ Compatible with CRM tools (Follow Up Boss, KVCore, Excel, Google Sheets)

---

## PHASE 4 — LEAD MOTIVATION INDICATOR ✅
- ✅ `motivation` column on `leads` table (`003_add_motivation_to_leads.sql`)
- ✅ Buyer form question: "When are you looking to buy?"
  - Just browsing → `cold`
  - Casually looking → `warm`
  - Actively searching → `motivated`
  - Ready to make an offer → `hot`
- ✅ Motivation badge shown on dashboard per property
- ✅ Motivation breakdown donut chart on analytics page

---

## PHASE 5 — PERMANENT REUSABLE QR CODES ✅
- ✅ `qrcodes` table with label and `property_id`
- ✅ Agent can create multiple QR codes per property (Front Yard, Open House, Rider, etc.)
- ✅ QR codes use permanent URL: `/q/[qrId]` — physical code never needs reprinting
- ✅ Reassign any QR to a different property from dashboard
- ✅ Scan + lead counts shown per QR code via `QRCodeManager`
- ✅ Download QR as PNG directly from dashboard

---

## PHASE 6 — BILLING ✅
- ✅ Stripe checkout (monthly $19/mo, yearly $99/yr)
- ✅ Webhook handles `checkout.session.completed` → upgrades profile to `pro`
- ✅ Webhook handles `customer.subscription.deleted` → downgrades to `free`
- ✅ Free plan limited to 1 property; Pro plan is unlimited
- ✅ Upgrade banner shown on dashboard for free users
- ⬜ Billing management page (view plan, cancel subscription, invoice history)

---

## PHASE 7 — AUTOMATION ⚠️ Partial
- ✅ Agent SMS notification on new lead (Twilio, `send-sms` API route)
- ⏸️ Buyer confirmation SMS (needs A2P 10DLC registration — ~$25 one-time)
- ⬜ Follow-up SMS sequence

---

## PHASE 8 — SCALE ⬜
- ✅ Deployed to Vercel — live at https://realtqr.vercel.app
- ⬜ Custom domain
- ⬜ Multi-agent accounts
- ⬜ Team dashboards
- ⬜ Custom agent branding
- ⬜ A2P 10DLC registration for SMS

---

## TECHNICAL NOTES
- **Dev server:** `cd ~/Documents/realtqr && npm run dev`
- **Deploy:** `npx vercel --prod --force`
- **Live URL:** https://realtqr.vercel.app
- **Supabase client:** `createBrowserSupabase()` from `lib/supabase-browser.ts`
- **Key pages:** `app/dashboard/page.tsx`, `app/p/[propertyId]/page.tsx`, `app/dashboard/analytics/page.tsx`
- **Key tables:** `profiles`, `properties`, `qrcodes`, `leads`, `scan_events`
- **Migrations:** `001_realtqr.sql` (schema + RLS), `002_qr_public_read.sql` (public policies), `003_add_motivation_to_leads.sql` (motivation column)
- **Env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_YEARLY`, `STRIPE_WEBHOOK_SECRET`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

---

## WHAT'S LEFT (priority order)
1. ⬜ Run migration `003_add_motivation_to_leads.sql` in Supabase dashboard
2. ⬜ Billing management page (cancel, view invoices)
3. ⬜ A2P 10DLC registration → unlock buyer SMS
4. ⬜ Follow-up SMS sequence
5. ⬜ Custom domain
6. ⬜ Multi-agent / team features
