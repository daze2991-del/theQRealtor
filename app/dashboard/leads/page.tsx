'use client'

// DB migration required (run once in Supabase SQL editor):
// ALTER TABLE leads ADD COLUMN IF NOT EXISTS status text DEFAULT 'new';
// ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes text;
// ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz;

import { Suspense, useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabase } from '../../../lib/supabase-browser'
import DashboardLayout from '../../../components/DashboardLayout'
import { computeCallPriority, motivationToTierV2, urgencyLabel, topSignalLabel, TIER_V2_CFG, type LeadTierV2 } from '../../../lib/leadScoringV2'

// ── Tokens ────────────────────────────────────────────────────────────────────
const C = {
  bg:      '#0B0F1A',
  card:    '#0F1629',
  border:  '#252533',
  purple:  '#7C3AED',
  purpleL: '#8B5CF6',
  text:    '#FFFFFF',
  sub:     '#C4C4D4',
  muted:   '#6B7280',
} as const

const STATUS_CFG = {
  new:       { label: 'New',       color: '#60A5FA', bg: '#0B1E3A', border: '#1E4D8C' },
  contacted: { label: 'Contacted', color: '#FCD34D', bg: '#2D1A06', border: '#92400E' },
  qualified: { label: 'Qualified', color: '#8B5CF6', bg: '#2E1065', border: '#7C3AED' },
  won:       { label: 'Won',       color: '#4ADE80', bg: '#052e16', border: '#166534' },
  lost:      { label: 'Lost',      color: '#9CA3AF', bg: '#1F2937', border: '#374151' },
} as const

// V2: hot / warm / cold only (motivated collapsed into hot)
const TIER_CHIP_CFG = TIER_V2_CFG

const TEMP_CHIPS: Array<{ key: LeadTierV2; label: string }> = [
  { key: 'hot',  label: '🔥 Hot'  },
  { key: 'warm', label: '☀️ Warm' },
  { key: 'cold', label: '❄️ Cold' },
]

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'won', 'lost'] as const
type StatusKey = typeof STATUS_OPTIONS[number]

// Derive V2 tier from a lead row (falls back to motivation for legacy rows)
function leadTier(lead: any): LeadTierV2 {
  if (lead.tier && ['hot', 'warm', 'cold'].includes(lead.tier)) return lead.tier as LeadTierV2
  return motivationToTierV2(lead.motivation)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function lastContactedText(iso: string | null | undefined): string {
  if (!iso) return 'Not yet contacted'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Last contacted: today'
  if (days === 1) return 'Last contacted: yesterday'
  return `Last contacted: ${days}d ago`
}

// Most recent buyer activity (latest scan), falling back to the original scan / submit time
function lastActiveText(lastScanIso: string | null | undefined, fallbackIso: string): string {
  return `Last active: ${timeAgo(lastScanIso || fallbackIso)}`
}

function buildSignals(scanEvent: any): string {
  if (!scanEvent) return ''
  const parts: string[] = []
  const pv = scanEvent.photos_viewed ?? 0
  if (pv > 0) parts.push(`Viewed ${pv} photo${pv !== 1 ? 's' : ''}`)
  if (scanEvent.cta_clicked === 'showing')    parts.push('Requested showing')
  else if (scanEvent.cta_clicked === 'disclosures') parts.push('Requested disclosures')
  else if (scanEvent.cta_clicked === 'question')    parts.push('Asked a question')
  if (scanEvent.return_visit) parts.push('2nd visit')
  return parts.join(' · ')
}

// ── Components ────────────────────────────────────────────────────────────────
function StatusBadge({ status, onClick }: { status: StatusKey; onClick?: (e: React.MouseEvent) => void }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.new
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
        borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700,
        whiteSpace: 'nowrap', cursor: onClick ? 'pointer' : 'default', userSelect: 'none',
        fontFamily: 'sans-serif',
      }}
    >
      {cfg.label}{onClick ? ' ▾' : ''}
    </button>
  )
}

