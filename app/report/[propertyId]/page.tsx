'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'

const C = {
  bg: '#0F0F13', card: '#1A1A24', cardAlt: '#15151E', border: '#252533',
  purple: '#7C3AED', purpleL: '#8B5CF6',
  text: '#FFFFFF', sub: '#C4C4D4', muted: '#6B7280',
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

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
  icon: string; label: string; value: number; change: number; sparkData: number[]; color: string
}) {
  const pos = change >= 0
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 16px 14px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.3 }}>{label}</span>
      </div>
      <div style={{ fontSize: 34, fontWeight: 900, color: C.text, lineHeight: 1, marginBottom: 5, letterSpacing: '-0.02em' }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: pos ? '#4ade80' : '#F87171', marginBottom: 10 }}>
        {pos ? '↑' : '↓'} {Math.abs(change)}% vs last month
      </div>
      <div style={{ opacity: 0.6 }}><Sparkline data={sparkData} color={color} /></div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SellerReportPage() {
  const params      = useParams()
  const searchParams = useSearchParams()
  const propertyId  = params.propertyId as string

  const [report,   setReport]   = useState<any>(null)
  const [loading,  setLoading]  = useState(true)
  const [missing,  setMissing]  = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied,   setCopied]   = useState(false)
  const [toast,    setToast]    = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/report/${propertyId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.property) { setMissing(true); setLoading(false); return }
        setReport(d)
        setLoading(false)
      })
      .catch(() => { setMissing(true); setLoading(false) })
  }, [propertyId])

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

  const { property, photo, leads, scanEvents, qrCodes, packetCount, packets } = report

  // ── Derived values ────────────────────────────────────────────────────────
  const now            = new Date()
  const msPerDay       = 86_400_000
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const totalScans       = scanEvents.length
  const engagedBuyers    = scanEvents.filter((e: any) => (e.photos_viewed ?? 0) > 0 || (e.time_on_page_sec ?? 0) > 60).length
  const showingRequests  = leads.filter((l: any) => l.motivation === 'hot').length
  const buyerQuestions   = leads.filter((l: any) => l.notes && (l.notes as string).trim()).length
  const returnVisitors   = scanEvents.filter((e: any) => e.return_visit).length
  const photoViewers     = scanEvents.filter((e: any) => (e.photos_viewed ?? 0) >= 5).length

  const thisMonthScans    = scanEvents.filter((e: any) => new Date(e.created_at) >= thisMonthStart).length
  const lastMonthScans    = scanEvents.filter((e: any) => { const d = new Date(e.created_at); return d >= lastMonthStart && d < thisMonthStart }).length
  const thisMonthEngaged  = scanEvents.filter((e: any) => new Date(e.created_at) >= thisMonthStart && ((e.photos_viewed ?? 0) > 0 || (e.time_on_page_sec ?? 0) > 60)).length
  const lastMonthEngaged  = scanEvents.filter((e: any) => { const d = new Date(e.created_at); return d >= lastMonthStart && d < thisMonthStart && ((e.photos_viewed ?? 0) > 0 || (e.time_on_page_sec ?? 0) > 60) }).length
  const thisMonthShowings = leads.filter((l: any) => l.motivation === 'hot' && new Date(l.created_at) >= thisMonthStart).length
  const lastMonthShowings = leads.filter((l: any) => { const d = new Date(l.created_at); return l.motivation === 'hot' && d >= lastMonthStart && d < thisMonthStart }).length
  const thisMonthQuestions = leads.filter((l: any) => l.notes && new Date(l.created_at) >= thisMonthStart).length
  const lastMonthQuestions = leads.filter((l: any) => { const d = new Date(l.created_at); return l.notes && d >= lastMonthStart && d < thisMonthStart }).length
  const thisMonthPackets  = (packets ?? []).filter((p: any) => new Date(p.created_at) >= thisMonthStart).length
  const lastMonthPackets  = (packets ?? []).filter((p: any) => { const d = new Date(p.created_at); return d >= lastMonthStart && d < thisMonthStart }).length

  // Sparklines
  const scanSparkData     = getDailyCount(scanEvents, 14)
  const engagedSparkData  = getDailyCount(scanEvents.filter((e: any) => (e.photos_viewed ?? 0) > 0 || (e.time_on_page_sec ?? 0) > 60), 14)
  const showingSparkData  = getDailyCount(leads.filter((l: any) => l.motivation === 'hot'), 14)
  const packetSparkData   = getDailyCount(packets ?? [], 14)
  const questionSparkData = getDailyCount(leads.filter((l: any) => l.notes), 14)

  // Health
  const health = leads.length >= 3 || showingRequests >= 1
    ? { label: '🟢 High Interest',     color: '#10B981', bg: 'rgba(16,185,129,0.12)', score: 'strong',
        sentence: 'Your listing is performing above average compared to similar homes in your area.' }
    : leads.length >= 1 || totalScans >= 1
    ? { label: '🟡 Moderate Interest', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', score: 'steady',
        sentence: 'Your listing is attracting steady buyer interest.' }
    : { label: '🔴 Low Interest',      color: '#EF4444', bg: 'rgba(239,68,68,0.12)',  score: 'growing',
        sentence: 'Your listing needs more visibility. Consider repositioning your QR signs.' }

  // Date range
  const createdAt    = new Date(property.created_at)
  const listingDays  = Math.max(1, Math.ceil((now.getTime() - createdAt.getTime()) / msPerDay))
  const dateRangeStr = `${fmtDateShort(property.created_at)} – ${fmtDateShort(now.toISOString())}`
  const location     = [property.city, property.state].filter(Boolean).join(', ')

  // Agent message
  const agentName = property.agent_name || 'Your Agent'
  const hasDisclosures = packetCount > 0
  const agentMessage = [
    `Hi there,`,
    ``,
    `Your home at ${property.address} is generating ${health.score} buyer interest. In the last ${listingDays} day${listingDays !== 1 ? 's' : ''}, ${totalScans} buyer${totalScans !== 1 ? 's' : ''} scanned your QR sign${showingRequests > 0 ? `, ${showingRequests} requested a showing` : ''}${hasDisclosures ? `, and ${packetCount} downloaded your disclosures` : ''}. Buyer engagement is ${health.score} compared to similar listings in the area.`,
    ``,
    `Let me know if you have any questions.`,
    ``,
    `— ${agentName}`,
  ].join('\n')

  // Recent buyer activity (anonymized)
  type AEvent = { icon: string; text: string; time: string; color: string; dot: string }
  const activityEvents: AEvent[] = [
    ...leads.filter((l: any) => l.motivation === 'hot').map((l: any): AEvent => ({
      icon: '📅', text: 'Buyer requested a showing', time: l.created_at, color: '#EF4444', dot: '#EF4444',
    })),
    ...leads.filter((l: any) => l.notes && (l.notes as string).trim()).map((l: any): AEvent => ({
      icon: '💬', text: 'Buyer asked a question about the property', time: l.created_at, color: '#10B981', dot: '#10B981',
    })),
    ...(packets ?? []).map((p: any): AEvent => ({
      icon: '📄', text: 'Buyer downloaded property disclosures', time: p.created_at, color: '#7C3AED', dot: '#7C3AED',
    })),
    ...scanEvents.filter((e: any) => e.return_visit).map((e: any): AEvent => ({
      icon: '↩️', text: 'Buyer returned to view this listing again', time: e.created_at, color: '#8B5CF6', dot: '#8B5CF6',
    })),
    ...scanEvents.filter((e: any) => !e.return_visit && (e.photos_viewed ?? 0) >= 5).map((e: any): AEvent => ({
      icon: '📸', text: 'Buyer viewed all photos', time: e.created_at, color: '#14B8A6', dot: '#14B8A6',
    })),
    ...scanEvents.filter((e: any) => !e.return_visit && (e.photos_viewed ?? 0) < 5).map((e: any): AEvent => ({
      icon: '📱', text: 'New buyer discovered this listing', time: e.created_at, color: '#F97316', dot: '#F97316',
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 8)

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

  return (
    <main style={{ background: C.bg, minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: C.text }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: none } }
        .rpt-mitem:hover { background: rgba(255,255,255,0.05) !important }
        @media (max-width: 900px) { .rpt-2col { grid-template-columns: 1fr !important } .rpt-5col { grid-template-columns: 1fr 1fr !important } }
        @media (max-width: 600px) { .rpt-5col { grid-template-columns: 1fr !important } .rpt-hero { flex-direction: column !important } .rpt-share { flex-direction: column !important } .rpt-nav-center { display: none !important } }
        @media print {
          .no-print { display: none !important }
          nav { position: static !important }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important }
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
          <span style={{ fontSize: 17, fontWeight: 900, color: C.text, letterSpacing: '-0.02em' }}>
            the<span style={{ color: C.purpleL }}>QR</span>ealtor.
          </span>
        </div>

        {/* Breadcrumb */}
        <div className="rpt-nav-center" style={{ fontSize: 12, color: C.muted, textAlign: 'center' }}>
          <Link href="/dashboard/properties" style={{ color: C.muted, textDecoration: 'none' }}>Seller Reports</Link>
          <span style={{ margin: '0 6px' }}>›</span>
          <span style={{ color: C.sub, fontWeight: 600 }}>{property.address}</span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <a href={`/p/${propertyId}`} target="_blank" rel="noreferrer" style={{
            fontSize: 12, fontWeight: 600, color: C.sub, textDecoration: 'none',
            border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 13px',
          }}>
            👁 Preview as Seller
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
            {copied ? '✓ Copied!' : '📊 Share Report'}
          </button>

          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              style={{ background: '#1F1F2E', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 16, color: C.muted, cursor: 'pointer', lineHeight: 1 }}
            >⋮</button>
            {menuOpen && (
              <div style={dropdownStyle}>
                <a href={`/p/${propertyId}`} target="_blank" rel="noreferrer" className="rpt-mitem" style={menuItemStyle} onClick={() => setMenuOpen(false)}>🔗 View Property Page</a>
                <a href={`/report/${propertyId}?print=true`} target="_blank" rel="noreferrer" className="rpt-mitem" style={menuItemStyle} onClick={() => setMenuOpen(false)}>⬇ Download PDF</a>
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
            {health.label}
          </span>
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
              {health.label}
            </span>
            <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.65, margin: 0 }}>{health.sentence}</p>
          </div>

          {/* Right: report meta */}
          <div style={{ width: 240, flexShrink: 0, padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Report for</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{agentName}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Report created</div>
              <div style={{ fontSize: 12, color: C.sub }}>{now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Report link</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: C.purpleL, fontWeight: 600, wordBreak: 'break-all' }}>
                  theqrealtor.com/report/{propertyId.slice(0, 8)}…
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

        {/* ── 5 KPI Cards ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Listing Performance Overview</div>
        </div>
        <div className="rpt-5col" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
          <KpiCard icon="👁" label="Total Scans"          value={totalScans}      change={safePct(thisMonthScans, lastMonthScans)}       sparkData={scanSparkData}     color="#60A5FA" />
          <KpiCard icon="👥" label="Engaged Buyers"       value={engagedBuyers}   change={safePct(thisMonthEngaged, lastMonthEngaged)}    sparkData={engagedSparkData}  color="#10B981" />
          <KpiCard icon="💬" label="Showing Requests"     value={showingRequests} change={safePct(thisMonthShowings, lastMonthShowings)}  sparkData={showingSparkData}  color="#F59E0B" />
          <KpiCard icon="📄" label="Disclosure Requests"  value={packetCount}     change={safePct(thisMonthPackets, lastMonthPackets)}    sparkData={packetSparkData}   color={C.purpleL} />
          <KpiCard icon="❓" label="Buyer Questions"      value={buyerQuestions}  change={safePct(thisMonthQuestions, lastMonthQuestions)} sparkData={questionSparkData} color="#F97316" />
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
                  { show: packetCount > 0,       icon: '📄', n: packetCount,       text: `buyer${packetCount !== 1 ? 's' : ''} downloaded disclosures`,                   color: '#7C3AED' },
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
                {showingRequests === 0 && packetCount === 0 && buyerQuestions === 0 && returnVisitors === 0 && photoViewers === 0 && (
                  <div style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '12px 0' }}>No buyer activity recorded yet.</div>
                )}
              </div>
              <div style={{ background: `${C.purple}12`, border: `1px solid ${C.purple}30`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
                  {showingRequests > 0
                    ? 'Buyers are actively engaging with this listing. Strong showing request activity indicates serious purchase intent.'
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
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{timeAgo(ev.time)}</div>
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
                <div style={{ fontSize: 11, color: C.muted }}>Listing Agent · theQRealtor</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Share & Download ─────────────────────────────────────────────── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
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
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{copied ? '✓ Link Copied!' : '📊 Share Report Link'}</span>
                    <span style={{ fontSize: 10, opacity: 0.75 }}>via email or text</span>
                  </button>
                  <a href={`/report/${propertyId}?print=true`} target="_blank" rel="noreferrer" style={{ ...outlineBtn, flex: 1 }}>
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
            Powered by theQRealtor · Real-time buyer analytics for real estate agents.
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
            © 2026 theQRealtor. All rights reserved.
          </div>
        </div>
      </div>
    </main>
  )
}
