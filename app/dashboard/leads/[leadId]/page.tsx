'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createBrowserSupabase } from '../../../../lib/supabase-browser'
import DashboardLayout from '../../../../components/DashboardLayout'
import Link from 'next/link'
import { calcIntentScore, scoreToLabel } from '../../../../lib/leadScoring'
import { calcPropertyInterest } from '../../../../lib/propertyInterest'
import {
  computeCallPriority, motivationToTierV2, TIER_V2_CFG, SCORE_GUIDE_V2,
  breakdownLines, type ScoreBreakdown, type LeadTierV2,
} from '../../../../lib/leadScoringV2'

const C = {
  bg: '#0F0F13', card: '#1A1A24', cardAlt: '#15151E', border: '#252533',
  purple: '#7C3AED', purpleL: '#8B5CF6',
  text: '#FFFFFF', sub: '#C4C4D4', muted: '#6B7280',
} as const

const TIER = {
  hot:       { label: '🔥 Hot Buyer',       color: '#EF4444', bg: '#3B0D0D', border: '#EF4444', intent: 'Very High Intent' },
  motivated: { label: '⚡ Motivated Buyer', color: '#F97316', bg: '#3B1F0D', border: '#F97316', intent: 'High Intent' },
  warm:      { label: '👍 Warm Buyer',      color: '#60A5FA', bg: '#0F2238', border: '#60A5FA', intent: 'Moderate Intent' },
  cold:      { label: '❄️ Cold Buyer',      color: '#6B7280', bg: '#1F2937', border: '#6B7280', intent: 'Low Intent' },
} as const

const INTEL_SUMMARY: Record<string, string> = {
  hot:       'This buyer is highly engaged and showing strong purchase intent.',
  motivated: 'This buyer is actively interested and worth following up with today.',
  warm:      'This buyer is considering this property and may need a nudge.',
  cold:      'This buyer is early in their search. Stay on their radar.',
}

const INTEL_ACTION: Record<string, string> = {
  hot:       'Call within 30 minutes. This buyer requested a showing and is highly engaged. Strike while intent is highest.',
  motivated: 'Follow up today via their preferred contact method. This buyer is actively searching.',
  warm:      'Send a friendly follow-up text or email within 24 hours. Keep them engaged.',
  cold:      'Add to your follow-up list. Check in every 2-3 weeks as they continue their search.',
}

// SCORE_GUIDE is now sourced from leadScoringV2 (SCORE_GUIDE_V2) — V2 tiers only

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// SVG donut chart with colored arc segments
function DonutChart({ segments, total }: { segments: Array<{ pts: number; color: string }>; total: number }) {
  const cx = 60, cy = 60, r = 44
  const circ = 2 * Math.PI * r
  const MAX = 25
  let deg = -90
  return (
    <svg viewBox="0 0 120 120" width={140} height={140} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#252533" strokeWidth={13} />
      {segments.filter(s => s.pts > 0).map((s, i) => {
        const arc = Math.min((s.pts / MAX) * circ, circ)
        const startDeg = deg
        deg += (s.pts / MAX) * 360
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={s.color} strokeWidth={12}
            strokeDasharray={`${arc} ${circ}`}
            transform={`rotate(${startDeg} ${cx} ${cy})`}
          />
        )
      })}
      <text x={cx} y={cy - 3} textAnchor="middle" fill="white" fontSize="20" fontWeight="800" fontFamily="sans-serif">
        {Math.min(total, 25)}
      </text>
      <text x={cx} y={cy + 13} textAnchor="middle" fill="#6B7280" fontSize="8" fontFamily="sans-serif">/ 25</text>
    </svg>
  )
}

function DropdownItem({
  onClick, href, danger, children,
}: {
  onClick?: () => void; href?: string; danger?: boolean; children: React.ReactNode
}) {
  const style: React.CSSProperties = {
    display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left',
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 13, color: danger ? '#EF4444' : C.sub, fontFamily: 'sans-serif',
    textDecoration: 'none', boxSizing: 'border-box',
  }
  if (href) return <Link href={href} target="_blank" style={style}>{children}</Link>
  return <button style={style} onClick={onClick}>{children}</button>
}

