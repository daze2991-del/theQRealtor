'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createBrowserSupabase } from '../lib/supabase-browser'

/* ─── tokens ─────────────────────────────────────────────────── */
const C = {
  bg:      '#0F0F13',
  sidebar: '#13131A',
  card:    '#1A1A24',
  border:  '#252533',
  purple:  '#7C3AED',
  purpleL: '#8B5CF6',
  text:    '#FFFFFF',
  sub:     '#C4C4D4',
  muted:   '#6B7280',
} as const

/* ─── nav icons ──────────────────────────────────────────────── */
function NavIcon({ name }: { name: string }) {
  const p = {
    width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: '1.8',
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  if (name === 'dashboard')  return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
  if (name === 'properties') return <svg {...p}><path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V10.5z"/><path d="M9 22V13h6v9"/></svg>
  if (name === 'qrcodes')    return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h2v2h-2zm4 0h2v2h-2zm-4 4h2v2h-2zm4 0h2v2h-2zm-4 4h2"/><path d="M20 18h2v4h-2"/></svg>
  if (name === 'leads')      return <svg {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
  if (name === 'analytics')  return <svg {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/></svg>
  if (name === 'billing')    return <svg {...p}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
  if (name === 'settings')   return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06-.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
  return null
}

/* ─── sidebar ────────────────────────────────────────────────── */
function Sidebar({ email, plan, propertyCount, onClose }: {
  email: string; plan: 'free' | 'pro'; propertyCount: number; onClose?: () => void
}) {
  const pathname = usePathname()
  const pct = plan === 'pro' ? 0 : Math.min(100, Math.round(propertyCount * 100))
  const initials = email ? email.slice(0, 2).toUpperCase() : '??'

  const nav = [
    { label: 'Dashboard',  icon: 'dashboard',  href: '/dashboard',              active: pathname === '/dashboard' },
    { label: 'Properties', icon: 'properties', href: '/dashboard/properties',   active: pathname === '/dashboard/properties' },
    { label: 'QR Codes',   icon: 'qrcodes',    href: '/dashboard/qr-codes',     active: pathname === '/dashboard/qr-codes' },
    { label: 'Leads',      icon: 'leads',      href: '/dashboard/leads',        active: pathname === '/dashboard/leads' },
    { label: 'Analytics',  icon: 'analytics',  href: '/dashboard/analytics',    active: pathname === '/dashboard/analytics' },
    { label: 'Billing',    icon: 'billing',    href: '/dashboard/billing',      active: pathname === '/dashboard/billing' },
    { label: 'Settings',   icon: 'settings',   href: '/dashboard/settings',     active: pathname === '/dashboard/settings' },
  ]

  return (
    <aside style={{
      width: 240, flexShrink: 0,
      background: C.sidebar, borderRight: `1px solid ${C.border}`,
      position: 'sticky', top: 0, height: '100vh',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto', fontFamily: 'sans-serif',
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 18px 18px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <svg width="30" height="30" viewBox="0 0 28 28" fill="none">
            <path d="M14 4L3 13h3v10h6v-6h4v6h6V13h3L14 4z" fill={C.purple}/>
          </svg>
          <span style={{ fontWeight: 800, fontSize: 17, color: C.text, letterSpacing: '-0.02em' }}>
            the<span style={{ color: C.purple }}>QR</span>ealtor.
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: C.muted,
            cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 4px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 10px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '8px 12px 6px' }}>
          Menu
        </div>
        {nav.map(({ label, icon, href, active }) => (
          <Link key={label} href={href} onClick={onClose} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 9, marginBottom: 1,
            background: active ? `${C.purple}20` : 'transparent',
            color: active ? C.purpleL : C.muted,
            textDecoration: 'none', fontSize: 13.5, fontWeight: active ? 600 : 400,
            borderLeft: `2px solid ${active ? C.purple : 'transparent'}`,
            transition: 'all 0.15s',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <NavIcon name={icon} />
            </span>
            {label}
          </Link>
        ))}
      </nav>

      {/* Plan badge + agent */}
      <div style={{ padding: '14px', borderTop: `1px solid ${C.border}` }}>
        <div style={{
          background: `${C.purple}18`, border: `1px solid ${C.purple}35`,
          borderRadius: 12, padding: '12px 14px', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: plan === 'pro' ? '#A78BFA' : C.muted }}>
              {plan === 'pro' ? '⚡ Pro Plan' : '🔒 Free Plan'}
            </span>
            <span style={{ fontSize: 10, color: C.muted }}>
              {plan === 'pro' ? 'Unlimited' : `${propertyCount}/1`}
            </span>
          </div>
          {plan !== 'pro' && (
            <div style={{ height: 3, background: C.border, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', borderRadius: 4, width: `${pct}%`, background: `linear-gradient(90deg, ${C.purple}, ${C.purpleL})` }} />
            </div>
          )}
          <Link href="/dashboard/billing" onClick={onClose} style={{ fontSize: 11.5, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>
            {plan === 'free' ? 'Upgrade to Pro →' : 'Manage Plan →'}
          </Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
            background: `${C.purple}28`, border: `1px solid ${C.purple}45`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: C.purpleL,
          }}>
            {initials}
          </div>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {email.split('@')[0] || '—'}
            </div>
            <div style={{ fontSize: 11, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {email || '—'}
            </div>
          </div>
        </div>
        <SignOutButton />
      </div>
    </aside>
  )
}

function SignOutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const handleSignOut = async () => {
    setLoading(true)
    const supabase = createBrowserSupabase()
    await supabase.auth.signOut()
    router.push('/')
  }
  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      style={{
        width: '100%', background: 'none', border: 'none',
        textAlign: 'left', padding: '6px 2px',
        fontSize: 12, color: C.muted, cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.5 : 1, fontFamily: 'sans-serif',
        display: 'flex', alignItems: 'center', gap: 6,
        transition: 'color 0.15s',
      }}
      onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.color = '#F87171' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.muted }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
      {loading ? 'Signing out…' : 'Sign out'}
    </button>
  )
}

/* ─── layout ─────────────────────────────────────────────────── */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState('')
  const [plan, setPlan] = useState<'free' | 'pro'>('free')
  const [propertyCount, setPropertyCount] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createBrowserSupabase()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        setEmail(session.user.email || '')

        const [{ data: profile, error: profileErr }, { count }] = await Promise.all([
          supabase.from('profiles').select('plan').eq('id', session.user.id).single(),
          supabase.from('properties').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id),
        ])

        if (profileErr) console.error('[DashboardLayout] profile query error:', profileErr)

        let resolvedPlan: 'free' | 'pro' = profile?.plan === 'pro' ? 'pro' : 'free'

        // If profiles says free, cross-check Stripe — the webhook may have failed to
        // update profiles.plan (e.g. if stripe_customer_id column doesn't exist yet)
        if (resolvedPlan === 'free') {
          try {
            const res = await fetch('/api/stripe/subscription')
            if (res.ok) {
              const { subscription } = await res.json()
              if (subscription?.status === 'active' || subscription?.status === 'trialing') {
                resolvedPlan = 'pro'
                // Heal the profiles row so future reads are correct
                await supabase
                  .from('profiles')
                  .update({ plan: 'pro' })
                  .eq('id', session.user.id)
              }
            }
          } catch (stripeErr) {
            console.error('[DashboardLayout] stripe cross-check error:', stripeErr)
          }
        }

        setPlan(resolvedPlan)
        setPropertyCount(count || 0)
      } catch (err) {
        console.error('[DashboardLayout] load error:', err)
      }
    }
    load()

    const onResize = () => { if (window.innerWidth > 768) setMobileOpen(false) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <>
      <style>{`
        .db-sidebar { display: flex; }
        .db-mobile-header { display: none; }
        @media (max-width: 768px) {
          .db-sidebar { display: none !important; }
          .db-mobile-header { display: flex !important; }
          .db-page-topbar { top: 52px !important; }
        }
      `}</style>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div
            onClick={() => setMobileOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 40 }}
          />
          <div style={{ position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 50 }}>
            <Sidebar
              email={email} plan={plan} propertyCount={propertyCount}
              onClose={() => setMobileOpen(false)}
            />
          </div>
        </>
      )}

      <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: 'sans-serif' }}>
        {/* Desktop sidebar */}
        <div className="db-sidebar">
          <Sidebar email={email} plan={plan} propertyCount={propertyCount} />
        </div>

        {/* Main content column */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>

          {/* Mobile-only top bar */}
          <div className="db-mobile-header" style={{
            position: 'sticky', top: 0, zIndex: 20, height: 52,
            background: C.sidebar, borderBottom: `1px solid ${C.border}`,
            alignItems: 'center', gap: 12, padding: '0 16px',
            flexShrink: 0,
          }}>
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              style={{
                background: 'transparent', border: `1px solid ${C.border}`,
                borderRadius: 8, width: 34, height: 34, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.text, fontSize: 15, cursor: 'pointer',
              }}
            >
              ☰
            </button>
            <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
              <path d="M14 4L3 13h3v10h6v-6h4v6h6V13h3L14 4z" fill={C.purple}/>
            </svg>
            <span style={{ fontWeight: 800, fontSize: 15, color: C.text, letterSpacing: '-0.02em' }}>
              the<span style={{ color: C.purple }}>QR</span>ealtor.
            </span>
          </div>

          {children}
        </div>
      </div>
    </>
  )
}
