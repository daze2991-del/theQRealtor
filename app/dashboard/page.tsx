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
function KPICard({ label, value, icon, accent }: {
  label: string; value: number | string; icon: string; accent: { bg: string }
}) {
  const isNote = typeof value === 'string' && value.length > 6
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 16, padding: '20px 22px',
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14, flexShrink: 0,
        background: accent.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 500, marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </div>
        <div style={{ fontSize: isNote ? 11 : 32, fontWeight: isNote ? 600 : 800, color: isNote ? C.muted : C.text, lineHeight: isNote ? 1.4 : 1 }}>
          {value}
        </div>
      </div>
    </div>
  )
}

/* ─── motivation badge ───────────────────────────────────────── */
function MotivationBadge({ level }: { level: string | null | undefined }) {
  if (!level) return <span style={{ color: '#6B7280' }}>—</span>
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    hot:       { label: '🔥 Hot',        color: '#EF4444', bg: '#3B0D0D' },
    motivated: { label: '⚡ Motivated',  color: '#F97316', bg: '#3B1F0D' },
    warm:      { label: '👍 Warm',       color: '#60A5FA', bg: '#0F2238' },
    cold:      { label: '❄ Cold',        color: '#6B7280', bg: '#1F2937' },
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
  const [user, setUser] = useState<any>(null)
  const [properties, setProperties] = useState<any[]>([])
  const [scanCounts, setScanCounts] = useState<Record<string, number>>({})
  const [leadCounts, setLeadCounts] = useState<Record<string, number>>({})
  const [hotLeadMap, setHotLeadMap] = useState<Record<string, string>>({})
  const [recentLeads, setRecentLeads] = useState<any[]>([])
  const [leadsToday, setLeadsToday] = useState(0)
  const [leadsThisMonth, setLeadsThisMonth] = useState(0)
  const [scansToday, setScansToday] = useState(0)
  const [plan, setPlan] = useState<'free' | 'pro'>('free')
  const [profileName, setProfileName] = useState('')
  const [loading, setLoading] = useState(true)
  const [exportingCSV, setExportingCSV] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)

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
      ])

      const scanMap: Record<string, number> = {}
      const leadMap: Record<string, number> = {}
      const hotMap: Record<string, string> = {}
      qrScanData?.forEach((q: any) => { scanMap[q.property_id] = (scanMap[q.property_id] || 0) + (q.scan_count || 0) })
      leads?.forEach((l: any) => {
        leadMap[l.property_id] = (leadMap[l.property_id] || 0) + 1
        const rank = motivationRank[l.motivation] || 0
        if (rank > (motivationRank[hotMap[l.property_id]] || 0)) hotMap[l.property_id] = l.motivation
      })
      setScanCounts(scanMap)
      setLeadCounts(leadMap)
      setHotLeadMap(hotMap)
      setRecentLeads(recentLeadsData || [])
      setScansToday(scansCount || 0)
      setLeadsToday(leadsCount || 0)
      setLeadsThisMonth(leadsMonthCount || 0)
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
  const totalLeads = Object.values(leadCounts).reduce((a, b) => a + b, 0)
  const totalScansAll = Object.values(scanCounts).reduce((a, b) => a + b, 0)
  const convRate = totalScansAll > 0 ? ((totalLeads / totalScansAll) * 100).toFixed(1) + '%' : 'Not enough data yet'
  const propNameMap: Record<string, string> = {}
  properties.forEach((p: any) => { propNameMap[p.id] = p.address })

  return (
    <DashboardLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .db-kpi  { display: grid; grid-template-columns: repeat(5,1fr); gap: 16px; margin-bottom: 24px; }
        .db-grid { display: grid; grid-template-columns: 1fr 300px; gap: 20px; }
        @media (max-width: 1400px) { .db-kpi { grid-template-columns: repeat(3,1fr); } }
        @media (max-width: 1140px) { .db-kpi { grid-template-columns: repeat(2,1fr); } }
        @media (max-width: 900px)  { .db-grid { grid-template-columns: 1fr; } }
        .qa-row { transition: border-color 0.15s, color 0.15s; }
        .qa-row:hover { border-color: #7C3AED60 !important; color: #8B5CF6 !important; }
        tbody tr:last-child td { border-bottom: none !important; }
        tbody tr:hover td { background: #1E1E2A; }
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
          {/* Top bar */}
          <div className="db-page-topbar" style={{
            padding: '16px 28px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: C.bg, position: 'sticky', top: 0, zIndex: 10,
          }}>
            <div>
              <h1 style={{ fontSize: 19, fontWeight: 700, color: C.text, margin: '0 0 2px' }}>Dashboard</h1>
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
                Welcome back, {(profileName || user?.email?.split('@')[0] || '').split(' ')[0]} 👋
                {' '}You have {leadsToday} new lead{leadsToday !== 1 ? 's' : ''} today.
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

          {/* Page body */}
          <div style={{ padding: '24px 28px', flex: 1 }}>

            {/* KPI cards */}
            <div className="db-kpi">
              <KPICard label="Total Properties" value={properties.length} icon="🏠" accent={{ bg: `${C.purple}22` }} />
              <KPICard label="New Leads Today"  value={leadsToday}        icon="👥" accent={{ bg: '#06200F' }} />
              <KPICard
                label={scansToday > 0 ? 'QR Scans Today' : 'Total Scans'}
                value={scansToday > 0 ? scansToday : totalScansAll}
                icon="📱" accent={{ bg: '#0B1E3A' }}
              />
              <KPICard label="Leads This Month"  value={leadsThisMonth}    icon="📅" accent={{ bg: '#2D1A06' }} />
              <KPICard label="Conversion Rate"   value={convRate}          icon="📈" accent={{ bg: '#1A0D2E' }} />
            </div>

            {/* 2-col grid */}
            <div className="db-grid">

              {/* Recent Leads table */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                <div style={{
                  padding: '16px 22px', borderBottom: `1px solid ${C.border}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>Recent Leads</span>
                    <span style={{
                      marginLeft: 10, fontSize: 11, fontWeight: 700, color: C.purpleL,
                      background: `${C.purple}22`, borderRadius: 20, padding: '2px 8px',
                    }}>{totalLeads}</span>
                  </div>
                  <span style={{ fontSize: 12, color: C.muted }}>Last 8</span>
                </div>

                {recentLeads.length === 0 ? (
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
                          {['Lead', 'Property', 'Intent', 'Time'].map(h => (
                            <th key={h} style={{
                              padding: '10px 20px', textAlign: 'left',
                              fontSize: 10.5, fontWeight: 700, color: C.muted,
                              textTransform: 'uppercase', letterSpacing: '0.08em',
                              borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {recentLeads.map((lead: any) => (
                          <tr key={lead.id} style={{ transition: 'background 0.1s' }}>
                            <td style={{ padding: '13px 20px', borderBottom: `1px solid ${C.border}` }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                                  background: `${C.purple}28`, border: `1px solid ${C.purple}40`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 12, fontWeight: 700, color: C.purpleL,
                                }}>
                                  {(lead.name || '??').slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{lead.name || 'Unknown'}</div>
                                  <div style={{ fontSize: 11.5, color: C.muted }}>{lead.phone || lead.email || '—'}</div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '13px 20px', borderBottom: `1px solid ${C.border}`, fontSize: 13, color: C.sub, maxWidth: 160 }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {propNameMap[lead.property_id] || '—'}
                              </div>
                            </td>
                            <td style={{ padding: '13px 20px', borderBottom: `1px solid ${C.border}` }}>
                              <MotivationBadge level={lead.motivation} />
                            </td>
                            <td style={{ padding: '13px 20px', borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>
                              {timeAgo(lead.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Right column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                {/* Quick Actions */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 18px' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 12 }}>Quick Actions</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {canAddProperty ? (
                      <Link href="/dashboard/new-property" className="qa-row" style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 13px', borderRadius: 10,
                        background: C.bg, border: `1px solid ${C.border}`,
                        color: C.sub, fontSize: 13.5, fontWeight: 500, textDecoration: 'none',
                      }}>
                        <span style={{ fontSize: 16 }}>🏠</span> Add Property
                      </Link>
                    ) : (
                      <button onClick={() => handleCheckout('monthly')} disabled={checkingOut} className="qa-row" style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 13px', borderRadius: 10,
                        background: C.bg, border: `1px solid ${C.purple}45`,
                        color: C.purpleL, fontSize: 13.5, fontWeight: 500,
                        cursor: checkingOut ? 'not-allowed' : 'pointer',
                        opacity: checkingOut ? 0.7 : 1, width: '100%',
                      }}>
                        <span style={{ fontSize: 16 }}>⚡</span>
                        {checkingOut ? 'Redirecting…' : 'Upgrade to Add More'}
                      </button>
                    )}

                    <button className="qa-row" onClick={() => document.getElementById('qr-section')?.scrollIntoView({ behavior: 'smooth' })} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 13px', borderRadius: 10,
                      background: C.bg, border: `1px solid ${C.border}`,
                      color: C.sub, fontSize: 13.5, fontWeight: 500,
                      cursor: 'pointer', width: '100%', textAlign: 'left',
                    }}>
                      <span style={{ fontSize: 16 }}>◫</span> Generate QR Code
                    </button>

                    <Link href="/dashboard/analytics" className="qa-row" style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 13px', borderRadius: 10,
                      background: C.bg, border: `1px solid ${C.border}`,
                      color: C.sub, fontSize: 13.5, fontWeight: 500, textDecoration: 'none',
                    }}>
                      <span style={{ fontSize: 16 }}>👥</span> View All Leads
                    </Link>

                    <button className="qa-row" onClick={downloadCSV} disabled={exportingCSV} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 13px', borderRadius: 10,
                      background: C.bg, border: `1px solid ${C.border}`,
                      color: C.sub, fontSize: 13.5, fontWeight: 500,
                      cursor: exportingCSV ? 'not-allowed' : 'pointer',
                      opacity: exportingCSV ? 0.6 : 1, width: '100%', textAlign: 'left',
                    }}>
                      <span style={{ fontSize: 16 }}>⬇</span>
                      {exportingCSV ? 'Exporting…' : 'Download CSV'}
                    </button>
                  </div>
                </div>

                {/* Active Properties */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{
                    padding: '15px 18px', borderBottom: `1px solid ${C.border}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Active Properties</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: C.purpleL,
                      background: `${C.purple}22`, borderRadius: 20, padding: '2px 8px',
                    }}>{properties.length}</span>
                  </div>
                  {properties.slice(0, 4).map((p: any, i: number) => (
                    <div key={p.id} style={{
                      padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 11,
                      borderBottom: i < Math.min(properties.length, 4) - 1 ? `1px solid ${C.border}` : 'none',
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                        background: `${C.purple}18`, border: `1px solid ${C.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
                      }}>🏠</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.address}
                        </div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
                          {scanCounts[p.id] || 0} scans · {leadCounts[p.id] || 0} leads
                        </div>
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                        background: '#062014', border: '1px solid #166534',
                        borderRadius: 20, padding: '2px 8px',
                      }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80' }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#4ade80' }}>Live</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Properties & QR Codes */}
            <div id="qr-section" style={{ marginTop: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>Properties & QR Codes</h2>
                {canAddProperty && (
                  <Link href="/dashboard/new-property" style={{ fontSize: 13, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>
                    + Add Property
                  </Link>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {properties.map((p: any) => (
                  <div key={p.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <h2 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>{p.address}</h2>
                        <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
                          {[p.city, p.state].filter(Boolean).join(', ')}
                        </p>
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