export default function LeadDetailPage() {
  const params = useParams()
  const router = useRouter()
  const leadId = params.leadId as string

  const [lead,           setLead]           = useState<any>(null)
  const [property,       setProperty]       = useState<any>(null)
  const [qrCode,         setQrCode]         = useState<any>(null)
  const [scanEvent,      setScanEvent]      = useState<any>(null)
  const [propPhoto,      setPropPhoto]      = useState<string | null>(null)
  const [propStats,      setPropStats]      = useState({ leads: 0, scans: 0, showings: 0, packets: 0 })
  const [loading,        setLoading]        = useState(true)
  const [notes,          setNotes]          = useState('')
  const [buyerQuestion,  setBuyerQuestion]  = useState('')
  const [savingNotes,    setSavingNotes]    = useState(false)
  const [notesSaved,     setNotesSaved]     = useState(false)
  const [actionsOpen,    setActionsOpen]    = useState(false)
  const [moreOpen,       setMoreOpen]       = useState(false)
  const [copied,         setCopied]         = useState('')
  const [deleting,       setDeleting]       = useState(false)

  const saveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actionsRef  = useRef<HTMLDivElement>(null)
  const moreRef     = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }

      const { data: leadData } = await supabase.from('leads').select('*').eq('id', leadId).single()
      if (!leadData) { router.push('/dashboard/leads'); return }
      setLead(leadData)
      setNotes(leadData.notes ?? '')
      setBuyerQuestion(leadData.notes ?? '')

      const [
        propRes, photoRes, qrRes, scanRes,
        leadCountRes, scanCountRes, showingCountRes, packetCountRes,
      ] = await Promise.all([
        supabase.from('properties').select('*').eq('id', leadData.property_id).single(),
        supabase.from('property_photos').select('url').eq('property_id', leadData.property_id)
          .order('sort_order', { ascending: true }).limit(1),
        leadData.qr_id
          ? supabase.from('qrcodes').select('*').eq('id', leadData.qr_id).single()
          : Promise.resolve({ data: null }),
        leadData.qr_id
          ? supabase.from('scan_events')
              .select('created_at, cta_clicked, photos_viewed, time_on_page_sec, return_visit')
              .eq('qr_id', leadData.qr_id).eq('converted', true)
              .order('created_at', { ascending: false }).limit(1).single()
          : Promise.resolve({ data: null }),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('property_id', leadData.property_id),
        // Scan count: count via the property's qr_ids. scan_events.property_id was added
        // later (migration 009) and is NULL on rows written by the createLead path and on
        // any pre-migration rows, so counting by property_id under-reports (often 0).
        // qr_id is NOT NULL on every scan_event, so this reflects the real rows.
        (async () => {
          const { data: propQrs } = await supabase.from('qrcodes').select('id').eq('property_id', leadData.property_id)
          const propQrIds = (propQrs || []).map((q: any) => q.id)
          if (propQrIds.length === 0) return { count: 0 }
          return await supabase.from('scan_events').select('*', { count: 'exact', head: true }).in('qr_id', propQrIds)
        })(),
        supabase.from('leads').select('*', { count: 'exact', head: true })
          .eq('property_id', leadData.property_id).eq('motivation', 'hot'),
        supabase.from('packet_requests').select('*', { count: 'exact', head: true }).eq('property_id', leadData.property_id),
      ])

      setProperty(propRes.data)
      setPropPhoto((photoRes.data as any[])?.[0]?.url ?? null)
      setQrCode(qrRes.data)
      setScanEvent(scanRes.data)
      setPropStats({
        leads:    leadCountRes.count ?? 0,
        scans:    scanCountRes.count ?? 0,
        showings: showingCountRes.count ?? 0,
        packets:  packetCountRes.count ?? 0,
      })
      setLoading(false)
    }
    load()
  }, [leadId])

  // Close dropdowns on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setActionsOpen(false)
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const saveNotes = async () => {
    setSavingNotes(true)
    setNotesSaved(false)
    const supabase = createBrowserSupabase()
    await supabase.from('leads').update({ notes }).eq('id', leadId)
    setSavingNotes(false)
    setNotesSaved(true)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setNotesSaved(false), 3000)
  }

  const copyToClipboard = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text) } catch {}
    setCopied(label)
    setTimeout(() => setCopied(''), 2000)
    setMoreOpen(false)
  }

  const deleteLead = async () => {
    if (!confirm(`Delete lead for ${lead?.name}? This cannot be undone.`)) return
    setDeleting(true)
    const supabase = createBrowserSupabase()
    await supabase.from('leads').delete().eq('id', leadId)
    router.push('/dashboard/leads')
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 32, height: 32, border: `2px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      </DashboardLayout>
    )
  }
  if (!lead) return null

  // ── Derived values ────────────────────────────────────────────────────────────
  // V2: primary tier and score come from the stored DB fields.
  // Fall back to V1 scan-event reconstruction for legacy rows (_legacy flag or empty breakdown).
  const tierV2: LeadTierV2 = lead.tier && ['hot','warm','cold'].includes(lead.tier)
    ? lead.tier
    : motivationToTierV2(lead.motivation)
  const tierCfgV2 = TIER_V2_CFG[tierV2]

  const initials  = (lead.name ?? '??').slice(0, 2).toUpperCase()
  const firstName = (lead.name ?? 'Lead').split(' ')[0]
  const location  = [property?.city, property?.state].filter(Boolean).join(', ')
  const fullAddr  = [property?.address, location].filter(Boolean).join(', ')

  // V2 score (stored) — use for primary display
  const storedScore   = lead.intent_score ?? 0
  const callPriority  = computeCallPriority(storedScore, lead.last_activity_at ?? lead.created_at)

  // Determine if we have a proper V2 breakdown or need V1 reconstruction
  const bdRaw        = lead.score_breakdown as Partial<ScoreBreakdown> | undefined
  const hasV2Breakdown = bdRaw && !bdRaw._legacy && typeof bdRaw.first_scan === 'number'

  // V1 reconstruction (for display in breakdown section when no V2 data)
  const eng = {
    visitCount:    scanEvent?.return_visit ? 2 : 1,
    photosViewed:  scanEvent?.photos_viewed    ?? 0,
    ctaClicked:    scanEvent?.cta_clicked      ?? null,
    timeOnPageSec: scanEvent?.time_on_page_sec ?? 0,
  }
  const v1Score = calcIntentScore(eng)

  // Score badge — always use the stored DB fields (intent_score + tier), never recompute
  const displayScore     = storedScore          // lead.intent_score from DB
  const scoreIntentColor = tierCfgV2.color       // from lead.tier via TIER_V2_CFG

  // Breakdown lines — V2 stored or V1 reconstructed
  const factors: Array<{ label: string; detail?: string; pts: number; color: string }> = hasV2Breakdown
    ? breakdownLines(bdRaw as ScoreBreakdown)
    : (() => {
        const f: Array<{ label: string; detail?: string; pts: number; color: string }> = [
          { label: 'First Scan', pts: 1, color: '#F97316' },
        ]
        if (eng.visitCount > 1)
          f.push({ label: 'Return Visit', detail: 'Returning visitor', pts: 3, color: '#7C3AED' })
        if (eng.photosViewed >= 5)
          f.push({ label: 'Photo Views', detail: `${eng.photosViewed} photos`, pts: 2, color: '#14B8A6' })
        const tPts = (eng.timeOnPageSec >= 120 ? 1 : 0) + (eng.timeOnPageSec >= 300 ? 2 : 0)
        if (tPts > 0) {
          const m = Math.floor(eng.timeOnPageSec / 60), s = eng.timeOnPageSec % 60
          f.push({ label: 'Time on Page', detail: `${m}m ${s}s`, pts: tPts, color: '#60A5FA' })
        }
        if (eng.ctaClicked === 'showing') f.push({ label: 'Showing Requested', pts: 10, color: '#EF4444' })
        else if (eng.ctaClicked === 'question') f.push({ label: 'Question Asked', pts: 5, color: '#10B981' })
        return f
      })()

  // Timeline events (most recent first)
  const timeline: Array<{ icon: string; title: string; desc: string; time: string; color: string; bg: string }> = []
  if (eng.ctaClicked === 'showing') {
    timeline.push({ icon: '🏠', title: 'Requested Showing', desc: `${firstName} requested a showing for this property`, time: lead.created_at, color: '#EF4444', bg: '#3B0D0D' })
  }
  if (lead.notes) {
    timeline.push({ icon: '💬', title: 'Asked a Question', desc: `"${lead.notes}"`, time: lead.created_at, color: '#10B981', bg: '#052e16' })
  }
  if (eng.visitCount > 1) {
    timeline.push({ icon: '↩️', title: 'Returned to Property Page', desc: 'Visited the property page more than once', time: scanEvent?.created_at ?? lead.created_at, color: '#7C3AED', bg: '#1e1b4b' })
  }
  if (eng.photosViewed > 0) {
    timeline.push({ icon: '📸', title: 'Viewed Photos', desc: `Viewed ${eng.photosViewed} photo${eng.photosViewed !== 1 ? 's' : ''}`, time: scanEvent?.created_at ?? lead.created_at, color: '#14B8A6', bg: '#022c22' })
  }
  timeline.push({ icon: '📱', title: 'Scanned QR Code', desc: 'First scan from yard sign', time: scanEvent?.created_at ?? lead.created_at, color: '#F97316', bg: '#431407' })

  // Contact preferences
  const prefs    = lead.contact_preference ? (lead.contact_preference as string).split(',').map((p: string) => p.trim()).filter(Boolean) : []
  const allPrefs = ['Text', 'Email', 'Phone Call']
  const prefIcon: Record<string, string> = { Text: '💬', Email: '✉️', 'Phone Call': '📞' }

  // Listing health — shared formula via calcPropertyInterest
  const health = calcPropertyInterest({
    totalLeads:      propStats.leads,
    totalScans:      propStats.scans,
    showingRequests: propStats.showings,
  })

  // Buyer Intelligence bullets (rule-based)
  const intelBullets: Array<{ icon: string; text: string }> = []
  if (eng.visitCount > 1)
    intelBullets.push({ icon: '↩️', text: 'Visited the property page more than once' })
  if (eng.photosViewed > 0)
    intelBullets.push({ icon: '📸', text: `Viewed ${eng.photosViewed} photo${eng.photosViewed !== 1 ? 's' : ''}` })
  if (eng.timeOnPageSec > 60) {
    const mins = Math.floor(eng.timeOnPageSec / 60)
    intelBullets.push({ icon: '⏱', text: `Spent ${mins} minute${mins !== 1 ? 's' : ''} on the property page` })
  }
  if (eng.ctaClicked === 'disclosures')
    intelBullets.push({ icon: '📋', text: 'Requested property disclosures' })
  if (lead.notes)
    intelBullets.push({ icon: '💬', text: 'Asked a question about the property' })
  if (lead.motivation === 'hot')
    intelBullets.push({ icon: '📅', text: 'Requested a showing' })

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
    overflow: 'hidden', minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  }

  return (
    <DashboardLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .action-btn:hover { filter: brightness(1.15) }
        .dropdown-item:hover { background: rgba(255,255,255,0.05) !important }
        .notes-ta:focus { border-color: #7C3AED !important; box-shadow: 0 0 0 3px rgba(124,58,237,0.2) !important; }
        @media (max-width: 960px) { .li-grid { grid-template-columns: 1fr !important } }
        @media (max-width: 640px) { .hero-inner { flex-direction: column !important } .hero-right { border-left: none !important; border-top: 1px solid #252533 !important; padding-left: 0 !important; padding-top: 20px !important; width: 100% !important; } .act-row { flex-wrap: wrap !important } }
      `}</style>

      {/* ── Header bar ─────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: C.bg, borderBottom: `1px solid ${C.border}`,
        padding: '12px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: 'sans-serif',
      }}>
        <div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>
            <Link href="/dashboard/leads" style={{ color: C.muted, textDecoration: 'none' }}>Leads</Link>
            <span style={{ margin: '0 5px' }}>›</span>
            <span style={{ color: C.sub }}>{lead.name}</span>
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>Lead Details</div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/dashboard/leads" style={{
            fontSize: 13, fontWeight: 600, color: C.sub, textDecoration: 'none',
            padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent',
          }}>
            ← Back to Leads
          </Link>
          <div ref={actionsRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setActionsOpen(v => !v)}
              style={{
                fontSize: 13, fontWeight: 700, color: C.text, cursor: 'pointer',
                padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`,
                background: '#1F1F2E', fontFamily: 'sans-serif',
              }}
            >
              Actions ▾
            </button>
            {actionsOpen && (
              <div style={dropdownStyle}>
                {lead.phone && <DropdownItem onClick={() => { copyToClipboard(lead.phone, 'phone'); setActionsOpen(false) }}>Copy Phone {copied === 'phone' && '✓'}</DropdownItem>}
                {lead.email && <DropdownItem onClick={() => { copyToClipboard(lead.email, 'email'); setActionsOpen(false) }}>Copy Email {copied === 'email' && '✓'}</DropdownItem>}
                {property && <DropdownItem href={`/p/${property.id}`}>View Buyer Page →</DropdownItem>}
                <div style={{ height: 1, background: C.border }} />
                <DropdownItem danger onClick={() => { setActionsOpen(false); deleteLead() }}>
                  {deleting ? 'Deleting…' : 'Delete Lead'}
                </DropdownItem>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 28px 56px', fontFamily: 'sans-serif', flex: 1 }}>

        {/* ── Buyer Hero Card ──────────────────────────────────────────────────── */}
        <div style={{
          background: C.card, border: `1px solid ${tierCfgV2.border}40`,
          borderRadius: 16, marginBottom: 14, overflow: 'hidden',
        }}>
          <div className="hero-inner" style={{ display: 'flex', padding: '22px 24px', gap: 24 }}>

            {/* Left side */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                {/* Avatar */}
                <div style={{
                  width: 80, height: 80, borderRadius: '50%', flexShrink: 0,
                  background: `linear-gradient(135deg, ${C.purple}, #5B21B6)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, fontWeight: 900, color: '#fff',
                  boxShadow: `0 0 0 3px ${tierCfgV2.border}40`,
                }}>
                  {initials}
                </div>
                <div style={{ minWidth: 0, paddingTop: 2 }}>
                  {/* Intent badge */}
                  <span style={{
                    display: 'inline-block', marginBottom: 6,
                    background: tierCfgV2.bg, color: tierCfgV2.color,
                    border: `1px solid ${tierCfgV2.border}60`,
                    borderRadius: 20, padding: '3px 12px',
                    fontSize: 12, fontWeight: 700,
                  }}>
                    {tierCfgV2.label}
                  </span>
                  {/* Name */}
                  <div style={{ fontSize: 26, fontWeight: 900, color: C.text, letterSpacing: '-0.02em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                    {lead.name ?? 'Unknown'}
                    <span title="Favorite" style={{ fontSize: 18, cursor: 'default', opacity: 0.4 }}>☆</span>
                    <span title="Edit" style={{ fontSize: 14, cursor: 'default', opacity: 0.4 }}>✏️</span>
                  </div>
                  {/* Address */}
                  {fullAddr && (
                    <div style={{ fontSize: 13, color: C.sub, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      🏠 {fullAddr}
                    </div>
                  )}
                  {/* Time */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted }}>
                    Lead submitted {timeAgo(lead.created_at)}
                    <span style={{
                      background: '#052e16', color: '#4ade80',
                      border: '1px solid #166534', borderRadius: 20,
                      padding: '2px 10px', fontSize: 11, fontWeight: 700,
                    }}>
                      ✓ First Contact
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right side */}
            <div className="hero-right" style={{
              width: 280, flexShrink: 0,
              borderLeft: `1px solid ${C.border}`,
              paddingLeft: 24,
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              {/* Preferred Contact */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Preferred Contact
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {prefs.length === 0 ? (
                    <span style={{ fontSize: 11, color: C.muted, fontStyle: 'italic' }}>No preference set</span>
                  ) : allPrefs.map(pref => {
                    const preferred = prefs.some(p => p.toLowerCase() === pref.toLowerCase())
                    return (
                      <span key={pref} style={{
                        fontSize: 11, fontWeight: 700,
                        background: preferred ? `${C.purpleL}18` : 'transparent',
                        border: `1px solid ${preferred ? C.purpleL : C.border}`,
                        color: preferred ? C.purpleL : C.muted,
                        borderRadius: 20, padding: '4px 11px',
                        opacity: preferred ? 1 : 0.7,
                      }}>
                        {prefIcon[pref]} {preferred ? pref : `Avoid ${pref}`}
                      </span>
                    )
                  })}
                </div>
              </div>

              {/* Lead Score */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Lead Score
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 44, fontWeight: 900, color: scoreIntentColor, lineHeight: 1 }}>{displayScore}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 12, color: C.muted }}>intent score (durable)</div>
                    <div style={{ fontSize: 10, color: C.muted }} title="Priority = intent score weighted by how recently this buyer was active">
                      Priority: <span style={{ color: C.sub, fontWeight: 700 }}>{callPriority.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons row */}
          <div className="act-row" style={{
            display: 'flex', gap: 10,
            padding: '14px 24px',
            borderTop: `1px solid ${C.border}`,
            background: C.cardAlt,
          }}>
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="action-btn" style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#052e16', border: '1px solid #166534',
                borderRadius: 10, padding: '10px 20px',
                color: '#4ade80', fontSize: 14, fontWeight: 700, textDecoration: 'none',
              }}>📞 Call Now</a>
            )}
            {lead.phone && (
              <a href={`sms:${lead.phone}`} className="action-btn" style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#0B1E3A', border: '1px solid #1D4ED860',
                borderRadius: 10, padding: '10px 20px',
                color: '#60A5FA', fontSize: 14, fontWeight: 700, textDecoration: 'none',
              }}>💬 Send Text</a>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="action-btn" style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: `${C.purple}18`, border: `1px solid ${C.purple}50`,
                borderRadius: 10, padding: '10px 20px',
                color: C.purpleL, fontSize: 14, fontWeight: 700, textDecoration: 'none',
              }}>✉️ Send Email</a>
            )}

            {/* More Actions dropdown */}
            <div ref={moreRef} style={{ position: 'relative', marginLeft: 'auto' }}>
              <button
                onClick={() => setMoreOpen(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: '#1F1F2E', border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: '10px 18px',
                  color: C.sub, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'sans-serif',
                }}
              >
                More Actions ▾
              </button>
              {moreOpen && (
                <div style={{ ...dropdownStyle, right: 0 }}>
                  {lead.phone && (
                    <DropdownItem onClick={() => copyToClipboard(lead.phone, 'phone')}>
                      📋 Copy Phone {copied === 'phone' ? '✓' : ''}
                    </DropdownItem>
                  )}
                  {lead.email && (
                    <DropdownItem onClick={() => copyToClipboard(lead.email, 'email')}>
                      📋 Copy Email {copied === 'email' ? '✓' : ''}
                    </DropdownItem>
                  )}
                  {property && (
                    <DropdownItem href={`/p/${property.id}`}>🔗 View Buyer Page</DropdownItem>
                  )}
                  <div style={{ height: 1, background: C.border }} />
                  <DropdownItem danger onClick={() => { setMoreOpen(false); deleteLead() }}>
                    🗑 Delete Lead
                  </DropdownItem>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Two-column body ──────────────────────────────────────────────────── */}
        <div className="li-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 14, alignItems: 'start' }}>

          {/* ── LEFT COLUMN ────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Buyer Intelligence */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, background: C.cardAlt }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>🧠 Buyer Intelligence</span>
              </div>
              <div style={{ padding: '16px 18px' }}>
                <p style={{ fontSize: 14, color: C.text, lineHeight: 1.65, margin: '0 0 14px' }}>
                  {TIER_V2_CFG[tierV2].summary}
                </p>
                {intelBullets.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
                    {intelBullets.map((b, i) => (
                      <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                        <span style={{ flexShrink: 0, fontSize: 14 }}>{b.icon}</span>
                        <span style={{ fontSize: 13, color: C.sub, lineHeight: 1.5 }}>{b.text}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{
                  background: `${C.purple}15`,
                  border: `1px solid ${C.purple}40`,
                  borderRadius: 10, padding: '12px 14px',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.purpleL, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    💡 Recommended Action
                  </div>
                  <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.6, margin: 0 }}>
                    {TIER_V2_CFG[tierV2].advice}
                  </p>
                </div>
              </div>
            </div>

            {/* Buyer Activity Timeline */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, background: C.cardAlt, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Buyer Activity Timeline</span>
                <Link href="/dashboard/leads" style={{ fontSize: 12, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>
                  View All →
                </Link>
              </div>
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 0 }}>
                {timeline.map((ev, i) => (
                  <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: i < timeline.length - 1 ? 16 : 0, position: 'relative' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                        background: ev.bg, border: `1px solid ${ev.color}50`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
                      }}>
                        {ev.icon}
                      </div>
                      {i < timeline.length - 1 && (
                        <div style={{ width: 1, flex: 1, background: C.border, marginTop: 4 }} />
                      )}
                    </div>
                    <div style={{ paddingTop: 6, minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 3 }}>{ev.title}</div>
                      <div style={{ fontSize: 12, color: C.sub, marginBottom: 4, lineHeight: 1.45, wordBreak: 'break-word' }}>{ev.desc}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{fmtTime(ev.time)} · {timeAgo(ev.time)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Intent Score Breakdown */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, background: C.cardAlt }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Intent Score Breakdown</span>
              </div>
              <div style={{ padding: '16px 18px', display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>

                {/* Donut chart */}
                <DonutChart segments={factors.map(f => ({ pts: f.pts, color: f.color }))} total={displayScore} />

                {/* Factor list */}
                <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {factors.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: f.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 12, color: C.sub }}>{f.label}</span>
                        {f.detail && <span style={{ fontSize: 11, color: C.muted, marginLeft: 5 }}>({f.detail})</span>}
                      </div>
                      <span style={{
                        fontSize: 12, fontWeight: 800, color: '#4ade80',
                        background: 'rgba(74,222,128,0.1)', borderRadius: 6, padding: '2px 7px',
                      }}>
                        +{f.pts}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Score Guide */}
                <div style={{ flexShrink: 0, minWidth: 110 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    Score Guide
                  </div>
                  {SCORE_GUIDE_V2.map(g => (
                    <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: C.muted, flex: 1 }}>{g.range}</span>
                      <span style={{ fontSize: 11, color: g.color, fontWeight: 700 }}>{g.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Notes */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, background: C.cardAlt }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>📝 Notes</span>
              </div>
              <div style={{ padding: '16px 18px' }}>
                <textarea
                  className="notes-ta"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add private notes about this lead…"
                  rows={4}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: C.bg, border: `1px solid ${C.border}`,
                    borderRadius: 9, color: C.text, fontSize: 13,
                    padding: '11px 13px', resize: 'vertical', outline: 'none',
                    fontFamily: 'sans-serif', lineHeight: 1.6, marginBottom: 10,
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    onClick={saveNotes}
                    disabled={savingNotes}
                    style={{
                      background: C.purple, color: '#fff', border: 'none',
                      borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 700,
                      cursor: savingNotes ? 'not-allowed' : 'pointer',
                      opacity: savingNotes ? 0.7 : 1, fontFamily: 'sans-serif',
                    }}
                  >
                    {savingNotes ? 'Saving…' : 'Save Note'}
                  </button>
                  {notesSaved && <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 600 }}>✓ Saved</span>}
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN ───────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Property card */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, background: C.cardAlt, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Property</span>
                {property && (
                  <Link href={`/p/${property.id}`} target="_blank" style={{ fontSize: 12, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>
                    View Property →
                  </Link>
                )}
              </div>
              <div style={{ padding: '14px 18px' }}>
                {propPhoto && (
                  <img src={propPhoto} alt={property?.address ?? 'Property'} style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 8, marginBottom: 12, display: 'block' }} />
                )}
                {property ? (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>{property.address}</div>
                    {location && <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>{location}</div>}
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: health.color, background: health.bg,
                      border: `1px solid ${health.color}40`,
                      borderRadius: 20, padding: '3px 11px',
                      display: 'inline-block', marginBottom: 12,
                    }}>
                      {health.badgeLabel}
                    </span>
                    {/* Stats row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                      {[
                        { label: 'Scans',      value: propStats.scans },
                        { label: 'Leads',      value: propStats.leads },
                        { label: 'Showings',   value: propStats.showings },
                        { label: 'Disclosures', value: propStats.packets },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ background: C.cardAlt, borderRadius: 8, padding: '8px 6px', textAlign: 'center', border: `1px solid ${C.border}` }}>
                          <div style={{ fontSize: 16, fontWeight: 900, color: C.text }}>{value}</div>
                          <div style={{ fontSize: 9, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: C.muted }}>Property not found.</div>
                )}
              </div>
            </div>

            {/* Buyer Question card */}
            {buyerQuestion && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, background: C.cardAlt, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Buyer Question</span>
                  <Link href="/dashboard/leads" style={{ fontSize: 12, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>
                    View All →
                  </Link>
                </div>
                <div style={{ padding: '16px 18px' }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>💬</div>
                  <p style={{ fontSize: 15, color: C.text, lineHeight: 1.65, margin: '0 0 10px', fontStyle: 'italic' }}>
                    "{buyerQuestion}"
                  </p>
                  <div style={{ fontSize: 11, color: C.muted }}>{timeAgo(lead.created_at)}</div>
                </div>
              </div>
            )}

            {/* Contact Information card */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, background: C.cardAlt, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Contact Information</span>
                <span style={{ fontSize: 12, color: C.muted }}>Edit</span>
              </div>
              <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {lead.phone && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>📞</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                        Mobile {prefs.includes('Text') ? '(Text Preferred)' : ''}
                      </div>
                      <a href={`tel:${lead.phone}`} style={{ fontSize: 14, fontWeight: 600, color: C.text, textDecoration: 'none' }}>{lead.phone}</a>
                    </div>
                    <a href={`sms:${lead.phone}`} title="Send text" style={{
                      width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#0B1E3A', border: '1px solid #1D4ED840', color: '#60A5FA', fontSize: 14, textDecoration: 'none', flexShrink: 0,
                    }}>💬</a>
                  </div>
                )}
                {lead.email && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>✉️</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                        Email
                      </div>
                      <a href={`mailto:${lead.email}`} style={{ fontSize: 13, fontWeight: 600, color: C.text, textDecoration: 'none', wordBreak: 'break-all' }}>{lead.email}</a>
                    </div>
                    <a href={`mailto:${lead.email}`} title="Send email" style={{
                      width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `${C.purple}18`, border: `1px solid ${C.purple}40`, color: C.purpleL, fontSize: 14, textDecoration: 'none', flexShrink: 0,
                    }}>✉️</a>
                  </div>
                )}
                {!lead.phone && !lead.email && (
                  <div style={{ fontSize: 13, color: C.muted }}>No contact info provided.</div>
                )}
              </div>
            </div>

            {/* Lead Source card */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, background: C.cardAlt }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Lead Source</span>
              </div>
              <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>📱</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>QR Code Scan</div>
                    <div style={{ fontSize: 11, color: C.muted }}>
                      {qrCode?.label || qrCode?.placement || 'Yard Sign'}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>
                  {fmtDateTime(scanEvent?.created_at ?? lead.created_at)}
                </div>
                {property && (
                  <div style={{ fontSize: 12, color: C.muted, fontFamily: 'monospace' }}>
                    /p/{property.id}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
