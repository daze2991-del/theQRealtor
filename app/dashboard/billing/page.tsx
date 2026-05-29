'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabase } from '../../../lib/supabase-browser'
import DashboardLayout from '../../../components/DashboardLayout'

const C = {
  bg:      '#0F0F13',
  card:    '#1A1A24',
  border:  '#252533',
  purple:  '#7C3AED',
  purpleL: '#8B5CF6',
  text:    '#FFFFFF',
  sub:     '#C4C4D4',
  muted:   '#6B7280',
} as const

type SubscriptionInfo = {
  status: string
  current_period_end: number
  cancel_at_period_end: boolean
  interval: 'month' | 'year'
} | null

export default function BillingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState<'free' | 'pro'>('free')
  const [email, setEmail] = useState('')
  const [subscription, setSubscription] = useState<SubscriptionInfo>(null)
  const [checkingOut, setCheckingOut] = useState(false)
  const [openingPortal, setOpeningPortal] = useState(false)

  const [propCount, setPropCount]       = useState(0)
  const [qrCount, setQrCount]           = useState(0)
  const [leadCount, setLeadCount]       = useState(0)
  const [hotLeadCount, setHotLeadCount] = useState(0)

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }
      setEmail(session.user.email || '')

      const { data: profile } = await supabase
        .from('profiles').select('plan').eq('id', session.user.id).single()

      const currentPlan = (profile?.plan as 'free' | 'pro') || 'free'
      setPlan(currentPlan)

      const { data: props } = await supabase
        .from('properties').select('id').eq('user_id', session.user.id)
      const propIds = (props || []).map((p: any) => p.id)
      setPropCount(propIds.length)

      if (propIds.length > 0) {
        const [{ count: qrCnt }, { data: leadsData }] = await Promise.all([
          supabase.from('qrcodes').select('id', { count: 'exact', head: true }).in('property_id', propIds),
          supabase.from('leads').select('motivation').in('property_id', propIds),
        ])
        setQrCount(qrCnt || 0)
        setLeadCount((leadsData || []).length)
        setHotLeadCount((leadsData || []).filter((l: any) => l.motivation === 'hot').length)
      }

      if (currentPlan === 'pro') {
        const res = await fetch('/api/stripe/subscription')
        if (res.ok) {
          const { subscription: sub } = await res.json()
          setSubscription(sub)
        }
      }

      setLoading(false)
    }
    load()
  }, [])

  const handleCheckout = async (billingPlan: 'monthly' | 'yearly') => {
    setCheckingOut(true)
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: billingPlan }),
    })
    const { url, error } = await res.json()
    if (url) window.location.href = url
    else { alert(error || 'Could not start checkout. Please try again.'); setCheckingOut(false) }
  }

  const handlePortal = async () => {
    setOpeningPortal(true)
    const res = await fetch('/api/stripe/portal', { method: 'POST' })
    const { url, error } = await res.json()
    if (url) window.location.href = url
    else { alert(error || 'Could not open billing portal.'); setOpeningPortal(false) }
  }

  const formatDate = (unix: number) =>
    new Date(unix * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const card: React.CSSProperties = {
    background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 14, padding: 28, marginBottom: 20,
  }
  const label: React.CSSProperties = {
    fontSize: 11, color: C.muted,
    textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
  }
  const btnPrimary: React.CSSProperties = {
    background: C.purple, color: '#fff', border: 'none',
    borderRadius: 8, padding: '12px 24px', fontSize: 15,
    fontWeight: 700, cursor: 'pointer', width: '100%', marginBottom: 10,
  }
  const btnOutline: React.CSSProperties = {
    background: 'transparent', color: C.purpleL,
    border: `1px solid ${C.purple}`, borderRadius: 8,
    padding: '12px 24px', fontSize: 15,
    fontWeight: 700, cursor: 'pointer', width: '100%', marginBottom: 10,
  }
  const btnGhost: React.CSSProperties = {
    background: 'transparent', color: C.muted,
    border: `1px solid ${C.border}`, borderRadius: 8,
    padding: '12px 24px', fontSize: 15,
    fontWeight: 700, cursor: 'pointer', width: '100%',
  }
  const divider: React.CSSProperties = { borderTop: `1px solid ${C.border}`, margin: '20px 0' }
  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }

  const badge = (p: string): React.CSSProperties => ({
    display: 'inline-block', padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
    background: p === 'pro' ? `${C.purple}28` : '#1F2937',
    color:      p === 'pro' ? C.purpleL         : '#9CA3AF',
    border:     `1px solid ${p === 'pro' ? C.purple : '#374151'}`,
    marginLeft: 10,
  })

  const commissionOpp = leadCount > 0 ? leadCount * 8000 : 0

  return (
    <DashboardLayout>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 36, height: 36, border: `2px solid ${C.purple}`, borderTopColor: 'transparent',
              borderRadius: '50%', margin: '0 auto 14px', animation: 'spin 0.7s linear infinite',
            }} />
            <div style={{ color: C.muted, fontSize: 14, fontFamily: 'sans-serif' }}>Loading billing…</div>
          </div>
        </div>
      ) : (
        <>
          {/* Top bar */}
          <div className="db-page-topbar" style={{
            position: 'sticky', top: 0, zIndex: 10,
            background: C.bg, borderBottom: `1px solid ${C.border}`,
            padding: '16px 28px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontFamily: 'sans-serif',
          }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>Billing</h1>
              <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0' }}>{email}</p>
            </div>
          </div>

          {/* Page body */}
          <div style={{ flex: 1, padding: '28px 28px 40px', overflowY: 'auto', fontFamily: 'sans-serif' }}>
            <div style={{ maxWidth: 640 }}>

              {/* ROI card */}
              <div style={{
                background: `linear-gradient(135deg, ${C.purple}12, #1A0D2E)`,
                border: `1px solid ${C.purple}35`,
                borderRadius: 14, padding: 24, marginBottom: 20,
              }}>
                <div style={{ fontSize: 11, color: C.purpleL, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  Your ROI Potential
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
                  {[
                    { label: 'Leads Captured',                value: leadCount.toString() },
                    { label: 'Est. Commission Opportunity',   value: commissionOpp > 0 ? `$${commissionOpp.toLocaleString()}+` : '—' },
                    { label: 'Monthly Cost',                  value: plan === 'pro' ? '$19/mo' : '$0' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: C.purpleL, lineHeight: 1, marginBottom: 6 }}>{value}</div>
                      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>{label}</div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 13, color: C.sub, margin: 0, lineHeight: 1.5 }}>
                  One closed deal could pay for years of Pro. Every lead captured is a potential transaction.
                </p>
              </div>

              {/* Current plan card */}
              <div style={card}>
                <div style={row}>
                  <div>
                    <span style={label}>Current Plan</span>
                    <span style={badge(plan)}>{plan === 'pro' ? 'Pro' : 'Free'}</span>
                  </div>
                  {subscription && (
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ ...label, display: 'block', marginBottom: 4 }}>
                        {subscription.cancel_at_period_end ? 'Cancels on' : 'Next billing date'}
                      </span>
                      <span style={{
                        fontSize: 14, fontWeight: 600,
                        color: subscription.cancel_at_period_end ? '#F87171' : C.text,
                      }}>
                        {formatDate(subscription.current_period_end)}
                      </span>
                    </div>
                  )}
                </div>

                {subscription && (
                  <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
                    <div>
                      <span style={{ ...label, display: 'block', marginBottom: 4 }}>Billing cycle</span>
                      <span style={{ fontSize: 14, color: '#9CA3AF' }}>
                        {subscription.interval === 'year' ? 'Yearly ($159/yr)' : 'Monthly ($19/mo)'}
                      </span>
                    </div>
                    <div>
                      <span style={{ ...label, display: 'block', marginBottom: 4 }}>Status</span>
                      <span style={{
                        fontSize: 14,
                        color: subscription.cancel_at_period_end ? '#FB923C'
                             : subscription.status === 'active' ? '#4ade80'
                             : '#F87171',
                      }}>
                        {subscription.cancel_at_period_end ? 'Cancels at period end'
                         : subscription.status === 'active' ? 'Active'
                         : subscription.status}
                      </span>
                    </div>
                  </div>
                )}

                <div style={divider} />

                {plan === 'free' ? (
                  <>
                    <p style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 20 }}>
                      You're on the <strong style={{ color: C.text }}>Free plan</strong> — 1 property, no SMS alerts.
                      Upgrade to Pro for unlimited properties, SMS notifications, and full analytics.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={{ background: `${C.purple}10`, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: C.purpleL, marginBottom: 4 }}>$19/mo</div>
                        <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Billed monthly</div>
                        <button onClick={() => handleCheckout('monthly')} disabled={checkingOut}
                          style={{ ...btnPrimary, marginBottom: 0, opacity: checkingOut ? 0.7 : 1, cursor: checkingOut ? 'not-allowed' : 'pointer' }}>
                          {checkingOut ? 'Redirecting…' : 'Upgrade Monthly'}
                        </button>
                      </div>
                      <div style={{ background: `${C.purple}10`, border: `1px solid ${C.purple}`, borderRadius: 10, padding: 20, position: 'relative' }}>
                        <div style={{
                          position: 'absolute', top: -10, right: 16,
                          background: C.purple, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        }}>BEST VALUE</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: C.purpleL, marginBottom: 4 }}>$159/yr</div>
                        <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>~$13.25/mo · save $69</div>
                        <button onClick={() => handleCheckout('yearly')} disabled={checkingOut}
                          style={{ ...btnPrimary, marginBottom: 0, opacity: checkingOut ? 0.7 : 1, cursor: checkingOut ? 'not-allowed' : 'pointer' }}>
                          {checkingOut ? 'Redirecting…' : 'Upgrade Yearly'}
                        </button>
                      </div>
                    </div>
                    <p style={{ fontSize: 12, color: '#4B5563', marginTop: 16, textAlign: 'center' }}>
                      Secure checkout via Stripe · Cancel anytime
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 20 }}>
                      {subscription?.cancel_at_period_end
                        ? <>Your subscription is <strong style={{ color: '#FB923C' }}>scheduled to cancel</strong> on {formatDate(subscription.current_period_end)}. You can reactivate anytime from the portal.</>
                        : <>You're on the <strong style={{ color: '#4ade80' }}>Pro plan</strong>. You have unlimited properties, SMS lead alerts, and full analytics access.</>
                      }
                    </p>
                    <button onClick={handlePortal} disabled={openingPortal}
                      style={{ ...btnOutline, opacity: openingPortal ? 0.7 : 1, cursor: openingPortal ? 'not-allowed' : 'pointer' }}>
                      {openingPortal ? 'Opening…' : 'Manage Subscription →'}
                    </button>
                    <button onClick={handlePortal} disabled={openingPortal}
                      style={{ ...btnGhost, opacity: openingPortal ? 0.7 : 1, cursor: openingPortal ? 'not-allowed' : 'pointer' }}>
                      {openingPortal ? 'Opening…' : 'View Invoices & Payment Method'}
                    </button>
                    <p style={{ fontSize: 12, color: '#4B5563', marginTop: 12, textAlign: 'center' }}>
                      Managed securely by Stripe · Cancel anytime from the portal
                    </p>
                  </>
                )}
              </div>

              {/* What's included */}
              <div style={card}>
                <div style={{ ...label, marginBottom: 16, display: 'block' }}>Account Usage</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: 'Properties',      value: propCount },
                    { label: 'QR Codes',        value: qrCount },
                    { label: 'Leads Captured',  value: leadCount },
                    { label: 'Hot Leads 🔥',    value: hotLeadCount },
                  ].map(({ label: lbl, value }) => (
                    <div key={lbl} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: C.purpleL, lineHeight: 1, marginBottom: 5 }}>{value}</div>
                      <div style={{ fontSize: 10.5, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{lbl}</div>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                  <div style={{ ...label, marginBottom: 14, display: 'block' }}>What's Included</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', color: C.muted, fontWeight: 600, paddingBottom: 10 }}>Feature</th>
                        <th style={{ textAlign: 'center', color: '#9CA3AF', fontWeight: 600, paddingBottom: 10 }}>Free</th>
                        <th style={{ textAlign: 'center', color: C.purpleL, fontWeight: 600, paddingBottom: 10 }}>Pro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['Properties',            '1',          'Unlimited'],
                        ['QR codes per property', 'Unlimited',  'Unlimited'],
                        ['Lead capture form',     '✓',          '✓'],
                        ['Scan tracking',         '✓',          '✓'],
                        ['Agent SMS alerts',      '✓',          '✓'],
                        ['Analytics dashboard',   '✓',          '✓'],
                        ['CSV export',            '✓',          '✓'],
                        ['Priority support',      '—',          '✓'],
                        ['Multi-Agent Teams',     '—',          'Coming Soon'],
                      ].map(([feature, free, pro], i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                          <td style={{ padding: '10px 0', color: C.text }}>{feature}</td>
                          <td style={{ textAlign: 'center', color: C.muted, padding: '10px 0' }}>{free}</td>
                          <td style={{ textAlign: 'center', padding: '10px 0', fontWeight: pro === 'Coming Soon' ? 600 : 700, color: pro === 'Coming Soon' ? '#A78BFA' : C.purpleL, fontSize: pro === 'Coming Soon' ? 11 : 14 }}>
                            {pro}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  )
}
