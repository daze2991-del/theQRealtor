'use client'

import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { createBrowserSupabase } from '../../../lib/supabase-browser'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../../components/DashboardLayout'

// Migration comments (do not run):
// ALTER TABLE qrcodes ADD COLUMN type text DEFAULT 'property';
// ALTER TABLE qrcodes ADD COLUMN open_house_data jsonb;

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

const AMBER  = '#D97706'
const AMBERL = '#F59E0B'

const TH: React.CSSProperties = {
  padding: '10px 18px', textAlign: 'left',
  fontSize: 10.5, fontWeight: 700, color: C.muted,
  textTransform: 'uppercase', letterSpacing: '0.08em',
  borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
  background: '#15151E',
}
const TD: React.CSSProperties = {
  padding: '12px 18px', borderBottom: `1px solid ${C.border}`,
  fontSize: 13.5, color: C.sub, verticalAlign: 'middle',
}

function placementIcon(p?: string): string {
  switch (p) {
    case 'Yard Sign':        return '🪧'
    case 'Directional Sign': return '➡️'
    case 'Open House Table': return '🏡'
    case 'Window Sign':      return '🪟'
    case 'Flyer / Mailer':   return '📄'
    case 'Other':            return '📍'
    default:                 return ''
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function StepDots({ step, color }: { step: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24 }}>
      {[1, 2, 3].map(n => (
        <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', fontSize: 12, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: n <= step ? color : C.border,
            color: n <= step ? '#fff' : C.muted,
            border: `2px solid ${n === step ? color : n < step ? color : C.border}`,
            transition: 'all 0.2s',
          }}>
            {n < step ? '✓' : n}
          </div>
          {n < 3 && <div style={{ width: 28, height: 2, background: n < step ? color : C.border, transition: 'all 0.2s' }} />}
        </div>
      ))}
    </div>
  )
}

function TrafficTips() {
  return (
    <div style={{ background: '#052E16', border: '1px solid #166534', borderRadius: 10, padding: '12px 14px', marginTop: 12 }}>
      <div style={{ fontSize: 11, color: '#4ADE80', fontWeight: 700, marginBottom: 8 }}>Placement tips for Traffic Mode:</div>
      <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {[
          'Space signs 10–15 ft apart along the path',
          'Place at eye level for pedestrians',
          'Works great near park entrances, shopping areas, busy corners',
          'Each sign uses the same QR — no extras to generate',
        ].map((t, i) => <li key={i} style={{ fontSize: 12, color: '#86EFAC' }}>{t}</li>)}
      </ul>
    </div>
  )
}

