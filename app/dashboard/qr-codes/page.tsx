'use client'

import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { createBrowserSupabase } from '../../../lib/supabase-browser'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../../components/DashboardLayout'

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

const TH_STYLE: React.CSSProperties = {
  padding: '10px 18px', textAlign: 'left',
  fontSize: 10.5, fontWeight: 700, color: C.muted,
  textTransform: 'uppercase', letterSpacing: '0.08em',
  borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
  background: '#15151E',
}

const TD_STYLE: React.CSSProperties = {
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
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function QRCodesPage() {
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router

  const [qrCodes, setQrCodes]         = useState<any[]>([])
  const [properties, setProperties]   = useState<any[]>([])
  const [leadCounts, setLeadCounts]   = useState<Record<string, number>>({})
  const [lastActivity, setLastActivity] = useState<Record<string, string>>({})
  const [filterPropId, setFilterPropId] = useState<string>('all')
  const [loading, setLoading]         = useState(true)
  const [origin, setOrigin]           = useState('')
  const [copiedId, setCopiedId]       = useState<string | null>(null)
  const [expandedQr, setExpandedQr]   = useState<{ id: string; label: string; property: string } | null>(null)

  useEffect(() => { setOrigin(window.location.origin) }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const supabase = createBrowserSupabase()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { routerRef.current.push('/auth'); return }

        const { data: props } = await supabase
          .from('properties').select('id, address').eq('user_id', session.user.id)
          .order('created_at', { ascending: false })

        if (cancelled) return
        setProperties(props || [])

        if (props && props.length > 0) {
          const propIds = props.map((p: any) => p.id)
          const [{ data: codes }, { data: leads }] = await Promise.all([
            supabase.from('qrcodes').select('*').in('property_id', propIds).order('created_at', { ascending: false }),
            supabase.from('leads').select('qr_id, created_at').in('property_id', propIds).order('created_at', { ascending: false }),
          ])

          if (cancelled) return

          const leadMap: Record<string, number> = {}
          const activityMap: Record<string, string> = {}
          ;(leads || []).forEach((l: any) => {
            if (l.qr_id) {
              leadMap[l.qr_id] = (leadMap[l.qr_id] || 0) + 1
              if (!activityMap[l.qr_id]) activityMap[l.qr_id] = l.created_at
            }
          })

          // also get latest scan_events per QR
          if (codes && codes.length > 0) {
            const qrIds = codes.map((c: any) => c.id)
            const { data: scans } = await supabase
              .from('scan_events')
              .select('qr_id, created_at')
              .in('qr_id', qrIds)
              .order('created_at', { ascending: false })
            ;(scans || []).forEach((s: any) => {
              if (s.qr_id && !activityMap[s.qr_id]) activityMap[s.qr_id] = s.created_at
              else if (s.qr_id && activityMap[s.qr_id] && s.created_at > activityMap[s.qr_id]) {
                activityMap[s.qr_id] = s.created_at
              }
            })
          }

          setQrCodes(codes || [])
          setLeadCounts(leadMap)
          setLastActivity(activityMap)
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

  const propMap = Object.fromEntries(properties.map((p: any) => [p.id, p.address]))

  const filteredCodes = filterPropId === 'all'
    ? qrCodes
    : qrCodes.filter(q => q.property_id === filterPropId)

  const downloadQR = (qrId: string, label: string) => {
    const svg = document.getElementById(`qr-dl-${qrId}`)
    if (!svg) return
    const serializer = new XMLSerializer()
    const svgStr = serializer.serializeToString(svg)
    const canvas = document.createElement('canvas')
    canvas.width = 300; canvas.height = 300
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 300, 300)
      ctx.drawImage(img, 0, 0, 300, 300)
      const a = document.createElement('a')
      a.download = `${label.replace(/\s+/g, '-').toLowerCase()}.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
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

  return (
    <DashboardLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .qr-row:hover td { background: #1E1E2A !important; }
        .qr-row:last-child td { border-bottom: none !important; }
      `}</style>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 32, height: 32, border: `2px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : (
        <>
          {/* Top bar */}
          <div className="db-page-topbar" style={{
            padding: '16px 28px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: C.bg, position: 'sticky', top: 0, zIndex: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h1 style={{ fontSize: 19, fontWeight: 700, color: C.text, margin: 0 }}>QR Codes</h1>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.purpleL, background: `${C.purple}22`, borderRadius: 20, padding: '2px 9px' }}>
                {qrCodes.length}
              </span>
            </div>
            {properties.length > 1 && (
              <select
                value={filterPropId} onChange={e => setFilterPropId(e.target.value)}
                style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: filterPropId === 'all' ? C.muted : C.text, fontSize: 13, padding: '7px 12px', cursor: 'pointer', outline: 'none' }}
              >
                <option value="all">All Properties</option>
                {properties.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.address}</option>
                ))}
              </select>
            )}
          </div>

          <div style={{ padding: '24px 28px' }}>
            {qrCodes.length === 0 ? (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '72px 32px', textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>◫</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>No QR codes yet</div>
                <div style={{ fontSize: 14, color: C.muted, marginBottom: 24, maxWidth: 360, margin: '0 auto 24px' }}>
                  {properties.length === 0
                    ? 'Add a property first, then create QR codes to track buyer scans.'
                    : 'Create QR codes from your properties page to start tracking buyer activity.'}
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
                        <th style={TH_STYLE}>QR Label</th>
                        <th style={TH_STYLE}>Property</th>
                        <th style={{ ...TH_STYLE, textAlign: 'center' }}>Scans</th>
                        <th style={{ ...TH_STYLE, textAlign: 'center' }}>Leads</th>
                        <th style={{ ...TH_STYLE, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCodes.map((qr: any) => (
                        <tr key={qr.id} className="qr-row">
                          <td style={TD_STYLE}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              {origin && (
                                <div
                                  onClick={e => { e.stopPropagation(); setExpandedQr({ id: qr.id, label: qr.label, property: propMap[qr.property_id] || '' }) }}
                                  title="Click to expand"
                                  style={{ flexShrink: 0, background: '#fff', borderRadius: 6, padding: 3, width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-in' }}
                                >
                                  <QRCodeSVG value={`${origin}/q/${qr.id}`} size={36} />
                                </div>
                              )}
                              <div>
                                <div style={{ fontWeight: 600, color: C.text, fontSize: 13.5 }}>{qr.label}</div>
                                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                                  {lastActivity[qr.id]
                                    ? `Last activity: ${timeAgo(lastActivity[qr.id])}`
                                    : 'No activity yet'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ ...TD_STYLE, maxWidth: 200 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.muted, fontSize: 13 }}>
                              {propMap[qr.property_id] || '—'}
                            </div>
                          </td>
                          <td style={{ ...TD_STYLE, textAlign: 'center' }}>
                            <span style={{ fontWeight: 700, color: C.purpleL, background: `${C.purple}18`, border: `1px solid ${C.purple}30`, borderRadius: 6, padding: '2px 10px', fontSize: 13 }}>
                              {qr.scan_count}
                            </span>
                          </td>
                          <td style={{ ...TD_STYLE, textAlign: 'center' }}>
                            <span style={{ fontWeight: 700, color: '#FCD34D', background: '#1A170D', border: '1px solid #3A3520', borderRadius: 6, padding: '2px 10px', fontSize: 13 }}>
                              {leadCounts[qr.id] || 0}
                            </span>
                          </td>
                          <td style={{ ...TD_STYLE, textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                              {origin && (
                                <button
                                  onClick={() => window.open(`${origin}/p/${qr.property_id}?qr=${qr.id}`, '_blank')}
                                  title="Test QR — open buyer page"
                                  style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                >
                                  🔗 Test QR
                                </button>
                              )}
                              <button
                                onClick={() => downloadQR(qr.id, qr.label)}
                                title="Download PNG"
                                style={{ background: 'transparent', color: '#00D4AA', border: '1px solid #004D3D', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                              >
                                ⬇ PNG
                              </button>
                              <Link
                                href={`/dashboard/sign-studio/${qr.id}`}
                                title="Open Sign Studio"
                                style={{ background: 'transparent', color: C.purpleL, border: `1px solid ${C.purple}50`, borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                              >
                                🎨 Sign Studio
                              </Link>
                              <button
                                onClick={() => copyLink(qr.id)}
                                title="Copy QR link"
                                style={{
                                  background: copiedId === qr.id ? `${C.purple}30` : 'transparent',
                                  color: copiedId === qr.id ? C.purpleL : C.muted,
                                  border: `1px solid ${copiedId === qr.id ? C.purple + '60' : C.border}`,
                                  borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600,
                                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                                }}
                              >
                                {copiedId === qr.id ? '✓ Copied' : '⎘ Copy Link'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* QR Performance Ranking */}
          {qrCodes.length > 0 && (
            <div style={{ padding: '0 28px 40px' }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 20, fontFamily: 'sans-serif' }}>
                  Top Performing QR Codes
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>

                  {/* By Leads */}
                  <div>
                    <div style={{ fontSize: 11, color: '#FFD700', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, fontFamily: 'sans-serif' }}>
                      🥇 By Leads
                    </div>
                    {[...qrCodes]
                      .map(q => ({ ...q, leads: leadCounts[q.id] || 0 }))
                      .sort((a, b) => b.leads - a.leads)
                      .slice(0, 5)
                      .map((q, i) => (
                        <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${C.border}`, fontFamily: 'sans-serif' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <span style={{ fontSize: 13, width: 20, flexShrink: 0 }}>{i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                            <span style={{ fontSize: 12, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {q.placement ? `${placementIcon(q.placement)} ` : ''}{q.label}{q.placement ? ` · ${q.placement}` : ''}
                            </span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#FFD700', flexShrink: 0, marginLeft: 8 }}>{q.leads} leads</span>
                        </div>
                      ))
                    }
                  </div>

                  {/* By Scans */}
                  <div>
                    <div style={{ fontSize: 11, color: C.purpleL, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, fontFamily: 'sans-serif' }}>
                      📊 By Scans
                    </div>
                    {[...qrCodes]
                      .sort((a, b) => (b.scan_count || 0) - (a.scan_count || 0))
                      .slice(0, 5)
                      .map((q, i) => (
                        <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${C.border}`, fontFamily: 'sans-serif' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <span style={{ fontSize: 13, width: 20, flexShrink: 0 }}>{i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                            <span style={{ fontSize: 12, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {q.placement ? `${placementIcon(q.placement)} ` : ''}{q.label}{q.placement ? ` · ${q.placement}` : ''}
                            </span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.purpleL, flexShrink: 0, marginLeft: 8 }}>{q.scan_count || 0} scans</span>
                        </div>
                      ))
                    }
                  </div>

                  {/* Conversion rate */}
                  <div>
                    <div style={{ fontSize: 11, color: '#34D399', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, fontFamily: 'sans-serif' }}>
                      ⚡ Conversion Rate
                    </div>
                    {[...qrCodes]
                      .map(q => {
                        const scans = q.scan_count || 0
                        const leads = leadCounts[q.id] || 0
                        const rate = scans > 0 ? ((leads / scans) * 100).toFixed(1) : null
                        return { ...q, leads, scans, rate }
                      })
                      .filter(q => q.scans > 0)
                      .sort((a, b) => parseFloat(b.rate || '0') - parseFloat(a.rate || '0'))
                      .slice(0, 5)
                      .map((q, i) => (
                        <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${C.border}`, fontFamily: 'sans-serif' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <span style={{ fontSize: 13, width: 20, flexShrink: 0 }}>{i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                            <span style={{ fontSize: 12, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {q.placement ? `${placementIcon(q.placement)} ` : ''}{q.label}{q.placement ? ` · ${q.placement}` : ''}
                            </span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#34D399', flexShrink: 0, marginLeft: 8 }}>{q.rate}%</span>
                        </div>
                      ))
                    }
                    {qrCodes.every(q => !q.scan_count) && (
                      <div style={{ fontSize: 12, color: C.muted }}>No scan data yet.</div>
                    )}
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* Hidden QR SVGs for PNG download */}
          {origin && (
            <div style={{ position: 'absolute', left: -9999, top: 0, opacity: 0, pointerEvents: 'none' }} aria-hidden>
              {qrCodes.map((qr: any) => (
                <QRCodeSVG key={qr.id} id={`qr-dl-${qr.id}`} value={`${origin}/q/${qr.id}`} size={240} />
              ))}
            </div>
          )}
        </>
      )}

      {/* QR expand modal */}
      {expandedQr && origin && (
        <div
          onClick={() => setExpandedQr(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 20, padding: '32px 32px 28px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 18, position: 'relative', maxWidth: 420, width: '100%',
              boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
            }}
          >
            {/* X button */}
            <button
              onClick={() => setExpandedQr(null)}
              aria-label="Close"
              style={{
                position: 'absolute', top: 14, right: 14,
                width: 32, height: 32, borderRadius: '50%',
                background: '#F3F4F6', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, color: '#374151', fontFamily: 'sans-serif',
              }}
            >✕</button>

            <QRCodeSVG value={`${origin}/q/${expandedQr.id}`} size={300} />

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginBottom: 4 }}>
                {expandedQr.label}
              </div>
              {expandedQr.property && (
                <div style={{ fontSize: 13, color: '#6B7280' }}>{expandedQr.property}</div>
              )}
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 10 }}>
                Point your camera at the QR code to test the scan
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
