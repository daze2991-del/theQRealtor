# RealtQR

QR-powered lead capture for real estate agents. Buyers scan a sign, fill out a form, and the agent gets an instant SMS. Every scan and lead is tracked in the dashboard.

**Live:** https://realtqr.vercel.app

---

## Stack
- **Frontend:** Next.js 14 (App Router), React 18, TypeScript
- **Database:** Supabase (Postgres + RLS + Auth)
- **Payments:** Stripe (monthly / yearly subscriptions)
- **SMS:** Twilio
- **Charts:** Recharts
- **Deploy:** Vercel

---

## Local Development

```bash
# Install dependencies
npm install

# Copy env template and fill in values
cp .env.example .env.local

# Run dev server
npm run dev
# → http://localhost:3000
```

### Required environment variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_PRICE_ID_MONTHLY=
STRIPE_PRICE_ID_YEARLY=
STRIPE_WEBHOOK_SECRET=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

---

## Database Migrations

Run these in order in the Supabase SQL Editor:

1. `supabase/migrations/001_realtqr.sql` — full schema + RLS policies
2. `supabase/migrations/002_qr_public_read.sql` — public read/insert policies for QR scanning
3. `supabase/migrations/003_add_motivation_to_leads.sql` — adds `motivation` column to leads

---

## Key Files

| File | Purpose |
|------|---------|
| `app/dashboard/page.tsx` | Main agent dashboard |
| `app/dashboard/analytics/page.tsx` | Analytics page (charts, KPIs, leaderboard) |
| `app/p/[propertyId]/page.tsx` | Public buyer landing page + lead form |
| `app/q/[qrId]/route.ts` | Permanent QR redirect handler |
| `app/print/[propertyId]/page.tsx` | Printable QR sheet |
| `components/QRCodeManager.tsx` | Per-property QR create / download / reassign UI |
| `app/api/stripe/checkout/route.ts` | Creates Stripe checkout session |
| `app/api/stripe/webhook/route.ts` | Handles Stripe subscription events |
| `app/api/send-sms/route.ts` | Sends Twilio SMS to agent on new lead |
| `lib/stripe.ts` | Stripe client |
| `lib/supabase-browser.ts` | Browser Supabase client |
| `lib/supabase-server.ts` | Server Supabase client |
| `lib/supabase-admin.ts` | Admin Supabase client (bypasses RLS) |

---

## Deploy

```bash
npx vercel --prod --force
```

See `ROADMAP.md` for full feature status and what's left to build.
