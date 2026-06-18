'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabase } from '../../../lib/supabase-browser'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import DashboardLayout from '../../../components/DashboardLayout'
import { Flame, Home, CalendarCheck, BarChart2, Sparkles, CheckCircle, TrendingUp, Minus } from 'lucide-react'
import { TIER_V2_CFG } from '../../../lib/leadScoringV2'

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

function hoursSince(isoStr: string): number {
  return (Date.now() - new Date(isoStr).getTime()) / 3_600_000
}

function leadTier(l: any): 'hot' | 'warm' | 'cold' {
  if (l.tier === 'hot' || l.tier === 'warm' || l.tier === 'cold') return l.tier
  // fall back to motivation mapping
  if (l.motivation === 'hot' || l.motivation === 'motivated') return 'hot'
  if (l.motivation === 'warm') return 'warm'
  return 'cold'
}

function isUncontacted(l: any): boolean {
  return (l.status ?? 'new') === 'new'
}

function requestedShowing(l: any): boolean {
  return (l.score_breakdown?.requested_showing ?? 0) > 0
}

const CHART_COLORS = { scans: '#8B5CF6', leads: '#FFD700' }

// ── component ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  const [scans, setScans]           = useState<any[]>([])
  const [leads, setLeads]           = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [prevScanCount, setPrevScanCount] = useState(0)
  const [prevLeadCount, setPrevLeadCount] = useState(0)
  const [oldLastSeen, setOldLastSeen]     = useState<string | null>(null)
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }

      setSessionUserId(session.user.id)

      const { data: props } = await supabase
        .from('properties')
        .select('id, address')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })

      const propertyIds = (props || []).map((p: any) => p.id)
      setProperties(props || [])

      if (propertyIds.length === 0) { setLoading(false); return }

      const now = new Date()
      const cutoff30 = new Date(now); cutoff30.setDate(cutoff30.getDate() - 29)
      const cutoff60 = new Date(now); cutoff60.setDate(cutoff60.getDate() - 59)
      const cutoffStr  = cutoff30.toISOString()
      const cutoff60Str = cutoff60.toISOString()

      const [
        { data: scanData },
        { data: leadData },
        { data: profileData },
        { count: prevScans },
        { count: prevLeads },
      ] = await Promise.all([
        supabase.from('scan_events').select('property_id, created_at').in('property_id', propertyIds).gte('created_at', cutoffStr),
        supabase.from('leads').select('id, name, property_id, motivation, tier, intent_score, status, last_contacted_at, last_activity_at, score_breakdown, created_at').in('property_id', propertyIds).gte('created_at', cutoffStr),
        supabase.from('profiles').select('last_seen_analytics_at').eq('id', session.user.id).single(),
        supabase.from('scan_events').select('*', { count: 'exact', head: true }).in('property_id', propertyIds).gte('created_at', cutoff60Str).lt('created_at', cutoffStr),
        supabase.from('leads').select('*', { count: 'exact', head: true }).in('property_id', propertyIds).gte('created_at', cutoff60Str).lt('created_at', cutoffStr),
      ])

      const lastSeen = profileData?.last_seen_analytics_at ?? null
      setOldLastSeen(lastSeen)
      setScans(scanData || [])
      setLeads(leadData || [])
      setPrevScanCount(prevScans || 0)
      setPrevLeadCount(prevLeads || 0)
      setLoading(false)

      // update last_seen AFTER capturing the old value above
      supabase.from('profiles').update({ last_seen_analytics_at: now.toISOString() }).eq('id', session.user.id).then(() => {})
    }
    load()
  }, [])

  // ── derived data ──────────────────────────────────────────────────────────

  const days        = last30Days()
  const scansByDay  = groupByDay(scans)
  const leadsByDay  = groupByDay(leads)

  const timelineData = days.map(day => ({
    day: day.slice(5),
    Scans: scansByDay[day] || 0,
    Leads: leadsByDay[day] || 0,
  }))

  const totalScans  = scans.length
  const totalLeads  = leads.length

  // conversion rate with prior-window comparison
  // cap at 100% — leads created before scan tracking fix can exceed scan count
  const convRaw   = totalScans  > 0 ? (totalLeads  / totalScans)  * 100 : null
  const convNow   = convRaw !== null ? Math.min(convRaw, 100) : null
  const convCapped = convRaw !== null && convRaw > 100
  const convPrev  = prevScanCount > 0 ? Math.min((prevLeadCount / prevScanCount) * 100, 100) : null
  const convDelta = convNow !== null && convPrev !== null ? convNow - convPrev : null

  // briefing
  const AGING_HOURS = 6
  const agingHot = leads.filter(l => leadTier(l) === 'hot' && isUncontacted(l) && hoursSince(l.created_at) >= AGING_HOURS)
  const outstandingShowings = leads.filter(l => requestedShowing(l) && isUncontacted(l))
  const newSinceLastVisit = oldLastSeen ? leads.filter(l => l.created_at > oldLastSeen) : []
  const newHot = newSinceLastVisit.filter(l => leadTier(l) === 'hot')
  const allCaughtUp = agingHot.length === 0 && outstandingShowings.length === 0 && (oldLastSeen === null || newSinceLastVisit.length === 0)

  // funnel
  const funnelContacted = leads.filter(l => !isUncontacted(l)).length
  const funnelShowing   = leads.filter(requestedShowing).length

  // tier distribution
  const tierRows = (['hot', 'warm', 'cold'] as const).map(tier => {
    const total = leads.filter(l => leadTier(l) === tier).length
    const uncontacted = leads.filter(l => leadTier(l) === tier && isUncontacted(l)).length
    return { tier, total, uncontacted, cfg: TIER_V2_CFG[tier] }
  })

  // seller-report readiness
  const readyProperties = properties.filter(p => {
    const pScans = scans.filter((s: any) => s.property_id === p.id).length
    const pLeads = leads.filter((l: any) => l.property_id === p.id).length
    return pScans >= 10 || pLeads >= 3
  })

  // leaderboard with conversion %
  const leaderboardRows = properties
    .map(p => {
      const pScans = scans.filter((s: any) => s.property_id === p.id).length
      const pLeads = leads.filter((l: any) => l.property_id === p.id).length
      const hasUnworkedHot = leads.some((l: any) => l.property_id === p.id && leadTier(l) === 'hot' && isUncontacted(l))
      const rawConv = pScans > 0 ? (pLeads / pScans) * 100 : null
      const isCapped = rawConv !== null && rawConv > 100
      const conv = rawConv === null ? '—' : isCapped ? '100%*' : Math.round(rawConv) + '%'
      return { address: p.address, scans: pScans, leads: pLeads, conv, isCapped, flag: hasUnworkedHot }
    })
    .sort((a, b) => b.scans - a.scans)
  const anyLeaderboardCapped = leaderboardRows.some(r => r.isCapped)

  // ── shared styles ─────────────────────────────────────────────────────────

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

  const s = (n: number) => n === 1 ? '' : 's'

  return (
    <DashboardLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .an-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        @media (max-width: 900px) { .an-grid2 { grid-template-columns: 1fr; } }
        .briefing-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; margin-bottom: 28px; }
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
          <div style={{
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

            {/* ── TODAY BRIEFING ─────────────────────────────────────────── */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
                Today's briefing
              </div>
            </div>

            {allCaughtUp ? (
              <div className="briefing-grid">
                <div style={{
                  ...card, marginBottom: 0,
                  borderLeft: `3px solid ${C.muted}`,
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <CheckCircle size={22} color={C.muted} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>You're all caught up</div>
                  <div style={{ fontSize: 12, color: C.muted }}>No urgent calls right now.</div>
                </div>
              </div>
            ) : (
              <div className="briefing-grid">
                {agingHot.length > 0 && (
                  <a href="/dashboard/leads" style={{ textDecoration: 'none' }}>
                    <div style={{
                      background: C.card, border: `1px solid ${C.border}`,
                      borderRadius: 14, padding: '18px 20px',
                      borderLeft: '3px solid #EF4444',
                      display: 'flex', flexDirection: 'column', gap: 6,
                      cursor: 'pointer',
                    }}>
                      <Flame size={22} color="#EF4444" />
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.35 }}>
                        {agingHot.length} hot lead{s(agingHot.length)} uncontacted {AGING_HOURS}h+
                      </div>
                      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55 }}>
                        Call now — intent decays every hour you wait.
                      </div>
                    </div>
                  </a>
                )}

                {oldLastSeen !== null && newSinceLastVisit.length > 0 && (
                  <a href="/dashboard/leads" style={{ textDecoration: 'none' }}>
                    <div style={{
                      background: C.card, border: `1px solid ${C.border}`,
                      borderRadius: 14, padding: '18px 20px',
                      borderLeft: `3px solid ${C.purpleL}`,
                      display: 'flex', flexDirection: 'column', gap: 6,
                      cursor: 'pointer',
                    }}>
                      <Sparkles size={22} color={C.purpleL} />
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.35 }}>
                        {newSinceLastVisit.length} new lead{s(newSinceLastVisit.length)} since your last visit
                        {newHot.length > 0 && ` — ${newHot.length} hot`}
                      </div>
                      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55 }}>
                        Review and reach out while they're warm.
                      </div>
                    </div>
                  </a>
                )}

                {outstandingShowings.length > 0 && (
                  <a href="/dashboard/leads" style={{ textDecoration: 'none' }}>
                    <div style={{
                      background: C.card, border: `1px solid ${C.border}`,
                      borderRadius: 14, padding: '18px 20px',
                      borderLeft: '3px solid #EF4444',
                      display: 'flex', flexDirection: 'column', gap: 6,
                      cursor: 'pointer',
                    }}>
                      <Home size={22} color="#EF4444" />
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.35 }}>
                        {outstandingShowings.length} showing request{s(outstandingShowings.length)} awaiting response
                      </div>
                      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55 }}>
                        Highest-intent signal a buyer can send. Book it.
                      </div>
                    </div>
                  </a>
                )}

                {readyProperties.length > 0 && (
                  <a href="/dashboard/seller-reports" style={{ textDecoration: 'none' }}>
                    <div style={{
                      background: C.card, border: `1px solid ${C.border}`,
                      borderRadius: 14, padding: '18px 20px',
                      borderLeft: '3px solid #22C55E',
                      display: 'flex', flexDirection: 'column', gap: 6,
                      cursor: 'pointer',
                    }}>
                      <BarChart2 size={22} color="#22C55E" />
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.35 }}>
                        {readyProperties.length} listing{s(readyProperties.length)} ready for a seller update
                      </div>
                      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55 }}>
                        {readyProperties.map((p: any) => p.address).join(', ')}
                      </div>
                    </div>
                  </a>
                )}
              </div>
            )}

            {/* ── KPI ROW ────────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              {/* Total Scans */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 24px' }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: C.purpleL, lineHeight: 1 }}>{totalScans}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Scans</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Buyer reach — share with your sellers</div>
              </div>

              {/* Total Leads */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 24px' }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#FFD700', lineHeight: 1 }}>{totalLeads}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Leads</div>
              </div>

              {/* Conversion Rate */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 24px' }}>
                {convNow === null ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, lineHeight: 1.4 }}>Not enough data yet</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lead Capture Rate</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.45 }}>Reflects leads captured vs. scans recorded. Engagement metric only — not a sales outcome.</div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <div style={{ fontSize: 32, fontWeight: 700, color: '#C084FC', lineHeight: 1 }}>{convNow.toFixed(1)}%</div>
                      {convDelta !== null && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: convDelta >= 0 ? '#22C55E' : '#EF4444' }}>
                          {convDelta >= 0 ? '▲' : '▼'} {Math.abs(convDelta).toFixed(1)}pp
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lead Capture Rate</div>
                    {convCapped && (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Capped at 100% — includes pre-fix leads</div>
                    )}
                    {!convCapped && convDelta !== null && (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>vs your prior 30-day avg</div>
                    )}
                    {!convCapped && convPrev === null && (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Not enough history for comparison</div>
                    )}
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.45 }}>Reflects leads captured vs. scans recorded. Engagement metric only — not a sales outcome.</div>
                  </>
                )}
              </div>
            </div>

            {/* ── CONVERSION FUNNEL ──────────────────────────────────────── */}
            <div style={card}>
              <div style={h2}>Conversion funnel</div>
              <p style={{ fontSize: 12, color: C.muted, marginTop: -10, marginBottom: 16 }}>
                Note: lead count may exceed scans for pre-existing data. Funnel will normalize as new scans accumulate.
              </p>
              {totalScans === 0 ? (
                <p style={{ color: C.muted, fontSize: 14 }}>No activity yet — place QR signs to start the funnel.</p>
              ) : (() => {
                const stages = [
                  { label: 'Scans',             value: totalScans,       color: C.purpleL },
                  { label: 'Leads',             value: totalLeads,       color: '#FFD700' },
                  { label: 'Showing requests',  value: funnelShowing,    color: '#FB923C' },
                  { label: 'Contacted',         value: funnelContacted,  color: '#22C55E' },
                ]
                const maxW = totalScans
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {stages.map((stage, i) => {
                      const pct = maxW > 0 ? Math.max((stage.value / maxW) * 100, stage.value > 0 ? 4 : 0) : 0
                      const dropPct = i > 0 && stages[i - 1].value > 0
                        ? Math.round(((stages[i - 1].value - stage.value) / stages[i - 1].value) * 100)
                        : null
                      const isFollowUpGap = i === 2 // Showing → Contacted
                      return (
                        <div key={stage.label}>
                          {dropPct !== null && (
                            <div style={{ fontSize: 11, color: isFollowUpGap ? '#EF4444' : C.muted, marginBottom: 4, paddingLeft: 2 }}>
                              ↓ {dropPct}% drop{isFollowUpGap ? ' — leads you haven\'t worked yet' : ''}
                            </div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ flex: 1, height: 32, background: C.border, borderRadius: 6, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: stage.color, borderRadius: 6, transition: 'width 0.4s ease' }} />
                            </div>
                            <div style={{ minWidth: 90, display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 12, color: C.muted }}>{stage.label}</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: stage.color }}>{stage.value}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            {/* ── LEADERBOARD + TIER BAR ─────────────────────────────────── */}
            <div className="an-grid2">
              {/* Leaderboard */}
              <div style={card}>
                <div style={h2}>Property leaderboard</div>
                {leaderboardRows.length === 0
                  ? <p style={{ color: C.muted, fontSize: 14 }}>No properties yet.</p>
                  : (
                    <>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={th}>Property</th>
                            <th style={{ ...th, textAlign: 'right' }}>Scans</th>
                            <th style={{ ...th, textAlign: 'right' }}>Leads</th>
                            <th style={{ ...th, textAlign: 'right' }}>Conv%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leaderboardRows.map((row, i) => (
                            <tr key={i}>
                              <td style={td}>
                                <span style={{ marginRight: 4 }}>{row.flag ? '🔥' : ''}</span>
                                {row.address}
                              </td>
                              <td style={{ ...td, textAlign: 'right', color: C.purpleL, fontWeight: 700 }}>{row.scans}</td>
                              <td style={{ ...td, textAlign: 'right', color: '#FFD700', fontWeight: 700 }}>{row.leads}</td>
                              <td style={{ ...td, textAlign: 'right', color: C.muted, fontWeight: 600 }}>{row.conv}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {anyLeaderboardCapped && (
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
                          * Capped at 100% — includes pre-fix leads
                        </div>
                      )}
                    </>
                  )
                }
              </div>

              {/* Tier distribution */}
              <div style={card}>
                <div style={h2}>Lead tiers</div>
                {totalLeads === 0
                  ? <p style={{ color: C.muted, fontSize: 14 }}>No leads yet.</p>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {tierRows.map(({ tier, total, uncontacted, cfg }) => (
                        total > 0 && (
                          <a key={tier} href={`/dashboard/leads?tier=${tier}`} style={{ textDecoration: 'none' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color, display: 'flex', alignItems: 'center', gap: 5 }}>
                                  {tier === 'hot'  && <Flame      size={13} />}
                                  {tier === 'warm' && <TrendingUp size={13} />}
                                  {tier === 'cold' && <Minus      size={13} />}
                                  {tier === 'hot' ? 'Hot' : tier === 'warm' ? 'Warm' : 'Cold'} · {total}
                                </span>
                                {uncontacted > 0 && (
                                  <span style={{ fontSize: 11, color: C.muted }}>
                                    {uncontacted} not yet called
                                  </span>
                                )}
                              </div>
                              <div style={{ height: 10, background: C.border, borderRadius: 5, overflow: 'hidden' }}>
                                <div style={{
                                  height: '100%',
                                  width: `${(total / totalLeads) * 100}%`,
                                  background: cfg.color,
                                  borderRadius: 5,
                                }} />
                              </div>
                              {uncontacted > 0 && (
                                <div style={{ height: 6, background: C.border, borderRadius: 5, overflow: 'hidden' }}>
                                  <div style={{
                                    height: '100%',
                                    width: `${(uncontacted / total) * 100}%`,
                                    background: '#EF4444',
                                    borderRadius: 5,
                                  }} />
                                </div>
                              )}
                            </div>
                          </a>
                        )
                      ))}
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                        Red bar = uncontacted share within tier
                      </div>
                    </div>
                  )
                }
              </div>
            </div>

            {/* ── COMBINED TREND CHART ───────────────────────────────────── */}
            <div style={card}>
              <div style={h2}>Activity — last 30 days</div>
              {scans.length === 0 && leads.length === 0
                ? <p style={{ color: C.muted, fontSize: 14 }}>No activity recorded yet. Generate a QR code and place it on yard signs, open houses, and flyers.</p>
                : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={timelineData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 10 }} tickLine={false} axisLine={false} interval={6} />
                      <YAxis tick={{ fill: C.muted, fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }}
                        cursor={{ fill: C.border }}
                      />
                      <Bar dataKey="Scans" fill={CHART_COLORS.scans} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Leads" fill={CHART_COLORS.leads} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )
              }
            </div>

          </div>
        </>
      )}
    </DashboardLayout>
  )
}