function TierBadge({ tier }: { tier: LeadTierV2 }) {
  const c = TIER_CHIP_CFG[tier]
  return (
    <span style={{
      background: c.bg, color: c.color, border: `1px solid ${c.color}50`,
      borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>{c.label}</span>
  )
}

function Avatar({ name, tier, size = 40 }: { name: string; tier?: LeadTierV2; size?: number }) {
  const initials = (name || '??').slice(0, 2).toUpperCase()
  const borderColor = tier ? TIER_CHIP_CFG[tier].border : '#374151'
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.28), flexShrink: 0,
      background: `${C.purple}28`, border: `2px solid ${borderColor}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.32), fontWeight: 700, color: C.purpleL,
    }}>{initials}</div>
  )
}

function ActionBtn({ href, title, emoji, bg, border }: { href: string; title: string; emoji: string; bg: string; border: string }) {
  return (
    <a href={href} title={title} onClick={e => e.stopPropagation()}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 8, fontSize: 15,
        background: bg, border: `1px solid ${border}`,
        textDecoration: 'none', flexShrink: 0,
      }}
    >{emoji}</a>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LeadsPage() {
  return (
    <Suspense fallback={null}>
      <LeadsPageInner />
    </Suspense>
  )
}

function LeadsPageInner() {
  const router = useRouter()

  const [loading,        setLoading]        = useState(true)
  const [allLeads,       setAllLeads]       = useState<any[]>([])
  const [properties,     setProperties]     = useState<any[]>([])
  const [qrMap,          setQrMap]          = useState<Record<string, { label: string; scan_count: number }>>({})
  const [scanEventByQr,  setScanEventByQr]  = useState<Record<string, any>>({})
  const [lastActiveByQr, setLastActiveByQr] = useState<Record<string, string>>({})
  const [exportingCSV,   setExportingCSV]   = useState(false)

  // Filters + sort
  const [filterDisclosures, setFilterDisclosures] = useState(false)
  const [filterTemp,     setFilterTemp]     = useState<LeadTierV2[]>(['hot', 'warm', 'cold'])
  const [filterStatus,   setFilterStatus]   = useState<string[]>([...STATUS_OPTIONS])
  const [filterProperty, setFilterProperty] = useState('')
  const [filterDays,     setFilterDays]     = useState('all')
  const [sortMode,       setSortMode]       = useState<'recent' | 'priority' | 'contacted'>('recent')

  // Per-lead UI state
  const [localLeads,     setLocalLeads]     = useState<Record<string, Partial<any>>>({})
  const [expandedNotes,  setExpandedNotes]  = useState<Record<string, boolean>>({})
  const [noteValues,     setNoteValues]     = useState<Record<string, string>>({})
  const [savingNotes,    setSavingNotes]    = useState<Record<string, boolean>>({})
  const [openStatusDd,   setOpenStatusDd]   = useState<string | null>(null)

  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Close status dropdown on any click outside a status dropdown container
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-status-dropdown]')) return
      setOpenStatusDd(null)
    }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [])

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }

      const { data: props } = await supabase
        .from('properties').select('id, address')
        .eq('user_id', session.user.id).order('created_at', { ascending: false })
      setProperties(props || [])
      if (!props || props.length === 0) { setLoading(false); return }

      const { data: leads } = await supabase
        .from('leads').select('*')
        .in('property_id', props.map((p: any) => p.id))
        .order('created_at', { ascending: false })
      setAllLeads(leads || [])

      // Init notes from DB
      const initNotes: Record<string, string> = {}
      ;(leads || []).forEach((l: any) => { initNotes[l.id] = l.notes ?? '' })
      setNoteValues(initNotes)

      // Fetch QR info + converted scan events in parallel
      const qrIds = [...new Set((leads || []).map((l: any) => l.qr_id).filter(Boolean))] as string[]
      if (qrIds.length > 0) {
        const [{ data: qrcodes }, { data: scanEvs }, { data: allScans }] = await Promise.all([
          supabase.from('qrcodes').select('id, label, scan_count').in('id', qrIds),
          supabase.from('scan_events')
            .select('qr_id, cta_clicked, photos_viewed, return_visit')
            .in('qr_id', qrIds).eq('converted', true)
            .order('created_at', { ascending: false }),
          // Latest activity per qr_id — any scan_events row (not just converted)
          supabase.from('scan_events')
            .select('qr_id, created_at')
            .in('qr_id', qrIds)
            .order('created_at', { ascending: false }),
        ])
        const qm: Record<string, { label: string; scan_count: number }> = {}
        ;(qrcodes || []).forEach((q: any) => { qm[q.id] = { label: q.label || '', scan_count: q.scan_count || 0 } })
        setQrMap(qm)

        // Most-recent converted scan event per qr_id
        const em: Record<string, any> = {}
        ;(scanEvs || []).forEach((e: any) => { if (!em[e.qr_id]) em[e.qr_id] = e })
        setScanEventByQr(em)

        // Most-recent scan timestamp per qr_id (rows arrive newest-first)
        const lm: Record<string, string> = {}
        ;(allScans || []).forEach((s: any) => { if (s.qr_id && !lm[s.qr_id]) lm[s.qr_id] = s.created_at })
        setLastActiveByQr(lm)
      }
      setLoading(false)
    }
    load().catch(() => setLoading(false))
  }, [])

  const propMap = useMemo(() => {
    const m: Record<string, string> = {}
    properties.forEach((p: any) => { m[p.id] = p.address })
    return m
  }, [properties])

  // Merge optimistic local overrides on top of DB data
  const getEffective = useCallback((lead: any) => ({
    ...lead,
    ...localLeads[lead.id],
  }), [localLeads])

  const updateStatus = async (leadId: string, newStatus: StatusKey) => {
    setOpenStatusDd(null)
    const lead = allLeads.find(l => l.id === leadId)
    const current = localLeads[leadId]
    const currentLastContacted = current?.last_contacted_at ?? lead?.last_contacted_at

    const patch: Partial<any> = { status: newStatus }
    if (newStatus !== 'new' && !currentLastContacted) {
      patch.last_contacted_at = new Date().toISOString()
    }
    setLocalLeads(prev => ({ ...prev, [leadId]: { ...prev[leadId], ...patch } }))

    const supabase = createBrowserSupabase()
    await supabase.from('leads').update(patch).eq('id', leadId)
  }

  const saveNotesNow = async (leadId: string, value: string) => {
    setSavingNotes(prev => ({ ...prev, [leadId]: true }))
    const supabase = createBrowserSupabase()
    await supabase.from('leads').update({ notes: value }).eq('id', leadId)
    setLocalLeads(prev => ({ ...prev, [leadId]: { ...prev[leadId], notes: value } }))
    setSavingNotes(prev => ({ ...prev, [leadId]: false }))
  }

  const handleNoteChange = (leadId: string, value: string) => {
    setNoteValues(prev => ({ ...prev, [leadId]: value }))
    if (noteTimers.current[leadId]) clearTimeout(noteTimers.current[leadId])
    noteTimers.current[leadId] = setTimeout(() => saveNotesNow(leadId, value), 1500)
  }

  const handleNoteBlur = (leadId: string) => {
    if (noteTimers.current[leadId]) {
      clearTimeout(noteTimers.current[leadId])
      delete noteTimers.current[leadId]
    }
    saveNotesNow(leadId, noteValues[leadId] ?? '')
  }

  const toggleTemp = (key: LeadTierV2) => {
    setFilterTemp(prev => prev.includes(key)
      ? prev.length > 1 ? prev.filter(k => k !== key) : prev
      : [...prev, key]
    )
  }

  const toggleStatus = (s: string) => {
    setFilterStatus(prev => prev.includes(s)
      ? prev.length > 1 ? prev.filter(k => k !== s) : prev
      : [...prev, s]
    )
  }

  const counts = useMemo(() => ({
    hot:  allLeads.filter(l => leadTier(l) === 'hot').length,
    warm: allLeads.filter(l => leadTier(l) === 'warm').length,
    cold: allLeads.filter(l => leadTier(l) === 'cold').length,
  }), [allLeads])

  const leads = useMemo(() => {
    let r = allLeads

    if (filterDisclosures) {
      // Disclosures chip: filter by cta_clicked on the scan event, replaces tier filter
      r = r.filter(l => l.qr_id && scanEventByQr[l.qr_id]?.cta_clicked === 'disclosures')
    } else {
      // Tier chips — use V2 tier field (with fallback to v1 motivation)
      r = r.filter(l => filterTemp.includes(leadTier(l)))
    }

    // Status filter
    r = r.filter(l => {
      const s = (localLeads[l.id]?.status ?? l.status ?? 'new') as string
      return filterStatus.includes(s)
    })

    // Property + date filters
    if (filterProperty) r = r.filter(l => l.property_id === filterProperty)
    if (filterDays !== 'all') {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - parseInt(filterDays))
      r = r.filter(l => new Date(l.created_at) >= cutoff)
    }

    const arr = [...r]
    if (sortMode === 'priority') {
      // call_priority = intent_score × recency decay — read-time only, never stored
      arr.sort((a, b) => {
        const pa = computeCallPriority(a.intent_score ?? 0, a.last_activity_at ?? a.created_at)
        const pb = computeCallPriority(b.intent_score ?? 0, b.last_activity_at ?? b.created_at)
        return pb !== pa ? pb - pa : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
    } else if (sortMode === 'contacted') {
      arr.sort((a, b) => {
        const aLC = localLeads[a.id]?.last_contacted_at ?? a.last_contacted_at
        const bLC = localLeads[b.id]?.last_contacted_at ?? b.last_contacted_at
        if (!aLC && !bLC) return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        if (!aLC) return -1
        if (!bLC) return 1
        return new Date(aLC).getTime() - new Date(bLC).getTime()
      })
    } else {
      arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
    return arr
  }, [allLeads, filterDisclosures, filterTemp, filterStatus, filterProperty, filterDays, sortMode, localLeads, scanEventByQr])

  const downloadCSV = async () => {
    if (leads.length === 0) return
    setExportingCSV(true)
    const supabase = createBrowserSupabase()
    const qrIds = [...new Set(leads.map(l => l.qr_id).filter(Boolean))] as string[]
    const lastScanMap: Record<string, string> = {}
    if (qrIds.length > 0) {
      const { data: scans } = await supabase
        .from('scan_events').select('qr_id, created_at')
        .in('qr_id', qrIds).order('created_at', { ascending: false })
      ;(scans || []).forEach((s: any) => { if (s.qr_id && !lastScanMap[s.qr_id]) lastScanMap[s.qr_id] = s.created_at })
    }
    const motivLabels: Record<string, string> = { hot: 'Ready now', motivated: '1–6 months', warm: '6–12 months', cold: 'Just browsing' }
    const recAction:   Record<string, string> = { hot: 'Call today', motivated: 'Text this week', warm: 'Follow up in 2 weeks', cold: 'Add to drip' }
    const rows = [
      ['Name', 'Phone', 'Email', 'Status', 'Intent', 'Motivation', 'Property', 'QR Label', 'Scans', 'Last Scan', 'Last Contacted', 'Submitted', 'Notes', 'Action'],
      ...leads.map(l => {
        const eff = getEffective(l)
        return [
          l.name || '', l.phone || '', l.email || '',
          eff.status || 'new',
          TIER_CHIP_CFG[leadTier(l)]?.label || l.motivation || '',
          motivLabels[l.motivation] || '',
          propMap[l.property_id] || '',
          l.qr_id ? (qrMap[l.qr_id]?.label || '') : '',
          l.qr_id ? String(qrMap[l.qr_id]?.scan_count ?? '') : '',
          l.qr_id && lastScanMap[l.qr_id] ? new Date(lastScanMap[l.qr_id]).toLocaleString() : '',
          eff.last_contacted_at ? new Date(eff.last_contacted_at).toLocaleString() : 'Not contacted',
          new Date(l.created_at).toLocaleString(),
          eff.notes || '',
          recAction[l.motivation] || '',
        ]
      }),
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setExportingCSV(false)
  }

  const allTempOn   = filterTemp.length === TEMP_CHIPS.length
  const allStatusOn = filterStatus.length === STATUS_OPTIONS.length
  const isFiltered  = !allTempOn || !allStatusOn || !!filterProperty || filterDays !== 'all' || filterDisclosures

  return (
    <DashboardLayout>
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .lead-card { cursor: pointer; transition: border-color 0.12s, box-shadow 0.12s; }
        .lead-card:hover { border-color: #7C3AED55 !important; box-shadow: 0 4px 20px rgba(0,0,0,0.25); }
        .chip-btn  { cursor: pointer; border: none; font-family: sans-serif; transition: all 0.12s; }
        .chip-btn:hover { opacity: 0.85; }
        .dd-item   { display: flex; align-items: center; gap: 8px; width: 100%; border: none; background: none; text-align: left; padding: 9px 14px; font-size: 13px; cursor: pointer; font-family: sans-serif; color: #C4C4D4; }
        .dd-item:hover { background: rgba(255,255,255,0.06) !important; }
        .notes-ta  { outline: none; resize: vertical; }
        .notes-ta:focus { border-color: #7C3AED !important; box-shadow: 0 0 0 3px rgba(124,58,237,0.15) !important; }
        @media (max-width: 640px) { .leads-grid { padding: 14px !important; } }
      `}</style>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, border: `2px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 14px', animation: 'spin 0.7s linear infinite' }} />
            <div style={{ color: C.muted, fontSize: 14, fontFamily: 'sans-serif' }}>Loading leads…</div>
          </div>
        </div>
      ) : (
        <>
          {/* ── Top bar ── */}
          <div style={{
            position: 'sticky', top: 0, zIndex: 20,
            background: C.bg, borderBottom: `1px solid ${C.border}`,
            padding: '15px 28px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 12, fontFamily: 'sans-serif',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>
                Lead Inbox
              </h1>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.purpleL, background: `${C.purple}22`, borderRadius: 20, padding: '3px 10px' }}>
                {allLeads.length}
              </span>
            </div>
            <button
              onClick={downloadCSV}
              disabled={exportingCSV || leads.length === 0}
              style={{
                background: 'transparent', color: C.purpleL,
                border: `1px solid ${C.purple}55`, borderRadius: 9,
                padding: '8px 16px', fontSize: 13, fontWeight: 600,
                cursor: (exportingCSV || leads.length === 0) ? 'not-allowed' : 'pointer',
                opacity: (exportingCSV || leads.length === 0) ? 0.5 : 1,
                fontFamily: 'sans-serif',
              }}
            >
              {exportingCSV ? 'Exporting…' : '⬇ Export CSV'}
            </button>
          </div>

          {/* ── Filter bar ── */}
          <div style={{
            padding: '11px 28px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
            fontFamily: 'sans-serif', background: C.bg,
          }}
            onClick={e => e.stopPropagation()}
          >
            {/* Tier chips (V2: hot/warm/cold) + Disclosures */}
            <div style={{ display: 'flex', gap: 6 }}>
              {TEMP_CHIPS.map(chip => {
                const on  = filterTemp.includes(chip.key) && !filterDisclosures
                const cnt = counts[chip.key] ?? 0
                const cfg = TIER_CHIP_CFG[chip.key]
                return (
                  <button key={chip.key} className="chip-btn"
                    onClick={() => { setFilterDisclosures(false); toggleTemp(chip.key) }}
                    style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      background: on ? `${cfg.color}22` : 'transparent',
                      border: `1px solid ${on ? cfg.color : C.border}`,
                      color: on ? cfg.color : C.muted,
                    }}
                  >
                    {chip.label}
                    {cnt > 0 && <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.7 }}>{cnt}</span>}
                  </button>
                )
              })}
              <button className="chip-btn"
                onClick={() => setFilterDisclosures(v => !v)}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  background: filterDisclosures ? '#D97706' + '22' : 'transparent',
                  border: `1px solid ${filterDisclosures ? '#D97706' : C.border}`,
                  color: filterDisclosures ? '#D97706' : C.muted,
                }}
              >
                📄 Disclosures
              </button>
            </div>

            <div style={{ width: 1, height: 20, background: C.border }} />

            {/* Status multi-select */}
            <div data-status-dropdown style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
              <button className="chip-btn"
                onClick={() => setOpenStatusDd(v => v === '__filter__' ? null : '__filter__')}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  background: !allStatusOn ? `${C.purple}30` : 'transparent',
                  border: `1px solid ${!allStatusOn ? C.purple : C.border}`,
                  color: !allStatusOn ? C.purpleL : C.muted,
                }}
              >
                Status {!allStatusOn ? `(${filterStatus.length})` : '(All)'} ▾
              </button>
              {openStatusDd === '__filter__' && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
                  background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
                  overflow: 'hidden', minWidth: 170, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}>
                  {STATUS_OPTIONS.map(s => {
                    const on = filterStatus.includes(s)
                    const cfg = STATUS_CFG[s]
                    return (
                      <button key={s} className="dd-item" onClick={() => toggleStatus(s)}>
                        <span style={{ fontSize: 13, color: on ? C.purpleL : C.muted }}>{on ? '☑' : '☐'}</span>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Sort */}
            <select value={sortMode} onChange={e => setSortMode(e.target.value as any)}
              style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, color: C.sub, fontSize: 12, fontWeight: 600, padding: '5px 11px', outline: 'none', cursor: 'pointer' }}
            >
              <option value="recent">Most recent</option>
              <option value="priority">Call Priority ↓</option>
              <option value="contacted">Last contacted (oldest first)</option>
            </select>

            <div style={{ width: 1, height: 20, background: C.border }} />

            {/* Property + date */}
            <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)}
              style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: filterProperty ? C.text : C.muted, fontSize: 13, padding: '6px 10px', outline: 'none', cursor: 'pointer' }}
            >
              <option value="">All Properties</option>
              {properties.map((p: any) => <option key={p.id} value={p.id}>{p.address}</option>)}
            </select>
            <select value={filterDays} onChange={e => setFilterDays(e.target.value)}
              style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: filterDays !== 'all' ? C.text : C.muted, fontSize: 13, padding: '6px 10px', outline: 'none', cursor: 'pointer' }}
            >
              <option value="all">All time</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>

            {isFiltered && (
              <button
                onClick={() => { setFilterDisclosures(false); setFilterTemp(['hot','warm','cold']); setFilterStatus([...STATUS_OPTIONS]); setFilterProperty(''); setFilterDays('all') }}
                style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 12, padding: '6px 12px', cursor: 'pointer', fontFamily: 'sans-serif' }}
              >Clear all</button>
            )}
            <span style={{ fontSize: 12, color: C.muted, marginLeft: 'auto' }}>{leads.length} of {allLeads.length}</span>
          </div>

          {/* ── Lead cards ── */}
          <div className="leads-grid" style={{ flex: 1, padding: '20px 28px 40px', fontFamily: 'sans-serif' }}>
            {leads.length === 0 ? (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '72px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 42, marginBottom: 14 }}>📭</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.sub, marginBottom: 8 }}>
                  {allLeads.length === 0 ? 'No leads yet' : 'No leads match your filters'}
                </div>
                <div style={{ fontSize: 14, color: C.muted }}>
                  {allLeads.length === 0 ? 'Place your QR signs to start capturing buyer leads.' : 'Try adjusting or clearing your filters.'}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {leads.map((lead: any, i: number) => {
                  const tier     = leadTier(lead)
                  const cfg      = TIER_CHIP_CFG[tier]
                  const callPri  = computeCallPriority(lead.intent_score ?? 0, lead.last_activity_at ?? lead.created_at)
                  const urgency  = urgencyLabel(callPri)
                  const reason   = topSignalLabel(lead.score_breakdown, tier)
                  const qr       = lead.qr_id ? qrMap[lead.qr_id] : null
                  const lastScan = lead.qr_id ? lastActiveByQr[lead.qr_id] : null
                  const address  = propMap[lead.property_id]
                  const eff      = getEffective(lead)
                  const status   = (eff.status ?? 'new') as StatusKey
                  const signals  = buildSignals(lead.qr_id ? scanEventByQr[lead.qr_id] : null)
                  const notesVal = noteValues[lead.id] ?? eff.notes ?? ''
                  const hasNotes = !!(notesVal.trim())
                  const notesOpen = expandedNotes[lead.id] ?? false
                  const isDdOpen  = openStatusDd === lead.id

                  return (
                    <div
                      key={lead.id}
                      className="lead-card"
                      onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                      style={{
                        background: C.card, border: `1px solid ${C.border}`,
                        borderRadius: 14, padding: '18px 20px',
                        animation: `fadeUp 0.2s ease ${Math.min(i * 0.03, 0.2)}s both`,
                        borderLeft: cfg ? `3px solid ${cfg.border}` : undefined,
                      }}
                    >
                      {/* Row 1: avatar + name + badges + time */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <Avatar name={lead.name || ''} tier={tier} size={42} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{lead.name || 'Unknown'}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <TierBadge tier={tier} />

                              {/* Status badge + per-lead dropdown */}
                              <div data-status-dropdown style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                                <StatusBadge
                                  status={status}
                                  onClick={() => setOpenStatusDd(v => v === lead.id ? null : lead.id)}
                                />
                                {isDdOpen && (
                                  <div style={{
                                    position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50,
                                    background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
                                    overflow: 'hidden', minWidth: 155, boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
                                  }}>
                                    {STATUS_OPTIONS.map(s => {
                                      const scfg = STATUS_CFG[s]
                                      const active = s === status
                                      return (
                                        <button key={s} className="dd-item"
                                          onClick={() => updateStatus(lead.id, s)}
                                          style={{ background: active ? `${C.purple}18` : 'none', fontWeight: active ? 700 : 400 }}
                                        >
                                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: scfg.color, flexShrink: 0, display: 'inline-block' }} />
                                          <span style={{ color: scfg.color, flex: 1 }}>{scfg.label}</span>
                                          {active && <span style={{ fontSize: 11, color: C.muted }}>✓</span>}
                                        </button>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>

                              <span style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>{timeAgo(lead.created_at)}</span>
                            </div>
                          </div>

                          {/* Contact info */}
                          <div style={{ fontSize: 13, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[lead.phone, lead.email].filter(Boolean).join('  ·  ') || <span style={{ color: C.muted }}>No contact info</span>}
                          </div>

                          {/* Signals summary line */}
                          {signals && (
                            <div style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>{signals}</div>
                          )}

                          {/* Contact prefs */}
                          {lead.contact_preference && (
                            <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                              {(lead.contact_preference as string).split(',').map((p: string) => p.trim()).filter(Boolean).map((pref: string) => (
                                <span key={pref} style={{ fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                                  {pref === 'Phone Call' ? '📞' : pref === 'Text' ? '💬' : '✉️'} {pref}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Row 2: property info + last contacted + action buttons */}
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
                          {address && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
                              <span>📍</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{address}</span>
                            </div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.purpleL }}>
                            <span>⚡</span>
                            <span>{lastActiveText(lastScan, lead.created_at)}</span>
                          </div>
                          {qr && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
                              <span>🏷️</span>
                              <span>{qr.label}</span>
                              <span style={{ color: C.border }}>·</span>
                              <span style={{ color: C.purpleL, fontWeight: 600 }}>{qr.scan_count} scan{qr.scan_count !== 1 ? 's' : ''}</span>
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: eff.last_contacted_at ? C.muted : '#EF444460', marginTop: 1 }}>
                            {lastContactedText(eff.last_contacted_at)}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          {/* Strongest signal — the one-line "why" */}
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.sub, background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                            {reason}
                          </span>
                          {/* Urgency tag — tiered off call_priority */}
                          {urgency && (
                            <span style={{ fontSize: 12, fontWeight: 700, color: urgency.color, whiteSpace: 'nowrap' }}>
                              {urgency.label}
                            </span>
                          )}
                          <span title={`Call Priority: ${callPri}`} style={{ fontSize: 10, color: C.muted, background: `${C.purple}18`, border: `1px solid ${C.purple}30`, borderRadius: 6, padding: '2px 6px', fontWeight: 700 }}>
                            P{callPri.toFixed(0)}
                          </span>
                          <div style={{ display: 'flex', gap: 5 }}>
                            {lead.phone && <ActionBtn href={`tel:${lead.phone}`}    title={`Call ${lead.name}`}  emoji="📞" bg="#062014"         border="#166534" />}
                            {lead.phone && <ActionBtn href={`sms:${lead.phone}`}    title={`Text ${lead.name}`}  emoji="💬" bg={`${C.purple}18`}  border={`${C.purple}40`} />}
                            {lead.email && <ActionBtn href={`mailto:${lead.email}`} title={`Email ${lead.name}`} emoji="✉️" bg="#0B1E3A"         border="#1D4ED860" />}
                          </div>
                          {/* Notes toggle */}
                          <button
                            title={notesOpen ? 'Collapse notes' : 'Expand notes'}
                            onClick={e => { e.stopPropagation(); setExpandedNotes(prev => ({ ...prev, [lead.id]: !prev[lead.id] })) }}
                            style={{
                              width: 32, height: 32, borderRadius: 8,
                              border: `1px solid ${notesOpen ? C.purple : C.border}`,
                              background: notesOpen ? `${C.purple}20` : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 14, cursor: 'pointer', position: 'relative', flexShrink: 0,
                            }}
                          >
                            📝
                            {hasNotes && !notesOpen && (
                              <span style={{ position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderRadius: '50%', background: C.purpleL }} />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Expandable notes */}
                      {notesOpen && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}
                          onClick={e => e.stopPropagation()}
                        >
                          <textarea
                            className="notes-ta"
                            value={notesVal}
                            onChange={e => handleNoteChange(lead.id, e.target.value)}
                            onBlur={() => handleNoteBlur(lead.id)}
                            placeholder="Add private notes about this lead…"
                            rows={3}
                            style={{
                              width: '100%', boxSizing: 'border-box',
                              background: C.bg, border: `1px solid ${C.border}`,
                              borderRadius: 8, color: C.text, fontSize: 13,
                              padding: '10px 12px', fontFamily: 'sans-serif', lineHeight: 1.6,
                              transition: 'border-color 0.12s',
                            }}
                          />
                          <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
                            {savingNotes[lead.id] ? '⟳ Saving…' : hasNotes ? '✓ Saved' : 'Auto-saves on blur'}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </DashboardLayout>
  )
}
