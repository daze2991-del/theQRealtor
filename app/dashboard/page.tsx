'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabase } from '../../lib/supabase-browser'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../components/DashboardLayout'

// ── Tokens ────────────────────────────────────────────────────────────────────
const C = {
  bg:      '#0F0F13',
  card:    '#1A1A24',
  card2:   '#15151E',
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
}

const MOTIV: Record<string, { label: string; color: string; bg: string; border: string }> = {
  hot:       { label: '🔥 Hot',       color: '#EF4444', bg: '#3B0D0D', border: '#EF4444' },
  motivated: { label: '⚡ Motivated', color: '#F97316', bg: '#3B1F0D', border: '#F97316' },
  warm:      { label: '👍 Warm',      color: '#60A5FA', bg: '#0F2238', border: '#60A5FA' },
  cold:      { label: '❄️ Cold',      color: '#6B7280', bg: '#1F2937', border: '#6B7280' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function pctDiff(curr: number, prev: number): { n: number; up: boolean } | null {
  if (!prev) return null
  const n = Math.round(((curr - prev) / prev) * 100)
  return { n: Math.abs(n), up: n >= 0 }
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const w = 80, h = 24, max = Math.max(...data, 1)
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - (v / max) * (h - 2)).toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
    </svg>
  )
}

// ── Donut chart ───────────────────────────────────────────────────────────────
function DonutChart({ segments, total }: { segments: Array<{ value: number; color: string; label: string; key: string }>; total: number }) {
  const cx = 80, cy = 80, r = 56, sw = 20
  const circumference = 2 * Math.PI * r
  const arcs: { color: string; dash: number; rotation: number }[] = []
  let cum = 0
  for (const seg of segments) {
    if (seg.value > 0 && total > 0) {
      arcs.push({ color: seg.color, dash: (seg.value / total) * circumference, rotation: (cum / total) * 360 - 90 })
      cum += seg.value
    }
  }
  return (
    <svg width="160" height="160" viewBox="0 0 160 160">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#252533" strokeWidth={sw} />
      {arcs.map((a, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none"
          stroke={a.color} strokeWidth={sw}
          strokeDasharray={`${a.dash} ${circumference - a.dash}`}
          transform={`rotate(${a.rotation}, ${cx}, ${cy})`}
        />
      ))}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="22" fontWeight="800" fill="#F8FAFC">{total}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9" fontWeight="700" fill="#6B7280">TOTAL LEADS</text>
    </svg>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, change, accent, sparkData }: {
  icon: string; label: string; value: number | string;
  change?: { n: number; up: boolean } | null;
  accent: typeof ACCENT[keyof typeof ACCENT];
  sparkData?: number[];
}) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px 14px', display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accent.color, opacity: 0.7 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: accent.bg, border: `1px solid ${accent.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{icon}</div>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 36, fontWeight: 900, color: C.text, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: change ? (change.up ? '#4ADE80' : '#F87171') : C.muted, lineHeight: 1.3 }}>
          {change ? `${change.up ? '↑' : '↓'} ${change.n}% vs last month` : 'vs last month'}
        </div>
        {sparkData && <Sparkline data={sparkData} color={accent.color} />}
      </div>
    </div>
  )
}

