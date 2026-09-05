import BillingPageClient from './BillingPageClient'

// Server-authoritative flag read. force-dynamic is required: without it this
// route is static (confirmed via `next build` prior to this change — it
// rendered as ○), which would bake whatever PAID_PLANS_ENABLED resolved to at
// BUILD time into the page and never re-read it — a later env var flip would
// need a redeploy to show up. This makes the read happen fresh per request.
export const dynamic = 'force-dynamic'

export default function BillingPage() {
  const paidPlansEnabled = process.env.PAID_PLANS_ENABLED === 'true'
  return <BillingPageClient paidPlansEnabled={paidPlansEnabled} />
}
