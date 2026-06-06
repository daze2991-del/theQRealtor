'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabase } from '../../../lib/supabase-browser'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import DashboardLayout from '../../../components/DashboardLayout'

// ── tokens ──────────────────────────────────────────────────────────────────

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

// ── helpers ──────────────────────────────────────────────────────────────────

function last30Days(): string[] {
  const days: string[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

function groupByDay(rows: { created_at: string }[]): Record<string, number> {
  const map: Record<string, number> = {}
  rows.forEach(r => {
    const day = r.created_at.slice(0, 10)
    map[day] = (map[day] || 0) + 1
  })
  return map
}

const MOTIVATION_CONFIG: Record<string, { label: string; color: string }> = {
  cold:      { label: 'Just browsing',        color: '#6B7280' },
  warm:      { label: 'Casually looking',     color: '#60A5FA' },
  motivated: { label: 'Actively searching',   color: '#FB923C' },
  hot:       { label: 'Ready to offer',       color: '#F87171' },
}

const CHART_COLORS = { scans: '#8B5CF6', leads: '#FFD700' }

// ── component ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  const [scans, setScans]               = useState<any[]>([])
  const [leads, setLeads]               = useState<any[]>([])
  const [properties, setProperties]     = useState<any[]>([])
  const [returnVisitCount, setReturnVisitCount]     = useState(0)
  const [thisMonthLeadCount, setThisMonthLeadCount] = useState(0)
  const [lastMonthLeadCount, setLastMonthLeadCount] = useState(0)

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }

      const { data: props } = await supabase
        .from('properties')
        .select('id, address')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })

      const propertyIds = (props || []).map((p: any) => p.id)
      setProperties(props || [])

      if (propertyIds.length === 0) { setLoading(false); return }

      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 29)
      const cutoffStr = cutoff.toISOString()
      const thisMonthStart = new Date(); thisMonthStart.setDate(1); thisMonthStart.setHours(0, 0, 0, 0)
      const lastMonthStart = new Date(thisMonthStart); lastMonthStart.setMonth(lastMonthStart.getMonth() - 1)

      const [
        { data: scanData },
        { data: leadData },
        { count: rvCount },
        { count: thisMonthCount },
        { count: lastMonthCount },
      ] = await Promise.all([
        supabase.from('scan_events').select('qr_id, created_at').gte('created_at', cutoffStr),
        supabase.from('leads').select('property_id, motivation, created_at').in('property_id', propertyIds).gte('created_at', cutoffStr),
        supabase.from('scan_events').select('*', { count: 'exact', head: true })
          .in('property_id', propertyIds).eq('return_visit', true).gte('created_at', cutoffStr),
        supabase.from('leads').select('*', { count: 'exact', head: true })
          .in('property_id', propertyIds).gte('created_at', thisMonthStart.toISOString()),
        supabase.from('leads').select('*', { count: 'exact', head: true })
          .in('property_id', propertyIds)
          .gte('created_at', lastMonthStart.toISOString())
          .lt('created_at', thisMonthStart.toISOString()),
      ])

      setScans(scanData || [])
      setLeads(leadData || [])
      setReturnVisitCount(rvCount || 0)
      setThisMonthLeadCount(thisMonthCount || 0)
      setLastMonthLeadCount(lastMonthCount || 0)
      setLoading(false)
    }
    load()
  }, [])

  const [qrScanTotals, setQrScanTotals] = useState<Record<string, number>>({})

  useEffect(() => {
    if (properties.length === 0) return
    const fetchTotals = async () => {
      const supabase = createBrowserSupabase()
      const { data } = await supabase
        .from('qrcodes')
        .select('property_id, scan_count')
        .in('property_id', properties.map((p: any) => p.id))
      const totals: Record<string, number> = {}
      data?.forEach((q: any) => {
        totals[q.property_id] = (totals[q.property_id] || 0) + q.scan_count
      })
      setQrScanTotals(totals)
    }
    fetchTotals()
  }, [properties])

  // ── derived data ──────────────────────────────────────────────────────────

  const days = last30Days()
  const scansByDay = groupByDay(scans)
  const leadsByDay = groupByDay(leads)

  const timelineData = days.map(day => ({
    day: day.slice(5),
    Scans: scansByDay[day] || 0,
    Leads: leadsByDay[day] || 0,
  }))

  const motivationData = Object.entries(MOTIVATION_CONFIG).map(([key, cfg]) => ({
    name: cfg.label,
    value: leads.filter(l => l.motivation === key).length,
    color: cfg.color,
  })).filter(d => d.value > 0)

  const leaderboardRows = properties
    .map(p => ({
      address: p.address,
      scans: qrScanTotals[p.id] || 0,
      leads: leads.filter((l: any) => l.property_id === p.id).length,
    }))
    .sort((a, b) => b.scans - a.scans)

  const totalScans = Object.values(qrScanTotals).reduce((a, b) => a + b, 0)
  const totalLeads = leads.length
  const convRate   = totalScans > 0 ? ((totalLeads / totalScans) * 100).toFixed(1) + '%' : 'Not enough data yet'

  // ── Insights ──────────────────────────────────────────────────────────────
  const hotLeadsCount = leads.filter((l: any) => l.motivation === 'hot').length
  const monthGrowth   = lastMonthLeadCount > 0
    ? Math.round(((thisMonthLeadCount - lastMonthLeadCount) / lastMonthLeadCount) * 100)
    : null
  const topPropByLeads = [...properties]
    .map((p: any) => ({ ...p, count30d: leads.filter((l: any) => l.property_id === p.id).length }))
    .sort((a: any, b: any) => b.count30d - a.count30d)[0]

  const insightCards: Array<{ icon: string; accent: string; text: string; sub: string }> = []
  if (totalLeads === 0 && totalScans === 0) {
    insightCards.push({ icon: '📍', accent: C.muted, text: 'Place your first QR sign to start seeing insights', sub: "Once buyers scan, you'll see real activity and lead data here." })
  } else {
    if (hotLeadsCount > 0) insightCards.push({ icon: '🔥', accent: '#EF4444', text: `${hotLeadsCount} buyer${hotLeadsCount > 1 ? 's' : ''} ready to act — call them today`, sub: 'Hot buyers have shown strong purchase intent. Reach out now.' })
    if (monthGrowth !== null && monthGrowth > 0) insightCards.push({ icon: '📈', accent: '#22C55E', text: `Lead volume up ${monthGrowth}% this month vs last month`, sub: 'Your QR signs are generating more leads than before.' })
    if (monthGrowth !== null && monthGrowth < 0) insightCards.push({ icon: '📉', accent: '#F97316', text: `Lead volume down ${Math.abs(monthGrowth)}% this month vs last month`, sub: 'Consider adding more QR signs or promoting your listings.' })
    if (topPropByLeads?.count30d > 0) insightCards.push({ icon: '🏆', accent: '#FCD34D', text: `${topPropByLeads.address} is your top listing this month`, sub: `${topPropByLeads.count30d} lead${topPropByLeads.count30d > 1 ? 's' : ''} captured in the last 30 days.` })
    if (returnVisitCount > 0) insightCards.push({ icon: '↩️', accent: C.purpleL, text: `${returnVisitCount} buyer${returnVisitCount > 1 ? 's' : ''} returned to view listings multiple times`, sub: 'Return visitors show strong purchase intent.' })
  }

  // ── shared card / table styles ────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 14, padding: 24, marginBottom: 24,
  }
  const th: React.CSSProperties = {
    textAlign: 'left', fontSize: 11, color: C.muted,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    padding: '0 12px 10px 0', fontWeight: 600,
  }
  const td: React.CSSProperties = {
    padding: '10px 12px 10px 0', fontSize: 14,
    borderTop: `1px solid ${C.border}`,
  }
  const h2: React.CSSProperties = {
    fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 18,
    textTransform: 'uppercase', letterSpacing: '0.06em',
  }

  return (
    <DashboardLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .an-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        @media (max-width: 900px) { .an-grid2 { grid-template-columns: 1fr; } }
      `}</style>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 36, height: 36,
              border: `2px solid ${C.purple}`, borderTopColor: 'transparent',
              borderRadius: '50%', margin: '0 auto 14px',
              animation: 'spin 0.7s linear infinite',
            }} />
            <div style={{ color: C.muted, fontSize: 14, fontFamily: 'sans-serif' }}>Loading analytics…</div>
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
              <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>
                Analytics
              </h1>
              <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0' }}>Last 30 days</p>
            </div>
          </div>

          {/* Page body */}
          <div style={{ flex: 1, padding: '28px 28px 40px', overflowY: 'auto', fontFamily: 'sans-serif' }}>

            {/* Insights */}
            {insightCards.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14, marginBottom: 28 }}>
                {insightCards.map((ins, i) => (
                  <div key={i} style={{
                    background: C.card, border: `1px solid ${C.border}`,
                    borderRadius: 14, padding: '18px 20px',
                    borderLeft: `3px solid ${ins.accent}`,
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    <div style={{ fontSize: 22 }}>{ins.icon}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.35 }}>{ins.text}</div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55 }}>{ins.sub}</div>
                  </div>
                ))}
              </div>
            )}

            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Total Scans',     value: totalScans,       color: C.purpleL },
                { label: 'Total Leads',     value: totalLeads,       color: '#FFD700'  },
                { label: 'Conversion Rate', value: convRate,           color: '#C084FC'  },
              ].map(k => {
                const isNote = typeof k.value === 'string' && k.value.length > 6
                return (
                  <div key={k.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 24px' }}>
                    <div style={{ fontSize: isNote ? 12 : 32, fontWeight: isNote ? 600 : 700, color: isNote ? C.muted : k.color, lineHeight: isNote ? 1.4 : 1 }}>{k.value}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
                  </div>
                )
              })}
            </div>

            {/* Motivation + Leaderboard row — shown first */}
            <div className="an-grid2">
              <div style={card}>
                <div style={h2}>Lead Motivation</div>
                {motivationData.length === 0
                  ? <p style={{ color: C.muted, fontSize: 14 }}>No leads yet.</p>
                  : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={motivationData} dataKey="value" innerRadius={60} outerRadius={90} paddingAngle={3}>
                          {motivationData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} />
                        <Legend formatter={(value) => <span style={{ color: '#9CA3AF', fontSize: 12 }}>{value}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  )
                }
              </div>

              <div style={card}>
                <div style={h2}>Property Leaderboard</div>
                {leaderboardRows.length === 0
                  ? <p style={{ color: C.muted, fontSize: 14 }}>No properties yet.</p>
                  : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={th}>Property</th>
                          <th style={{ ...th, textAlign: 'right' }}>Scans</th>
                          <th style={{ ...th, textAlign: 'right' }}>Leads</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboardRows.map((row, i) => (
                          <tr key={i}>
                            <td style={td}>{row.address}</td>
                            <td style={{ ...td, textAlign: 'right', color: C.purpleL, fontWeight: 700 }}>{row.scans}</td>
                            <td style={{ ...td, textAlign: 'right', color: '#FFD700', fontWeight: 700 }}>{row.leads}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                }
              </div>
            </div>

            {/* Charts row */}
            <div className="an-grid2">
              <div style={card}>
                <div style={h2}>Scans — last 30 days</div>
                {scans.length === 0
                  ? <p style={{ color: C.muted, fontSize: 14 }}>No QR scans recorded yet. Generate a QR code and place it on yard signs, open houses, and flyers.</p>
                  : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={timelineData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 10 }} tickLine={false} axisLine={false} interval={6} />
                        <YAxis tick={{ fill: C.muted, fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} cursor={{ fill: C.border }} />
                        <Bar dataKey="Scans" fill={CHART_COLORS.scans} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )
                }
              </div>

              <div style={card}>
                <div style={h2}>Leads — last 30 days</div>
                {leads.length === 0
                  ? <p style={{ color: C.muted, fontSize: 14 }}>No lead data yet.</p>
                  : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={timelineData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 10 }} tickLine={false} axisLine={false} interval={6} />
                        <YAxis tick={{ fill: C.muted, fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} cursor={{ fill: C.border }} />
                        <Bar dataKey="Leads" fill={CHART_COLORS.leads} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )
                }
              </div>
            </div>

          </div>
        </>
      )}
    </DashboardLayout>
  )
}