// ── Health badge ──────────────────────────────────────────────────────────────
function HealthBadge({ scans, leads, hot }: { scans: number; leads: number; hot: number }) {
  if (scans >= 10 && leads >= 3 && hot >= 1)
    return <span style={{ fontSize: 10, fontWeight: 700, color: '#16A34A', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>🟢 High Interest</span>
  if (scans >= 5 && leads >= 1)
    return <span style={{ fontSize: 10, fontWeight: 700, color: '#CA8A04', background: '#FEFCE8', border: '1px solid #FDE047', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>🟡 Moderate</span>
  return <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>🔴 Low Interest</span>
}

// ── Motivation badge ──────────────────────────────────────────────────────────
function MotivBadge({ level }: { level: string }) {
  const m = MOTIV[level]
  if (!m) return null
  return <span style={{ fontSize: 10, fontWeight: 700, color: m.color, background: m.bg, border: `1px solid ${m.border}40`, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap' }}>{m.label}</span>
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
  const [recentLeads,      setRecentLeads]       = useState<any[]>([])
  const [totalLeads,       setTotalLeads]        = useState(0)
  const [totalScansAll,    setTotalScansAll]     = useState(0)
  const [propScanCounts,   setPropScanCounts]    = useState<Record<string, number>>({})
  const [propLeadCounts,   setPropLeadCounts]    = useState<Record<string, number>>({})
  const [propThumbs,       setPropThumbs]        = useState<Record<string, string>>({})
  const [propHotLeads,     setPropHotLeads]      = useState<Record<string, number>>({})
  const [propPacketCounts, setPropPacketCounts]  = useState<Record<string, number>>({})
  const [pipelineCounts,   setPipelineCounts]    = useState<Record<string, number>>({ hot: 0, motivated: 0, warm: 0, cold: 0 })
  const [topPropId,        setTopPropId]         = useState<string | null>(null)
  const [activityFeed,     setActivityFeed]      = useState<Array<{ icon: string; label: string; created_at: string }>>([])
  const [totalPacketCount, setTotalPacketCount]  = useState(0)
  const [lastMonthLeads,   setLastMonthLeads]    = useState(0)
  const [prevMonthScans,   setPrevMonthScans]    = useState(0)
  const [scanSparkline,    setScanSparkline]     = useState<number[]>([])
  const [leadSparkline,    setLeadSparkline]     = useState<number[]>([])
  const [profileName,      setProfileName]       = useState('')
  const [loading,          setLoading]           = useState(true)
  const [copiedReport,     setCopiedReport]      = useState(false)
  const [origin,           setOrigin]            = useState('')

  useEffect(() => { setOrigin(window.location.origin) }, [])

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }

      const { data: profile } = await supabase.from('profiles').select('plan, name').eq('id', session.user.id).single()
      setProfileName(profile?.name || '')

      const { data: props } = await supabase.from('properties').select('id, address, city, state, active, packet_enabled')
        .eq('user_id', session.user.id).order('created_at', { ascending: false })
      if (!props) return // query failed — stay on dashboard, don't redirect
      if (props.length === 0) { router.push('/dashboard/onboarding'); return }
      setProperties(props)

      const ids = props.map((p: any) => p.id)
      const thisMonthStart = new Date(); thisMonthStart.setDate(1); thisMonthStart.setHours(0, 0, 0, 0)
      const lastMonthStart = new Date(thisMonthStart); lastMonthStart.setMonth(lastMonthStart.getMonth() - 1)
      const monthISO       = thisMonthStart.toISOString()
      const lastMonthISO   = lastMonthStart.toISOString()

      const [
        { data: qrData },
        { data: recentLeadsData },
        { count: totalLeadsCount },
        { data: leadsPerProp },
        { data: thumbData },
        { data: recentScansData },
        { data: recentPacketData },
        prevLeadsResult,
        prevScansResult,
      ] = await Promise.all([
        supabase.from('qrcodes').select('id, label, property_id, scan_count').in('property_id', ids),
        supabase.from('leads').select('*').in('property_id', ids).order('created_at', { ascending: false }).limit(20),
        supabase.from('leads').select('*', { count: 'exact', head: true }).in('property_id', ids),
        supabase.from('leads').select('property_id, motivation, created_at').in('property_id', ids),
        supabase.from('property_photos').select('property_id, url').in('property_id', ids).order('sort_order', { ascending: true }),
        supabase.from('scan_events').select('property_id, created_at, return_visit').in('property_id', ids).order('created_at', { ascending: false }).limit(50),
        supabase.from('packet_requests').select('property_id, created_at').in('property_id', ids).order('created_at', { ascending: false }).limit(20),
        supabase.from('leads').select('*', { count: 'exact', head: true }).in('property_id', ids).gte('created_at', lastMonthISO).lt('created_at', monthISO),
        supabase.from('scan_events').select('*', { count: 'exact', head: true }).in('property_id', ids).gte('created_at', lastMonthISO).lt('created_at', monthISO),
      ])

      // Maps
      const scanMap: Record<string, number> = {}
      ;(qrData || []).forEach((q: any) => { scanMap[q.property_id] = (scanMap[q.property_id] || 0) + (q.scan_count || 0) })

      const leadMap: Record<string, number> = {}
      const hotByProp: Record<string, number> = {}
      const pipeline: Record<string, number> = { hot: 0, motivated: 0, warm: 0, cold: 0 }
      const monthLeadsByProp: Record<string, number> = {}
      ;(leadsPerProp || []).forEach((l: any) => {
        leadMap[l.property_id] = (leadMap[l.property_id] || 0) + 1
        if (l.motivation && pipeline[l.motivation] !== undefined) pipeline[l.motivation]++
        if (l.motivation === 'hot') hotByProp[l.property_id] = (hotByProp[l.property_id] || 0) + 1
        if (l.created_at >= monthISO) monthLeadsByProp[l.property_id] = (monthLeadsByProp[l.property_id] || 0) + 1
      })
      const topEntry = Object.entries(monthLeadsByProp).sort((a, b) => b[1] - a[1])[0]

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
      const motivIcon: Record<string, string> = { hot: '🔥', motivated: '⚡', warm: '👍', cold: '❄️' }
      const motivText: Record<string, string> = { hot: 'Hot lead at', motivated: 'Motivated buyer at', warm: 'New warm lead at', cold: 'New lead at' }
      const feedItems: Array<{ icon: string; label: string; created_at: string }> = [
        ...(recentLeadsData || []).map((l: any) => ({ icon: motivIcon[l.motivation] ?? '👤', label: `${motivText[l.motivation] ?? 'New lead at'} ${propAddr[l.property_id] ?? '—'}`, created_at: l.created_at })),
        ...(recentScansData || []).map((e: any) => ({ icon: e.return_visit ? '↩️' : '📱', label: `${e.return_visit ? 'Buyer returned to' : 'Buyer scanned'} ${propAddr[e.property_id] ?? '—'}`, created_at: e.created_at })),
        ...((recentPacketData as any[] || []).map((r: any) => ({ icon: '📄', label: `Packet request at ${propAddr[r.property_id] ?? '—'}`, created_at: r.created_at }))),
      ]
      feedItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      // Packet counts per property
      const pkByProp: Record<string, number> = {}
      let pkTotal = 0
      ;(recentPacketData as any[] || []).forEach((r: any) => { pkByProp[r.property_id] = (pkByProp[r.property_id] || 0) + 1; pkTotal++ })
      // Try full packet count
      try {
        const { count: pkCount } = await supabase.from('packet_requests').select('*', { count: 'exact', head: true }).in('property_id', ids)
        setTotalPacketCount(pkCount || 0)
        const { data: pkAllData } = await supabase.from('packet_requests').select('property_id').in('property_id', ids)
        const fullPkMap: Record<string, number> = {}
        ;(pkAllData || []).forEach((r: any) => { fullPkMap[r.property_id] = (fullPkMap[r.property_id] || 0) + 1 })
        setPropPacketCounts(fullPkMap)
      } catch { setTotalPacketCount(pkTotal); setPropPacketCounts(pkByProp) }

      setProperties(props)
      setRecentLeads((recentLeadsData || []).slice(0, 5))
      setTotalLeads(totalLeadsCount || 0)
      setTotalScansAll((qrData || []).reduce((s: number, q: any) => s + (q.scan_count || 0), 0))
      setPropScanCounts(scanMap)
      setPropLeadCounts(leadMap)
      setPropThumbs(thumbMap)
      setPropHotLeads(hotByProp)
      setPipelineCounts(pipeline)
      setTopPropId(topEntry?.[0] ?? null)
      setActivityFeed(feedItems.slice(0, 10))
      setLastMonthLeads(prevLeadsResult.count || 0)
      setPrevMonthScans(prevScansResult.count || 0)
      setLoading(false)
    }
    load()
  }, [])

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
  const topPropLeads    = topPropId ? (propLeadCounts[topPropId] || 0) : 0

  const hotLeads        = recentLeads.filter(l => l.motivation === 'hot' || l.motivation === 'motivated').slice(0, 3)
  const propNameMap: Record<string, string> = {}
  properties.forEach((p: any) => { propNameMap[p.id] = p.address })

  // AI insight
  const otherProps   = properties.filter(p => p.id !== topPropId)
  const otherAvg     = otherProps.length > 0 ? otherProps.reduce((s, p) => s + (propLeadCounts[p.id] || 0), 0) / otherProps.length : 0
  const aiRatio      = otherAvg > 0 && topPropLeads > 0 ? Math.round((topPropLeads / otherAvg) * 10) / 10 : 0
  const showAiBanner = properties.length >= 2 && topProp && aiRatio > 1 && otherProps.some(p => (propLeadCounts[p.id] || 0) > 0)

  // Donut segments
  const donutSegments = [
    { key: 'hot',       value: pipelineCounts.hot || 0,       color: '#EF4444', label: '🔥 Hot' },
    { key: 'motivated', value: pipelineCounts.motivated || 0, color: '#F97316', label: '⚡ Motivated' },
    { key: 'warm',      value: pipelineCounts.warm || 0,      color: '#60A5FA', label: '👍 Warm' },
    { key: 'cold',      value: pipelineCounts.cold || 0,      color: '#6B7280', label: '❄️ Cold' },
  ]

  return (
    <DashboardLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .db-kpi4    { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; }
        .db-mid3    { display: grid; grid-template-columns: 2fr 1.6fr 1fr; gap: 14px; }
        .db-bot2    { display: grid; grid-template-columns: 1fr 340px; gap: 14px; }
        .prop-row   { display: grid; grid-template-columns: 48px 1fr auto; gap: 12px; align-items: center; }
        .db-hover   { transition: background 0.1s; }
        .db-hover:hover { background: #1E1E2A !important; }
        @media (max-width: 1100px) {
          .db-mid3  { grid-template-columns: 1fr 1fr !important; }
          .db-bot2  { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 860px) {
          .db-kpi4  { grid-template-columns: repeat(2,1fr) !important; }
          .db-mid3  { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 500px) {
          .db-kpi4  { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      {loading ? (
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
                {greeting}{firstName ? `, ${firstName}` : ''}! 👋
              </h1>
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Here's what's happening with your properties.</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 13px' }}>
                <span style={{ fontSize: 14 }}>📅</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.sub }}>{monthRange}</span>
              </div>
              <div style={{ position: 'relative' }}>
                <div style={{ width: 36, height: 36, background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, cursor: 'pointer' }}>🔔</div>
                {hotCount > 0 && (
                  <div style={{ position: 'absolute', top: -4, right: -4, background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 800, borderRadius: 10, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{hotCount}</div>
                )}
              </div>
            </div>
          </div>

          {/* ── SECTION 2: KPI Cards ── */}
          <div className="db-kpi4">
            <KpiCard icon="🔍" label="QR Scans"             value={totalScansAll}    change={scanChange}  accent={ACCENT.purple} sparkData={scanSparkline} />
            <KpiCard icon="👥" label="New Leads"            value={totalLeads}       change={leadChange}  accent={ACCENT.green}  sparkData={leadSparkline} />
            <KpiCard icon="💬" label="Showing Requests"     value={hotCount}         change={null}        accent={ACCENT.blue}   sparkData={scanSparkline.map((_, i) => i % 3 === 0 ? 1 : 0)} />
            <KpiCard icon="📄" label="Disclosure Requests"  value={totalPacketCount} change={null}        accent={ACCENT.amber}  />
          </div>

          {/* ── SECTION 3: Three-column middle ── */}
          <div className="db-mid3">

            {/* Hot Leads */}
            <Card>
              <CardHead
                title="🔥 Hot Leads Need Attention"
                action={<Link href="/dashboard/leads" style={{ fontSize: 11, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>View all →</Link>}
              />
              <div>
                {hotLeads.length === 0 ? (
                  <div style={{ padding: '32px 18px', textAlign: 'center', color: C.muted, fontSize: 13 }}>No hot or motivated leads yet.</div>
                ) : (
                  hotLeads.map((lead: any, i: number) => (
                    <div key={lead.id} className="db-hover" style={{ padding: '12px 18px', borderBottom: i < hotLeads.length - 1 ? `1px solid ${C.border}` : 'none', background: C.card }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                          background: MOTIV[lead.motivation]?.bg ?? C.card,
                          border: `2px solid ${MOTIV[lead.motivation]?.border ?? C.border}40`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: MOTIV[lead.motivation]?.color ?? C.muted,
                        }}>{(lead.name || '??').slice(0, 2).toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{lead.name || 'Unknown'}</span>
                            <MotivBadge level={lead.motivation} />
                          </div>
                          <div style={{ fontSize: 11, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            📍 {propNameMap[lead.property_id] || '—'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span style={{ fontSize: 10, color: C.muted }}>{timeAgo(lead.created_at)}</span>
                          {lead.phone && (
                            <a href={`tel:${lead.phone}`} style={{ width: 28, height: 28, borderRadius: 7, background: `${C.purple}20`, border: `1px solid ${C.purple}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, textDecoration: 'none' }}>📞</a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Lead Pipeline Donut */}
            <Card>
              <CardHead title="Lead Pipeline" />
              <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <DonutChart segments={donutSegments} total={totalLeads} />
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {donutSegments.map(seg => {
                    const pct = totalLeads > 0 ? Math.round((seg.value / totalLeads) * 100) : 0
                    return (
                      <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: C.sub, flex: 1 }}>{seg.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{seg.value}</span>
                        <span style={{ fontSize: 11, color: C.muted, minWidth: 32, textAlign: 'right' }}>{pct}%</span>
                      </div>
                    )
                  })}
                </div>
                <p style={{ fontSize: 11, color: C.muted, margin: 0, textAlign: 'center' }}>Based on buyer intent &amp; engagement</p>
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
                  activityFeed.slice(0, 6).map((ev, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 16px', borderBottom: i < 5 ? `1px solid ${C.border}` : 'none' }}>
                      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{ev.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.label}</div>
                        <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{timeAgo(ev.created_at)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          {/* ── SECTION 4+5: Properties + Seller Report ── */}
          <div className="db-bot2">

            {/* Properties list */}
            <Card>
              <CardHead
                title={`Your Properties (${properties.length})`}
                action={<Link href="/dashboard/properties" style={{ fontSize: 11, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>View all →</Link>}
              />
              {properties.length === 0 ? (
                <div style={{ padding: '32px 18px', textAlign: 'center', color: C.muted, fontSize: 13 }}>No properties yet. <Link href="/dashboard/new-property" style={{ color: C.purpleL }}>Add one →</Link></div>
              ) : (
                <div>
                  {properties.slice(0, 4).map((p: any, i: number) => {
                    const scans  = propScanCounts[p.id] || 0
                    const leads  = propLeadCounts[p.id] || 0
                    const hot    = propHotLeads[p.id] || 0
                    const packet = propPacketCounts[p.id] || 0
                    const thumb  = propThumbs[p.id]
                    const loc    = [p.city, p.state].filter(Boolean).join(', ')
                    return (
                      <div key={p.id} className="db-hover" style={{ padding: '12px 18px', borderBottom: i < Math.min(properties.length, 4) - 1 ? `1px solid ${C.border}` : 'none', background: C.card }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {thumb ? (
                            <img src={thumb} alt="" style={{ width: 48, height: 48, borderRadius: 9, objectFit: 'cover', flexShrink: 0, border: `1px solid ${C.border}` }} />
                          ) : (
                            <div style={{ width: 48, height: 48, borderRadius: 9, flexShrink: 0, background: `${C.purple}18`, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🏠</div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{p.address}</span>
                              <HealthBadge scans={scans} leads={leads} hot={hot} />
                            </div>
                            {loc && <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>{loc}</div>}
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, color: C.purpleL, fontWeight: 600 }}>{scans} scans</span>
                              <span style={{ fontSize: 11, color: '#FCD34D', fontWeight: 600 }}>{leads} leads</span>
                              {hot > 0 && <span style={{ fontSize: 11, color: '#EF4444', fontWeight: 600 }}>🔥 {hot} showing</span>}
                              {packet > 0 && <span style={{ fontSize: 11, color: '#D97706', fontWeight: 600 }}>📄 {packet}</span>}
                            </div>
                          </div>
                          <Link href="/dashboard/properties" style={{ fontSize: 11, fontWeight: 700, color: C.purpleL, textDecoration: 'none', background: `${C.purple}18`, border: `1px solid ${C.purple}30`, borderRadius: 7, padding: '5px 10px', flexShrink: 0 }}>
                            Details
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                  {properties.length > 4 && (
                    <div style={{ padding: '10px 18px', textAlign: 'center', borderTop: `1px solid ${C.border}` }}>
                      <Link href="/dashboard/properties" style={{ fontSize: 12, color: C.muted, textDecoration: 'none', fontWeight: 600 }}>+{properties.length - 4} more — view all properties</Link>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Seller Report Preview */}
            {topProp ? (
              <Card style={{ alignSelf: 'start' }}>
                <CardHead title="📊 Seller Report Preview" />
                <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {propThumbs[topProp.id] ? (
                    <img src={propThumbs[topProp.id]} alt="" style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 10, display: 'block', border: `1px solid ${C.border}` }} />
                  ) : (
                    <div style={{ width: '100%', height: 72, background: `${C.purple}18`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, border: `1px solid ${C.border}` }}>🏠</div>
                  )}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{topProp.address}</div>
                    <HealthBadge scans={propScanCounts[topProp.id] || 0} leads={propLeadCounts[topProp.id] || 0} hot={propHotLeads[topProp.id] || 0} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'Scans',    value: propScanCounts[topProp.id] || 0, color: C.purpleL },
                      { label: 'Leads',    value: propLeadCounts[topProp.id] || 0, color: '#FCD34D' },
                      { label: 'Showing',  value: propHotLeads[topProp.id] || 0,   color: '#EF4444' },
                      { label: 'Packets',  value: propPacketCounts[topProp.id] || 0, color: '#D97706' },
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
                        await navigator.clipboard.writeText(`${origin}/report/${topProp.id}`).catch(() => {})
                        setCopiedReport(true)
                        setTimeout(() => setCopiedReport(false), 2000)
                      }}
                      style={{ flex: 1, background: copiedReport ? '#052e16' : `${C.purple}20`, border: `1px solid ${copiedReport ? '#166534' : C.purple + '35'}`, borderRadius: 9, padding: '9px', fontSize: 11, fontWeight: 700, color: copiedReport ? '#4ade80' : C.purpleL, cursor: 'pointer', fontFamily: 'sans-serif', transition: 'all 0.15s' }}
                    >
                      {copiedReport ? '✓ Copied!' : '🔗 Share Report'}
                    </button>
                    <a href={`/report/${topProp.id}?print=true`} target="_blank" rel="noreferrer"
                      style={{ flex: 1, background: '#2563EB', borderRadius: 9, padding: '9px', fontSize: 11, fontWeight: 700, color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      ⬇ PDF
                    </a>
                  </div>
                  <Link href={`/report/${topProp.id}`} style={{ fontSize: 12, color: C.purpleL, textDecoration: 'none', fontWeight: 600, textAlign: 'center' }}>View full report →</Link>
                </div>
              </Card>
            ) : (
              <Card style={{ alignSelf: 'start' }}>
                <CardHead title="📊 Seller Report Preview" />
                <div style={{ padding: '32px 18px', textAlign: 'center', color: C.muted, fontSize: 13 }}>Capture leads to unlock your top performing listing preview.</div>
              </Card>
            )}
          </div>

          {/* ── SECTION 6: AI Insight Banner ── */}
          {showAiBanner && (
            <div style={{ background: 'linear-gradient(135deg, #2D1A5E 0%, #1A1A24 100%)', border: `1px solid ${C.purple}40`, borderRadius: 16, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', animation: 'fadeUp 0.4s ease' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: `${C.purple}30`, border: `1px solid ${C.purple}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>✨</div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.purpleL, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>AI Insight</div>
                  <div style={{ fontSize: 14, color: C.text, lineHeight: 1.6, maxWidth: 580 }}>
                    <strong>{topProp?.address}</strong> is performing <strong style={{ color: C.purpleL }}>{aiRatio}×</strong> better than your other listings. Consider boosting this property in your marketing campaigns.
                  </div>
                </div>
              </div>
              <Link href="/dashboard/analytics" style={{ background: C.purple, color: '#fff', fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 10, textDecoration: 'none', flexShrink: 0 }}>
                View Recommendations →
              </Link>
            </div>
          )}

        </div>
      )}
    </DashboardLayout>
  )
}
