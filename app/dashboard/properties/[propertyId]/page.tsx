'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createBrowserSupabase } from '../../../../lib/supabase-browser'
import DashboardLayout from '../../../../components/DashboardLayout'
import Link from 'next/link'
import { calcPropertyInterest } from '../../../../lib/propertyInterest'
import { timeAgo } from '../../../../lib/timeAgo'
import { deactivationPatch } from '../../../../lib/propertyStatus'
import { motivationToTierV2, requestedShowing } from '../../../../lib/leadScoringV2'

const C = {
  bg: '#0F0F13', card: '#1A1A24', cardAlt: '#15151E', border: '#252533',
  purple: '#7C3AED', purpleL: '#8B5CF6',
  text: '#FFFFFF', sub: '#C4C4D4', muted: '#6B7280',
} as const

const TIER_COLOR: Record<string, string> = {
  hot: '#EF4444', warm: '#60A5FA', cold: '#6B7280',
}
const TIER_BG: Record<string, string> = {
  hot: '#3B0D0D', warm: '#0F2238', cold: '#1F2937',
}
const TIER_LABEL: Record<string, string> = {
  hot: '🔥 Hot', warm: '👍 Warm', cold: '❄️ Cold',
}
const MOCK_PCTS = [12, 8, 24, 15, 6, 19, 31]

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// V2 tier is the source of truth; falls back to V1 motivation for legacy rows
// with no tier value (same pattern as app/dashboard/page.tsx:252).
function leadTier(l: any): 'hot' | 'warm' | 'cold' {
  return l.tier && ['hot', 'warm', 'cold'].includes(l.tier) ? l.tier : motivationToTierV2(l.motivation)
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

function safePct(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0
  return Math.round(((curr - prev) / prev) * 100)
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const H = 32, W = 100
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

function CircularProgress({ score, color }: { score: number; color: string }) {
  const r = 52, cx = 64, cy = 64
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <svg viewBox="0 0 128 128" width={160} height={160}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#252533" strokeWidth={12} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={12}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + 10} textAnchor="middle" fill="white" fontSize="28" fontWeight="800" fontFamily="sans-serif">
        {score}
      </text>
    </svg>
  )
}

function KpiCard({ icon, label, value, change, sparkData, color }: {
  icon: string; label: string; value: number; change: number; sparkData: number[]; color: string
}) {
  const pos = change >= 0
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 18px 14px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 36, fontWeight: 900, color: C.text, lineHeight: 1, marginBottom: 6 }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: pos ? '#4ade80' : '#F87171', marginBottom: 12 }}>
        {pos ? '↑' : '↓'} {Math.abs(change)}% vs last month
      </div>
      <div style={{ opacity: 0.65 }}>
        <Sparkline data={sparkData} color={color} />
      </div>
    </div>
  )
}

function SectionCard({ title, action, children, style }: {
  title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties
}) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', ...style }}>
      <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, background: C.cardAlt, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{title}</span>
        {action && <div>{action}</div>}
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
  )
}

