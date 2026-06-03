'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabase } from '../../lib/supabase-browser'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import DashboardLayout from '../../components/DashboardLayout'

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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

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
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accent.text, opacity: 0.6 }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{
          width: 42, height: 42, borderRadius: 11, flexShrink: 0,
          background: accent.bg, border: `1px solid ${accent.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19,
        }}>{icon}</div>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: accent.text, marginTop: 5, opacity: 0.6 }} />
      </div>
      <div>
        <div style={{
          fontSize: isNote ? 18 : 36, fontWeight: 800, color: C.text,
          lineHeight: 1, letterSpacing: isNote ? '-0.01em' : '-0.03em', marginBottom: 5,
        }}>{value}</div>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {label}
        </div>
        {sub && <div style={{ fontSize: 11, color: accent.text, fontWeight: 600, marginTop: 7, opacity: 0.85 }}>{sub}</div>}
      </div>
    </div>
  )
}

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

export default function Dashboard() {
  const router = useRouter()
  const [properties,     setProperties]     = useState<any[]>([])
  const [recentLeads,    setRecentLeads]     = useState<any[]>([])
  const [leadsToday,     setLeadsToday]      = useState(0)
  const [leadsThisMonth, setLeadsThisMonth]  = useState(0)
  const [scansToday,     setScansToday]      = useState(0)
  const [totalLeads,     setTotalLeads]      = useState(0)
  const [totalScansAll,  setTotalScansAll]   = useState(0)
  const [propScanCounts, setPropScanCounts]  = useState<Record<string, number>>({})
  const [propLeadCounts, setPropLeadCounts]  = useState<Record<string, number>>({})
  const [propThumbs,     setPropThumbs]      = useState<Record<string, string>>({})
  const [propQrCodes,    setPropQrCodes]     = useState<Record<string, Array<{ id: string; label: string }>>>({})
  const [expandedQr,     setExpandedQr]      = useState<{ id: string; label: string; property: string } | null>(null)
  const [plan,           setPlan]            = useState<'free' | 'pro'>('free')
  const [profileName,    setProfileName]     = useState('')
  const [loading,        setLoading]         = useState(true)
  const [exportingCSV,   setExportingCSV]    = useState(false)

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }

      const { data: profile } = await supabase
        .from('profiles').select('plan, name').eq('id', session.user.id).single()
      setPlan(profile?.plan === 'pro' ? 'pro' : 'free')
      setProfileName(profile?.name || '')

      const { data: props } = await supabase
        .from('properties').select('id, address, city, state, active').eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
      if (!props || props.length === 0) { router.push('/dashboard/onboarding'); return }
      setProperties(props)

      const ids = props.map((p: any) => p.id)
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const todayISO = todayStart.toISOString()
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
      const monthISO = monthStart.toISOString()

      const [
        { data: qrData },
        { data: recentLeadsData },
        { count: scansCount },
        { count: leadsTodayCount },
        { count: leadsMonthCount },
        { count: totalLeadsCount },
        { data: leadsPerProp },
        { data: thumbData },
      ] = await Promise.all([
        supabase.from('qrcodes').select('id, label, property_id, scan_count').in('property_id', ids),
        supabase.from('leads').select('*').in('property_id', ids)
          .order('created_at', { ascending: false }).limit(5),
        supabase.from('scan_events').select('*', { count: 'exact', head: true })
          .gte('created_at', todayISO),
        supabase.from('leads').select('*', { count: 'exact', head: true })
          .in('property_id', ids).gte('created_at', todayISO),
        supabase.from('leads').select('*', { count: 'exact', head: true })
          .in('property_id', ids).gte('created_at', monthISO),
        supabase.from('leads').select('*', { count: 'exact', head: true })
          .in('property_id', ids),
        supabase.from('leads').select('property_id').in('property_id', ids),
        supabase.from('property_photos').select('property_id, url')
          .in('property_id', ids).order('sort_order', { ascending: true }),
      ])

      const scanMap: Record<string, number> = {}
      const qrByProp: Record<string, Array<{ id: string; label: string }>> = {}
      ;(qrData || []).forEach((q: any) => {
        scanMap[q.property_id] = (scanMap[q.property_id] || 0) + (q.scan_count || 0)
        if (!qrByProp[q.property_id]) qrByProp[q.property_id] = []
        qrByProp[q.property_id].push({ id: q.id, label: q.label || 'Unlabeled' })
      })
      const leadMap: Record<string, number> = {}
      ;(leadsPerProp || []).forEach((l: any) => { leadMap[l.property_id] = (leadMap[l.property_id] || 0) + 1 })
      const thumbMap: Record<string, string> = {}
      ;(thumbData || []).forEach((t: any) => { if (!thumbMap[t.property_id]) thumbMap[t.property_id] = t.url })

      setTotalScansAll((qrData || []).reduce((sum: number, q: any) => sum + (q.scan_count || 0), 0))
      setRecentLeads(recentLeadsData || [])
      setScansToday(scansCount || 0)
      setLeadsToday(leadsTodayCount || 0)
      setLeadsThisMonth(leadsMonthCount || 0)
      setTotalLeads(totalLeadsCount || 0)
      setPropScanCounts(scanMap)
      setPropLeadCounts(leadMap)
      setPropThumbs(thumbMap)
      setPropQrCodes(qrByProp)
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
      ['Name', 'Phone', 'Email', 'Lead Status', 'Motivation', 'Property', 'QR Code Label', 'Total Scans', 'Last Scan Date', 'Created At', 'Recommended Action'],
      ...leads.map((l: any) => [
        l.name || '', l.phone || '', l.email || '',
        leadStatus[l.motivation] || l.motivation || '',
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

  const activeCount   = properties.filter((p: any) => p.active).length
  const convRate      = totalScansAll > 0 ? ((totalLeads / totalScansAll) * 100).toFixed(1) + '%' : '—'
  const canAddProperty = plan === 'pro' || properties.length < 1
  const propNameMap: Record<string, string> = {}
  properties.forEach((p: any) => { propNameMap[p.id] = p.address })

  const motivOrder: Record<string, number> = { hot: 0, motivated: 1, warm: 2, cold: 3 }
  const sortedLeads = [...recentLeads].sort((a, b) => {
    const ar = motivOrder[a.motivation] ?? 4
    const br = motivOrder[b.motivation] ?? 4
    return ar !== br ? ar - br : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const hasHotLead = recentLeads.some(l => l.motivation === 'hot')
  const firstName  = (profileName || '').split(' ')[0]
  const hour       = typeof window !== 'undefined' ? new Date().getHours() : 12
  const greeting   = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const today      = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const A = {
    purple: { bg: `${C.purple}1A`, border: `${C.purple}35`, text: C.purpleL },
    green:  { bg: '#06200F',       border: '#166534',        text: '#4ade80' },
    blue:   { bg: '#0B1E3A',       border: '#1E4D8C',        text: '#60A5FA' },
    amber:  { bg: '#2D1A06',       border: '#92400E',        text: '#FCD34D' },
    indigo: { bg: '#1A0D2E',       border: '#4C1D95',        text: '#A78BFA' },
  }

  const actionBtn = (href: string, label: string, color: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: 7, fontSize: 13,
    background: 'transparent', border: `1px solid ${C.border}`,
    color, cursor: 'pointer', textDecoration: 'none', flexShrink: 0,
    transition: 'border-color 0.1s',
  })

  return (
    <DashboardLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .db-kpi { display: grid; grid-template-columns: repeat(5,1fr); gap: 16px; margin-bottom: 24px; }
        .db-grid { display: grid; grid-template-columns: 1fr 260px; gap: 20px; }
        @media (max-width: 1400px) { .db-kpi { grid-template-columns: repeat(3,1fr); } }
        @media (max-width: 1140px) { .db-kpi { grid-template-columns: repeat(2,1fr); } }
        @media (max-width: 900px)  { .db-grid { grid-template-columns: 1fr; } }
        .kpi-card { transition: border-color 0.15s, transform 0.15s; }
        .kpi-card:hover { border-color: #7C3AED44 !important; transform: translateY(-1px); }
        .lead-row td { transition: background 0.1s; }
        .lead-row:hover td { background: #1E1E2A !important; }
        .lead-row:last-child td { border-bottom: none !important; }
        .action-btn:hover { border-color: #7C3AED88 !important; }
      `}</style>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, border: `2px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 14px', animation: 'spin 0.7s linear infinite' }} />
            <div style={{ color: C.muted, fontSize: 14, fontFamily: 'sans-serif' }}>Loading…</div>
          </div>
        </div>
      ) : (
        <>
          {/* Top bar */}
          <div className="db-page-topbar" style={{
            padding: '15px 28px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: C.bg, position: 'sticky', top: 0, zIndex: 10,
          }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 2px', letterSpacing: '-0.01em' }}>
                {greeting}{firstName ? `, ${firstName}` : ''} 👋
              </h1>
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{today}</p>
            </div>
          </div>

          <div style={{ padding: '22px 28px', flex: 1 }}>

            {/* Hot lead alert */}
            {hasHotLead && (
              <div style={{
                background: 'linear-gradient(90deg, #2D0A0A 0%, #1A1A24 80%)',
                border: '1px solid #EF444430', borderLeft: '3px solid #EF4444',
                borderRadius: 12, padding: '11px 18px',
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
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

            {/* KPI cards */}
            <div className="db-kpi">
              {[
                { label: 'Active Properties', value: activeCount,     icon: '🏠', accent: A.purple, sub: `${properties.length} total` },
                { label: 'New Leads Today',   value: leadsToday,      icon: '👥', accent: A.green,  sub: leadsThisMonth > 0 ? `↗ ${leadsThisMonth} this month` : 'None yet today' },
                { label: 'Total Scans Today', value: scansToday,      icon: '📱', accent: A.blue,   sub: totalScansAll > 0 ? `${totalScansAll} all time` : 'No scans today' },
                { label: 'Leads This Month',  value: leadsThisMonth,  icon: '📅', accent: A.amber,  sub: totalLeads > 0 ? `${totalLeads} total` : 'Place signs to start' },
                { label: 'Conversion Rate',   value: convRate,        icon: '📈', accent: A.indigo, sub: totalScansAll > 0 ? `${totalLeads} leads / ${totalScansAll} scans` : 'Not enough data yet' },
              ].map(kpi => (
                <div key={kpi.label} className="kpi-card">
                  <KPICard {...kpi} />
                </div>
              ))}
            </div>

            {/* 2-col grid: leads + quick actions */}
            <div className="db-grid">

              {/* Recent Leads */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                <div style={{
                  padding: '13px 20px', borderBottom: `1px solid ${C.border}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: '#15151E',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Recent Leads</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.purpleL, background: `${C.purple}22`, borderRadius: 20, padding: '2px 8px' }}>
                      {totalLeads}
                    </span>
                  </div>
                  <Link href="/dashboard/leads" style={{ fontSize: 12, color: C.purpleL, fontWeight: 600, textDecoration: 'none' }}>
                    View all →
                  </Link>
                </div>

                {sortedLeads.length === 0 ? (
                  <div style={{ padding: '52px 22px', textAlign: 'center' }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
                    <div style={{ color: C.sub, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No leads yet</div>
                    <div style={{ color: C.muted, fontSize: 13 }}>Place your QR signs to start capturing buyers.</div>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#15151E' }}>
                          {['Lead', 'Property', 'Intent', 'Time', 'Actions'].map(h => (
                            <th key={h} style={{
                              padding: '9px 16px', textAlign: 'left',
                              fontSize: 10.5, fontWeight: 700, color: C.muted,
                              textTransform: 'uppercase', letterSpacing: '0.08em',
                              borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedLeads.map((lead: any) => {
                          const isHot = lead.motivation === 'hot'
                          return (
                            <tr key={lead.id} className="lead-row">
                              <td style={{ padding: '11px 16px', borderBottom: `1px solid ${C.border}`, borderLeft: isHot ? '3px solid #EF4444' : '3px solid transparent' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                  <div style={{
                                    width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                                    background: isHot ? '#3B0D0D' : `${C.purple}28`,
                                    border: `1px solid ${isHot ? '#EF444440' : `${C.purple}40`}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 11, fontWeight: 700, color: isHot ? '#EF4444' : C.purpleL,
                                  }}>
                                    {(lead.name || '??').slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{lead.name || 'Unknown'}</div>
                                    <div style={{ fontSize: 11, color: C.muted }}>{lead.phone || lead.email || '—'}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '11px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.sub, maxWidth: 160 }}>
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {propNameMap[lead.property_id] || '—'}
                                </div>
                              </td>
                              <td style={{ padding: '11px 16px', borderBottom: `1px solid ${C.border}` }}>
                                <MotivationBadge level={lead.motivation} />
                              </td>
                              <td style={{ padding: '11px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>
                                {timeAgo(lead.created_at)}
                              </td>
                              <td style={{ padding: '11px 16px', borderBottom: `1px solid ${C.border}` }}>
                                <div style={{ display: 'flex', gap: 5 }}>
                                  {lead.phone && (
                                    <a href={`tel:${lead.phone}`} className="action-btn" title={`Call ${lead.name}`}
                                      style={actionBtn(`tel:${lead.phone}`, '📞', C.purpleL)}>📞</a>
                                  )}
                                  {lead.phone && (
                                    <a href={`sms:${lead.phone}`} className="action-btn" title={`Text ${lead.name}`}
                                      style={actionBtn(`sms:${lead.phone}`, '#4ade80', '#4ade80')}>💬</a>
                                  )}
                                  {lead.email && (
                                    <a href={`mailto:${lead.email}`} className="action-btn" title={`Email ${lead.name}`}
                                      style={actionBtn(`mailto:${lead.email}`, '#60A5FA', '#60A5FA')}>✉️</a>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', alignSelf: 'start' }}>
                <div style={{ padding: '13px 16px', borderBottom: `1px solid ${C.border}`, background: '#15151E' }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Quick Actions</span>
                </div>
                <div style={{ padding: '10px' }}>
                  {canAddProperty ? (
                    <Link href="/dashboard/new-property" style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 9,
                      background: C.bg, border: `1px solid ${C.border}`,
                      color: C.sub, fontSize: 13, fontWeight: 500,
                      textDecoration: 'none', marginBottom: 6,
                    }}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: `${C.purple}20`, border: `1px solid ${C.purple}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🏠</span>
                      Add Property
                    </Link>
                  ) : (
                    <Link href="/dashboard/properties" style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 9,
                      background: C.bg, border: `1px solid ${C.border}`,
                      color: C.sub, fontSize: 13, fontWeight: 500,
                      textDecoration: 'none', marginBottom: 6,
                    }}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: `${C.purple}20`, border: `1px solid ${C.purple}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🏠</span>
                      Manage Properties
                    </Link>
                  )}
                  <Link href="/dashboard/leads" style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 9,
                    background: C.bg, border: `1px solid ${C.border}`,
                    color: C.sub, fontSize: 13, fontWeight: 500,
                    textDecoration: 'none', marginBottom: 6,
                  }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: '#06200F', border: '1px solid #166534', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>👥</span>
                    View Leads
                  </Link>
                  <button onClick={downloadCSV} disabled={exportingCSV} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 9,
                    background: C.bg, border: `1px solid ${C.border}`,
                    color: C.sub, fontSize: 13, fontWeight: 500,
                    cursor: exportingCSV ? 'not-allowed' : 'pointer',
                    opacity: exportingCSV ? 0.6 : 1,
                    width: '100%', textAlign: 'left', fontFamily: 'sans-serif',
                  }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: '#2D1A06', border: '1px solid #92400E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⬇</span>
                    {exportingCSV ? 'Exporting…' : 'Download CSV'}
                  </button>
                </div>
              </div>

            </div>

            {/* Live Properties strip */}
            {(() => {
              const liveProps = properties.filter((p: any) => p.active)
              if (liveProps.length === 0) return null
              const shown = liveProps.slice(0, 5)
              return (
                <div style={{ marginTop: 20 }}>
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                    <div style={{
                      padding: '13px 20px', borderBottom: `1px solid ${C.border}`,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: '#15151E',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Live Properties</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', background: '#06200F', border: '1px solid #166534', borderRadius: 20, padding: '2px 8px' }}>
                          {liveProps.length}
                        </span>
                      </div>
                      <Link href="/dashboard/properties" style={{ fontSize: 12, color: C.muted, fontWeight: 600, textDecoration: 'none' }}>
                        View all →
                      </Link>
                    </div>
                    {shown.map((p: any, i: number) => {
                      const isLast = i === shown.length - 1
                      const thumb = propThumbs[p.id]
                      const location = [p.city, p.state].filter(Boolean).join(', ')
                      return (
                        <div key={p.id} style={{
                          padding: '10px 16px',
                          borderBottom: isLast ? 'none' : `1px solid ${C.border}`,
                        }}>
                          {/* Top row: thumb + address + stats + view link */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {thumb ? (
                              <img src={thumb} alt="" style={{ width: 64, height: 64, borderRadius: 9, objectFit: 'cover', flexShrink: 0, border: `1px solid ${C.border}` }} />
                            ) : (
                              <div style={{ width: 64, height: 64, borderRadius: 9, flexShrink: 0, background: `${C.purple}18`, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🏠</div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.address}</div>
                              {location && <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{location}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: C.purpleL, background: `${C.purple}18`, border: `1px solid ${C.purple}35`, borderRadius: 6, padding: '2px 7px' }}>
                                {propScanCounts[p.id] || 0} scans
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#FCD34D', background: '#1A170D', border: '1px solid #3A3520', borderRadius: 6, padding: '2px 7px' }}>
                                {propLeadCounts[p.id] || 0} leads
                              </span>
                              <Link href={`/p/${p.id}`} target="_blank" style={{ fontSize: 12, color: C.purpleL, fontWeight: 700, textDecoration: 'none' }}>
                                View →
                              </Link>
                            </div>
                          </div>
                          {/* QR code chips */}
                          {(() => {
                            const qrs = propQrCodes[p.id] || []
                            if (qrs.length === 0) return null
                            const shown = qrs.slice(0, 5)
                            const extra = qrs.length - shown.length
                            return (
                              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8, paddingLeft: 76 }}>
                                {shown.map(qr => (
                                  <button
                                    key={qr.id}
                                    onClick={() => setExpandedQr({ id: qr.id, label: qr.label, property: p.address })}
                                    style={{
                                      background: '#15151E', border: `1px solid ${C.border}`,
                                      borderRadius: 7, padding: '4px 8px 4px 4px', fontSize: 11,
                                      color: C.sub, cursor: 'pointer', fontFamily: 'sans-serif',
                                      display: 'flex', alignItems: 'center', gap: 6,
                                      transition: 'border-color 0.1s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.borderColor = C.purple)}
                                    onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                                  >
                                    <div style={{ background: '#fff', borderRadius: 4, padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                      <QRCodeSVG value={`${typeof window !== 'undefined' ? window.location.origin : ''}/q/${qr.id}`} size={28} />
                                    </div>
                                    {qr.label}
                                  </button>
                                ))}
                                {extra > 0 && (
                                  <span style={{ fontSize: 11, color: C.muted, padding: '3px 6px', alignSelf: 'center' }}>+{extra} more</span>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                      )
                    })}
                    {liveProps.length > 5 && (
                      <div style={{ padding: '8px 16px', borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
                        <Link href="/dashboard/properties" style={{ fontSize: 12, color: C.muted, fontWeight: 600, textDecoration: 'none' }}>
                          +{liveProps.length - 5} more — view all properties
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

          </div>
        </>
      )}
      {/* QR expand modal */}
      {expandedQr && (
        <div
          onClick={() => setExpandedQr(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 20, padding: '32px 32px 28px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 18, position: 'relative', maxWidth: 420, width: '100%',
              boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
            }}
          >
            <button
              onClick={() => setExpandedQr(null)}
              aria-label="Close"
              style={{
                position: 'absolute', top: 14, right: 14,
                width: 32, height: 32, borderRadius: '50%',
                background: '#F3F4F6', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, color: '#374151', fontFamily: 'sans-serif',
              }}
            >✕</button>
            <QRCodeSVG value={`${typeof window !== 'undefined' ? window.location.origin : ''}/q/${expandedQr.id}`} size={300} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginBottom: 4 }}>{expandedQr.label}</div>
              {expandedQr.property && <div style={{ fontSize: 13, color: '#6B7280' }}>{expandedQr.property}</div>}
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 10 }}>Point your camera here to test the scan</div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
