'use client'

import { Suspense, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createBrowserSupabase } from '../lib/supabase-browser'

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

function NavIcon({ name }: { name: string }) {
  const p = {
    width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: '1.8',
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  if (name === 'dashboard')    return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
  if (name === 'properties')   return <svg {...p}><path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V10.5z"/><path d="M9 22V13h6v9"/></svg>
  if (name === 'qrcodes')      return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h2v2h-2zm4 0h2v2h-2zm-4 4h2v2h-2zm4 0h2v2h-2zm-4 4h2"/><path d="M20 18h2v4h-2"/></svg>
  if (name === 'leads')        return <svg {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
  if (name === 'inbox')        return <svg {...p}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>
  if (name === 'disclosures')  return <svg {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
  if (name === 'analytics')    return <svg {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/></svg>
  if (name === 'billing')      return <svg {...p}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
  if (name === 'settings')     return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06-.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
  return null
}

// Pure nav list renderer — no search-params dependency, safe for SSR fallback.
function NavLinks({ pathname, isDisclosures, onClose }: {
  pathname: string; isDisclosures: boolean; onClose?: () => void
}) {
  const nav = [
    { label: 'Dashboard',   icon: 'dashboard',   href: '/dashboard',                       active: pathname === '/dashboard' },
    { label: 'Properties',  icon: 'properties',  href: '/dashboard/properties',            active: pathname.startsWith('/dashboard/properties') },
    { label: 'QR Codes',    icon: 'qrcodes',     href: '/dashboard/qr-codes',              active: pathname.startsWith('/dashboard/qr-codes') },
    { label: 'Leads',       icon: 'leads',       href: '/dashboard/leads',                 active: pathname.startsWith('/dashboard/leads') && !isDisclosures },
    { label: 'Disclosures', icon: 'disclosures', href: '/dashboard/leads?cta=disclosures', active: isDisclosures },
    { label: 'Analytics',   icon: 'analytics',   href: '/dashboard/analytics',             active: pathname.startsWith('/dashboard/analytics') },
    { label: 'Billing',     icon: 'billing',     href: '/dashboard/billing',               active: pathname.startsWith('/dashboard/billing') },
    { label: 'Settings',    icon: 'settings',    href: '/dashboard/settings',              active: pathname.startsWith('/dashboard/settings') },
  ]
  return (
    <>
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
    </>
  )
}

// Isolates useSearchParams() so it can be wrapped in <Suspense>.
function NavLinksWithParams({ pathname, onClose }: { pathname: string; onClose?: () => void }) {
  const searchParams = useSearchParams()
  const isDisclosures = pathname === '/dashboard/leads' && searchParams.get('cta') === 'disclosures'
  return <NavLinks pathname={pathname} isDisclosures={isDisclosures} onClose={onClose} />
}

function Sidebar({ email, plan, propertyCount, onClose }: {
  email: string; plan: 'free' | 'pro'; propertyCount: number; onClose?: () => void
}) {
  const pathname = usePathname()
  const limit = plan === 'pro' ? 50 : 1
  const usagePct = Math.min(100, Math.round((propertyCount / limit) * 100))
  const initials = email ? email.slice(0, 2).toUpperCase() : '??'

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
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 10px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '8px 12px 6px' }}>
          Menu
        </div>
        <Suspense fallback={<NavLinks pathname={pathname} isDisclosures={false} onClose={onClose} />}>
          <NavLinksWithParams pathname={pathname} onClose={onClose} />
        </Suspense>
      </nav>

      {/* Plan usage + agent */}
      <div style={{ padding: '14px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ background: `${C.purple}18`, border: `1px solid ${C.purple}35`, borderRadius: 12, padding: '14px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <span style={{ fontSize: 14 }}>{plan === 'pro' ? '👑' : '🔒'}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: plan === 'pro' ? '#A78BFA' : C.muted }}>
              {plan === 'pro' ? 'Pro Plan' : 'Free Plan'}
            </span>
          </div>
          <p style={{ fontSize: 11, color: C.muted, margin: '0 0 10px', lineHeight: 1.5 }}>
            {plan === 'pro' ? "You're on the Pro Plan" : 'Upgrade for unlimited access'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.muted, marginBottom: 5 }}>
            <span>Properties used</span>
            <span style={{ fontWeight: 700 }}>{propertyCount}/{limit}</span>
          </div>
          <div style={{ height: 3, background: C.border, borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ height: '100%', borderRadius: 4, width: `${usagePct}%`, background: `linear-gradient(90deg, ${C.purple}, ${C.purpleL})` }} />
          </div>
          <Link href="/dashboard/billing" onClick={onClose} style={{ fontSize: 11.5, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>
            {plan === 'free' ? 'Upgrade to Pro →' : 'Manage Plan →'}
          </Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: `${C.purple}28`, border: `1px solid ${C.purple}45`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: C.purpleL }}>
            {initials}
          </div>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.split('@')[0] || '—'}</div>
            <div style={{ fontSize: 11, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email || '—'}</div>
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
    <button onClick={handleSignOut} disabled={loading} style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', padding: '6px 2px', fontSize: 12, color: C.muted, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1, fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.15s' }}
      onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.color = '#F87171' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.muted }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
      {loading ? 'Signing out…' : 'Sign out'}
    </button>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [email, setEmail]               = useState('')
  const [plan, setPlan]                 = useState<'free' | 'pro'>('free')
  const [propertyCount, setPropertyCount] = useState(0)
  const [mobileOpen, setMobileOpen]     = useState(false)

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

        if (resolvedPlan === 'free') {
          try {
            const res = await fetch('/api/stripe/subscription')
            if (res.ok) {
              const { subscription } = await res.json()
              if (subscription?.status === 'active' || subscription?.status === 'trialing') {
                resolvedPlan = 'pro'
                await supabase.from('profiles').update({ plan: 'pro' }).eq('id', session.user.id)
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

      {mobileOpen && (
        <>
          <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 40 }} />
          <div style={{ position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 50 }}>
            <Sidebar email={email} plan={plan} propertyCount={propertyCount} onClose={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: 'sans-serif' }}>
        <div className="db-sidebar">
          <Sidebar email={email} plan={plan} propertyCount={propertyCount} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="db-mobile-header" style={{ position: 'sticky', top: 0, zIndex: 20, height: 52, background: C.sidebar, borderBottom: `1px solid ${C.border}`, alignItems: 'center', gap: 12, padding: '0 16px', flexShrink: 0 }}>
            <button onClick={() => setMobileOpen(true)} aria-label="Open menu" style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, width: 34, height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text, fontSize: 15, cursor: 'pointer' }}>☰</button>
            <svg width="22" height="22" viewBox="0 0 28 28" fill="none"><path d="M14 4L3 13h3v10h6v-6h4v6h6V13h3L14 4z" fill={C.purple}/></svg>
            <span style={{ fontWeight: 800, fontSize: 15, color: C.text, letterSpacing: '-0.02em' }}>the<span style={{ color: C.purple }}>QR</span>ealtor.</span>
          </div>
          {children}
        </div>
      </div>
    </>
  )
}
