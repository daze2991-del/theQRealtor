'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabase } from '../../lib/supabase-browser'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../components/DashboardLayout'
import { LineChart, Line, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { QrCode, Users, CalendarCheck, Flame, TrendingUp, BarChart2, Home, Bell, Calendar, Share2, Download, RotateCcw, AlertCircle } from 'lucide-react'
import { calcPropertyInterest } from '../../lib/propertyInterest'
import { timeAgo } from '../../lib/timeAgo'
import { motivationToTierV2, requestedShowing } from '../../lib/leadScoringV2'
import { isEligibleLead, needsFollowUp as isNeedsFollowUpLead } from '../../lib/leadEligibility'
import NeedsAttention from '../../components/dashboard/NeedsAttention'

// ── Tokens ────────────────────────────────────────────────────────────────────
const C = {
  bg:      '#0B0F1A',
  card:    '#0F1629',
  card2:   '#0A0D1C',
  border:  '#252533',
  purple:  '#7C3AED',
  purpleL: '#8B5CF6',
  text:    '#FFFFFF',
  sub:     '#C4C4D4',
  muted:   '#6B7280',
} as const

const ACCENT = {
  purple: { color: '#8B5CF6', bg: `#7C3AED1A`, border: `#7C3AED35` },
  green:  { color: '#4ADE80', bg: '#06200F',   border: '#166534'    },
  blue:   { color: '#60A5FA', bg: '#0B1E3A',   border: '#1E4D8C'    },
  amber:  { color: '#FCD34D', bg: '#2D1A06',   border: '#92400E'    },
  red:    { color: '#EF4444', bg: '#3B0D0D',   border: '#EF444435'  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Addresses are stored exactly as the agent typed them (often all-lowercase,
// e.g. "4444 culver blvs") — this only affects display, never the stored value.
// Title-cases each word; does not correct spelling or expand abbreviations.
function formatAddressDisplay(address: string): string {
  return address
    .split(' ')
    .map(word => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(' ')
}

function pctDiff(curr: number, prev: number): { n: number; up: boolean } | null {
  if (!prev) return null
  const n = Math.round(((curr - prev) / prev) * 100)
  return { n: Math.abs(n), up: n >= 0 }
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const chartData = data.map(v => ({ v }))
  return (
    <ResponsiveContainer width={80} height={24}>
      <LineChart data={chartData}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Donut chart ───────────────────────────────────────────────────────────────
function DonutChart({ segments, total }: { segments: Array<{ value: number; color: string; label: string; key: string }>; total: number }) {
  const filled = segments.filter(s => s.value > 0)
  const data = filled.length > 0 ? filled : [{ key: 'empty', value: 1, color: '#252533', label: '' }]
  return (
    <div style={{ position: 'relative', width: 160, height: 160 }}>
      <PieChart width={160} height={160}>
        <Pie data={data} dataKey="value" cx={80} cy={80} innerRadius={54} outerRadius={70} paddingAngle={filled.length > 1 ? 2 : 0} startAngle={90} endAngle={-270} isAnimationActive={false}>
          {data.map((seg, i) => <Cell key={i} fill={seg.color} />)}
        </Pie>
      </PieChart>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#F8FAFC', lineHeight: 1 }}>{total}</div>
        <div style={{ fontSize: 8, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 5, whiteSpace: 'nowrap' }}>TOTAL LEADS</div>
      </div>
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, change, accent, sparkData, caption, tooltip, href }: {
  icon: React.ReactNode; label: string; value: number | string;
  change?: { n: number; up: boolean } | null;
  accent: typeof ACCENT[keyof typeof ACCENT];
  sparkData?: number[];
  caption?: string;
  tooltip?: string;
  href?: string;
}) {
  const router = useRouter()
  return (
    <div
      className={href ? 'db-kpi-card' : undefined}
      onClick={href ? () => router.push(href) : undefined}
      style={{ background: C.card, border: `1px solid #7C3AED60`, borderRadius: 16, padding: '18px 20px 14px', display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', overflow: 'hidden', cursor: href ? 'pointer' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{icon}</div>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div style={{ fontSize: 48, fontWeight: 900, color: C.text, lineHeight: 1, letterSpacing: '-0.03em' }}>{value}</div>
        {tooltip && <span title={tooltip} style={{ fontSize: 11, color: C.muted, cursor: 'help', flexShrink: 0 }}>ⓘ</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: change ? (change.up ? accent.color : '#F87171') : C.muted, lineHeight: 1.3 }}>
          {change ? `${change.up ? '+' : '-'}${change.n}% vs last month` : (!caption ? '— flat' : null)}
        </div>
        {sparkData && <Sparkline data={sparkData} color={accent.color} />}
      </div>
      {caption && <div style={{ fontSize: 11, color: C.muted, marginTop: -4 }}>{caption}</div>}
    </div>
  )
}

// ── Health badge ──────────────────────────────────────────────────────────────
const HEALTH_BADGE_STYLE = {
  high:     { color: '#16A34A', background: '#F0FDF4', border: '1px solid #86EFAC' },
  moderate: { color: '#CA8A04', background: '#FEFCE8', border: '1px solid #FDE047' },
  low:      { color: '#DC2626', background: '#FEF2F2', border: '1px solid #FCA5A5' },
} as const

function HealthBadge({ scans, leads, hot }: { scans: number; leads: number; hot: number }) {
  const h = calcPropertyInterest({ totalLeads: leads, totalScans: scans, showingRequests: hot })
  return (
    <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap', ...HEALTH_BADGE_STYLE[h.level] }}>
      {h.badgeLabel}
    </span>
  )
}

// ── Section card wrapper ──────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', ...style }}>
      {children}
    </div>
  )
}
function CardHead({ title, action }: { title: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, background: C.card2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{title}</span>
      {action}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter()

  const [properties,       setProperties]       = useState<any[]>([])
  const [agentId,          setAgentId]           = useState('')
  const [totalLeads,       setTotalLeads]        = useState(0)
  const [totalScansAll,    setTotalScansAll]     = useState(0)
  const [propScanCounts,   setPropScanCounts]    = useState<Record<string, number>>({})
  const [propLeadCounts,   setPropLeadCounts]    = useState<Record<string, number>>({})
  const [propThumbs,       setPropThumbs]        = useState<Record<string, string>>({})
  const [propHotLeads,     setPropHotLeads]      = useState<Record<string, number>>({})
  const [pipelineCounts,   setPipelineCounts]    = useState<Record<string, number>>({ hot: 0, warm: 0, cold: 0 })
  const [topPropId,        setTopPropId]         = useState<string | null>(null)
  const [activityFeed,     setActivityFeed]      = useState<Array<{ iconKey: string; label: string; created_at: string }>>([])
  const [lastMonthLeads,   setLastMonthLeads]    = useState(0)
  const [prevMonthScans,   setPrevMonthScans]    = useState(0)
  const [scanSparkline,    setScanSparkline]     = useState<number[]>([])
  const [leadSparkline,    setLeadSparkline]     = useState<number[]>([])
  const [profileName,      setProfileName]       = useState('')
  const [loading,          setLoading]           = useState(true)
  const [propertiesLoaded, setPropertiesLoaded]  = useState(false)
  const [onboardingDone,   setOnboardingDone]    = useState<boolean | null>(null)
  const [copiedReport,     setCopiedReport]      = useState(false)
  const [origin,           setOrigin]            = useState('')
  const [buyerInterestCount, setBuyerInterestCount] = useState(0)
  const [showingRequestsCount, setShowingRequestsCount] = useState(0)
  const [needsFollowUp,    setNeedsFollowUp]     = useState(0)
  const [hotNotCalled,     setHotNotCalled]      = useState(0)
  const [warmNotCalled,    setWarmNotCalled]      = useState(0)

  useEffect(() => { setOrigin(window.location.origin) }, [])

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }
      setAgentId(session.user.id)

      const { data: profile } = await supabase.from('profiles').select('plan, name, onboarding_completed').eq('id', session.user.id).single()
      setProfileName(profile?.name || '')
      setOnboardingDone(profile?.onboarding_completed ?? false)

      const { data: props, error: propsError } = await supabase
        .from('properties')
        .select('id, address, city, state, price, beds, baths, description, active, agent_name, agent_phone, user_id, created_at, report_token')
        .eq('user_id', session.user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (propsError) { console.error('[dashboard] properties query error:', propsError); return }
      if (!props) return
      setProperties(props)
      setPropertiesLoaded(true)

      const ids = props.map((p: any) => p.id)
      const thisMonthStart = new Date(); thisMonthStart.setDate(1); thisMonthStart.setHours(0, 0, 0, 0)
      const lastMonthStart = new Date(thisMonthStart); lastMonthStart.setMonth(lastMonthStart.getMonth() - 1)
      const monthISO       = thisMonthStart.toISOString()
      const lastMonthISO   = lastMonthStart.toISOString()

      const [
        { data: allScansData },
        { data: recentLeadsData },
        { count: totalLeadsCount },
        { data: leadsPerProp },
        { data: thumbData },
        { data: recentScansData },
        { data: eligibleLeadsData },
        prevLeadsResult,
        prevScansResult,
      ] = await Promise.all([
        // Scan totals now come straight from scan_events (property_id is a
        // required, reliable stamp on every row — see /api/scan-events) instead
        // of qrcodes.scan_count, which lived on the now-empty/retired qrcodes table.
        supabase.from('scan_events').select('property_id').in('property_id', ids),
        supabase.from('leads').select('*').in('property_id', ids).order('created_at', { ascending: false }).limit(20),
        supabase.from('leads').select('*', { count: 'exact', head: true }).in('property_id', ids),
        supabase.from('leads').select('property_id, motivation, tier, status, created_at, score_breakdown').in('property_id', ids),
        supabase.from('property_photos').select('property_id, url').in('property_id', ids).order('sort_order', { ascending: true }),
        supabase.from('scan_events').select('property_id, created_at, return_visit').in('property_id', ids).order('created_at', { ascending: false }).limit(50),
        // Canonical eligible-lead set (lib/leadEligibility.ts) — agent_id-scoped,
        // not property_id-scoped, so a lead survives here regardless of whether
        // its property is soft-deleted, hard-deleted, or gone entirely. Feeds
        // "Needs Follow-Up" and Lead Health's "not yet called" sub-labels.
        supabase.from('leads').select('tier, motivation, status, do_not_contact, spam').eq('agent_id', session.user.id),
        supabase.from('leads').select('*', { count: 'exact', head: true }).in('property_id', ids).gte('created_at', lastMonthISO).lt('created_at', monthISO),
        supabase.from('scan_events').select('*', { count: 'exact', head: true }).in('property_id', ids).gte('created_at', lastMonthISO).lt('created_at', monthISO),
      ])

      // Maps
      const scanMap: Record<string, number> = {}
      ;(allScansData || []).forEach((s: any) => { scanMap[s.property_id] = (scanMap[s.property_id] || 0) + 1 })

      const leadMap: Record<string, number> = {}
      const hotByProp: Record<string, number> = {}
      const pipeline: Record<string, number> = { hot: 0, warm: 0, cold: 0 }
      const monthLeadsByProp: Record<string, number> = {}
      ;(leadsPerProp || []).forEach((l: any) => {
        leadMap[l.property_id] = (leadMap[l.property_id] || 0) + 1
        // Lead Health buckets on tier (V2), falling back to motivation only for legacy rows with no tier
        const t = l.tier && ['hot', 'warm', 'cold'].includes(l.tier) ? l.tier : motivationToTierV2(l.motivation)
        if (pipeline[t] !== undefined) pipeline[t]++
        if (l.motivation === 'hot') hotByProp[l.property_id] = (hotByProp[l.property_id] || 0) + 1
        if (l.created_at >= monthISO) monthLeadsByProp[l.property_id] = (monthLeadsByProp[l.property_id] || 0) + 1
      })
      const topEntry = Object.entries(monthLeadsByProp).sort((a, b) => b[1] - a[1])[0]

      // Canonical eligible-lead counts (agent_id-scoped — see the query comment
      // above). "Needs Follow-Up" and Lead Health's "Hot: N not yet called" are
      // now provably the same number, computed once, instead of two independent
      // property_id-scoped reimplementations that could silently disagree.
      const eligibleLeads = (eligibleLeadsData || []).map((l: any) => ({
        ...l,
        tier: l.tier && ['hot', 'warm', 'cold'].includes(l.tier) ? l.tier : motivationToTierV2(l.motivation),
      }))
      const hotNotCalledCount  = eligibleLeads.filter(isNeedsFollowUpLead).length
      const warmNotCalledCount = eligibleLeads.filter((l: any) => isEligibleLead(l) && l.tier === 'warm').length

      const thumbMap: Record<string, string> = {}
      ;(thumbData || []).forEach((t: any) => { if (!thumbMap[t.property_id]) thumbMap[t.property_id] = t.url })

      // Sparklines (14-day daily buckets)
      const days14: string[] = []
      for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days14.push(d.toISOString().slice(0, 10)) }
      const scanDaily: Record<string, number> = {}, leadDaily: Record<string, number> = {}
      ;(recentScansData || []).forEach((e: any) => { const d = e.created_at.slice(0, 10); if (days14.includes(d)) scanDaily[d] = (scanDaily[d] || 0) + 1 })
      ;(leadsPerProp || []).forEach((l: any) => { const d = l.created_at.slice(0, 10); if (days14.includes(d)) leadDaily[d] = (leadDaily[d] || 0) + 1 })
      setScanSparkline(days14.map(d => scanDaily[d] || 0))
      setLeadSparkline(days14.map(d => leadDaily[d] || 0))

      // Activity feed
      const propAddr: Record<string, string> = {}
      props.forEach((p: any) => { propAddr[p.id] = p.address })
      const multiProp = props.length > 1
      const shortAddr = (propId: string) => {
        if (!multiProp) return ''
        const addr = propAddr[propId] ?? '—'
        const words = addr.split(' ')
        const short = words.length > 2 ? words.slice(0, 2).join(' ') + '…' : addr
        return ` at ${short}`
      }
      const tierIconKey: Record<string, string> = { hot: 'flame', warm: 'trending', cold: 'user' }
      const tierText: Record<string, string> = { hot: 'Hot lead', warm: 'Warm lead', cold: 'New lead' }
      const feedItems: Array<{ iconKey: string; label: string; created_at: string }> = [
        ...(recentLeadsData || []).map((l: any) => {
          const t = l.tier && ['hot', 'warm', 'cold'].includes(l.tier) ? l.tier : motivationToTierV2(l.motivation)
          return { iconKey: tierIconKey[t] ?? 'user', label: `${tierText[t] ?? 'New lead'}${shortAddr(l.property_id)}`, created_at: l.created_at }
        }),
        // Excludes return-visit scans, which are already surfaced as actionable items in
        // Needs Your Attention — this feed shows recent activity that isn't already actionable there.
        ...(recentScansData || []).filter((e: any) => !e.return_visit).map((e: any) => ({ iconKey: e.return_visit ? 'return' : 'scan', label: `${e.return_visit ? 'Buyer returned' : 'Buyer scanned'}${shortAddr(e.property_id)}`, created_at: e.created_at })),
      ]
      feedItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      setProperties(props)
      setTotalLeads(totalLeadsCount || 0)
      setTotalScansAll((allScansData || []).length)
      setPropScanCounts(scanMap)
      setPropLeadCounts(leadMap)
      setPropThumbs(thumbMap)
      setPropHotLeads(hotByProp)
      setPipelineCounts(pipeline)
      setBuyerInterestCount((leadsPerProp || []).filter((l: any) => l.tier === 'hot').length)
      setShowingRequestsCount((leadsPerProp || []).filter(requestedShowing).length)
      setNeedsFollowUp(hotNotCalledCount)
      setHotNotCalled(hotNotCalledCount)
      setWarmNotCalled(warmNotCalledCount)
      setTopPropId(topEntry?.[0] ?? null)
      setActivityFeed(feedItems.slice(0, 10))
      setLastMonthLeads(prevLeadsResult.count || 0)
      setPrevMonthScans(prevScansResult.count || 0)
      setLoading(false)
    }
    load()
  }, [])

  // Route brand-new agents into the wizard. Once onboarding is completed (or
  // skipped), never auto-route into it again — even with no property.
  useEffect(() => {
    if (propertiesLoaded && onboardingDone === false && properties.length === 0) {
      router.push('/dashboard/onboarding')
    }
  }, [propertiesLoaded, onboardingDone, properties])

  // ── Derived ─────────────────────────────────────────────────────────────────
  const firstName  = (profileName || '').split(' ')[0]
  const hour       = typeof window !== 'undefined' ? new Date().getHours() : 12
  const greeting   = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const today      = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const monthRange = `${monthStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  const hotCount        = pipelineCounts.hot || 0
  const scanChange      = pctDiff(totalScansAll, prevMonthScans)
  const leadChange      = pctDiff(totalLeads, lastMonthLeads)
  const topProp         = topPropId ? properties.find(p => p.id === topPropId) : null

  // Donut segments — 3 tiers: Hot (11+), Warm (5–10), Cold (0–4)
  const donutSegments = [
    { key: 'hot',  value: pipelineCounts.hot || 0,                                             color: '#EF4444', label: 'Hot' },
    { key: 'warm', value: pipelineCounts.warm || 0,                                             color: '#60A5FA', label: 'Warm' },
    { key: 'cold', value: pipelineCounts.cold || 0,                                             color: '#6B7280', label: 'Cold' },
  ]

  return (
    <DashboardLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .db-kpi4    { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; }
        .db-layout  { display: grid; grid-template-columns: 2fr 2.6fr; gap: 14px; }
        .db-rtop    { display: grid; grid-template-columns: 1.6fr 1fr; gap: 14px; }
        .prop-row   { display: grid; grid-template-columns: 48px 1fr auto; gap: 12px; align-items: center; }
        .db-hover   { transition: background 0.1s; }
        .db-hover:hover { background: #1E1E2A !important; }
        .db-kpi-card { transition: border-color 0.12s, background 0.12s; }
        .db-kpi-card:hover { border-color: #7C3AED66 !important; background: #131A2E !important; }
        @media (max-width: 1100px) {
          .db-layout { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 860px) {
          .db-kpi4   { grid-template-columns: repeat(2,1fr) !important; }
          .db-rtop   { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 500px) {
          .db-kpi4  { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      {loading || !propertiesLoaded ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, border: `2px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 14px', animation: 'spin 0.7s linear infinite' }} />
            <div style={{ color: C.muted, fontSize: 14 }}>Loading dashboard…</div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1, overflowY: 'auto' }}>

          {/* ── SECTION 1: Header ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
                {greeting}{firstName ? `, ${firstName}` : ''}!
              </h1>
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Here's what's happening with your properties.</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 13px' }}>
                <Calendar size={14} color={C.sub} />
                <span style={{ fontSize: 12, fontWeight: 600, color: C.sub }}>{monthRange}</span>
              </div>
              <div style={{ position: 'relative' }}>
                <div style={{ width: 36, height: 36, background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Bell size={17} color={C.sub} /></div>
                {showingRequestsCount > 0 && (
                  <div style={{ position: 'absolute', top: -4, right: -4, background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 800, borderRadius: 10, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{showingRequestsCount}</div>
                )}
              </div>
            </div>
          </div>

          {/* ── Today's Focus ── */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.purple}`, borderRadius: 12, padding: '11px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Today's Focus</div>
              {needsFollowUp === 0 && showingRequestsCount === 0 ? (
                <span style={{ fontSize: 13, color: C.sub }}>You're all caught up — no urgent actions right now.</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {needsFollowUp > 0 && <span style={{ fontSize: 13, color: C.sub }}>• {needsFollowUp} high-interest buyer{needsFollowUp !== 1 ? 's' : ''} awaiting contact</span>}
                  {showingRequestsCount > 0 && <span style={{ fontSize: 13, color: C.sub }}>• {showingRequestsCount} showing request{showingRequestsCount !== 1 ? 's' : ''} pending</span>}
                </div>
              )}
            </div>
            {(needsFollowUp > 0 || showingRequestsCount > 0) && (
              <Link href="/dashboard/leads" style={{ fontSize: 12, fontWeight: 700, color: C.purpleL, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>Review Leads →</Link>
            )}
          </div>

          {/* ── SECTION 2: KPI Cards ── */}
          <div className="db-kpi4">
            <KpiCard href="/dashboard/leads?status=not_contacted"      icon={<AlertCircle   size={18} color={ACCENT.amber.color}  />} label="Needs Follow-Up"    value={needsFollowUp}      change={null}       accent={ACCENT.amber} caption={needsFollowUp === 0 ? "You're all caught up" : 'High-interest buyers awaiting contact'} />
            <KpiCard href="/dashboard/leads?tier=all&sort=newest"      icon={<Users         size={18} color={ACCENT.green.color}  />} label="New Leads"          value={totalLeads}         change={leadChange} accent={ACCENT.green} caption="Last 30 days" />
            <KpiCard href="/dashboard/leads?motivation=showing"        icon={<CalendarCheck size={18} color={ACCENT.blue.color}   />} label="Showing Requests"   value={showingRequestsCount} change={null}     accent={ACCENT.blue}  caption={showingRequestsCount === 0 ? "Appears when buyers click 'Request a Showing'" : undefined} />
            <KpiCard href="/dashboard/leads?tier=hot"                  icon={<Flame         size={18} color={ACCENT.red.color}    />} label="High-Intent Buyers" value={buyerInterestCount} change={null}       accent={ACCENT.red}   caption={buyerInterestCount === 0 ? 'Place your first QR sign to start capturing buyers' : undefined} />
          </div>

          {/* ── SECTION 3+4+5: Two-column main layout ── */}
          <div className="db-layout">

            {/* Left column: Needs Your Attention stacked above Properties */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Needs Your Attention — uncontacted hot/warm leads + anonymous return-scan activity */}
            <NeedsAttention agentId={agentId} properties={properties} />

            {/* Properties list */}
            <Card style={{ height: 320, display: 'flex', flexDirection: 'column' }}>
              <CardHead
                title={`Your Properties (${properties.length})`}
                action={<Link href="/dashboard/properties" style={{ fontSize: 11, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>View all →</Link>}
              />
              <div style={{ flex: 1, overflowY: 'auto' }}>
              {properties.length === 0 ? (
                <div style={{ padding: '32px 18px', textAlign: 'center', color: C.muted, fontSize: 13 }}>No properties yet. <Link href="/dashboard/properties" style={{ color: C.purpleL }}>Add Property →</Link></div>
              ) : (
                <div>
                  {[...properties].sort((a, b) => (propLeadCounts[b.id] || 0) - (propLeadCounts[a.id] || 0)).slice(0, 4).map((p: any, i: number, arr) => {
                    const scans = propScanCounts[p.id] || 0
                    const leads = propLeadCounts[p.id] || 0
                    const hot   = propHotLeads[p.id] || 0
                    return (
                      <Link key={p.id} href={`/dashboard/properties/${p.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                        <div className="db-hover" style={{ padding: '11px 18px', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none', background: C.card }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{formatAddressDisplay(p.address)}</span>
                            <HealthBadge scans={scans} leads={leads} hot={hot} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                            <span style={{ color: '#FCD34D', fontWeight: 600 }}>{leads}</span><span style={{ color: C.muted }}>Leads</span>
                            <span style={{ color: C.border }}>·</span>
                            <span style={{ color: '#EF4444', fontWeight: 600 }}>{hot}</span><span style={{ color: C.muted }}>Showings</span>
                            <span style={{ color: C.border }}>·</span>
                            <span style={{ color: C.purpleL, fontWeight: 600 }}>{scans}</span><span style={{ color: C.muted }}>Scans</span>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                  {properties.length > 4 && (
                    <div style={{ padding: '10px 18px', textAlign: 'center', borderTop: `1px solid ${C.border}` }}>
                      <Link href="/dashboard/properties" style={{ fontSize: 12, color: C.muted, textDecoration: 'none', fontWeight: 600 }}>+{properties.length - 4} more — view all properties</Link>
                    </div>
                  )}
                </div>
              )}
              </div>
            </Card>

            </div>{/* end left column */}

            {/* Right column: Lead Pipeline + Live Activity top row, Seller Report below */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="db-rtop">

            {/* Lead Health */}
            <Card>
              <CardHead title="Lead Health" />
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Hot',  color: '#EF4444', count: pipelineCounts.hot || 0,                                           uncontacted: hotNotCalled  },
                  { label: 'Warm', color: '#F59E0B', count: pipelineCounts.warm || 0,                                           uncontacted: warmNotCalled },
                  { label: 'Cold', color: '#6B7280', count: pipelineCounts.cold || 0,                                           uncontacted: null          },
                ].map(({ label, color, count, uncontacted }) => (
                  <div key={label} style={{ borderLeft: `3px solid ${color}`, paddingLeft: 10, paddingTop: 5, paddingBottom: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text, minWidth: 36 }}>{label}</span>
                      <span style={{ fontSize: 12, color: C.sub }}>{count} lead{count !== 1 ? 's' : ''}</span>
                      {uncontacted !== null && uncontacted > 0 && (
                        <span style={{ fontSize: 11, color: C.muted }}>· {uncontacted} not yet called</span>
                      )}
                    </div>
                  </div>
                ))}
                <p style={{ fontSize: 11, color: C.muted, margin: '4px 0 0', textAlign: 'center' }}>Based on buyer intent &amp; engagement</p>
              </div>
            </Card>

            {/* Live Activity */}
            <Card>
              <CardHead
                title={<>Live Activity <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block', marginLeft: 6, boxShadow: '0 0 6px #4ade80' }} /></>}
                action={<Link href="/dashboard/leads" style={{ fontSize: 11, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>View all →</Link>}
              />
              <div>
                {activityFeed.length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: C.muted, fontSize: 12 }}>No activity yet.</div>
                ) : (
                  activityFeed.slice(0, 5).map((ev, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 16px', borderBottom: i < 4 ? `1px solid ${C.border}` : 'none' }}>
                      <span style={{ flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', width: 18, justifyContent: 'center' }}>
                        {ev.iconKey === 'flame'    && <Flame      size={14} color="#EF4444" />}
                        {ev.iconKey === 'trending' && <TrendingUp size={14} color="#60A5FA" />}
                        {ev.iconKey === 'scan'     && <QrCode     size={14} color={C.muted} />}
                        {ev.iconKey === 'return'   && <RotateCcw  size={14} color={C.muted} />}
                        {ev.iconKey === 'user'     && <Users      size={14} color={C.muted} />}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.4 }}>{ev.label}</div>
                        <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{timeAgo(ev.created_at)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
            </div>{/* end db-rtop */}

            {/* Seller Report Preview */}
            {topProp ? (
              <Card>
                <CardHead title={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><BarChart2 size={14} color={C.purpleL} /> Seller Report Preview</span>} />
                <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {propThumbs[topProp.id] ? (
                    <img src={propThumbs[topProp.id]} alt="" style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 10, display: 'block', border: `1px solid ${C.border}` }} />
                  ) : (
                    <div style={{ width: '100%', height: 72, background: `${C.purple}18`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.border}` }}><Home size={32} color={C.purpleL} /></div>
                  )}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{topProp.address}</div>
                    <HealthBadge scans={propScanCounts[topProp.id] || 0} leads={propLeadCounts[topProp.id] || 0} hot={propHotLeads[topProp.id] || 0} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'Scans',    value: propScanCounts[topProp.id] || 0, color: C.purpleL },
                      { label: 'Leads',    value: propLeadCounts[topProp.id] || 0, color: '#FCD34D' },
                      { label: 'Showing',  value: propHotLeads[topProp.id] || 0,   color: '#EF4444' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ background: C.card2, borderRadius: 9, padding: '9px 10px', border: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
                        <div style={{ fontSize: 9, color: C.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(`${origin}/report/${topProp.report_token}`).catch(() => {})
                        setCopiedReport(true)
                        setTimeout(() => setCopiedReport(false), 2000)
                      }}
                      style={{ flex: 1, background: copiedReport ? '#052e16' : `${C.purple}20`, border: `1px solid ${copiedReport ? '#166534' : C.purple + '35'}`, borderRadius: 9, padding: '9px', fontSize: 11, fontWeight: 700, color: copiedReport ? '#4ade80' : C.purpleL, cursor: 'pointer', fontFamily: 'sans-serif', transition: 'all 0.15s' }}
                    >
                      {copiedReport ? '✓ Copied!' : <><Share2 size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />Share Report</>}
                    </button>
                    <a href={`/report/${topProp.report_token}?print=true`} target="_blank" rel="noreferrer"
                      style={{ flex: 1, background: '#2563EB', borderRadius: 9, padding: '9px', fontSize: 11, fontWeight: 700, color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Download size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />PDF
                    </a>
                  </div>
                  <Link href={`/report/${topProp.report_token}`} style={{ fontSize: 12, color: C.purpleL, textDecoration: 'none', fontWeight: 600, textAlign: 'center' }}>View full report →</Link>
                </div>
              </Card>
            ) : (
              <Card>
                <CardHead title={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><BarChart2 size={14} color={C.purpleL} /> Seller Report Preview</span>} />
                <div style={{ padding: '32px 18px', textAlign: 'center', color: C.muted, fontSize: 13 }}>Capture leads to unlock your top performing listing preview.</div>
              </Card>
            )}
            </div>{/* end right column */}
          </div>{/* end db-layout */}

        </div>
      )}
    </DashboardLayout>
  )
}
