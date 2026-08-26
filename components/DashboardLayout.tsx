'use client'

import { Suspense, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createBrowserSupabase } from '../lib/supabase-browser'
import { getBetaStatus } from '../lib/beta'
import { signLimitForPlan } from '../lib/plans'
import FeedbackPrompt from './FeedbackPrompt'

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

type Plan = 'founding' | 'alpha' | 'free' | 'starter' | 'pro' | 'elite'

const PLAN_LABELS: Record<Plan, string> = {
  founding: 'Beta Agent',
  alpha:    'Alpha',
  free:     'Free Plan',
  starter:  'Starter',
  pro:      'Pro',
  elite:    'Elite',
}

// Per-plan sidebar usage. QR-based plans cap signs (one sign = one QR code
// in this product); free caps properties; elite is unlimited (usage hidden
// — returns null).
function planUsage(plan: Plan, propertyCount: number, signCount: number):
  { used: number; limit: number; noun: string } | null {
  if (plan === 'elite') return null
  if (plan === 'free')  return { used: propertyCount, limit: 1, noun: 'properties' }
  const limit = signLimitForPlan(plan)
  return limit === null ? null : { used: signCount, limit, noun: 'QR/Signs' }
}

function NavIcon({ name }: { name: string }) {
  const p = {
    width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: '1.8',
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  if (name === 'dashboard')  return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
  if (name === 'properties') return <svg {...p}><path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V10.5z"/><path d="M9 22V13h6v9"/></svg>
  if (name === 'qrcodes')    return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h2v2h-2zm4 0h2v2h-2zm-4 4h2v2h-2zm4 0h2v2h-2zm-4 4h2"/><path d="M20 18h2v4h-2"/></svg>
  if (name === 'signs')      return <svg {...p}><rect x="4" y="4" width="16" height="10" rx="1.5"/><line x1="12" y1="14" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/></svg>
  if (name === 'leads')      return <svg {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
  if (name === 'analytics')  return <svg {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/></svg>
  if (name === 'billing')    return <svg {...p}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
  if (name === 'settings')   return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06-.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
  if (name === 'reports')    return <svg {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="8" y2="17"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="16" y1="15" x2="16" y2="17"/></svg>
  if (name === 'admin')      return <svg {...p}><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"/></svg>
  return null
}

const WORKSPACE_NAV: Array<{ label: string; icon: string; href: string; exact?: boolean; hasBadge?: boolean }> = [
  { label: 'Dashboard',     icon: 'dashboard',  href: '/dashboard',               exact: true },
  { label: 'Properties',    icon: 'properties', href: '/dashboard/properties' },
  { label: 'Seller Reports',icon: 'reports',    href: '/dashboard/seller-reports' },
  { label: 'Signs',         icon: 'signs',      href: '/dashboard/signs' },
  { label: 'Leads',         icon: 'leads',      href: '/dashboard/leads',          hasBadge: true },
  { label: 'Analytics',     icon: 'analytics',  href: '/dashboard/analytics' },
]

const ACCOUNT_NAV: Array<{ label: string; icon: string; href: string }> = [
  { label: 'Billing',  icon: 'billing',  href: '/dashboard/billing' },
  { label: 'Settings', icon: 'settings', href: '/dashboard/settings' },
]

function NavItem({ label, icon, href, active, badge, onClose }: {
  label: string; icon: string; href: string; active: boolean; badge?: number; onClose?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      onMouseEnter={e => { if (!active) { const el = e.currentTarget as HTMLAnchorElement; el.style.background = 'rgba(255,255,255,0.05)'; el.style.color = C.sub } }}
      onMouseLeave={e => { if (!active) { const el = e.currentTarget as HTMLAnchorElement; el.style.background = 'transparent'; el.style.color = C.muted } }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '9px 12px', borderRadius: 8, marginBottom: 2,
        minHeight: 38,
        background: active ? 'rgba(124,58,237,0.14)' : 'transparent',
        color: active ? '#C4B5FD' : C.muted,
        textDecoration: 'none', fontSize: 13.5, fontWeight: active ? 600 : 400,
        transition: 'background 0.12s, color 0.12s',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: active ? '#A78BFA' : 'inherit' }}>
        <NavIcon name={icon} />
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span style={{
          fontSize: 11, fontWeight: 700, lineHeight: 1,
          color: '#C4B5FD', background: 'rgba(124,58,237,0.20)',
          borderRadius: 20, padding: '2px 7px', flexShrink: 0,
        }}>{badge}</span>
      )}
    </Link>
  )
}

function NavLinks({ pathname, onClose, newLeadCount, isAdmin }: {
  pathname: string; onClose?: () => void; newLeadCount?: number; isAdmin?: boolean
}) {
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <>
      <div style={{ fontSize: 11, color: C.muted, padding: '8px 12px 4px', letterSpacing: '0.01em' }}>
        Workspace
      </div>
      {WORKSPACE_NAV.map(item => (
        <NavItem
          key={item.label}
          label={item.label}
          icon={item.icon}
          href={item.href}
          active={isActive(item.href, item.exact)}
          badge={item.hasBadge ? newLeadCount : undefined}
          onClose={onClose}
        />
      ))}
      <hr style={{ border: 'none', borderTop: '1px solid rgba(83,74,183,0.3)', margin: '12px 0', width: '100%' }} />
      <div style={{ fontSize: 11, color: C.muted, padding: '0 12px 4px', letterSpacing: '0.01em' }}>
        Account
      </div>
      {ACCOUNT_NAV.map(item => (
        <NavItem
          key={item.label}
          label={item.label}
          icon={item.icon}
          href={item.href}
          active={isActive(item.href)}
          onClose={onClose}
        />
      ))}
      {isAdmin && (
        <>
          <hr style={{ border: 'none', borderTop: '1px solid rgba(245,158,11,0.22)', margin: '12px 0', width: '100%' }} />
          <Link
            href="/admin"
            onClick={onClose}
            onMouseEnter={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.background = 'rgba(245,158,11,0.14)' }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.background = isActive('/admin') ? 'rgba(245,158,11,0.16)' : 'rgba(245,158,11,0.06)' }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '9px 12px', borderRadius: 8, marginBottom: 2, minHeight: 38,
              background: isActive('/admin') ? 'rgba(245,158,11,0.16)' : 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.30)',
              color: isActive('/admin') ? '#FCD34D' : '#F59E0B',
              textDecoration: 'none', fontSize: 13.5, fontWeight: 600,
              transition: 'background 0.12s',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <NavIcon name="admin" />
            </span>
            <span style={{ flex: 1 }}>Beta Overview</span>
            <span style={{
              fontSize: 9, fontWeight: 800, lineHeight: 1, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: '#78350F', background: '#F59E0B',
              borderRadius: 20, padding: '3px 7px', flexShrink: 0,
            }}>Founder</span>
          </Link>
        </>
      )}
    </>
  )
}

