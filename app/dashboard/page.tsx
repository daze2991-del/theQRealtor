'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabase } from '../../lib/supabase-browser'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import QRCodeManager from '../../components/QRCodeManager'
import DashboardLayout from '../../components/DashboardLayout'

/* ─── tokens ─────────────────────────────────────────────────── */
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

/* ─── helpers ────────────────────────────────────────────────── */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/* ─── KPI card ───────────────────────────────────────────────── */
function KPICard({ label, value, icon, accent, sub }: {
  label: string
  value: number | string
  icon: string
  accent: { bg: string; border: string; text: string }
  sub?: string
}) {
  const isNote = typeof value === 'string' && value.length > 4
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 16, padding: '20px 20px 18px',
      display: 'flex', flexDirection: 'column', gap: 14,
      position: 'relative', overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}>
      {/* colored top accent */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: accent.text, opacity: 0.6,
      }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{
          width: 42, height: 42, borderRadius: 11, flexShrink: 0,
          background: accent.bg, border: `1px solid ${accent.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 19,
        }}>
          {icon}
        </div>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: accent.text, marginTop: 5, opacity: 0.6,
        }} />
      </div>
      <div>
        <div style={{
          fontSize: isNote ? 18 : 36,
          fontWeight: 800,
          color: C.text,
          lineHeight: 1,
          letterSpacing: isNote ? '-0.01em' : '-0.03em',
          marginBottom: 5,
        }}>
          {value}
        </div>
        <div style={{
          fontSize: 11, color: C.muted, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: accent.text, fontWeight: 600, marginTop: 7, opacity: 0.85 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── motivation badge ───────────────────────────────────────── */
function MotivationBadge({ level }: { level: string | null | undefined }) {
  if (!level) return <span style={{ color: '#6B7280' }}>—</span>
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    hot:       { label: '🔥 Hot',       color: '#EF4444', bg: '#3B0D0D' },
    motivated: { label: '⚡ Motivated', color: '#F97316', bg: '#3B1F0D' },
    warm:      { label: '👍 Warm',      color: '#60A5FA', bg: '#0F2238' },
    cold:      { label: '❄ Cold',       color: '#6B7280', bg: '#1F2937' },
  }
  const c = cfg[level] ?? { label: level, color: '#9CA3AF', bg: '#1F2937' }
  return (
    <span style={{
      background: c.bg, color: c.color, border: `1px solid ${c.color}50`,
      borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>{c.label}</span>
  )
}

/* ─── dashboard ──────────────────────────────────────────────── */
export default function Dashboard() {
  const router = useRouter()
  const [user, setUser]               = useState<any>(null)
  const [properties, setProperties]   = useState<any[]>([])
  const [scanCounts, setScanCounts]   = useState<Record<string, number>>({})
  const [leadCounts, setLeadCounts]   = useState<Record<string, number>>({})
  const [hotLeadMap, setHotLeadMap]   = useState<Record<string, string>>({})
  const [recentLeads, setRecentLeads] = useState<any[]>([])
  const [leadsToday, setLeadsToday]       = useState(0)
  const [leadsThisMonth, setLeadsThisMonth] = useState(0)
  const [scansToday, setScansToday]       = useState(0)
  const [plan, setPlan]               = useState<'free' | 'pro'>('free')
  const [profileName, setProfileName] = useState('')
  const [loading, setLoading]         = useState(true)
  const [exportingCSV, setExportingCSV] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const [propThumbs, setPropThumbs]   = useState<Record<string, string>>({})

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }
      setUser(session.user)

      const { data: profile } = await supabase
        .from('profiles').select('plan, name').eq('id', session.user.id).single()
      setPlan(profile?.plan === 'pro' ? 'pro' : 'free')
      setProfileName(profile?.name || '')

      const { data: props } = await supabase
        .from('properties').select('*').eq('user_id', session.user.id)
        .order('created_at', { ascending: false })

      if (!props || props.length === 0) {
        router.push('/dashboard/onboarding')
        return
      }

      setProperties(props)

      const ids = props.map((p: any) => p.id)
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const todayISO = todayStart.toISOString()
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
      const monthISO = monthStart.toISOString()
      const motivationRank: Record<string, number> = { cold: 1, warm: 2, motivated: 3, hot: 4 }

      const [
        { data: qrScanData },
        { data: leads },
        { data: recentLeadsData },
        { count: scansCount },
        { count: leadsCount },
        { count: leadsMonthCount },
        { data: thumbData },
      ] = await Promise.all([
        // scan_events has no property_id column — use qrcodes.scan_count instead
        supabase.from('qrcodes').select('property_id, scan_count').in('property_id', ids),
        supabase.from('leads').select('property_id, motivation').in('property_id', ids),
        supabase.from('leads').select('*').in('property_id', ids)
          .order('created_at', { ascending: false }).limit(8),
        // scan_events has no property_id; RLS scopes to this user's QR codes
        supabase.from('scan_events').select('*', { count: 'exact', head: true })
          .gte('created_at', todayISO),
        supabase.from('leads').select('*', { count: 'exact', head: true })
          .in('property_id', ids).gte('created_at', todayISO),
        supabase.from('leads').select('*', { count: 'exact', head: true })
          .in('property_id', ids).gte('created_at', monthISO),
        supabase.from('property_photos').select('property_id, url')
          .in('property_id', ids).order('sort_order', { ascending: true }),
      ])

      const scanMap: Record<string, number> = {}
      const leadMap: Record<string, number> = {}
      const hotMap:  Record<string, string> = {}
      qrScanData?.forEach((q: any) => { scanMap[q.property_id] = (scanMap[q.property_id] || 0) + (q.scan_count || 0) })
      leads?.forEach((l: any) => {
        leadMap[l.property_id] = (leadMap[l.property_id] || 0) + 1
        const rank = motivationRank[l.motivation] || 0
        if (rank > (motivationRank[hotMap[l.property_id]] || 0)) hotMap[l.property_id] = l.motivation
      })

      const thumbMap: Record<string, string> = {}
      thumbData?.forEach((t: any) => { if (!thumbMap[t.property_id]) thumbMap[t.property_id] = t.url })

      setScanCounts(scanMap)
      setLeadCounts(leadMap)
      setHotLeadMap(hotMap)
      setRecentLeads(recentLeadsData || [])
      setScansToday(scansCount || 0)
      setLeadsToday(leadsCount || 0)
      setLeadsThisMonth(leadsMonthCount || 0)
      setPropThumbs(thumbMap)
      setLoading(false)
    }
    load()
  }, [])

  const downloadCSV = async () => {
    setExportingCSV(true)
    const supabase = createBrowserSupabase()
    const { data: leads } = await supabase.from('leads').select('*')
      .in('property_id', properties.map((p: any) => p.id))
      .order('created_at', { ascending: false })
    if (!leads || leads.length === 0) { alert('No leads to export yet.'); setExportingCSV(false); return }

    const propMap: Record<string, string> = {}
    properties.forEach((p: any) => { propMap[p.id] = p.address })

    const qrIds = [...new Set(leads.map((l: any) => l.qr_id).filter(Boolean))] as string[]
    const qrMap: Record<string, { label: string; scan_count: number }> = {}
    const lastScanMap: Record<string, string> = {}

    if (qrIds.length > 0) {
      const [{ data: qrcodes }, { data: scans }] = await Promise.all([
        supabase.from('qrcodes').select('id, label, scan_count').in('id', qrIds),
        supabase.from('scan_events').select('qr_id, created_at').in('qr_id', qrIds).order('created_at', { ascending: false }),
      ])
      ;(qrcodes || []).forEach((q: any) => { qrMap[q.id] = { label: q.label || '', scan_count: q.scan_count || 0 } })
      ;(scans || []).forEach((s: any) => { if (s.qr_id && !lastScanMap[s.qr_id]) lastScanMap[s.qr_id] = s.created_at })
    }

    const leadStatus:  Record<string, string> = { hot: 'Hot', motivated: 'Motivated', warm: 'Warm', cold: 'Cold' }
    const motivLabels: Record<string, string> = { hot: 'Ready now', motivated: 'Looking in 1–6 months', warm: 'Looking in 6–12 months', cold: 'Just browsing' }
    const recAction:   Record<string, string> = { hot: 'Call today', motivated: 'Follow up this week', warm: 'Nurture - follow up in 2 weeks', cold: 'Add to drip campaign' }

    const rows = [
      ['Name', 'Phone', 'Email', 'Lead Status', 'Motivation', 'Main Property', 'QR Code Label', 'Total Scans', 'Last Scan Date', 'Created At', 'Recommended Action'],
      ...leads.map((l: any) => [
        l.name || '',
        l.phone || '',
        l.email || '',
        leadStatus[l.motivation]  || l.motivation || '',
        motivLabels[l.motivation] || l.motivation || '',
        propMap[l.property_id] || '',
        l.qr_id ? (qrMap[l.qr_id]?.label || '') : '',
        l.qr_id ? String(qrMap[l.qr_id]?.scan_count ?? '') : '',
        l.qr_id && lastScanMap[l.qr_id] ? new Date(lastScanMap[l.qr_id]).toLocaleString() : '',
        new Date(l.created_at).toLocaleString(),
        recAction[l.motivation] || '',
      ]),
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `realtqr-leads-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
    setExportingCSV(false)
  }

  const handleCheckout = async (billingPlan: 'monthly' | 'yearly') => {
    setCheckingOut(true)
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: billingPlan }),
    })
    const { url, error } = await res.json()
    if (url) window.location.href = url
    else { alert(error || 'Could not start checkout.'); setCheckingOut(false) }
  }

  const canAddProperty = plan === 'pro' || properties.length < 1
  const totalLeads     = Object.values(leadCounts).reduce((a, b) => a + b, 0)
  const totalScansAll  = Object.values(scanCounts).reduce((a, b) => a + b, 0)
  const convRate       = totalScansAll > 0 ? ((totalLeads / totalScansAll) * 100).toFixed(1) + '%' : '—'
  const propNameMap: Record<string, string> = {}
  properties.forEach((p: any) => { propNameMap[p.id] = p.address })

  // Sort recent leads: hot first, then by recency
  const motivOrder: Record<string, number> = { hot: 0, motivated: 1, warm: 2, cold: 3 }
  const sortedRecentLeads = [...recentLeads].sort((a, b) => {
    const ar = motivOrder[a.motivation] ?? 4
    const br = motivOrder[b.motivation] ?? 4
    return ar !== br ? ar - br : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const hasHotLead  = recentLeads.some(l => l.motivation === 'hot')
  const firstName   = (profileName || user?.email?.split('@')[0] || '').split(' ')[0]
  const hour        = typeof window !== 'undefined' ? new Date().getHours() : 12
  const greeting    = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // Accent palettes for KPI cards
  const A = {
    purple: { bg: `${C.purple}1A`, border: `${C.purple}35`, text: C.purpleL },
    green:  { bg: '#06200F',       border: '#166534',        text: '#4ade80' },
    blue:   { bg: '#0B1E3A',       border: '#1E4D8C',        text: '#60A5FA' },
    amber:  { bg: '#2D1A06',       border: '#92400E',        text: '#FCD34D' },
    indigo: { bg: '#1A0D2E',       border: '#4C1D95',        text: '#A78BFA' },
  }

  // Quick-action row style
  const qa: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 12px', borderRadius: 9,
    background: C.bg, border: `1px solid ${C.border}`,
    color: C.sub, fontSize: 13, fontWeight: 500,
    textDecoration: 'none', cursor: 'pointer',
    width: '100%', textAlign: 'left',
    transition: 'all 0.15s',
  }

  return (
    <DashboardLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .db-kpi  { display: grid; grid-template-columns: repeat(5,1fr); gap: 16px; margin-bottom: 24px; }
        .db-grid { display: grid; grid-template-columns: 1fr 300px; gap: 20px; }
        @media (max-width: 1400px) { .db-kpi { grid-template-columns: repeat(3,1fr); } }
        @media (max-width: 1140px) { .db-kpi { grid-template-columns: repeat(2,1fr); } }
        @media (max-width: 900px)  { .db-grid { grid-template-columns: 1fr; } }
        .qa-btn:hover { border-color: #7C3AED55 !important; color: #8B5CF6 !important; background: #1E1A2E !important; }
        .kpi-card:hover { border-color: #7C3AED44 !important; transform: translateY(-1px); }
        .kpi-card { transition: border-color 0.15s, transform 0.15s; }
        .lead-row td { transition: background 0.1s; }
        .lead-row:hover td { background: #1E1E2A !important; }
        .lead-row:last-child td { border-bottom: none !important; }
      `}</style>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, border: `2px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 14px', animation: 'spin 0.7s linear infinite' }} />
            <div style={{ color: C.muted, fontSize: 14, fontFamily: 'sans-serif' }}>Loading dashboard…</div>
          </div>
        </div>
      ) : (
        <>
          {/* ── Top bar ── */}
          <div className="db-page-topbar" style={{
            padding: '15px 28px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: C.bg, position: 'sticky', top: 0, zIndex: 10,
          }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 3px', letterSpacing: '-0.01em' }}>
                {greeting},{' '}
                <span style={{ color: C.purpleL }}>{firstName}</span> 👋
              </h1>
              <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1 }}>
                {leadsToday > 0 ? (
                  <><span style={{ color: '#4ade80', fontWeight: 700 }}>{leadsToday} new lead{leadsToday !== 1 ? 's' : ''} today</span>
                  {' · '}{leadsThisMonth} this month · {totalLeads} total</>
                ) : (
                  <>No new leads today · <span style={{ color: C.sub }}>{totalLeads} total lead{totalLeads !== 1 ? 's' : ''}</span></>
                )}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button onClick={downloadCSV} disabled={exportingCSV} style={{
                background: 'transparent', color: C.purpleL,
                border: `1px solid ${C.purple}55`,
                borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 600,
                cursor: exportingCSV ? 'not-allowed' : 'pointer', opacity: exportingCSV ? 0.6 : 1,
              }}>
                {exportingCSV ? 'Exporting…' : '⬇ Export CSV'}
              </button>
              {canAddProperty ? (
                <Link href="/dashboard/new-property" style={{
                  background: C.purple, color: '#fff', fontSize: 13, fontWeight: 700,
                  padding: '8px 18px', borderRadius: 9, textDecoration: 'none',
                }}>
                  + Add Property
                </Link>
              ) : (
                <button onClick={() => handleCheckout('monthly')} disabled={checkingOut} style={{
                  background: C.purple, color: '#fff', border: 'none',
                  borderRadius: 9, padding: '8px 18px', fontSize: 13, fontWeight: 700,
                  cursor: checkingOut ? 'not-allowed' : 'pointer', opacity: checkingOut ? 0.7 : 1,
                }}>
                  {checkingOut ? 'Redirecting…' : '⚡ Upgrade to Pro'}
                </button>
              )}
            </div>
          </div>

          {/* ── Page body ── */}
          <div style={{ padding: '22px 28px', flex: 1 }}>

            {/* Hot lead alert */}
            {hasHotLead && (
              <div style={{
                background: 'linear-gradient(90deg, #2D0A0A 0%, #1A1A24 80%)',
                border: '1px solid #EF444430',
                borderLeft: '3px solid #EF4444',
                borderRadius: 12, padding: '11px 18px',
                display: 'flex', alignItems: 'center', gap: 12,
                marginBottom: 20, fontFamily: 'sans-serif',
              }}>
                <span style={{ fontSize: 18 }}>🔥</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#EF4444' }}>Hot lead needs attention</span>
                  <span style={{ fontSize: 13, color: C.muted }}> — a buyer is ready to act. Call them today.</span>
                </div>
                <Link href="/dashboard/leads" style={{ fontSize: 12, color: '#EF4444', fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>
                  View leads →
                </Link>
              </div>
            )}

            {/* ── KPI cards ── */}
            <div className="db-kpi">
              <div className="kpi-card">
                <KPICard
                  label="Properties"
                  value={properties.length}
                  icon="🏠"
                  accent={A.purple}
                  sub={`${properties.filter((p: any) => p.active).length} active`}
                />
              </div>
              <div className="kpi-card">
                <KPICard
                  label="New Leads Today"
                  value={leadsToday}
                  icon="👥"
                  accent={A.green}
                  sub={leadsThisMonth > 0 ? `↗ ${leadsThisMonth} this month` : 'None yet today'}
                />
              </div>
              <div className="kpi-card">
                <KPICard
                  label={scansToday > 0 ? 'QR Scans Today' : 'Total QR Scans'}
                  value={scansToday > 0 ? scansToday : totalScansAll}
                  icon="📱"
                  accent={A.blue}
                  sub={scansToday > 0 ? `${totalScansAll} all time` : 'No scans today'}
                />
              </div>
              <div className="kpi-card">
                <KPICard
                  label="Leads This Month"
                  value={leadsThisMonth}
                  icon="📅"
                  accent={A.amber}
                  sub={totalLeads > 0 ? `${totalLeads} total` : 'Place signs to start'}
                />
              </div>
              <div className="kpi-card">
                <KPICard
                  label="Conversion Rate"
                  value={convRate}
                  icon="📈"
                  accent={A.indigo}
                  sub={totalScansAll > 0 ? `${totalLeads} leads / ${totalScansAll} scans` : 'Not enough data yet'}
                />
              </div>
            </div>

            {/* ── 2-col grid ── */}
            <div className="db-grid">

              {/* Recent Leads — sorted hot-first */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                <div style={{
                  padding: '14px 20px', borderBottom: `1px solid ${C.border}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: '#15151E',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Recent Leads</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: C.purpleL,
                      background: `${C.purple}22`, borderRadius: 20, padding: '2px 8px',
                    }}>{totalLeads}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 11, color: C.muted }}>Sorted by intent</span>
                    <Link href="/dashboard/leads" style={{ fontSize: 12, color: C.purpleL, fontWeight: 600, textDecoration: 'none' }}>
                      View all →
                    </Link>
                  </div>
                </div>

                {sortedRecentLeads.length === 0 ? (
                  <div style={{ padding: '52px 22px', textAlign: 'center', fontFamily: 'sans-serif' }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
                    <div style={{ color: C.sub, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No leads yet</div>
                    <div style={{ color: C.muted, fontSize: 13 }}>Place your QR signs to start capturing buyers.</div>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#15151E' }}>
                          {['Lead', 'Property', 'Intent', 'Time'].map(h => (
                            <th key={h} style={{
                              padding: '9px 18px', textAlign: 'left',
                              fontSize: 10.5, fontWeight: 700, color: C.muted,
                              textTransform: 'uppercase', letterSpacing: '0.08em',
                              borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRecentLeads.map((lead: any) => {
                          const isHot = lead.motivation === 'hot'
                          return (
                            <tr key={lead.id} className="lead-row">
                              <td style={{
                                padding: '12px 18px', borderBottom: `1px solid ${C.border}`,
                                borderLeft: isHot ? '3px solid #EF4444' : '3px solid transparent',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{
                                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                                    background: isHot ? '#3B0D0D' : `${C.purple}28`,
                                    border: `1px solid ${isHot ? '#EF444440' : `${C.purple}40`}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 12, fontWeight: 700,
                                    color: isHot ? '#EF4444' : C.purpleL,
                                  }}>
                                    {(lead.name || '??').slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{lead.name || 'Unknown'}</div>
                                    <div style={{ fontSize: 11.5, color: C.muted }}>{lead.phone || lead.email || '—'}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, fontSize: 12.5, color: C.sub, maxWidth: 160 }}>
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {propNameMap[lead.property_id] || '—'}
                                </div>
                              </td>
                              <td style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}` }}>
                                <MotivationBadge level={lead.motivation} />
                              </td>
                              <td style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>
                                {timeAgo(lead.created_at)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── Right column ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Quick Actions */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '13px 16px', borderBottom: `1px solid ${C.border}`, background: '#15151E' }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Quick Actions</span>
                  </div>
                  <div style={{ padding: '12px 10px' }}>
                    {/* Listings group */}
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#3D3D55', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 4px 6px' }}>
                      Listings
                    </div>
                    {canAddProperty ? (
                      <Link href="/dashboard/new-property" className="qa-btn" style={qa}>
                        <span style={{ width: 28, height: 28, borderRadius: 8, background: `${C.purple}20`, border: `1px solid ${C.purple}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>🏠</span>
                        Add Property
                      </Link>
                    ) : (
                      <button onClick={() => handleCheckout('monthly')} disabled={checkingOut} className="qa-btn" style={{ ...qa, color: C.purpleL, borderColor: `${C.purple}45` }}>
                        <span style={{ width: 28, height: 28, borderRadius: 8, background: `${C.purple}20`, border: `1px solid ${C.purple}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>⚡</span>
                        {checkingOut ? 'Redirecting…' : 'Upgrade to Add More'}
                      </button>
                    )}
                    <div style={{ height: 6 }} />
                    <button className="qa-btn" onClick={() => document.getElementById('qr-section')?.scrollIntoView({ behavior: 'smooth' })} style={qa}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: '#0B1E3A', border: '1px solid #1E4D8C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>◫</span>
                      Generate QR Code
                    </button>

                    {/* Leads group */}
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#3D3D55', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '14px 4px 6px' }}>
                      Leads
                    </div>
                    <Link href="/dashboard/leads" className="qa-btn" style={qa}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: '#06200F', border: '1px solid #166534', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>👥</span>
                      View All Leads
                    </Link>
                    <div style={{ height: 6 }} />
                    <button className="qa-btn" onClick={downloadCSV} disabled={exportingCSV} style={{ ...qa, opacity: exportingCSV ? 0.6 : 1, cursor: exportingCSV ? 'not-allowed' : 'pointer' }}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: '#2D1A06', border: '1px solid #92400E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>⬇</span>
                      {exportingCSV ? 'Exporting…' : 'Download CSV'}
                    </button>
                  </div>
                </div>

                {/* Active Properties */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{
                    padding: '13px 16px', borderBottom: `1px solid ${C.border}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: '#15151E',
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Active Properties</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: C.purpleL,
                      background: `${C.purple}22`, borderRadius: 20, padding: '2px 8px',
                    }}>{properties.length}</span>
                  </div>
                  {properties.slice(0, 5).map((p: any, i: number) => {
                    const isLast = i === Math.min(properties.length, 5) - 1
                    const thumb  = propThumbs[p.id]
                    return (
                      <div key={p.id} style={{
                        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                        borderBottom: isLast ? 'none' : `1px solid ${C.border}`,
                      }}>
                        {/* Thumbnail or placeholder */}
                        {thumb ? (
                          <img src={thumb} alt="" style={{
                            width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                            objectFit: 'cover', border: `1px solid ${C.border}`,
                          }} />
                        ) : (
                          <div style={{
                            width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                            background: `${C.purple}18`, border: `1px solid ${C.border}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                          }}>🏠</div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.address}
                          </div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                            <span style={{ color: C.purpleL, fontWeight: 600 }}>{scanCounts[p.id] || 0}</span> scans
                            {' · '}
                            <span style={{ color: (leadCounts[p.id] || 0) > 0 ? '#FCD34D' : C.muted, fontWeight: (leadCounts[p.id] || 0) > 0 ? 600 : 400 }}>
                              {leadCounts[p.id] || 0}
                            </span> leads
                          </div>
                        </div>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                          background: p.active ? '#062014' : '#18181F',
                          border: `1px solid ${p.active ? '#166534' : '#374151'}`,
                          borderRadius: 20, padding: '2px 7px',
                        }}>
                          <div style={{ width: 5, height: 5, borderRadius: '50%', background: p.active ? '#4ade80' : '#6B7280' }} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: p.active ? '#4ade80' : '#6B7280' }}>
                            {p.active ? 'Live' : 'Off'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  {properties.length > 5 && (
                    <div style={{ padding: '9px 14px', borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
                      <Link href="/dashboard/properties" style={{ fontSize: 12, color: C.muted, textDecoration: 'none', fontWeight: 600 }}>
                        +{properties.length - 5} more →
                      </Link>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* ── Properties & QR Codes ── */}
            <div id="qr-section" style={{ marginTop: 32 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${C.border}`,
              }}>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 2px', letterSpacing: '-0.01em' }}>
                    Properties & QR Codes
                  </h2>
                  <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
                    Manage listings and generate print-ready QR codes
                  </p>
                </div>
                {canAddProperty && (
                  <Link href="/dashboard/new-property" style={{
                    background: `${C.purple}1A`, color: C.purpleL, border: `1px solid ${C.purple}45`,
                    fontSize: 13, fontWeight: 700, padding: '7px 16px', borderRadius: 9, textDecoration: 'none',
                  }}>
                    + Add Property
                  </Link>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {properties.map((p: any) => (
                  <div key={p.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                      {/* Property header with optional thumbnail */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, minWidth: 0 }}>
                        {propThumbs[p.id] ? (
                          <img src={propThumbs[p.id]} alt="" style={{
                            width: 56, height: 56, borderRadius: 10,
                            objectFit: 'cover', border: `1px solid ${C.border}`, flexShrink: 0,
                          }} />
                        ) : (
                          <div style={{
                            width: 56, height: 56, borderRadius: 10,
                            background: `${C.purple}18`, border: `1px solid ${C.border}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 24, flexShrink: 0,
                          }}>🏠</div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <h2 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '0 0 3px', letterSpacing: '-0.01em' }}>{p.address}</h2>
                          <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
                            {[p.city, p.state].filter(Boolean).join(', ')}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ background: `${C.purple}18`, border: `1px solid ${C.purple}35`, borderRadius: 10, padding: '8px 16px', textAlign: 'center' }}>
                          <div style={{ fontSize: 22, fontWeight: 800, color: C.purpleL }}>{scanCounts[p.id] || 0}</div>
                          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Scans</div>
                        </div>
                        <div style={{ background: '#1A170D', border: '1px solid #3A3520', borderRadius: 10, padding: '8px 16px', textAlign: 'center' }}>
                          <div style={{ fontSize: 22, fontWeight: 800, color: '#FCD34D' }}>{leadCounts[p.id] || 0}</div>
                          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Leads</div>
                          {hotLeadMap[p.id] && <div style={{ marginTop: 6 }}><MotivationBadge level={hotLeadMap[p.id]} /></div>}
                        </div>
                      </div>
                    </div>
                    <Link href={`/p/${p.id}`} style={{ display: 'inline-block', marginTop: 14, color: C.purpleL, fontWeight: 700, textDecoration: 'none', fontSize: 13.5 }}>
                      View Buyer Page →
                    </Link>
                    <QRCodeManager
                      propertyId={p.id}
                      allProperties={properties.map((prop: any) => ({ id: prop.id, address: prop.address }))}
                    />
                  </div>
                ))}
              </div>
            </div>

          </div>
        </>
      )}
    </DashboardLayout>
  )
}