export default function QRCodesPage() {
  const router    = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router

  // ── existing state ──
  const [qrCodes,      setQrCodes]      = useState<any[]>([])
  const [properties,   setProperties]   = useState<any[]>([])
  const [leadCounts,   setLeadCounts]   = useState<Record<string, number>>({})
  const [lastActivity, setLastActivity] = useState<Record<string, string>>({})
  const [filterPropId, setFilterPropId] = useState('all')
  const [loading,      setLoading]      = useState(true)
  const [origin,       setOrigin]       = useState('')
  const [copiedId,     setCopiedId]     = useState<string | null>(null)
  const [expandedQr,   setExpandedQr]   = useState<{ id: string; label: string; property: string } | null>(null)

  // ── new state ──
  const [agentFullName, setAgentFullName] = useState('')
  const [activeModal,   setActiveModal]   = useState<'property' | 'openhouse' | null>(null)
  const [modalStep,     setModalStep]     = useState(1)
  const [modalPropId,   setModalPropId]   = useState('')
  const [signFormat,    setSignFormat]    = useState<string | null>(null)
  const [trafficMode,   setTrafficMode]   = useState(false)
  const [ohDate,        setOhDate]        = useState('')
  const [ohTime,        setOhTime]        = useState('')
  const [ohCapture,     setOhCapture]     = useState({ name: true, email: true, phone: true, agent: true })
  const [modalCopied,   setModalCopied]   = useState(false)

  // ── create QR modal state ──
  const [createModal,  setCreateModal]  = useState(false)
  const [createPropId, setCreatePropId] = useState('')
  const [createName,   setCreateName]   = useState('')
  const [createType,   setCreateType]   = useState<'property' | 'openhouse'>('property')
  const [createFormat, setCreateFormat] = useState<'outdoor' | 'indoor'>('outdoor')
  const [createSaving, setCreateSaving] = useState(false)
  const [createError,  setCreateError]  = useState('')

  useEffect(() => { setOrigin(window.location.origin) }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const supabase = createBrowserSupabase()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { routerRef.current.push('/auth'); return }

        const [{ data: props }, { data: profile }] = await Promise.all([
          supabase.from('properties').select('id, address').eq('user_id', session.user.id).order('created_at', { ascending: false }),
          supabase.from('profiles').select('full_name').eq('id', session.user.id).single(),
        ])

        if (cancelled) return
        setProperties(props || [])
        setAgentFullName(profile?.full_name || '')

        if (props && props.length > 0) {
          const propIds = props.map((p: any) => p.id)
          const [{ data: codes }, { data: leads }] = await Promise.all([
            supabase.from('qrcodes').select('*').in('property_id', propIds).order('created_at', { ascending: false }),
            supabase.from('leads').select('qr_id, created_at').in('property_id', propIds).order('created_at', { ascending: false }),
          ])
          if (cancelled) return

          const leadMap: Record<string, number> = {}
          const actMap:  Record<string, string>  = {}
          ;(leads || []).forEach((l: any) => {
            if (l.qr_id) {
              leadMap[l.qr_id] = (leadMap[l.qr_id] || 0) + 1
              if (!actMap[l.qr_id]) actMap[l.qr_id] = l.created_at
            }
          })
          if (codes && codes.length > 0) {
            const qrIds = codes.map((c: any) => c.id)
            const { data: scans } = await supabase.from('scan_events').select('qr_id, created_at').in('qr_id', qrIds).order('created_at', { ascending: false })
            ;(scans || []).forEach((s: any) => {
              if (!s.qr_id) return
              if (!actMap[s.qr_id] || s.created_at > actMap[s.qr_id]) actMap[s.qr_id] = s.created_at
            })
          }
          setQrCodes(codes || [])
          setLeadCounts(leadMap)
          setLastActivity(actMap)
        }
      } catch (err) {
        console.error('[QRCodesPage] load error:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const openModal = (type: 'property' | 'openhouse') => {
    setActiveModal(type); setModalStep(1); setModalPropId(''); setSignFormat(null)
    setTrafficMode(false); setOhDate(''); setOhTime(''); setModalCopied(false)
    setOhCapture({ name: true, email: true, phone: true, agent: true })
  }

  const propMap       = Object.fromEntries(properties.map((p: any) => [p.id, p.address]))
  const filteredCodes = filterPropId === 'all' ? qrCodes : qrCodes.filter(q => q.property_id === filterPropId)

  const downloadQR = (qrId: string, label: string) => {
    const svg = document.getElementById(`qr-dl-${qrId}`)
    if (!svg) return
    const svgStr = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    canvas.width = 300; canvas.height = 300
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 300, 300); ctx.drawImage(img, 0, 0, 300, 300)
      const a = document.createElement('a')
      a.download = `${label.replace(/\s+/g, '-').toLowerCase()}.png`
      a.href = canvas.toDataURL('image/png'); a.click()
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr)
  }

  const downloadModalQR = () => {
    const svg = document.getElementById('qr-modal-preview')
    if (!svg) return
    const svgStr = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    canvas.width = 300; canvas.height = 300
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 300, 300); ctx.drawImage(img, 0, 0, 300, 300)
      const a = document.createElement('a')
      const slug = activeModal === 'openhouse' ? 'open-house' : (propMap[modalPropId] || 'qr').replace(/\s+/g, '-').toLowerCase()
      a.download = `${slug}.png`; a.href = canvas.toDataURL('image/png'); a.click()
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr)
  }

  const copyLink = async (qrId: string) => {
    try {
      await navigator.clipboard.writeText(`${origin}/q/${qrId}`)
      setCopiedId(qrId)
      setTimeout(() => setCopiedId(id => id === qrId ? null : id), 2000)
    } catch { /* clipboard unavailable */ }
  }

  const copyModalLink = async () => {
    try {
      const url = activeModal === 'openhouse'
        ? `${origin}/open-house/${modalPropId}`
        : `${origin}/p/${modalPropId}`
      await navigator.clipboard.writeText(url)
      setModalCopied(true); setTimeout(() => setModalCopied(false), 2000)
    } catch {}
  }

  const openCreateModal = () => {
    setCreatePropId(''); setCreateName(''); setCreateType('property')
    setCreateFormat('outdoor'); setCreateError(''); setCreateModal(true)
  }

  const submitCreateQR = async () => {
    const name = createName.trim()
    if (!createPropId || !name) return
    setCreateSaving(true); setCreateError('')
    try {
      const supabase = createBrowserSupabase()
      const { data, error } = await supabase.from('qrcodes').insert({
        property_id: createPropId,
        label: name,
        placement: createFormat === 'outdoor' ? 'Yard Sign' : 'Window Sign',
        type: createType,
        scan_count: 0,
      }).select().single()
      if (error) { setCreateError('Failed to create QR code. Please try again.') }
      else { setQrCodes(prev => [data, ...prev]); setCreateModal(false) }
    } catch { setCreateError('Something went wrong. Please try again.') }
    finally { setCreateSaving(false) }
  }

  const accent  = activeModal === 'openhouse' ? AMBER  : C.purple
  const accentL = activeModal === 'openhouse' ? AMBERL : C.purpleL

  // ── shared sign-format step (used by both modals) ──
  const formats = activeModal === 'openhouse'
    ? [
        { id: 'aframe', icon: '🔼', title: 'A-Frame',          size: '18"×24"', desc: 'Sidewalk or driveway sandwich board' },
        { id: 'flyer',  icon: '📄', title: 'Open House Flyer',  size: '8.5"×11"', desc: 'Handout with photo + details' },
      ]
    : [
        { id: 'hang',   icon: '🪧', title: 'Hang Sign',   size: '6"×12"',  desc: 'Clips onto yard sign post rider' },
        { id: 'window', icon: '🪟', title: 'Window Sign', size: '5"×7"',   desc: 'Adheres to window or door glass' },
      ]

  return (
    <DashboardLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .qr-row:hover td { background: #1E1E2A !important; }
        .qr-row:last-child td { border-bottom: none !important; }
        .modal-input { background: #0F0F13; border: 1px solid #252533; border-radius: 8px; padding: 10px 12px; font-size: 14px; color: #fff; width: 100%; box-sizing: border-box; outline: none; font-family: sans-serif; }
        .modal-input:focus { border-color: #7C3AED; }
      `}</style>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 32, height: 32, border: `2px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : (
        <>
          {/* ── top bar ── */}
          <div className="db-page-topbar" style={{ padding: '16px 28px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.bg, position: 'sticky', top: 0, zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h1 style={{ fontSize: 19, fontWeight: 700, color: C.text, margin: 0 }}>QR Codes</h1>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.purpleL, background: `${C.purple}22`, borderRadius: 20, padding: '2px 9px' }}>{qrCodes.length}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {properties.length > 1 && (
                <select value={filterPropId} onChange={e => setFilterPropId(e.target.value)}
                  style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: filterPropId === 'all' ? C.muted : C.text, fontSize: 13, padding: '7px 12px', cursor: 'pointer', outline: 'none' }}>
                  <option value="all">All Properties</option>
                  {properties.map((p: any) => <option key={p.id} value={p.id}>{p.address}</option>)}
                </select>
              )}
              <button
                onClick={openCreateModal}
                style={{ background: C.purple, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                + Generate QR Code
              </button>
            </div>
          </div>

          {/* ── generate new QR header ── */}
          <div style={{ padding: '28px 28px 0', fontFamily: 'sans-serif' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Generate New QR</h2>
            <p style={{ fontSize: 14, color: C.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
              Create QR codes for listings and open houses. Track scans, leads, and engagement from every property.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 24 }}>
              {['📱 Buyer Scans Sign', '🏡 Property Page', '📋 Lead Capture', '📊 Your Dashboard'].map((s, i, arr) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ background: `${C.purple}18`, border: `1px solid ${C.purple}35`, borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 600, color: C.sub, whiteSpace: 'nowrap' }}>{s}</span>
                  {i < arr.length - 1 && <span style={{ color: C.muted, fontSize: 12 }}>→</span>}
                </div>
              ))}
            </div>

            {/* ── type cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 32 }}>

              {/* Property QR */}
              <div style={{ background: C.card, border: `1px solid ${C.purple}40`, borderRadius: 16, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 28 }}>🏡</span>
                    <span style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Property QR</span>
                  </div>
                  <span style={{ background: `${C.purple}20`, border: `1px solid ${C.purple}40`, borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 700, color: C.purpleL }}>Popular</span>
                </div>
                <div style={{ background: '#1F1630', border: `1px solid ${C.purple}25`, borderRadius: 6, padding: '5px 10px', fontSize: 11, color: C.muted, marginBottom: 14, display: 'inline-block' }}>
                  Use for: Yard signs, window signs, property flyers
                </div>
                <p style={{ fontSize: 13.5, color: C.sub, margin: '0 0 14px', lineHeight: 1.6 }}>
                  A buyer walks by your listing, scans the sign, and instantly sees photos, price, and your contact info.
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  {['🪧 Hang Sign', '🪟 Window', '📄 Flyer'].map(p => (
                    <span key={p} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 20, padding: '3px 10px', fontSize: 11, color: C.muted }}>{p}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
                  {['Property Details', 'Photo Gallery', 'Contact Agent', 'Lead Capture', 'Analytics'].map(item => (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.sub }}>
                      <span style={{ color: '#4ADE80', fontWeight: 700 }}>✓</span>{item}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                  {[['74', 'avg scans'], ['8', 'avg leads']].map(([n, l]) => (
                    <div key={l} style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: C.purpleL }}>{n}</div>
                      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => openModal('property')} style={{ width: '100%', background: C.purple, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  Generate Property QR →
                </button>
              </div>

              {/* Open House QR */}
              <div style={{ background: C.card, border: `1px solid ${AMBER}40`, borderRadius: 16, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 28 }}>🏠</span>
                  <span style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Open House QR</span>
                </div>
                <div style={{ background: '#1A1200', border: `1px solid ${AMBER}25`, borderRadius: 6, padding: '5px 10px', fontSize: 11, color: C.muted, marginBottom: 14, display: 'inline-block' }}>
                  Use for: Open house events, A-frame signs, flyers
                </div>
                <p style={{ fontSize: 13.5, color: C.sub, margin: '0 0 14px', lineHeight: 1.6 }}>
                  Visitors check in when they arrive at your open house. Captures name, email, phone, and buyer intent signals.
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  {['🔼 A-Frame', '📄 Flyer', '🪧 Hang Sign'].map(p => (
                    <span key={p} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 20, padding: '3px 10px', fontSize: 11, color: C.muted }}>{p}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
                  {['Visitor Check-In', 'Contact Capture', 'Property Info', 'Agent Status Q', 'Analytics'].map(item => (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.sub }}>
                      <span style={{ color: '#4ADE80', fontWeight: 700 }}>✓</span>{item}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                  {[['41', 'avg visitors'], ['12', 'avg leads']].map(([n, l]) => (
                    <div key={l} style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: AMBERL }}>{n}</div>
                      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => openModal('openhouse')} style={{ width: '100%', background: AMBER, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  Generate Open House QR →
                </button>
              </div>
            </div>
          </div>

          {/* ── QR table ── */}
          <div style={{ padding: '0 28px', fontFamily: 'sans-serif' }}>
            {qrCodes.length === 0 ? (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '72px 32px', textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>◫</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>No QR codes yet</div>
                <div style={{ fontSize: 14, color: C.muted, maxWidth: 360, margin: '0 auto 24px' }}>
                  {properties.length === 0 ? 'Add a property first, then create QR codes to track buyer scans.' : 'Create QR codes from your properties page to start tracking buyer activity.'}
                </div>
                <Link href={properties.length === 0 ? '/dashboard/new-property' : '/dashboard/properties'} style={{ background: C.purple, color: '#fff', fontSize: 14, fontWeight: 700, padding: '10px 24px', borderRadius: 10, textDecoration: 'none' }}>
                  {properties.length === 0 ? '+ Add a Property' : '→ Go to Properties'}
                </Link>
              </div>
            ) : filteredCodes.length === 0 ? (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '48px 32px', textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: C.muted }}>No QR codes for this property.</div>
              </div>
            ) : (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={TH}>QR Label</th>
                        <th style={TH}>Type</th>
                        <th style={TH}>Property</th>
                        <th style={{ ...TH, textAlign: 'center' }}>Scans</th>
                        <th style={{ ...TH, textAlign: 'center' }}>Leads</th>
                        <th style={{ ...TH, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCodes.map((qr: any) => {
                        const isOH = (qr.type || 'property') === 'openhouse'
                        return (
                          <tr key={qr.id} className="qr-row">
                            <td style={TD}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                {origin && (
                                  <div onClick={e => { e.stopPropagation(); setExpandedQr({ id: qr.id, label: qr.label, property: propMap[qr.property_id] || '' }) }}
                                    title="Click to expand"
                                    style={{ flexShrink: 0, background: '#fff', borderRadius: 6, padding: 3, width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-in' }}>
                                    <QRCodeSVG value={`${origin}/q/${qr.id}`} size={36} />
                                  </div>
                                )}
                                <div>
                                  <div style={{ fontWeight: 600, color: C.text, fontSize: 13.5 }}>{qr.label}</div>
                                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                                    {lastActivity[qr.id] ? `Last activity: ${timeAgo(lastActivity[qr.id])}` : 'No activity yet'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={TD}>
                              <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap',
                                background: isOH ? `${AMBER}20`    : `${C.purple}20`,
                                color:      isOH ? AMBERL           : C.purpleL,
                                border:     `1px solid ${isOH ? AMBER + '40' : C.purple + '40'}`,
                              }}>
                                {isOH ? '🏠 Open House QR' : '🏡 Property QR'}
                              </span>
                            </td>
                            <td style={{ ...TD, maxWidth: 200 }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.muted, fontSize: 13 }}>
                                {propMap[qr.property_id] || '—'}
                              </div>
                            </td>
                            <td style={{ ...TD, textAlign: 'center' }}>
                              <span style={{ fontWeight: 700, color: C.purpleL, background: `${C.purple}18`, border: `1px solid ${C.purple}30`, borderRadius: 6, padding: '2px 10px', fontSize: 13 }}>
                                {qr.scan_count}
                              </span>
                            </td>
                            <td style={{ ...TD, textAlign: 'center' }}>
                              <span style={{ fontWeight: 700, color: '#FCD34D', background: '#1A170D', border: '1px solid #3A3520', borderRadius: 6, padding: '2px 10px', fontSize: 13 }}>
                                {leadCounts[qr.id] || 0}
                              </span>
                            </td>
                            <td style={{ ...TD, textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                {origin && (
                                  <button
                                    onClick={() => {
                                      const url = isOH
                                        ? `${origin}/open-house/${qr.property_id}`
                                        : `${origin}/p/${qr.property_id}?qr=${qr.id}`
                                      window.open(url, '_blank')
                                    }}
                                    title="Test QR — open buyer page"
                                    style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                    🔗 Test QR
                                  </button>
                                )}
                                <button onClick={() => downloadQR(qr.id, qr.label)} title="Download PNG"
                                  style={{ background: 'transparent', color: '#00D4AA', border: '1px solid #004D3D', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  ⬇ PNG
                                </button>
                                <Link href={`/dashboard/sign-studio/${qr.id}`} title="Open Sign Studio"
                                  style={{ background: 'transparent', color: C.purpleL, border: `1px solid ${C.purple}50`, borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                                  🎨 Sign Studio
                                </Link>
                                <button onClick={() => copyLink(qr.id)} title="Copy QR link"
                                  style={{ background: copiedId === qr.id ? `${C.purple}30` : 'transparent', color: copiedId === qr.id ? C.purpleL : C.muted, border: `1px solid ${copiedId === qr.id ? C.purple + '60' : C.border}`, borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                                  {copiedId === qr.id ? '✓ Copied' : '⎘ Copy Link'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ── top performing ── */}
          {qrCodes.length > 0 && (
            <div style={{ padding: '24px 28px 40px', fontFamily: 'sans-serif' }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 20 }}>
                  Top Performing QR Codes
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#FFD700', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>🥇 By Leads</div>
                    {[...qrCodes].map(q => ({ ...q, leads: leadCounts[q.id] || 0 })).sort((a, b) => b.leads - a.leads).slice(0, 5).map((q, i) => (
                      <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <span style={{ fontSize: 13, width: 20, flexShrink: 0 }}>{i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                          <span style={{ fontSize: 12, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.placement ? `${placementIcon(q.placement)} ` : ''}{q.label}{q.placement ? ` · ${q.placement}` : ''}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#FFD700', flexShrink: 0, marginLeft: 8 }}>{q.leads} leads</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: C.purpleL, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>📊 By Scans</div>
                    {[...qrCodes].sort((a, b) => (b.scan_count || 0) - (a.scan_count || 0)).slice(0, 5).map((q, i) => (
                      <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <span style={{ fontSize: 13, width: 20, flexShrink: 0 }}>{i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                          <span style={{ fontSize: 12, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.placement ? `${placementIcon(q.placement)} ` : ''}{q.label}{q.placement ? ` · ${q.placement}` : ''}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.purpleL, flexShrink: 0, marginLeft: 8 }}>{q.scan_count || 0} scans</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#34D399', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>⚡ Conversion Rate</div>
                    {[...qrCodes].map(q => {
                      const scans = q.scan_count || 0; const leads = leadCounts[q.id] || 0
                      return { ...q, leads, scans, rate: scans > 0 ? ((leads / scans) * 100).toFixed(1) : null }
                    }).filter(q => q.scans > 0).sort((a, b) => parseFloat(b.rate || '0') - parseFloat(a.rate || '0')).slice(0, 5).map((q, i) => (
                      <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <span style={{ fontSize: 13, width: 20, flexShrink: 0 }}>{i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                          <span style={{ fontSize: 12, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.placement ? `${placementIcon(q.placement)} ` : ''}{q.label}{q.placement ? ` · ${q.placement}` : ''}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#34D399', flexShrink: 0, marginLeft: 8 }}>{q.rate}%</span>
                      </div>
                    ))}
                    {qrCodes.every(q => !q.scan_count) && <div style={{ fontSize: 12, color: C.muted }}>No scan data yet.</div>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* hidden SVGs for table PNG download */}
          {origin && (
            <div style={{ position: 'absolute', left: -9999, top: 0, opacity: 0, pointerEvents: 'none' }} aria-hidden>
              {qrCodes.map((qr: any) => <QRCodeSVG key={qr.id} id={`qr-dl-${qr.id}`} value={`${origin}/q/${qr.id}`} size={240} />)}
            </div>
          )}
        </>
      )}

      {/* ── expand modal ── */}
      {expandedQr && origin && (
        <div onClick={() => setExpandedQr(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, padding: '32px 32px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, position: 'relative', maxWidth: 420, width: '100%', boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}>
            <button onClick={() => setExpandedQr(null)} aria-label="Close" style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: '50%', background: '#F3F4F6', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#374151', fontFamily: 'sans-serif' }}>✕</button>
            <QRCodeSVG value={`${origin}/q/${expandedQr.id}`} size={300} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginBottom: 4 }}>{expandedQr.label}</div>
              {expandedQr.property && <div style={{ fontSize: 13, color: '#6B7280' }}>{expandedQr.property}</div>}
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 10 }}>Point your camera at the QR code to test the scan</div>
            </div>
          </div>
        </div>
      )}

      {/* ── generation modal ── */}
      {activeModal && (
        <div onClick={() => setActiveModal(null)} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'sans-serif' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${accent}40`, borderRadius: 20, padding: 32, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.6)', position: 'relative' }}>

            <button onClick={() => setActiveModal(null)} style={{ position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: '50%', background: C.bg, border: `1px solid ${C.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: C.muted }}>✕</button>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: accentL, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                {activeModal === 'property' ? '🏡 Property QR' : '🏠 Open House QR'}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>
                {modalStep === 1 ? (activeModal === 'property' ? 'Select a Property' : 'Open House Details') : modalStep === 2 ? 'Pick Sign Format' : 'Your QR Code is Ready'}
              </div>
            </div>

            <StepDots step={modalStep} color={accent} />

            {/* ── step 1 ── */}
            {modalStep === 1 && activeModal === 'property' && (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                  {properties.map((p: any) => (
                    <button key={p.id} onClick={() => setModalPropId(p.id)}
                      style={{ width: '100%', textAlign: 'left', padding: '14px 16px', background: modalPropId === p.id ? `${C.purple}20` : C.bg, border: `1px solid ${modalPropId === p.id ? C.purple : C.border}`, borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s', fontSize: 14, fontWeight: modalPropId === p.id ? 700 : 500, color: modalPropId === p.id ? C.text : C.sub, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>🏡 {p.address}</span>
                      {modalPropId === p.id && <span style={{ color: C.purpleL }}>✓</span>}
                    </button>
                  ))}
                  <Link href="/dashboard/properties" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', background: C.bg, border: `1px dashed ${C.border}`, borderRadius: 10, textDecoration: 'none', fontSize: 14, fontWeight: 600, color: C.muted }}>
                    <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Add New Property
                  </Link>
                </div>
                <button onClick={() => modalPropId && setModalStep(2)} disabled={!modalPropId}
                  style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: modalPropId ? C.purple : C.border, color: modalPropId ? '#fff' : C.muted, fontSize: 15, fontWeight: 700, cursor: modalPropId ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
                  Next: Pick Format →
                </button>
              </div>
            )}

            {modalStep === 1 && activeModal === 'openhouse' && (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Property Address</label>
                    <select value={modalPropId} onChange={e => setModalPropId(e.target.value)}
                      style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: modalPropId ? C.text : C.muted, fontSize: 14, padding: '10px 12px', width: '100%', outline: 'none', cursor: 'pointer' }}>
                      <option value="">Select a property…</option>
                      {properties.map((p: any) => <option key={p.id} value={p.id}>{p.address}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Date</label>
                      <input className="modal-input" type="text" placeholder="e.g. Saturday, Jun 21" value={ohDate} onChange={e => setOhDate(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Time</label>
                      <input className="modal-input" type="text" placeholder="e.g. 1:00–4:00 PM" value={ohTime} onChange={e => setOhTime(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Hosting Agent</label>
                    <input className="modal-input" type="text" placeholder="Agent name" value={agentFullName} onChange={e => setAgentFullName(e.target.value)} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Capture at Check-In</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {([
                        { key: 'name',  label: 'Name'  },
                        { key: 'email', label: 'Email' },
                        { key: 'phone', label: 'Phone' },
                        { key: 'agent', label: 'Are you working with an agent?' },
                      ] as { key: keyof typeof ohCapture; label: string }[]).map(({ key, label }) => (
                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13.5, color: C.sub }}>
                          <input type="checkbox" checked={ohCapture[key]} onChange={e => setOhCapture(prev => ({ ...prev, [key]: e.target.checked }))}
                            style={{ width: 16, height: 16, accentColor: AMBER, cursor: 'pointer', flexShrink: 0 }} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <button onClick={() => modalPropId && setModalStep(2)} disabled={!modalPropId}
                  style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: modalPropId ? AMBER : C.border, color: modalPropId ? '#fff' : C.muted, fontSize: 15, fontWeight: 700, cursor: modalPropId ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
                  Next: Pick Format →
                </button>
              </div>
            )}

            {/* ── step 2 ── */}
            {modalStep === 2 && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                  {formats.map(fmt => (
                    <button key={fmt.id} onClick={() => setSignFormat(fmt.id)}
                      style={{ padding: '18px 16px', borderRadius: 12, border: `2px solid ${signFormat === fmt.id ? accent : C.border}`, background: signFormat === fmt.id ? `${accent}15` : C.bg, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>{fmt.icon}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>{fmt.title}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: accentL, marginBottom: 4 }}>{fmt.size}</div>
                      <div style={{ fontSize: 12, color: C.muted }}>{fmt.desc}</div>
                    </button>
                  ))}
                </div>
                <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={trafficMode} onChange={e => setTrafficMode(e.target.checked)}
                      style={{ marginTop: 2, width: 16, height: 16, accentColor: '#22c55e', cursor: 'pointer', flexShrink: 0 }} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>🚶 Enable Traffic Mode</span>
                        <span style={{ background: '#052E16', border: '1px solid #166534', borderRadius: 20, padding: '1px 8px', fontSize: 10, fontWeight: 700, color: '#4ADE80' }}>Boost scans</span>
                      </div>
                      <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.5 }}>
                        Place multiple A-frames along high foot traffic areas — sidewalks, neighborhood paths, or busy corners — to maximize how many people see and scan your listing.
                      </p>
                    </div>
                  </label>
                  {trafficMode && <TrafficTips />}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setModalStep(1)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>← Back</button>
                  <button onClick={() => signFormat && setModalStep(3)} disabled={!signFormat}
                    style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: signFormat ? accent : C.border, color: signFormat ? '#fff' : C.muted, fontSize: 15, fontWeight: 700, cursor: signFormat ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
                    Generate QR Code →
                  </button>
                </div>
              </div>
            )}

            {/* ── step 3 ── */}
            {modalStep === 3 && origin && modalPropId && (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, marginBottom: 20 }}>
                  <div style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 12 }}>
                    <QRCodeSVG
                      id="qr-modal-preview"
                      value={activeModal === 'openhouse' ? `${origin}/open-house/${modalPropId}` : `${origin}/p/${modalPropId}`}
                      size={200}
                    />
                  </div>
                  <div style={{ fontSize: 13, color: C.muted, textAlign: 'center' }}>{propMap[modalPropId]}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                    {origin}/{activeModal === 'openhouse' ? 'open-house' : 'p'}/{modalPropId}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <button onClick={downloadModalQR}
                    style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: accent, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    ⬇ Download PNG
                  </button>
                  <button onClick={copyModalLink}
                    style={{ flex: 1, padding: '11px', borderRadius: 10, border: `1px solid ${accent}50`, background: modalCopied ? `${accent}20` : 'transparent', color: modalCopied ? accentL : C.sub, fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}>
                    {modalCopied ? '✓ Copied' : '⎘ Copy Link'}
                  </button>
                </div>
                <div style={{ background: '#1A120A', border: `1px solid ${AMBER}30`, borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 13, color: '#FCD34D', fontWeight: 700, marginBottom: 6 }}>⚠️ Used the wrong QR type?</div>
                  <p style={{ fontSize: 12, color: C.sub, margin: '0 0 10px', lineHeight: 1.55 }}>
                    No need to start over. Switch this QR to {activeModal === 'property' ? 'Open House QR' : 'Property QR'} without regenerating. The link stays the same — only what visitors see changes.
                  </p>
                  <button style={{ fontSize: 12, fontWeight: 700, color: AMBERL, background: 'transparent', border: `1px solid ${AMBER}40`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>
                    Switch to {activeModal === 'property' ? 'Open House QR' : 'Property QR'} →
                  </button>
                </div>
                <button onClick={() => setModalStep(2)} style={{ width: '100%', marginTop: 12, padding: '10px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>← Back</button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* ── create QR modal ── */}
      {createModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setCreateModal(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'sans-serif' }}
        >
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>Generate New QR Code</h2>
              <button onClick={() => setCreateModal(false)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1 }}>✕</button>
            </div>

            {/* Property selector */}
            <label style={{ display: 'block', marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Property</div>
              <select
                value={createPropId}
                onChange={e => setCreatePropId(e.target.value)}
                style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 13px', color: createPropId ? C.text : C.muted, fontSize: 13, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
              >
                <option value="">Select a property…</option>
                {properties.map((p: any) => <option key={p.id} value={p.id}>{p.address}</option>)}
              </select>
            </label>

            {/* Sign Name */}
            <label style={{ display: 'block', marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Sign Name</div>
              <input
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                placeholder="e.g. Front Lawn, Street Corner, Backyard, A-Frame"
                style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 13px', color: C.text, fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
              />
              <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>Name this sign so you can identify it later.</div>
            </label>

            {/* QR Type */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>QR Type</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {([
                  { id: 'property'  as const, icon: '🏡', title: 'Property QR',   desc: 'For active listings. Buyers scan and see property details, photos, and contact options.', features: ['Lead Capture', 'Photo Gallery', 'Request Showing', 'Analytics'] },
                  { id: 'openhouse' as const, icon: '🏠', title: 'Open House QR', desc: 'Capture visitor info before, during, and after an open house.',                          features: ['Visitor Check-In', 'Contact Capture', 'Follow-Up', 'Analytics'] },
                ]).map(qt => (
                  <button key={qt.id} onClick={() => setCreateType(qt.id)}
                    style={{ padding: '14px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', border: `2px solid ${createType === qt.id ? C.purple : C.border}`, background: createType === qt.id ? `${C.purple}14` : C.bg }}>
                    <div style={{ fontSize: 22, marginBottom: 6 }}>{qt.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 5 }}>{qt.title}</div>
                    <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.4, marginBottom: 8 }}>{qt.desc}</div>
                    {qt.features.map(f => (
                      <div key={f} style={{ fontSize: 11, color: C.sub, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                        <span style={{ color: '#4ade80', fontSize: 10 }}>✓</span> {f}
                      </div>
                    ))}
                  </button>
                ))}
              </div>
            </div>

            {/* Sign Format */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Sign Format</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {([
                  { id: 'outdoor' as const, label: 'Outdoor Sign', desc: 'Standard QR for yard signs and riders' },
                  { id: 'indoor'  as const, label: 'Indoor Sheet', desc: 'QR formatted for printed indoor sign sheets' },
                ]).map(fmt => (
                  <label key={fmt.id} style={{ cursor: 'pointer' }}>
                    <input type="radio" name="createFmt" checked={createFormat === fmt.id} onChange={() => setCreateFormat(fmt.id)} style={{ display: 'none' }} />
                    <div style={{ padding: '12px 14px', borderRadius: 10, transition: 'all 0.15s', border: `2px solid ${createFormat === fmt.id ? C.purple : C.border}`, background: createFormat === fmt.id ? `${C.purple}12` : C.bg }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 3 }}>{fmt.label}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{fmt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {createError && <p style={{ color: '#F87171', fontSize: 12, marginBottom: 14 }}>{createError}</p>}

            <button
              onClick={submitCreateQR}
              disabled={createSaving || !createPropId || !createName.trim()}
              style={{ width: '100%', background: createSaving || !createPropId || !createName.trim() ? `${C.purple}60` : C.purple, border: 'none', borderRadius: 10, padding: '13px', color: '#fff', fontSize: 14, fontWeight: 700, cursor: createSaving || !createPropId || !createName.trim() ? 'not-allowed' : 'pointer', marginBottom: 12 }}
            >
              {createSaving ? 'Generating…' : 'Generate QR Code'}
            </button>
            <div style={{ textAlign: 'center' }}>
              <button onClick={() => setCreateModal(false)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