// ── Edit form fields (shared with list page) ──────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', background: '#0F0F13', border: `1px solid #252533`,
  borderRadius: 8, padding: '9px 12px', color: '#FFFFFF', fontSize: 13,
  boxSizing: 'border-box', fontFamily: 'sans-serif',
}
const labelHeadStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#6B7280',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5, display: 'block',
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PropertyIntelligencePage() {
  const params = useParams()
  const router = useRouter()
  const propertyId = params.propertyId as string

  const [property,        setProperty]        = useState<any>(null)
  const [photos,          setPhotos]          = useState<any[]>([])
  const [scanEvents,      setScanEvents]      = useState<any[]>([])
  const [allTimeScanCount, setAllTimeScanCount] = useState(0)
  const [leads,           setLeads]           = useState<any[]>([])
  const [qrCodes,         setQrCodes]         = useState<any[]>([])
  const [loading,         setLoading]         = useState(true)
  const [editOpen,    setEditOpen]    = useState(false)
  const [editForm,    setEditForm]    = useState<any>({})
  const [editSaving,  setEditSaving]  = useState(false)
  const [editError,   setEditError]   = useState('')
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [copied,      setCopied]      = useState(false)
  const [toast,       setToast]       = useState('')
  const [origin,      setOrigin]      = useState('')
  const [deleting,    setDeleting]    = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setOrigin(window.location.origin) }, [])

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }

      const { data: prop } = await supabase.from('properties').select('*').eq('id', propertyId).is('deleted_at', null).single()
      if (!prop || prop.user_id !== session.user.id) { router.push('/dashboard/properties'); return }
      setProperty(prop)

      const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString()

      const [photoRes, scanRes, leadRes, assignmentRes, scanCountRes] = await Promise.all([
        supabase.from('property_photos').select('url, sort_order').eq('property_id', propertyId).order('sort_order', { ascending: true }),
        supabase.from('scan_events')
          .select('created_at, cta_clicked, photos_viewed, time_on_page_sec, return_visit, sign_id')
          .eq('property_id', propertyId).gte('created_at', sixtyDaysAgo)
          .order('created_at', { ascending: false }),
        supabase.from('leads').select('*').eq('property_id', propertyId).order('created_at', { ascending: false }),
        // Signs currently assigned to this property, replacing the old direct
        // qrcodes.property_id list (qrcodes is now empty/retired).
        supabase.from('sign_assignments').select('sign_id, signs(id, label)').eq('property_id', propertyId).is('unassigned_at', null),
        supabase.from('scan_events').select('*', { count: 'exact', head: true }).eq('property_id', propertyId),
      ])

      setPhotos(photoRes.data ?? [])
      setScanEvents(scanRes.data ?? [])
      setAllTimeScanCount(scanCountRes.count ?? 0)
      setLeads(leadRes.data ?? [])
      const assignedSigns = ((assignmentRes.data ?? []) as any[])
        .map(a => (Array.isArray(a.signs) ? a.signs[0] : a.signs))
        .filter(Boolean)
      const signIds = assignedSigns.map((s: any) => s.id)
      if (signIds.length > 0) {
        const { data: signScans } = await supabase.from('scan_events').select('sign_id').in('sign_id', signIds)
        const scanCountBySign: Record<string, number> = {}
        ;(signScans || []).forEach((s: any) => { if (s.sign_id) scanCountBySign[s.sign_id] = (scanCountBySign[s.sign_id] || 0) + 1 })
        setQrCodes(assignedSigns.map((s: any) => ({ id: s.id, label: s.label, scan_count: scanCountBySign[s.id] || 0 })))
      } else {
        setQrCodes([])
      }

      setLoading(false)
    }
    load()
  }, [propertyId])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const openEdit = () => {
    setEditForm({
      address: property.address || '', city: property.city || '', state: property.state || '',
      price: property.price ?? '', beds: property.beds ?? '', baths: property.baths ?? '',
      description: property.description || '', agent_name: property.agent_name || '',
      agent_phone: property.agent_phone || '', active: !!property.active,
    })
    setEditError('')
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!editForm.address?.trim()) return
    setEditSaving(true)
    setEditError('')
    const supabase = createBrowserSupabase()
    const updates = {
      address: editForm.address.trim(), city: editForm.city.trim() || null,
      state: editForm.state.trim().toUpperCase() || null,
      price: editForm.price !== '' ? Number(editForm.price) : null,
      beds: editForm.beds !== '' ? Number(editForm.beds) : null,
      baths: editForm.baths !== '' ? Number(editForm.baths) : null,
      description: editForm.description.trim() || null,
      agent_name: editForm.agent_name.trim() || null,
      agent_phone: editForm.agent_phone.trim() || null,
      active: editForm.active,
      // Same stamping rule as the list page's toggle and edit modal — shared so
      // the three surfaces can't drift. No-ops when active didn't change.
      ...deactivationPatch(!!property.active, editForm.active),
    }
    const { error } = await supabase.from('properties').update(updates).eq('id', propertyId)
    if (error) { setEditError('Failed to save. Please try again.') }
    else { setProperty((p: any) => ({ ...p, ...updates })); setEditOpen(false) }
    setEditSaving(false)
  }

  const copyReport = async () => {
    try { await navigator.clipboard.writeText(`${origin}/report/${property.report_token}`) } catch {}
    setCopied(true)
    setToast('Link copied — send to your seller')
    setTimeout(() => setCopied(false), 2000)
    setTimeout(() => setToast(''), 2800)
  }

  const deleteProp = async () => {
    if (!confirm(`Delete "${property?.address}"?\n\nThis removes the property from your dashboard. Its leads and scan history are preserved.`)) return
    setDeleting(true)
    const supabase = createBrowserSupabase()
    // Soft delete: archive by stamping deleted_at. History rows are preserved.
    const { error } = await supabase.from('properties').update({ deleted_at: new Date().toISOString() }).eq('id', propertyId)
    if (error) { console.error('[deleteProp] soft-delete failed:', error); setDeleting(false); return }
    router.push('/dashboard/properties')
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 32, height: 32, border: `2px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </DashboardLayout>
    )
  }
  if (!property) return null

  // ── Derived values ────────────────────────────────────────────────────────
  const heroPhoto    = photos[0]?.url ?? null
  const location     = [property.city, property.state].filter(Boolean).join(', ')
  const now          = new Date()
  const msPerDay     = 86400000
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  // Health — shared formula via calcPropertyInterest
  const totalLeads = leads.length
  const showingRequests = leads.filter(requestedShowing).length
  const healthCfg = calcPropertyInterest({
    totalLeads,
    totalScans:      scanEvents.length,
    showingRequests,
  })

  // KPI numbers
  const totalScans = scanEvents.length

  const thisMonthScans    = scanEvents.filter((e: any) => new Date(e.created_at) >= thisMonthStart).length
  const lastMonthScans    = scanEvents.filter((e: any) => { const d = new Date(e.created_at); return d >= lastMonthStart && d < thisMonthStart }).length
  const thisMonthLeads    = leads.filter((l: any) => new Date(l.created_at) >= thisMonthStart).length
  const lastMonthLeads    = leads.filter((l: any) => { const d = new Date(l.created_at); return d >= lastMonthStart && d < thisMonthStart }).length
  const thisMonthShowings = leads.filter((l: any) => requestedShowing(l) && new Date(l.created_at) >= thisMonthStart).length
  const lastMonthShowings = leads.filter((l: any) => { const d = new Date(l.created_at); return requestedShowing(l) && d >= lastMonthStart && d < thisMonthStart }).length

  const scanChangePct    = safePct(thisMonthScans, lastMonthScans)
  const leadChangePct    = safePct(thisMonthLeads, lastMonthLeads)
  const showingChangePct = safePct(thisMonthShowings, lastMonthShowings)

  // Sparklines
  const scanSparkData    = getDailyCount(scanEvents, 14)
  const leadSparkData    = getDailyCount(leads, 14)
  const showingSparkData = getDailyCount(leads.filter(requestedShowing), 14)

  // 7-day / 30-day stats for health card
  const last7Scans  = scanEvents.filter((e: any) => (now.getTime() - new Date(e.created_at).getTime()) < 7 * msPerDay).length
  const prev7Scans  = scanEvents.filter((e: any) => { const d = now.getTime() - new Date(e.created_at).getTime(); return d >= 7 * msPerDay && d < 14 * msPerDay }).length
  const last30Leads = leads.filter((l: any) => (now.getTime() - new Date(l.created_at).getTime()) < 30 * msPerDay).length
  const prev30Leads = leads.filter((l: any) => { const d = now.getTime() - new Date(l.created_at).getTime(); return d >= 30 * msPerDay && d < 60 * msPerDay }).length
  const scan7Pct    = safePct(last7Scans, prev7Scans)
  const lead30Pct   = safePct(last30Leads, prev30Leads)

  // Buyer funnel
  const engagedVisitors = scanEvents.filter((e: any) => (e.photos_viewed ?? 0) > 0 || (e.time_on_page_sec ?? 0) > 60).length
  const funnelScans = totalScans
  const showingRatePct = totalLeads === 0 ? '—' : `${((showingRequests / totalLeads) * 100).toFixed(1)}%`

  // Activity feed
  type AEvent = { icon: string; title: string; desc: string; time: string; color: string; bg: string }
  const activityEvents: AEvent[] = [
    ...leads.slice(0, 8).map((l: any): AEvent => {
      const didRequestShowing = requestedShowing(l)
      return {
        icon:  didRequestShowing ? '🏠' : l.notes ? '💬' : '👤',
        title: didRequestShowing ? 'Showing Requested' : l.notes ? 'Buyer Asked Question' : 'New Lead',
        desc:  didRequestShowing
          ? `${l.name} requested a showing`
          : l.notes
            ? `${l.name}: "${(l.notes as string).slice(0, 52)}${l.notes.length > 52 ? '…' : ''}"`
            : `${l.name} submitted a lead`,
        time:  l.created_at,
        color: didRequestShowing ? '#EF4444' : l.notes ? '#10B981' : '#7C3AED',
        bg:    didRequestShowing ? '#3B0D0D' : l.notes ? '#052e16' : '#1e1b4b',
      }
    }),
    ...scanEvents.slice(0, 8).map((e: any): AEvent => ({
      icon:  e.return_visit ? '↩️' : '📱',
      title: e.return_visit ? 'Repeat Visitor Returned' : 'New Scan',
      desc:  e.return_visit ? 'A buyer returned to the property page' : 'A buyer scanned the QR code',
      time:  e.created_at,
      color: e.return_visit ? '#7C3AED' : '#F97316',
      bg:    e.return_visit ? '#1e1b4b'  : '#431407',
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 5)

  // Top leads
  const TIER_ORDER: Record<string, number> = { hot: 0, warm: 1, cold: 2 }
  const topLeads = [...leads].sort((a: any, b: any) => {
    const ta = TIER_ORDER[leadTier(a)] ?? 3
    const tb = TIER_ORDER[leadTier(b)] ?? 3
    return ta !== tb ? ta - tb : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  }).slice(0, 3)

  // Recent questions
  const recentQuestions = leads.filter((l: any) => l.notes).slice(0, 3)

  // QR health
  const maxQrScans = Math.max(...qrCodes.map((q: any) => q.scan_count ?? 0), 1)
  function qrHealth(scans: number) {
    const r = scans / maxQrScans
    if (r > 0.66) return { label: 'High',   color: '#10B981', bg: 'rgba(16,185,129,0.12)' }
    if (r > 0.33) return { label: 'Medium', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' }
    return              { label: 'Low',    color: '#EF4444', bg: 'rgba(239,68,68,0.12)' }
  }

  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
    overflow: 'hidden', minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  }

  const funnelTiers = [
    { label: 'QR Scans',          value: funnelScans,       color: '#60A5FA', prevVal: null },
    { label: 'Engaged Visitors',  value: engagedVisitors,   color: '#10B981', prevVal: funnelScans },
    { label: 'Leads',             value: totalLeads,         color: '#F59E0B', prevVal: funnelScans },
    { label: 'Showing Requests',  value: showingRequests,    color: '#EF4444', prevVal: totalLeads },
  ]
  const maxFunnelVal = Math.max(funnelScans, 1)

  return (
    <DashboardLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .pi-link:hover { opacity: 0.8 }
        .pi-btn:hover { filter: brightness(1.12) }
        .pi-menu-item:hover { background: rgba(255,255,255,0.05) !important }
        @media (max-width: 1100px) { .pi-3col { grid-template-columns: 1fr 1fr !important } }
        @media (max-width: 900px)  { .pi-2col,.pi-3col,.pi-4col { grid-template-columns: 1fr !important } }
      `}</style>

      {/* ── Sticky header ────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: C.bg, borderBottom: `1px solid ${C.border}`,
        padding: '12px 28px', fontFamily: 'sans-serif',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          {/* Left: back + title */}
          <div>
            <Link href="/dashboard/properties" style={{ fontSize: 12, color: C.muted, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              ← Property Intelligence
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: C.text, letterSpacing: '-0.02em' }}>
                {property.address}
              </h1>
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: healthCfg.color, background: healthCfg.bg,
                border: `1px solid ${healthCfg.color}40`,
                borderRadius: 20, padding: '3px 11px',
              }}>
                {healthCfg.badgeLabel}
              </span>
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              {location && <span>{location} · </span>}
              <span>{property.active ? 'Active Listing' : 'Offline'}</span>
              <span> · Created {fmtDate(property.created_at)}</span>
            </div>
          </div>

          {/* Right: month, share, menu */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: C.muted }}>{monthLabel}</span>
            <button
              onClick={copyReport}
              className="pi-btn"
              style={{
                background: copied ? '#052e16' : C.purple, color: copied ? '#4ade80' : '#fff',
                border: 'none', borderRadius: 9, padding: '8px 16px',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'sans-serif',
              }}
            >
              {copied ? '✓ Copied!' : 'Share Seller Report Link'}
            </button>

            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                style={{
                  background: '#1F1F2E', border: `1px solid ${C.border}`, borderRadius: 9,
                  padding: '8px 13px', fontSize: 16, color: C.muted, cursor: 'pointer', lineHeight: 1,
                }}
              >⋮</button>
              {menuOpen && (
                <div style={dropdownStyle}>
                  <button className="pi-menu-item" onClick={() => { setMenuOpen(false); openEdit() }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: C.sub, fontSize: 13, padding: '10px 16px', cursor: 'pointer' }}>
                    ✏️ Edit Property
                  </button>
                  <a href={`/p/${propertyId}`} target="_blank" rel="noreferrer"
                    style={{ display: 'block', color: C.sub, fontSize: 13, padding: '10px 16px', textDecoration: 'none' }}
                    onClick={() => setMenuOpen(false)}>
                    🔗 View Buyer Page
                  </a>
                  <div style={{ height: 1, background: C.border }} />
                  <button className="pi-menu-item" onClick={() => { setMenuOpen(false); deleteProp() }} disabled={deleting}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#EF4444', fontSize: 13, padding: '10px 16px', cursor: deleting ? 'not-allowed' : 'pointer' }}>
                    {deleting ? '…' : '🗑️ Delete Property'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '22px 28px 56px', fontFamily: 'sans-serif' }}>

        {/* ── Section 2: KPI Cards ─────────────────────────────────────────── */}
        <div className="pi-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
          <KpiCard icon="🔍" label="QR Scans"            value={allTimeScanCount} change={scanChangePct}    sparkData={scanSparkData}    color="#60A5FA" />
          <KpiCard icon="👥" label="Leads"               value={totalLeads}        change={leadChangePct}    sparkData={leadSparkData}    color="#10B981" />
          <KpiCard icon="💬" label="Showing Requests"    value={showingRequests}  change={showingChangePct} sparkData={showingSparkData} color="#F59E0B" />
        </div>

        {/* ── Section 3: Listing Health | Property Image ───────────────────── */}
        <div className="pi-2col" style={{ display: 'grid', gridTemplateColumns: '55% 1fr', gap: 14, marginBottom: 20 }}>

          {/* Listing Health */}
          <SectionCard
            title="Listing Health"
            action={
              <Link href="/dashboard/analytics" style={{ fontSize: 12, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>
                View Health Insights →
              </Link>
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <div style={{ flexShrink: 0 }}>
                <CircularProgress score={healthCfg.score} color={healthCfg.color} />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>/ 100</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: healthCfg.color, marginBottom: 6 }}>{healthCfg.label}</div>
                <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.6, margin: '0 0 16px' }}>{healthCfg.text}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { value: `${scan7Pct >= 0 ? '+' : ''}${scan7Pct}% vs last 7 days`, label: 'Scans',  color: scan7Pct >= 0 ? '#4ade80' : '#F87171' },
                    { value: `${lead30Pct >= 0 ? '+' : ''}${lead30Pct}% vs last 30 days`, label: 'Leads', color: lead30Pct >= 0 ? '#4ade80' : '#F87171' },
                    { value: 'Top 15% in market', label: 'Rank', color: C.purpleL },
                  ].map(stat => (
                    <div key={stat.label} style={{
                      background: C.cardAlt, border: `1px solid ${C.border}`, borderRadius: 8,
                      padding: '8px 12px', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Property Image */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ position: 'relative' }}>
              {heroPhoto ? (
                <img src={heroPhoto} alt={property.address} style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ width: '100%', height: 220, background: `linear-gradient(135deg, ${C.purple}, #5B21B6)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>
                  🏠
                </div>
              )}
              <button
                onClick={openEdit}
                style={{
                  position: 'absolute', top: 10, right: 10,
                  background: 'rgba(0,0,0,0.65)', border: `1px solid rgba(255,255,255,0.2)`,
                  borderRadius: 8, padding: '6px 12px', color: '#fff',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                ✏️ Edit Property
              </button>
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <a href={`/p/${propertyId}`} target="_blank" rel="noreferrer" className="pi-btn"
                style={{
                  display: 'block', textAlign: 'center',
                  background: `${C.purple}18`, border: `1px solid ${C.purple}40`,
                  borderRadius: 9, padding: '10px', color: C.purpleL,
                  fontSize: 13, fontWeight: 700, textDecoration: 'none',
                }}>
                View Listing Page →
              </a>
              <a href={`/p/${propertyId}`} target="_blank" rel="noreferrer" className="pi-btn"
                style={{
                  display: 'block', textAlign: 'center',
                  background: 'transparent', border: `1px solid ${C.border}`,
                  borderRadius: 9, padding: '10px', color: C.sub,
                  fontSize: 13, fontWeight: 600, textDecoration: 'none',
                }}>
                Preview as Buyer →
              </a>
            </div>
          </div>
        </div>

        {/* ── Section 4: Activity | Funnel | Top Buyers ────────────────────── */}
        <div className="pi-3col" style={{ display: 'grid', gridTemplateColumns: '35% 35% 1fr', gap: 14, marginBottom: 20 }}>

          {/* Activity Feed */}
          <SectionCard title="Activity Feed">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {activityEvents.length === 0 ? (
                <div style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '12px 0' }}>No activity yet.</div>
              ) : activityEvents.map((ev, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: i < activityEvents.length - 1 ? 14 : 0, marginBottom: i < activityEvents.length - 1 ? 0 : 0 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: ev.bg, border: `1px solid ${ev.color}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                  }}>
                    {ev.icon}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{ev.title}</div>
                    <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.4, marginTop: 2, wordBreak: 'break-word', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.desc}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{timeAgo(ev.time)}</div>
                  </div>
                </div>
              ))}
            </div>
            <Link href={`/dashboard/leads?property=${propertyId}`}
              style={{ display: 'block', textAlign: 'center', marginTop: 14, fontSize: 12, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>
              View Full Activity Timeline →
            </Link>
          </SectionCard>

          {/* Buyer Funnel */}
          <SectionCard
            title="Buyer Funnel"
            action={<Link href={`/report/${property.report_token}`} style={{ fontSize: 12, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>View Funnel Report →</Link>}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {funnelTiers.map((tier, i) => {
                const widthPct = Math.max((tier.value / maxFunnelVal) * 100, tier.value > 0 ? 20 : 8)
                const convPct  = tier.prevVal != null && tier.prevVal > 0 ? ((tier.value / tier.prevVal) * 100).toFixed(0) : null
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
                      <div style={{
                        width: `${widthPct}%`, minWidth: 80,
                        background: tier.color + '22', border: `1px solid ${tier.color}50`,
                        borderRadius: 6, padding: '7px 10px',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6,
                      }}>
                        <span style={{ fontSize: 11, color: C.sub, whiteSpace: 'nowrap' }}>{tier.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: tier.color }}>{tier.value}</span>
                      </div>
                    </div>
                    {convPct !== null && (
                      <span style={{ fontSize: 11, color: C.muted, flexShrink: 0, width: 36, textAlign: 'right' }}>{convPct}%</span>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ background: `${C.purple}12`, border: `1px solid ${C.purple}30`, borderRadius: 9, padding: '10px 12px' }}>
              <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.55 }}>
                Your showing request rate is <strong style={{ color: C.purpleL }}>{showingRatePct}</strong>.
              </div>
            </div>
          </SectionCard>

          {/* Top Buyer Activity */}
          <SectionCard
            title="Top Buyer Activity"
            action={<Link href="/dashboard/leads" style={{ fontSize: 12, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>View All Leads →</Link>}
          >
            {topLeads.length === 0 ? (
              <div style={{ fontSize: 13, color: C.muted }}>No leads yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {topLeads.map((lead: any) => {
                  const initials = (lead.name ?? '??').slice(0, 2).toUpperCase()
                  const tier     = leadTier(lead)
                  const color    = TIER_COLOR[tier] ?? C.muted
                  const bg       = TIER_BG[tier]   ?? '#1F2937'
                  const action   = tier === 'hot' ? 'Requested showing' : lead.notes ? 'Asked a question' : 'Submitted lead'
                  return (
                    <div key={lead.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                        background: bg, border: `2px solid ${color}60`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 800, color,
                      }}>
                        {initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, borderRadius: 20, padding: '1px 7px', border: `1px solid ${color}40` }}>
                            {TIER_LABEL[tier] ?? tier}
                          </span>
                          <span style={{ fontSize: 10, color: C.muted }}>{action} · {timeAgo(lead.created_at)}</span>
                        </div>
                      </div>
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} style={{ width: 28, height: 28, borderRadius: 7, background: '#052e16', border: '1px solid #166534', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontSize: 13, flexShrink: 0 }}>📞</a>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <Link href="/dashboard/leads"
              style={{ display: 'block', textAlign: 'center', marginTop: 14, fontSize: 12, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>
              View All {leads.length} Lead{leads.length !== 1 ? 's' : ''} →
            </Link>
          </SectionCard>
        </div>

        {/* ── Section 5: Questions | QR Performance | Share Report ─────────── */}
        <div className="pi-3col" style={{ display: 'grid', gridTemplateColumns: '35% 35% 1fr', gap: 14 }}>

          {/* Buyer Questions */}
          <SectionCard
            title="Buyer Questions"
            action={<Link href="/dashboard/leads" style={{ fontSize: 12, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>View All Questions →</Link>}
          >
            {recentQuestions.length === 0 ? (
              <div style={{ fontSize: 13, color: C.muted }}>No questions submitted yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {recentQuestions.map((lead: any) => (
                  <div key={lead.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#052e16', border: '1px solid #166534', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>💬</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        "{lead.notes}"
                      </div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{lead.name} · {timeAgo(lead.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Link href="/dashboard/leads"
              style={{ display: 'block', textAlign: 'center', marginTop: 14, fontSize: 12, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>
              View All Questions →
            </Link>
          </SectionCard>

          {/* QR Code Performance */}
          <SectionCard
            title="QR Code Performance"
            action={<Link href="/dashboard/qr-codes" style={{ fontSize: 12, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>View QR Codes →</Link>}
          >
            {qrCodes.length === 0 ? (
              <div style={{ fontSize: 13, color: C.muted }}>No QR codes assigned to this property.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {qrCodes.map((qr: any, i: number) => {
                  const health  = qrHealth(qr.scan_count ?? 0)
                  const mockPct = MOCK_PCTS[i % MOCK_PCTS.length]
                  return (
                    <div key={qr.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${C.purple}18`, border: `1px solid ${C.purple}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>📱</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {qr.label || 'Unlabeled QR'}
                        </div>
                        <div style={{ fontSize: 10, color: C.muted }}>{qr.scan_count ?? 0} scans · ↑{mockPct}%</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: health.color, background: health.bg, borderRadius: 20, padding: '2px 9px', flexShrink: 0 }}>
                        {health.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            <Link href="/dashboard/qr-codes"
              style={{ display: 'block', textAlign: 'center', marginTop: 14, fontSize: 12, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>
              Manage QR Codes →
            </Link>
          </SectionCard>

          {/* Share Seller Report */}
          <SectionCard title="Share Seller Report">
            <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, margin: '0 0 14px' }}>
              Keep your seller informed with beautiful, data-rich reports.
            </p>
            {heroPhoto ? (
              <img src={heroPhoto} alt="Property" style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8, marginBottom: 14, display: 'block' }} />
            ) : (
              <div style={{ width: '100%', height: 110, background: `linear-gradient(135deg, ${C.purple}, #5B21B6)`, borderRadius: 8, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>🏠</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={copyReport}
                className="pi-btn"
                style={{
                  background: copied ? '#052e16' : C.purple, color: copied ? '#4ade80' : '#fff',
                  border: 'none', borderRadius: 9, padding: '10px',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'sans-serif',
                }}
              >
                {copied ? '✓ Report Link Copied' : 'Share Seller Report Link'}
              </button>
              <a href={`/report/${property.report_token}`} target="_blank" rel="noreferrer" className="pi-btn"
                style={{ display: 'block', textAlign: 'center', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px', color: C.sub, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                👁 Preview Seller View
              </a>
              <a href={`/report/${property.report_token}?print=true`} target="_blank" rel="noreferrer" className="pi-btn"
                style={{ display: 'block', textAlign: 'center', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px', color: C.sub, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                ⬇ Download PDF
              </a>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── Edit Modal ──────────────────────────────────────────────────────── */}
      {editOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setEditOpen(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Edit Property</h2>
              <button onClick={() => setEditOpen(false)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', padding: 4 }}>✕</button>
            </div>

            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={labelHeadStyle}>Address *</span>
              <input value={editForm.address} onChange={e => setEditForm((f: any) => ({ ...f, address: e.target.value }))} style={inputStyle} />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 10, marginBottom: 14 }}>
              <label>
                <span style={labelHeadStyle}>City</span>
                <input value={editForm.city} onChange={e => setEditForm((f: any) => ({ ...f, city: e.target.value }))} style={inputStyle} />
              </label>
              <label>
                <span style={labelHeadStyle}>State</span>
                <input value={editForm.state} onChange={e => setEditForm((f: any) => ({ ...f, state: e.target.value }))} maxLength={2} placeholder="CA" style={{ ...inputStyle, textTransform: 'uppercase' }} />
              </label>
            </div>

            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={labelHeadStyle}>Price ($)</span>
              <input type="number" value={editForm.price} onChange={e => setEditForm((f: any) => ({ ...f, price: e.target.value }))} placeholder="500000" style={inputStyle} />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <label>
                <span style={labelHeadStyle}>Beds</span>
                <input type="number" value={editForm.beds} onChange={e => setEditForm((f: any) => ({ ...f, beds: e.target.value }))} min="0" step="1" style={inputStyle} />
              </label>
              <label>
                <span style={labelHeadStyle}>Baths</span>
                <input type="number" value={editForm.baths} onChange={e => setEditForm((f: any) => ({ ...f, baths: e.target.value }))} min="0" step="0.5" style={inputStyle} />
              </label>
            </div>

            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={labelHeadStyle}>Description</span>
              <textarea value={editForm.description} onChange={e => setEditForm((f: any) => ({ ...f, description: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </label>

            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={labelHeadStyle}>Agent Name</span>
              <input value={editForm.agent_name} onChange={e => setEditForm((f: any) => ({ ...f, agent_name: e.target.value }))} style={inputStyle} />
            </label>

            <label style={{ display: 'block', marginBottom: 20 }}>
              <span style={labelHeadStyle}>Agent Phone (SMS alerts)</span>
              <input type="tel" value={editForm.agent_phone} onChange={e => setEditForm((f: any) => ({ ...f, agent_phone: e.target.value }))} placeholder="+15551234567" style={inputStyle} />
            </label>

            {[
              { key: 'active', icon: '', label: editForm.active ? 'Listing is Live' : 'Listing is Offline', sub: '' },
            ].map(({ key, icon, label, sub }) => (
              <div key={key} onClick={() => setEditForm((f: any) => ({ ...f, [key]: !f[key] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ width: 40, height: 22, borderRadius: 11, background: editForm[key] ? C.purple : C.border, position: 'relative', flexShrink: 0, transition: 'background 0.15s' }}>
                  <div style={{ position: 'absolute', top: 3, left: editForm[key] ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
                </div>
                <div>
                  <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>{icon} {label}</span>
                  {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
                </div>
              </div>
            ))}

            {editError && <p style={{ color: '#F87171', fontSize: 12, margin: '0 0 14px' }}>{editError}</p>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditOpen(false)}
                style={{ flex: 1, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 9, padding: 10, color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={saveEdit} disabled={editSaving || !editForm.address?.trim()}
                style={{ flex: 2, background: editSaving ? `${C.purple}80` : C.purple, border: 'none', borderRadius: 9, padding: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: editSaving ? 'not-allowed' : 'pointer' }}>
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
          background: '#052e16', border: '1px solid #16a34a', borderRadius: 10,
          padding: '12px 20px', fontSize: 14, fontWeight: 600, color: '#4ade80',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)', fontFamily: 'sans-serif',
        }}>
          ✓ {toast}
        </div>
      )}
    </DashboardLayout>
  )
}
