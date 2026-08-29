'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { calcPropertyInterest } from '../../../lib/propertyInterest'
import { timeAgo } from '../../../lib/timeAgo'
import { motivationToTierV2, requestedShowing } from '../../../lib/leadScoringV2'

// App default agent timezone (matches the SMS quiet-hours default). No per-agent
// timezone is stored, so peak-engagement grouping uses this for UTC→local.
const AGENT_TZ = 'America/Los_Angeles'

const C = {
  bg: '#0F0F13', card: '#1A1A24', cardAlt: '#15151E', border: '#252533',
  purple: '#7C3AED', purpleL: '#8B5CF6',
  text: '#FFFFFF', sub: '#C4C4D4', muted: '#6B7280',
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string, opts?: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleDateString('en-US', opts ?? { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getDailyCount(items: any[], days = 14): number[] {
  const counts = Array(days).fill(0)
  const now = Date.now()
  items.forEach(item => {
    const daysAgo = Math.floor((now - new Date(item.created_at).getTime()) / 86400000)
    if (daysAgo >= 0 && daysAgo < days) counts[days - 1 - daysAgo]++
  })
  return counts
}

function safePct(curr: number, prev: number) {
  if (prev === 0) return curr > 0 ? 100 : 0
  return Math.round(((curr - prev) / prev) * 100)
}

// ── Peak-engagement helpers (timezone-aware) ───────────────────────────────────
const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DOW_FULL   = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DOW_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
const TIME_BLOCKS = [
  { key: 'Morning',   sub: '6am–12pm' },
  { key: 'Midday',    sub: '12–3pm'   },
  { key: 'Afternoon', sub: '3–7pm'    },
  { key: 'Evening',   sub: '7pm–12am' },
] as const

// Weekday (0=Mon..6=Sun) and hour (0-23) of a UTC timestamp in the agent's tz.
function tzWeekdayHour(iso: string): { wd: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: AGENT_TZ, weekday: 'short', hour: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const wdStr = parts.find(p => p.type === 'weekday')?.value ?? 'Mon'
  let hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0')
  if (hour === 24) hour = 0 // some ICU builds emit '24' for midnight
  return { wd: DOW_INDEX[wdStr] ?? 0, hour }
}

// 0=Morning,1=Midday,2=Afternoon,3=Evening. Overnight (0–6) folds into Evening
// so no scans are dropped from the distribution.
function timeBlockIndex(hour: number): number {
  if (hour >= 6 && hour < 12) return 0
  if (hour >= 12 && hour < 15) return 1
  if (hour >= 15 && hour < 19) return 2
  return 3
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const H = 28, W = 100
  const max = Math.max(...data, 1)
  const pts = data.map((v, i) => {
    const x = data.length < 2 ? W / 2 : (i / (data.length - 1)) * W
    const y = H - 2 - ((v / max) * (H - 4))
    return `${x},${y}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function KpiCard({ icon, label, value, change, sparkData, color }: {
  icon: string; label: string; value: number; change: number | null; sparkData: number[]; color: string
}) {
  const pos = change !== null && change >= 0
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 16px 14px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.3 }}>{label}</span>
      </div>
      <div style={{ fontSize: 34, fontWeight: 900, color: C.text, lineHeight: 1, marginBottom: 5, letterSpacing: '-0.02em' }}>{value.toLocaleString()}</div>
      {change !== null && (
        <div style={{ fontSize: 11, fontWeight: 600, color: pos ? '#4ade80' : '#F87171', marginBottom: 10 }}>
          {pos ? '↑' : '↓'} {Math.abs(change)}% vs last month
        </div>
      )}
      <div style={{ opacity: 0.6 }}><Sparkline data={sparkData} color={color} /></div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SellerReportPage() {
  const params      = useParams()
  const searchParams = useSearchParams()
  // The URL segment is properties.report_token — a private credential, NOT the
  // property id. Buyer-facing links below must use the resolved property.id
  // from the API response instead; these two must never be conflated.
  const reportToken = params.token as string

  const [report,   setReport]   = useState<any>(null)
  const [loading,  setLoading]  = useState(true)
  const [missing,  setMissing]  = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied,   setCopied]   = useState(false)
  const [toast,    setToast]    = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/report/${reportToken}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.property) { setMissing(true); setLoading(false); return }
        setReport(d)
        setLoading(false)
      })
      .catch(() => { setMissing(true); setLoading(false) })
  }, [reportToken])

  // Auto-print on ?print=true
  useEffect(() => {
    if (searchParams.get('print') === 'true') {
      const t = setTimeout(() => window.print(), 800)
      return () => clearTimeout(t)
    }
  }, [searchParams])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const copyURL = async () => {
    try { await navigator.clipboard.writeText(window.location.href) } catch {}
    setCopied(true); setTimeout(() => setCopied(false), 2500)
  }

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  if (loading) {
    return (
      <main style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: `2px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </main>
    )
  }

  if (missing) {
    return (
      <main style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center', color: C.muted }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏠</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Report not found</div>
          <Link href="/dashboard/properties" style={{ color: C.purpleL }}>← Back to Properties</Link>
        </div>
      </main>
    )
  }

  const { property, photo, agent, leads, scanEvents, qrCodes, totalScanCount, uniqueVisitCount } = report

  // ── Derived values ────────────────────────────────────────────────────────
  const now            = new Date()
  const msPerDay       = 86_400_000
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  // Must be defined before the KPI counts below so it's in scope.
  // Resolves V2 tier first; falls back to V1 motivation for legacy rows.
  // Dedup: this used to reimplement the tier/motivation fallback inline. Same
  // behavior, now backed by the single source of truth (lib/leadScoringV2).
  const tierOf = (l: any): 'hot' | 'warm' | 'cold' =>
    l.tier === 'hot' || l.tier === 'warm' || l.tier === 'cold' ? l.tier : motivationToTierV2(l.motivation)

  const totalScans       = scanEvents.length
  // Before fix: counted scan_events with photos_viewed>0 OR time_on_page_sec>60 — both
  // columns are NULL on unconverted scans (createLead path never writes them), so this
  // always returned 0 even with 12 hot leads. After fix: counts leads with real engagement
  // (hot or warm tier), which is a meaningful signal independent of scan_events columns.
  const engagedBuyers    = leads.filter((l: any) => tierOf(l) === 'hot' || tierOf(l) === 'warm').length
  console.log('[seller-report] engagedBuyers (before was 0, now):', engagedBuyers, '| total leads:', leads.length)
  const showingRequests  = leads.filter(requestedShowing).length
  const buyerQuestions   = leads.filter((l: any) => l.has_notes).length
  const returnVisitors   = scanEvents.filter((e: any) => e.return_visit).length
  const photoViewers     = scanEvents.filter((e: any) => (e.photos_viewed ?? 0) >= 5).length

  const thisMonthScans    = scanEvents.filter((e: any) => new Date(e.created_at) >= thisMonthStart).length
  const lastMonthScans    = scanEvents.filter((e: any) => { const d = new Date(e.created_at); return d >= lastMonthStart && d < thisMonthStart }).length
  const thisMonthEngaged  = leads.filter((l: any) => (tierOf(l) === 'hot' || tierOf(l) === 'warm') && new Date(l.created_at) >= thisMonthStart).length
  const lastMonthEngaged  = leads.filter((l: any) => { const d = new Date(l.created_at); const t = tierOf(l); return (t === 'hot' || t === 'warm') && d >= lastMonthStart && d < thisMonthStart }).length
  const thisMonthShowings = leads.filter((l: any) => requestedShowing(l) && new Date(l.created_at) >= thisMonthStart).length
  const lastMonthShowings = leads.filter((l: any) => { const d = new Date(l.created_at); return requestedShowing(l) && d >= lastMonthStart && d < thisMonthStart }).length
  const thisMonthQuestions = leads.filter((l: any) => l.has_notes && new Date(l.created_at) >= thisMonthStart).length
  const lastMonthQuestions = leads.filter((l: any) => { const d = new Date(l.created_at); return l.has_notes && d >= lastMonthStart && d < thisMonthStart }).length

  // Sparklines
  const scanSparkData     = getDailyCount(scanEvents, 14)
  const engagedSparkData  = getDailyCount(scanEvents.filter((e: any) => (e.photos_viewed ?? 0) > 0 || (e.time_on_page_sec ?? 0) > 60), 14)
  const showingSparkData  = getDailyCount(leads.filter(requestedShowing), 14)
  const questionSparkData = getDailyCount(leads.filter((l: any) => l.has_notes), 14)

  // Health — shared formula via calcPropertyInterest
  const health = calcPropertyInterest({ totalLeads: leads.length, totalScans, showingRequests })

  // Date range
  const createdAt    = new Date(property.created_at)
  const listingDays  = Math.max(1, Math.ceil((now.getTime() - createdAt.getTime()) / msPerDay))
  const showComparison = listingDays >= 30
  const dateRangeStr = `${fmtDateShort(property.created_at)} – ${fmtDateShort(now.toISOString())}`
  const location     = [property.city, property.state].filter(Boolean).join(', ')

  // Agent message
  const agentName = property.agent_name || 'Your Agent'
  const agentMessage = [
    `Hi,`,
    ``,
    `Your home at ${property.address} is generating strong buyer interest. In the last ${listingDays} day${listingDays !== 1 ? 's' : ''}, ${totalScanCount} buyer${totalScanCount !== 1 ? 's' : ''} scanned your QR sign${showingRequests > 0 ? `, ${showingRequests} requested a showing` : ''}.`,
    ``,
    `Let me know if you have any questions.`,
    ``,
    `— ${agentName}`,
  ].join('\n')

  // Recent buyer activity — grouped by type so identical rows don't repeat.
  type AEvent = { icon: string; text: string; time: string; color: string; dot: string }
  const activityEvents: AEvent[] = (() => {
    const events: AEvent[] = []
    const showingLeads = leads.filter(requestedShowing)
    if (showingLeads.length === 1) {
      events.push({ icon: '📅', text: 'Buyer requested a showing', time: showingLeads[0].created_at, color: '#EF4444', dot: '#EF4444' })
    } else if (showingLeads.length > 1) {
      events.push({ icon: '📅', text: `${showingLeads.length} buyers requested a showing`, time: showingLeads[0].created_at, color: '#EF4444', dot: '#EF4444' })
    }
    const questionLeads = leads.filter((l: any) => l.has_notes)
    if (questionLeads.length === 1) {
      events.push({ icon: '💬', text: 'Buyer asked a question about the property', time: questionLeads[0].created_at, color: '#10B981', dot: '#10B981' })
    } else if (questionLeads.length > 1) {
      events.push({ icon: '💬', text: `${questionLeads.length} buyers asked questions about the property`, time: questionLeads[0].created_at, color: '#10B981', dot: '#10B981' })
    }
    const returnVisits = scanEvents.filter((e: any) => e.return_visit)
    if (returnVisits.length === 1) {
      events.push({ icon: '↩️', text: 'Buyer returned to view this listing again', time: returnVisits[0].created_at, color: '#8B5CF6', dot: '#8B5CF6' })
    } else if (returnVisits.length > 1) {
      events.push({ icon: '↩️', text: `${returnVisits.length} buyers returned for a second look`, time: returnVisits[0].created_at, color: '#8B5CF6', dot: '#8B5CF6' })
    }
    const photoViewers = scanEvents.filter((e: any) => !e.return_visit && (e.photos_viewed ?? 0) >= 5)
    if (photoViewers.length === 1) {
      events.push({ icon: '📸', text: 'Buyer viewed all photos', time: photoViewers[0].created_at, color: '#14B8A6', dot: '#14B8A6' })
    } else if (photoViewers.length > 1) {
      events.push({ icon: '📸', text: `${photoViewers.length} buyers viewed all photos`, time: photoViewers[0].created_at, color: '#14B8A6', dot: '#14B8A6' })
    }
    const newScans = scanEvents.filter((e: any) => !e.return_visit && (e.photos_viewed ?? 0) < 5)
    if (newScans.length === 1) {
      events.push({ icon: '📱', text: 'New buyer discovered this listing', time: newScans[0].created_at, color: '#F97316', dot: '#F97316' })
    } else if (newScans.length > 1) {
      events.push({ icon: '📱', text: `${newScans.length} new buyers discovered this listing`, time: newScans[0].created_at, color: '#F97316', dot: '#F97316' })
    }
    return events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
  })()

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
    overflow: 'hidden', minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  }

  const menuItemStyle: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
    color: C.sub, fontSize: 13, padding: '10px 16px', cursor: 'pointer', fontFamily: 'sans-serif',
    textDecoration: 'none', boxSizing: 'border-box',
  }

  const outlineBtn: React.CSSProperties = {
    background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 10,
    color: C.sub, fontSize: 13, fontWeight: 600, padding: '10px 18px',
    cursor: 'pointer', fontFamily: 'sans-serif', textDecoration: 'none',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1,
  }

  const initials = (agentName).split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()

  // ── Seller-report analytics ────────────────────────────────────────────────
  // Headline: total unique buyer visits (distinct devices, all-time). Falls back
  // to a windowed estimate from the returned events if the count is absent.
  const uniqueVisits = typeof uniqueVisitCount === 'number'
    ? uniqueVisitCount
    : scanEvents.filter((e: any) => !e.return_visit).length

  // Lead quality by V2 tier (tierOf defined above)
  const hotCount  = leads.filter((l: any) => tierOf(l) === 'hot').length
  const warmCount = leads.filter((l: any) => tierOf(l) === 'warm').length
  const coldCount = leads.filter((l: any) => tierOf(l) === 'cold').length

  // Weekly buyer activity — last 8 weeks (oldest → newest)
  const WEEKS = 8
  const nowMs = now.getTime()
  const weeklyData = Array.from({ length: WEEKS }, (_, i) => {
    const d = new Date(nowMs - (WEEKS - 1 - i) * 7 * 86_400_000)
    return { week: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), Visits: 0 }
  })
  scanEvents.forEach((e: any) => {
    const wAgo = Math.floor((nowMs - new Date(e.created_at).getTime()) / (7 * 86_400_000))
    if (wAgo >= 0 && wAgo < WEEKS) weeklyData[WEEKS - 1 - wAgo].Visits++
  })

  // Peak engagement — day-of-week + time-block distribution (tz-aware)
  const dowCounts   = [0, 0, 0, 0, 0, 0, 0]
  const blockCounts = [0, 0, 0, 0]
  scanEvents.forEach((e: any) => {
    const { wd, hour } = tzWeekdayHour(e.created_at)
    dowCounts[wd]++
    blockCounts[timeBlockIndex(hour)]++
  })
  const peakTotal    = scanEvents.length
  const peakDowIdx   = peakTotal ? dowCounts.indexOf(Math.max(...dowCounts)) : -1
  const peakDowPct   = peakTotal ? Math.round((dowCounts[peakDowIdx] / peakTotal) * 100) : 0
  const peakBlockIdx = peakTotal ? blockCounts.indexOf(Math.max(...blockCounts)) : -1
  const peakBlockPct = peakTotal ? Math.round((blockCounts[peakBlockIdx] / peakTotal) * 100) : 0
  const dowMax       = Math.max(1, ...dowCounts)
  const blockMax     = Math.max(1, ...blockCounts)

  // Sign performance — real per-sign scan counts from scan_events.sign_id
  // (qrcodes.scan_count lived on the now-empty/retired qrcodes table).
  const signCounts: Record<string, number> = {}
  scanEvents.forEach((e: any) => { if (e.sign_id) signCounts[e.sign_id] = (signCounts[e.sign_id] || 0) + 1 })
  const signRows = (qrCodes || [])
    .map((q: any) => ({ id: q.id, label: q.label || 'Unnamed sign', scans: signCounts[q.id] || 0 }))
    .sort((a: any, b: any) => b.scans - a.scans)
  const topSignId  = signRows.length && signRows[0].scans > 0 ? signRows[0].id : null
  const signMax    = Math.max(1, ...signRows.map((s: any) => s.scans))
  const agentPhone = property.agent_phone || ''

  return (
    <main style={{ background: C.bg, minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: C.text }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: none } }
        .rpt-mitem:hover { background: rgba(255,255,255,0.05) !important }
        @media (max-width: 900px) { .rpt-2col { grid-template-columns: 1fr !important } .rpt-5col { grid-template-columns: 1fr 1fr !important } }
        @media (max-width: 600px) { .rpt-5col { grid-template-columns: 1fr !important } .rpt-hero { flex-direction: column !important } .rpt-share { flex-direction: column !important } .rpt-nav-center { display: none !important } }
        @media print {
          /* Hide all interactive chrome — nav, buttons, share card */
          .no-print { display: none !important }
          nav { display: none !important }
          /* Drop sticky/fixed positioning so content flows onto pages */
          * { position: static !important }
          /* Preserve theme colors + charts (recharts SVGs print fine) */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important }
          html, body { background: ${C.bg} !important }
          main { background: ${C.bg} !important }
          /* Avoid splitting cards across page breaks where possible */
          .rpt-card, .rpt-hero { break-inside: avoid; page-break-inside: avoid }
          @page { margin: 14mm }
        }
      `}</style>

      {/* ── Toast ────────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: '10px 20px', fontSize: 13, color: C.text, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)', animation: 'fadeIn 0.2s ease',
        }}>
          {toast}
        </div>
      )}

      {/* ── Sticky Nav ───────────────────────────────────────────────────────── */}
      <nav className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: C.bg, borderBottom: `1px solid ${C.border}`,
        padding: '12px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        {/* Logo */}
        <div style={{ flexShrink: 0 }}>
          <a href="https://theqrealtor.com" style={{ fontSize: 17, fontWeight: 900, color: C.text, letterSpacing: '-0.02em', textDecoration: 'none' }}>
            the<span style={{ color: C.purpleL }}>QR</span>ealtor.
          </a>
        </div>

        {/* Breadcrumb */}
        <div className="rpt-nav-center" style={{ fontSize: 12, color: C.muted, textAlign: 'center' }}>
          <Link href="/dashboard/properties" style={{ color: C.muted, textDecoration: 'none' }}>Seller Reports</Link>
          <span style={{ margin: '0 6px' }}>›</span>
          <span style={{ color: C.sub, fontWeight: 600 }}>{property.address}</span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <a href={`/p/${property.id}`} target="_blank" rel="noreferrer" style={{
            fontSize: 12, fontWeight: 600, color: C.sub, textDecoration: 'none',
            border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 13px',
          }}>
            👁 Preview as Buyer
          </a>
          <button
            onClick={copyURL}
            style={{
              fontSize: 12, fontWeight: 700,
              background: copied ? '#052e16' : C.purple,
              color: copied ? '#4ade80' : '#fff',
              border: 'none', borderRadius: 8, padding: '8px 16px',
              cursor: 'pointer', fontFamily: 'sans-serif',
            }}
          >
            {copied ? '✓ Copied!' : 'Share Report Link'}
          </button>

          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              style={{ background: '#1F1F2E', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 16, color: C.muted, cursor: 'pointer', lineHeight: 1 }}
            >⋮</button>
            {menuOpen && (
              <div style={dropdownStyle}>
                <a href={`/p/${property.id}`} target="_blank" rel="noreferrer" className="rpt-mitem" style={menuItemStyle} onClick={() => setMenuOpen(false)}>🔗 View Property Page</a>
                <a href={`/report/${reportToken}?print=true`} target="_blank" rel="noreferrer" className="rpt-mitem" style={menuItemStyle} onClick={() => setMenuOpen(false)}>⬇ Download PDF</a>
                <button className="rpt-mitem" style={menuItemStyle} onClick={() => { setMenuOpen(false); window.print() }}>🖨 Print Report</button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ── Below-nav header ─────────────────────────────────────────────────── */}
      <div style={{ padding: '18px 28px 0', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: C.text, letterSpacing: '-0.02em' }}>
            Seller Report
          </h1>
          <span style={{
            fontSize: 12, fontWeight: 700, color: health.color, background: health.bg,
            border: `1px solid ${health.color}40`, borderRadius: 20, padding: '3px 12px',
          }}>
            {health.badgeLabel}
          </span>
          <button
            className="no-print"
            onClick={() => window.print()}
            style={{
              marginLeft: 'auto', fontSize: 13, fontWeight: 700,
              background: C.purple, color: '#fff', border: 'none', borderRadius: 9,
              padding: '8px 16px', cursor: 'pointer', fontFamily: 'sans-serif',
            }}
          >
            ⬇ Download PDF
          </button>
        </div>
        <div style={{ fontSize: 12, color: C.muted, paddingBottom: 14 }}>
          📅 {dateRangeStr} &nbsp;|&nbsp; {listingDays} day{listingDays !== 1 ? 's' : ''} on market
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 28px 60px' }}>

        {/* ── Property Hero Card ───────────────────────────────────────────── */}
        <div className="rpt-hero" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', display: 'flex', marginBottom: 20, minHeight: 190 }}>
          {/* Photo */}
          <div style={{ width: 240, flexShrink: 0, position: 'relative' }}>
            {photo ? (
              <img src={photo} alt={property.address} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', minHeight: 190, background: `linear-gradient(135deg, ${C.purple}, #5B21B6)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>🏠</div>
            )}
          </div>

          {/* Center info */}
          <div style={{ flex: 1, padding: '22px 24px', borderRight: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 4, letterSpacing: '-0.02em' }}>{property.address}</div>
            {location && (
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>
                {location} · {property.active ? 'Active Listing' : 'Offline'}
              </div>
            )}
            <span style={{
              display: 'inline-block', marginBottom: 12,
              fontSize: 11, fontWeight: 700, color: health.color, background: health.bg,
              border: `1px solid ${health.color}40`, borderRadius: 20, padding: '3px 12px',
            }}>
              {health.badgeLabel}
            </span>
            <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.65, margin: 0 }}>{health.text}</p>
          </div>

          {/* Right: report meta */}
          <div style={{ width: 240, flexShrink: 0, padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Report for</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                {/* Credential stamp — every field is optional; each renders only
                    when present so a partly-filled profile never leaves an
                    empty label or a broken avatar behind. */}
                {agent?.photo_url && (
                  <img
                    src={agent.photo_url}
                    alt={agent.name || 'Listing agent'}
                    style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `1px solid ${C.border}` }}
                  />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{agent?.name || agentName}</div>
                  {agent?.brokerage && (
                    <div style={{ fontSize: 11, color: C.sub, marginTop: 1 }}>{agent.brokerage}</div>
                  )}
                </div>
              </div>
              {(agent?.phone || agent?.dre) && (
                <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
                  {agent?.phone && <div>{agent.phone}</div>}
                  {agent?.dre && <div>DRE# {agent.dre}</div>}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Report created</div>
              <div style={{ fontSize: 12, color: C.sub }}>{now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Report link</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: C.purpleL, fontWeight: 600, wordBreak: 'break-all' }}>
                  theqrealtor.com/report/{reportToken.slice(0, 8)}…
                </span>
                <button
                  onClick={copyURL}
                  title="Copy report link"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, flexShrink: 0, padding: 2 }}
                >📋</button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Live-data badge + last updated ───────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            fontSize: 12, fontWeight: 700, color: C.purpleL,
            background: `${C.purple}18`, border: `1px solid ${C.purple}40`,
            borderRadius: 20, padding: '5px 13px',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 0 3px rgba(74,222,128,0.25)' }} />
            Powered by theqrealtor · Live data
          </span>
          <span style={{ fontSize: 12, color: C.muted }}>
            Last updated {now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>

        {/* ── Headline stats: Total Leads + QR Sign Visits ─────────────────── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '28px', marginBottom: 20 }}>
          <div className="rpt-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            <div style={{ textAlign: 'center', padding: '0 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                Total Leads Captured
              </div>
              <div style={{ fontSize: 56, fontWeight: 900, color: C.text, lineHeight: 1, letterSpacing: '-0.03em', marginBottom: 8 }}>
                {leads.length.toLocaleString()}
              </div>
              <div style={{ fontSize: 13, color: C.sub }}>
                Buyers who reached out about your property
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '0 20px', borderLeft: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                QR Sign Visits
              </div>
              <div style={{ fontSize: 56, fontWeight: 900, color: C.purpleL, lineHeight: 1, letterSpacing: '-0.03em', marginBottom: 8 }}>
                {uniqueVisits.toLocaleString()}
              </div>
              <div style={{ fontSize: 13, color: C.sub }}>
                Buyers who scanned your yard sign
              </div>
            </div>
          </div>
        </div>

        {/* ── Lead quality breakdown ───────────────────────────────────────── */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Lead Quality Breakdown</div>
        </div>
        <div className="rpt-5col" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Hot',      n: hotCount,         desc: 'Ready to move',         color: '#EF4444', icon: '🔥' },
            { label: 'Warm',     n: warmCount,        desc: 'Actively considering',  color: '#F59E0B', icon: '👍' },
            { label: 'Cold',     n: coldCount,        desc: 'Early interest',        color: '#60A5FA', icon: '❄️' },
            { label: 'Showings', n: showingRequests,  desc: 'Requested a tour',      color: '#7C3AED', icon: '📅' },
          ].map(c => (
            <div key={c.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${c.color}`, borderRadius: 14, padding: '16px 16px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{c.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: c.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: C.text, lineHeight: 1, marginBottom: 5 }}>{c.n}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{c.desc}</div>
            </div>
          ))}
        </div>

        {/* ── Buyer activity over time (weekly) ────────────────────────────── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, background: C.cardAlt }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Buyer Activity Over Time</span>
            <span style={{ fontSize: 12, color: C.muted, marginLeft: 8 }}>· last 8 weeks</span>
          </div>
          {listingDays < 30 ? (
            <div style={{ padding: '36px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>📈</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.sub, marginBottom: 6 }}>Building your trend</div>
              <div style={{ fontSize: 12, color: C.muted }}>Check back weekly — your activity chart grows with each buyer scan.</div>
            </div>
          ) : (
            <div style={{ padding: '18px 14px 10px' }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <XAxis dataKey="week" tick={{ fill: C.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: C.muted, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} cursor={{ fill: C.border }} />
                  <Bar dataKey="Visits" fill={C.purpleL} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── Peak engagement ──────────────────────────────────────────────── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, background: C.cardAlt, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Peak Engagement</span>
            <span style={{ fontSize: 14 }}>⚡</span>
            <span style={{ fontSize: 11, color: C.muted, marginLeft: 'auto' }}>times in {AGENT_TZ.split('/')[1].replace('_', ' ')}</span>
          </div>
          <div style={{ padding: '18px' }}>
            {peakTotal === 0 ? (
              <div style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '12px 0' }}>No visit timing data yet.</div>
            ) : (
              <>
                {/* Callouts */}
                <div className="rpt-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                  <div style={{ background: `${C.purple}12`, border: `1px solid ${C.purple}30`, borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Peak Day</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>
                      {DOW_FULL[peakDowIdx]} <span style={{ color: C.purpleL, fontWeight: 700 }}>— {peakDowPct}% of all visits</span>
                    </div>
                  </div>
                  <div style={{ background: `${C.purple}12`, border: `1px solid ${C.purple}30`, borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Peak Time</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>
                      {TIME_BLOCKS[peakBlockIdx].key} <span style={{ color: C.purpleL, fontWeight: 700 }}>— {peakBlockPct}% of visits</span>
                    </div>
                  </div>
                </div>

                {/* Two horizontal bar charts */}
                <div className="rpt-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  {/* Day of week */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>By Day of Week</div>
                    {DOW_LABELS.map((d, i) => (
                      <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: C.muted, width: 30, flexShrink: 0 }}>{d}</span>
                        <div style={{ flex: 1, height: 14, background: C.cardAlt, borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${(dowCounts[i] / dowMax) * 100}%`, height: '100%', background: i === peakDowIdx ? C.purpleL : `${C.purple}66`, borderRadius: 4, transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ fontSize: 11, color: C.sub, width: 20, textAlign: 'right', flexShrink: 0 }}>{dowCounts[i]}</span>
                      </div>
                    ))}
                  </div>
                  {/* Time block */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>By Time of Day</div>
                    {TIME_BLOCKS.map((b, i) => (
                      <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: C.muted, width: 96, flexShrink: 0 }}>{b.key} <span style={{ opacity: 0.6 }}>{b.sub}</span></span>
                        <div style={{ flex: 1, height: 14, background: C.cardAlt, borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${(blockCounts[i] / blockMax) * 100}%`, height: '100%', background: i === peakBlockIdx ? C.purpleL : `${C.purple}66`, borderRadius: 4, transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ fontSize: 11, color: C.sub, width: 20, textAlign: 'right', flexShrink: 0 }}>{blockCounts[i]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Sign performance ─────────────────────────────────────────────── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, background: C.cardAlt }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Sign Performance</span>
            <span style={{ fontSize: 12, color: C.muted, marginLeft: 8 }}>· scans by QR sign</span>
          </div>
          <div style={{ padding: '16px 18px' }}>
            {signRows.length === 0 ? (
              <div style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '12px 0' }}>No QR signs created for this property yet.</div>
            ) : (
              signRows.map((s: any) => {
                const isTop = s.id === topSignId
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 150, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      {isTop && <span style={{ fontSize: 13 }}>🏆</span>}
                      <span style={{ fontSize: 13, fontWeight: isTop ? 700 : 600, color: isTop ? C.text : C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                    </div>
                    <div style={{ flex: 1, height: 18, background: C.cardAlt, borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${(s.scans / signMax) * 100}%`, height: '100%', background: isTop ? C.purpleL : `${C.purple}55`, borderRadius: 5, transition: 'width 0.3s' }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: isTop ? C.purpleL : C.sub, width: 56, textAlign: 'right', flexShrink: 0 }}>
                      {s.scans} scan{s.scans !== 1 ? 's' : ''}
                    </span>
                  </div>
                )
              })
            )}
            {topSignId && (
              <div style={{ marginTop: 4, fontSize: 12, color: C.muted }}>
                🏆 Top performer: <span style={{ color: C.purpleL, fontWeight: 700 }}>{signRows[0].label}</span> is driving the most buyer scans.
              </div>
            )}
          </div>
        </div>

        {/* ── 5 KPI Cards ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Listing Performance Overview</div>
        </div>
        <div className="rpt-5col" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <KpiCard icon="👁" label="QR Scans"              value={totalScans}      change={showComparison ? safePct(thisMonthScans, lastMonthScans) : null}        sparkData={scanSparkData}     color="#60A5FA" />
          <KpiCard icon="👥" label="Engaged Buyers"       value={engagedBuyers}   change={showComparison ? safePct(thisMonthEngaged, lastMonthEngaged) : null}     sparkData={engagedSparkData}  color="#10B981" />
          <KpiCard icon="💬" label="Showing Requests"     value={showingRequests} change={showComparison ? safePct(thisMonthShowings, lastMonthShowings) : null}   sparkData={showingSparkData}  color="#F59E0B" />
          <KpiCard icon="❓" label="Buyer Questions"      value={buyerQuestions}  change={showComparison ? safePct(thisMonthQuestions, lastMonthQuestions) : null} sparkData={questionSparkData} color="#F97316" />
        </div>

        {/* ── Two Columns ──────────────────────────────────────────────────── */}
        <div className="rpt-2col" style={{ display: 'grid', gridTemplateColumns: '55% 1fr', gap: 16, marginBottom: 20 }}>

          {/* What Buyers Are Doing ⭐ */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, background: C.cardAlt, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>What Buyers Are Doing</span>
              <span style={{ fontSize: 14 }}>⭐</span>
            </div>
            <div style={{ padding: '20px 18px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
                {[
                  { show: showingRequests > 0,  icon: '📅', n: showingRequests,  text: `buyer${showingRequests !== 1 ? 's' : ''} requested a showing`,                  color: '#EF4444' },
                  { show: buyerQuestions > 0,    icon: '💬', n: buyerQuestions,    text: `buyer${buyerQuestions !== 1 ? 's' : ''} asked questions`,                      color: '#10B981' },
                  { show: returnVisitors > 0,    icon: '↩️', n: returnVisitors,    text: `buyer${returnVisitors !== 1 ? 's' : ''} returned to view this listing multiple times`, color: '#8B5CF6' },
                  { show: photoViewers > 0,      icon: '📸', n: photoViewers,      text: `buyer${photoViewers !== 1 ? 's' : ''} viewed all photos`,                      color: '#14B8A6' },
                ].filter(item => item.show).map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                      background: item.color + '18', border: `1px solid ${item.color}40`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                    }}>
                      {item.icon}
                    </div>
                    <div>
                      <span style={{ fontSize: 22, fontWeight: 900, color: item.color, marginRight: 8, letterSpacing: '-0.02em' }}>{item.n}</span>
                      <span style={{ fontSize: 14, color: C.sub }}>{item.text}</span>
                    </div>
                  </div>
                ))}
                {showingRequests === 0 && buyerQuestions === 0 && returnVisitors === 0 && photoViewers === 0 && (
                  <div style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '12px 0' }}>No buyer activity recorded yet.</div>
                )}
              </div>
              <div style={{ background: `${C.purple}12`, border: `1px solid ${C.purple}30`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
                  {showingRequests > 0
                    ? 'Buyers are actively engaging with this listing. Buyers who request showings are your highest-engagement leads.'
                    : leads.length > 0
                    ? 'Buyers are exploring this listing. Continued QR sign visibility will help convert interest into showings.'
                    : 'Place your QR signs to start capturing buyer engagement data.'}
                </div>
              </div>
            </div>
          </div>

          {/* Recent Buyer Activity */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, background: C.cardAlt }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Recent Buyer Activity</span>
            </div>
            <div style={{ padding: '16px 18px' }}>
              {activityEvents.length === 0 ? (
                <div style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '16px 0' }}>No activity yet — place your QR signs to start capturing data.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {activityEvents.map((ev, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: i < activityEvents.length - 1 ? 14 : 0 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: ev.dot, marginTop: 4, flexShrink: 0, boxShadow: `0 0 0 2px ${ev.dot}30` }} />
                        {i < activityEvents.length - 1 && <div style={{ width: 1, flex: 1, background: C.border, margin: '4px 0' }} />}
                      </div>
                      <div style={{ paddingBottom: i < activityEvents.length - 1 ? 0 : 0, flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.45 }}>{ev.icon} {ev.text}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{timeAgo(ev.time, { absoluteAfterDays: 30 })}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                <Link href={`/dashboard/leads`} style={{ fontSize: 12, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>
                  View Full Activity Timeline →
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── Agent Message to Seller ──────────────────────────────────────── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, background: C.cardAlt, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Agent Message to Seller</span>
            <button
              onClick={() => showToast('✏️ Edit Message — coming soon!')}
              style={{ fontSize: 12, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'sans-serif' }}
            >
              Edit Message
            </button>
          </div>
          <div style={{ padding: '24px 28px' }}>
            <div style={{ fontSize: 28, color: C.purpleL, lineHeight: 1, marginBottom: 14, opacity: 0.5 }}>"</div>
            <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.85, whiteSpace: 'pre-line', maxWidth: 700 }}>
              {agentMessage}
            </div>
            <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: `linear-gradient(135deg, ${C.purple}, #5B21B6)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0,
              }}>
                {initials || '?'}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{agentName}</div>
                <div style={{ fontSize: 11, color: C.muted }}>Listing Agent · theqrealtor</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Share & Download ─────────────────────────────────────────────── */}
        <div className="no-print" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, background: C.cardAlt }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Share & Download Report</span>
          </div>
          <div style={{ padding: '20px 24px' }}>
            <p style={{ fontSize: 13, color: C.muted, margin: '0 0 18px', lineHeight: 1.55 }}>
              Keep your seller informed with beautiful, data-rich reports.
            </p>
            <div className="rpt-share" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>

              {/* Buttons */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                  <button
                    onClick={copyURL}
                    style={{
                      flex: 2, background: copied ? '#052e16' : C.purple, color: copied ? '#4ade80' : '#fff',
                      border: 'none', borderRadius: 10, padding: '12px 16px', cursor: 'pointer',
                      fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{copied ? '✓ Link Copied!' : 'Share Report Link'}</span>
                    <span style={{ fontSize: 10, opacity: 0.75 }}>via email or text</span>
                  </button>
                  <a href={`/report/${reportToken}?print=true`} target="_blank" rel="noreferrer" style={{ ...outlineBtn, flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>⬇ Download PDF</span>
                    <span style={{ fontSize: 10, color: C.muted }}>Full report</span>
                  </a>
                  <button onClick={() => window.print()} style={{ ...outlineBtn, flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>🖨 Print Report</span>
                    <span style={{ fontSize: 10, color: C.muted }}>Print-ready PDF</span>
                  </button>
                </div>

                {/* Checklist */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
                  {[
                    'Performance overview', 'Graphs & insights',
                    'Buyer activity timeline', 'Your agent message',
                    'Lead details summary', 'Branded with your info',
                  ].map(item => (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: C.sub }}>
                      <span style={{ color: '#4ade80', fontWeight: 700 }}>✓</span> {item}
                    </div>
                  ))}
                </div>
              </div>

              {/* Mini preview */}
              <div style={{ width: 160, flexShrink: 0, position: 'relative', borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                {photo ? (
                  <img src={photo} alt={property.address} style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: '100%', height: 110, background: `linear-gradient(135deg, ${C.purple}, #5B21B6)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🏠</div>
                )}
                <div style={{ padding: '8px 10px', background: C.cardAlt }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: C.purpleL, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Seller Report</div>
                  <div style={{ fontSize: 10, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{property.address}</div>
                  <div style={{ fontSize: 9, color: C.muted }}>{fmtDateShort(now.toISOString())}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', padding: '36px 0 8px', borderTop: `1px solid ${C.border}`, marginTop: 28 }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: C.text, marginBottom: 6, letterSpacing: '-0.02em' }}>
            the<span style={{ color: C.purpleL }}>QR</span>ealtor.
          </div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>
            Data collected via theqrealtor QR tracking — live, verifiable, tamper-proof.
          </div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 10, fontWeight: 600 }}>
            {agentName}{agentPhone ? ` · ${agentPhone}` : ''}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
            © 2026 theqrealtor. All rights reserved.
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 12, fontStyle: 'italic', maxWidth: 560, margin: '12px auto 0' }}>
            Reflects buyer engagement activity only. Not a valuation, appraisal, or guarantee of sale.
          </div>
        </div>
      </div>
    </main>
  )
}