function NavLinksWithParams({ pathname, onClose, newLeadCount, isAdmin }: {
  pathname: string; onClose?: () => void; newLeadCount?: number; isAdmin?: boolean
}) {
  return <NavLinks pathname={pathname} onClose={onClose} newLeadCount={newLeadCount} isAdmin={isAdmin} />
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
      aria-label="Sign out"
      onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.color = '#F87171' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.muted }}
      style={{
        background: 'transparent', border: 'none', color: C.muted,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.5 : 1, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 6, borderRadius: 6, transition: 'color 0.15s',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
    </button>
  )
}

function Sidebar({ email, plan, propertyCount, signCount, newLeadCount, isAdmin, onClose }: {
  email: string; plan: Plan; propertyCount: number; signCount: number;
  newLeadCount: number; isAdmin?: boolean; onClose?: () => void
}) {
  const pathname = usePathname()
  const usage = planUsage(plan, propertyCount, signCount)
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
        <Link href="/dashboard" style={{ fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif", letterSpacing: '-0.5px', textDecoration: 'none' }}>
          <span style={{ fontSize: '18px', fontWeight: 300, color: '#ffffff' }}>the</span>
          <span style={{ fontSize: '18px', fontWeight: 700, color: '#534AB7' }}>qr</span>
          <span style={{ fontSize: '18px', fontWeight: 500, color: '#ffffff' }}>ealtor</span>
        </Link>
        {onClose && (
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 10px' }}>
        <Suspense fallback={<NavLinks pathname={pathname} onClose={onClose} newLeadCount={newLeadCount} isAdmin={isAdmin} />}>
          <NavLinksWithParams pathname={pathname} onClose={onClose} newLeadCount={newLeadCount} isAdmin={isAdmin} />
        </Suspense>
      </nav>

      {/* Plan card + profile */}
      <div style={{ padding: '12px 12px 14px', borderTop: `1px solid ${C.border}` }}>

        {/* Plan card */}
        <div style={{
          background: '#16161F',
          border: '0.5px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: 14, marginBottom: 12,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 10 }}>
            {PLAN_LABELS[plan]}
          </div>
          {usage && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                <span style={{ fontSize: 11, color: C.muted }}>QR/Signs used</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.sub }}>{usage.used} / {usage.limit}</span>
              </div>
              {/* Segmented meter */}
              <div style={{ display: 'flex', gap: 3, marginBottom: 12 }}>
                {Array.from({ length: usage.limit }, (_, i) => (
                  <div key={i} style={{
                    flex: 1, height: 4, borderRadius: 100,
                    background: i < usage.used ? '#8B5CF6' : 'rgba(255,255,255,0.08)',
                  }} />
                ))}
              </div>
            </>
          )}
          <Link
            href="/dashboard/billing"
            onClick={onClose}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: C.purpleL, textDecoration: 'none', fontWeight: 500 }}
          >
            Manage plan
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </Link>
        </div>

        {/* Profile row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: `${C.purple}28`, border: `1px solid ${C.purple}45`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: C.purpleL,
          }}>
            {initials}
          </div>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {email.split('@')[0] || '—'}
            </div>
            <div style={{ fontSize: 11, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {email || '—'}
            </div>
          </div>
          <SignOutButton />
        </div>

      </div>
    </aside>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [email, setEmail]               = useState('')
  const [plan, setPlan]                 = useState<Plan>('free')
  const [propertyCount, setPropertyCount] = useState(0)
  const [signCount, setSignCount]       = useState(0)
  const [newLeadCount, setNewLeadCount] = useState(0)
  const [mobileOpen, setMobileOpen]     = useState(false)
  const [betaJoinedAt, setBetaJoinedAt] = useState<string | null>(null)
  const [warningDismissed, setWarningDismissed] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createBrowserSupabase()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        setEmail(session.user.email || '')

        const [{ data: profile, error: profileErr }, { data: props }] = await Promise.all([
          supabase.from('profiles').select('plan, beta_joined_at').eq('id', session.user.id).single(),
          supabase.from('properties').select('id').eq('user_id', session.user.id).is('deleted_at', null),
        ])

        if (profileErr) console.error('[DashboardLayout] profile query error:', profileErr)

        const propertyIds = (props || []).map((p: any) => p.id)

        // signs is RLS-scoped to the owning agent, so this only ever counts
        // the caller's own rows — this is also exactly what SIGN_LIMITS
        // enforces at sign-creation time (lib/plans.ts signLimitForPlan),
        // so the displayed count always matches the real, enforced limit.
        // Archived signs are excluded here for that reason: app/api/signs/create
        // counts only archived_at IS NULL, so this filter must match it.
        const { count: sc } = await supabase
          .from('signs').select('id', { count: 'exact', head: true })
          .eq('agent_id', session.user.id)
          .is('archived_at', null)
        const signCnt = sc || 0

        // New/uncontacted lead count for the Leads nav badge.
        let newLeadCnt = 0
        if (propertyIds.length > 0) {
          const { count: nlc } = await supabase
            .from('leads').select('id', { count: 'exact', head: true })
            .in('property_id', propertyIds)
            .or('status.is.null,status.eq.new')
          newLeadCnt = nlc || 0
        }

        const rawPlan = (profile?.plan as string) || 'free'
        const KNOWN_PLANS: Plan[] = ['founding', 'alpha', 'free', 'starter', 'pro', 'elite']
        let resolvedPlan: Plan = (KNOWN_PLANS.includes(rawPlan as Plan) ? rawPlan : 'free') as Plan

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

        setBetaJoinedAt(profile?.beta_joined_at ?? null)
        // Server-authoritative admin check: /api/admin/whoami runs the same
        // adminGate() against the server-only ADMIN_USER_ID and returns just a
        // boolean. This only decides whether to render the founder link — the
        // /admin route re-gates on its own, so a spoofed true still 404s.
        try {
          const res = await fetch('/api/admin/whoami')
          if (res.ok) {
            const { isAdmin: ok } = await res.json()
            setIsAdmin(!!ok)
          }
        } catch { /* default: non-admin, link stays hidden */ }
        setPlan(resolvedPlan)
        setPropertyCount(propertyIds.length)
        setSignCount(signCnt)
        setNewLeadCount(newLeadCnt)
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
            <Sidebar email={email} plan={plan} propertyCount={propertyCount} signCount={signCount} newLeadCount={newLeadCount} isAdmin={isAdmin} onClose={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: 'sans-serif' }}>
        <div className="db-sidebar">
          <Sidebar email={email} plan={plan} propertyCount={propertyCount} signCount={signCount} newLeadCount={newLeadCount} isAdmin={isAdmin} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="db-mobile-header" style={{ position: 'sticky', top: 0, zIndex: 20, height: 52, background: C.sidebar, borderBottom: `1px solid ${C.border}`, alignItems: 'center', gap: 12, padding: '0 16px', flexShrink: 0 }}>
            <button onClick={() => setMobileOpen(true)} aria-label="Open menu" style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, width: 34, height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text, fontSize: 15, cursor: 'pointer' }}>☰</button>
            <Link href="/dashboard" style={{ fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif", letterSpacing: '-0.5px', textDecoration: 'none' }}>
              <span style={{ fontSize: '18px', fontWeight: 300, color: '#ffffff' }}>the</span>
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#534AB7' }}>qr</span>
              <span style={{ fontSize: '18px', fontWeight: 500, color: '#ffffff' }}>ealtor</span>
            </Link>
          </div>
          {(() => {
            const { expired, daysRemaining } = getBetaStatus(betaJoinedAt)
            if (expired) {
              return (
                <div style={{
                  background: '#1C0A0A', borderBottom: '1px solid #7F1D1D',
                  padding: '12px 24px', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', gap: 16, flexShrink: 0,
                  fontFamily: 'sans-serif',
                }}>
                  <span style={{ fontSize: 13.5, color: '#FCA5A5', fontWeight: 500 }}>
                    Your beta has ended — reach out to continue.
                  </span>
                  <Link href="/dashboard/billing" style={{
                    fontSize: 12.5, fontWeight: 700, color: '#F87171',
                    textDecoration: 'none', whiteSpace: 'nowrap',
                    border: '1px solid #7F1D1D', borderRadius: 6, padding: '4px 10px',
                  }}>
                    View billing →
                  </Link>
                </div>
              )
            }
            if (!warningDismissed && daysRemaining > 0 && daysRemaining <= 14) {
              return (
                <div style={{
                  background: '#1C1400', borderBottom: '1px solid #78350F',
                  padding: '12px 24px', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', gap: 16, flexShrink: 0,
                  fontFamily: 'sans-serif',
                }}>
                  <span style={{ fontSize: 13.5, color: '#FCD34D', fontWeight: 500 }}>
                    Your beta ends in {daysRemaining} day{daysRemaining === 1 ? '' : 's'}.
                  </span>
                  <button
                    onClick={() => setWarningDismissed(true)}
                    style={{
                      background: 'transparent', border: 'none', color: '#92400E',
                      cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px',
                      flexShrink: 0,
                    }}
                    aria-label="Dismiss"
                  >✕</button>
                </div>
              )
            }
            return null
          })()}
          {children}
        </div>
      </div>

      <FeedbackPrompt />
    </>
  )
}
