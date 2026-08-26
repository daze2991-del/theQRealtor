'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { Tag, Clipboard, Signpost, type LucideIcon } from 'lucide-react'
import { createBrowserSupabase } from '../../../../lib/supabase-browser'
import DashboardLayout from '../../../../components/DashboardLayout'
import Link from 'next/link'

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

// ── size model ──────────────────────────────────────────────────────────────
// One design, rendered at whatever width/height is chosen. Presets just set a
// starting point; the custom inputs below them can override to anything.
// UNTOUCHED in this pass — same values as the rebuild, only labels/presentation
// changed elsewhere in this file.
const MIN_DIM = 200
const MAX_DIM = 6000
const DEFAULT_W = 1200
const DEFAULT_H = 3600

function sanitizeDim(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_W
  return Math.max(MIN_DIM, Math.min(MAX_DIM, Math.round(n)))
}

// One-decimal form — kept for the advanced/custom-size readout, where a
// precise "4.1 in" from an odd pixel value is more honest than rounding it away.
function formatInches(px: number): string {
  return (px / 300).toFixed(1)
}

// Clean form for plain-language display ("4 × 12 in", not "4.0 × 12.0 in") —
// presentation only, does not touch the underlying px math.
function formatInchesClean(px: number): string {
  const inches = px / 300
  return Number.isInteger(inches) ? String(inches) : String(Math.round(inches * 10) / 10)
}

interface Preset {
  id: string
  label: string
  width: number
  height: number
  icon: LucideIcon
}

// Dimensions are UNTOUCHED — same print-correct pixel values as the rebuild
// (all @300dpi). Only labels changed, to match physical product names rather
// than "use case" framing.
const PRESETS: Preset[] = [
  { id: 'yardsign',  label: 'Yard Sign',       width: 1200, height: 3600, icon: Clipboard },
  { id: 'openhouse', label: 'A-Frame Insert',  width: 2550, height: 3300, icon: Signpost },
  { id: 'flyer',     label: 'Flyer / Mailer',  width: 1200, height: 1200, icon: Tag },
]

// ── canvas helpers ────────────────────────────────────────────────────────────
// UNTOUCHED in this pass.

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Rasterizes whatever SVG element is passed AT ITS OWN NATIVE SIZE — no
// separate "target size" parameter. That parameter is what caused the old
// blur bug: it was accepted but never used, so every destination reused one
// fixed 720px raster regardless of how large it was drawn. The fix is
// structural, not a patch — the caller is responsible for rendering the
// source QRCodeSVG at the exact pixel size it will be drawn at (see
// `layout.qrSize` below), so this function never scales anything.
async function svgToImage(svgEl: SVGSVGElement): Promise<HTMLImageElement> {
  const serializer = new XMLSerializer()
  const svgStr = serializer.serializeToString(svgEl)
  return loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr))
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// ── layout ────────────────────────────────────────────────────────────────────
// UNTOUCHED in this pass. Every measurement is a fraction of `unit` (the
// smaller of width/height), so the design recomputes correctly for any chosen
// size instead of stretching a fixed design. Single source of truth for both
// the hidden QR source's `size` prop and the canvas draw call.
interface Layout {
  unit: number
  barH: number
  qrSize: number
  qrX: number
  qrY: number
  titleSize: number
  wmSize: number
  gap1: number
  gap2: number
}

function computeLayout(width: number, height: number): Layout {
  const unit = Math.min(width, height)
  const barH      = Math.max(4, Math.round(unit * 0.012))
  const qrSize    = Math.max(40, Math.round(unit * 0.5))
  const titleSize = Math.max(14, Math.round(unit * 0.045))
  const wmSize    = Math.max(10, Math.round(unit * 0.026))
  const gap1      = Math.round(unit * 0.05)
  const gap2      = Math.round(unit * 0.035)
  const contentH  = qrSize + gap1 + titleSize + gap2 + wmSize
  const qrX = Math.round((width - qrSize) / 2)
  const qrY = Math.round(barH + (height - barH * 2 - contentH) / 2)
  return { unit, barH, qrSize, qrX, qrY, titleSize, wmSize, gap1, gap2 }
}

// ── the one shared renderer ───────────────────────────────────────────────────
// UNTOUCHED in this pass. Used for BOTH the live on-screen preview and the
// downloaded PNG — same function, same inputs, so the preview can never drift
// from what downloads.
async function renderSignToCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  qrSvgEl: SVGSVGElement,
) {
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const L = computeLayout(width, height)

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = C.purple
  ctx.fillRect(0, 0, width, L.barH)
  ctx.fillRect(0, height - L.barH, width, L.barH)

  // Light frame behind the QR for definition against the white background.
  const framePad = Math.max(6, Math.round(L.qrSize * 0.06))
  ctx.strokeStyle = '#E5E7EB'
  ctx.lineWidth = Math.max(2, Math.round(L.unit * 0.003))
  roundRect(ctx, L.qrX - framePad, L.qrY - framePad, L.qrSize + framePad * 2, L.qrSize + framePad * 2, framePad)
  ctx.stroke()

  const qrImg = await svgToImage(qrSvgEl)
  ctx.drawImage(qrImg, L.qrX, L.qrY, L.qrSize, L.qrSize)

  ctx.fillStyle = '#111827'
  ctx.font = `bold ${L.titleSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText('Scan for Photos & Details', width / 2, L.qrY + L.qrSize + L.gap1 + L.titleSize)

  // "Powered by " + "the" + "qr" (brand purple) + "ealtor", centered as one line.
  const wmY = L.qrY + L.qrSize + L.gap1 + L.titleSize + L.gap2 + L.wmSize
  ctx.font = `bold ${L.wmSize}px sans-serif`
  const prefix = 'Powered by ', partThe = 'the', partQr = 'qr', partEaltor = 'ealtor'
  const wPrefix  = ctx.measureText(prefix).width
  const wThe     = ctx.measureText(partThe).width
  const wQr      = ctx.measureText(partQr).width
  const wEaltor  = ctx.measureText(partEaltor).width
  let x = width / 2 - (wPrefix + wThe + wQr + wEaltor) / 2
  ctx.textAlign = 'left'
  ctx.fillStyle = C.muted
  ctx.fillText(prefix, x, wmY); x += wPrefix
  ctx.fillStyle = '#111827'
  ctx.fillText(partThe, x, wmY); x += wThe
  ctx.fillStyle = C.purple
  ctx.fillText(partQr, x, wmY); x += wQr
  ctx.fillStyle = '#111827'
  ctx.fillText(partEaltor, x, wmY)
}

// ── preview ───────────────────────────────────────────────────────────────────
// Renderer call itself is untouched; only the display bounds grew (this is now
// the dominant hero element, not a small panel beside a size picker) and the
// old technical caption line moved out to the parent, replaced by the
// plain-language size text specified below.
const PREVIEW_MAX_W = 420
const PREVIEW_MAX_H = 560

function SignPreview({
  width, height, qrSvgEl, qrUrl,
}: {
  width: number; height: number; qrSvgEl: SVGSVGElement | null; qrUrl: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !qrSvgEl || !qrUrl) return
    renderSignToCanvas(canvas, width, height, qrSvgEl).catch(() => { /* image load failed, leave prior frame */ })
  }, [width, height, qrSvgEl, qrUrl])

  const scale = Math.min(PREVIEW_MAX_W / width, PREVIEW_MAX_H / height)
  const dispW = Math.round(width * scale)
  const dispH = Math.round(height * scale)

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: dispW, height: dispH,
        borderRadius: 10, border: `1px solid ${C.border}`,
        background: '#fff', display: 'block',
      }}
    />
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function SignStudioPage() {
  const params = useParams()
  const router = useRouter()
  const signId = params.signId as string

  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(true)
  const [sign, setSign] = useState<any>(null)
  const [scanCount, setScanCount] = useState(0)
  const [property, setProperty] = useState<any>(null)
  const [downloading, setDownloading] = useState(false)

  const [selectedPresetId, setSelectedPresetId] = useState<string | null>('yardsign')
  const [size, setSize] = useState({ width: DEFAULT_W, height: DEFAULT_H })
  const [customOpen, setCustomOpen] = useState(false)
  const [printingTipsOpen, setPrintingTipsOpen] = useState(false)

  const qrSourceRef = useRef<SVGSVGElement>(null)
  const [qrSourceEl, setQrSourceEl] = useState<SVGSVGElement | null>(null)
  // Stable identity (not an inline arrow) so React doesn't null-then-reattach
  // this ref on every render — standard pattern for a callback ref that also
  // drives state.
  const setQrRef = useCallback((node: SVGSVGElement | null) => {
    qrSourceRef.current = node
    setQrSourceEl(node)
  }, [])

  useEffect(() => { setOrigin(window.location.origin) }, [])

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }

      // Owner RLS covers signs, sign_assignments, and the agent's own
      // properties, so no server round-trip is needed here.
      const { data: signRow } = await supabase
        .from('signs')
        .select('id, label, created_at, sign_assignments(property_id, unassigned_at, properties(id, address, city, state))')
        .eq('id', signId)
        .single()
      if (!signRow) { router.push('/dashboard/signs'); return }
      setSign(signRow)

      const current = (signRow.sign_assignments ?? []).find((a: any) => a.unassigned_at === null)
      setProperty(current?.properties ?? null)

      const { count } = await supabase
        .from('scan_events')
        .select('id', { count: 'exact', head: true })
        .eq('sign_id', signId)
      setScanCount(count ?? 0)

      setLoading(false)
    }
    load()
  }, [signId])

  // The QR encodes the SIGN, not a property: /p/{signId} resolves through the
  // sign's current assignment at scan time, so a printed sign survives
  // reassignment without reprinting.
  const qrUrl = origin ? `${origin}/p/${signId}` : ''
  const address = property?.address || ''

  const width  = sanitizeDim(size.width)
  const height = sanitizeDim(size.height)
  const layout = useMemo(() => computeLayout(width, height), [width, height])

  const activePreset = PRESETS.find(p => p.id === selectedPresetId) ?? null
  const formatName = activePreset ? activePreset.label : 'Custom Size'
  const subtitle = address ? `${formatName} · ${address}` : formatName

  const selectPreset = (preset: Preset) => {
    setSelectedPresetId(preset.id)
    setSize({ width: preset.width, height: preset.height })
  }

  // Custom size is entered in inches (agent-facing unit), converted to px at
  // 300dpi internally — the underlying `size` state is still pixels, same as
  // the untouched renderer/layout code expects.
  const setCustomWidthIn = (raw: string) => {
    setSelectedPresetId(null)
    setSize(prev => ({ ...prev, width: Math.round(Number(raw) * 300) }))
  }
  const setCustomHeightIn = (raw: string) => {
    setSelectedPresetId(null)
    setSize(prev => ({ ...prev, height: Math.round(Number(raw) * 300) }))
  }

  const handleDownload = async () => {
    const svgEl = qrSourceRef.current
    if (!svgEl) return
    setDownloading(true)
    try {
      const canvas = document.createElement('canvas')
      await renderSignToCanvas(canvas, width, height, svgEl)
      const a = document.createElement('a')
      a.download = `sign-${signId}-${width}x${height}.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
    } finally {
      setDownloading(false)
    }
  }

  // shared styles
  const card: React.CSSProperties = {
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.text, fontSize: 14, padding: '9px 12px', outline: 'none',
    fontFamily: 'sans-serif',
  }

  const toggleLinkStyle: React.CSSProperties = {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    color: C.purpleL, fontSize: 12, fontWeight: 600, fontFamily: 'sans-serif',
  }

  return (
    <DashboardLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .ss-input:focus { border-color: ${C.purple} !important; }
      `}</style>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 32, height: 32, border: `2px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : (
        <>
          {/* Top bar */}
          <div style={{
            padding: '14px 28px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', gap: 14,
            background: C.bg, position: 'sticky', top: 0, zIndex: 10,
            fontFamily: 'sans-serif',
          }}>
            <Link href="/dashboard/signs" style={{ color: C.muted, fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
              ← Signs
            </Link>
            <span style={{ color: C.border }}>|</span>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.01em' }}>
                Sign Studio
              </h1>
              {sign && (
                <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>{sign.label}</p>
              )}
              <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>{subtitle}</p>
            </div>
          </div>

          {/* Single-column flow: the preview is the dominant, first thing an
              agent sees. Everything below it is secondary. */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px', fontFamily: 'sans-serif' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640, margin: '0 auto' }}>

              {/* Preview + physical size + primary download CTA — one panel,
                  not split across cards, so the download action reads as the
                  natural next step after seeing the sign, not a buried extra. */}
              <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <SignPreview width={width} height={height} qrSvgEl={qrSourceEl} qrUrl={qrUrl} />

                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
                    {formatInchesClean(width)} × {formatInchesClean(height)} in
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    300 DPI · Print ready
                  </div>
                </div>

                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  style={{
                    width: '100%',
                    background: downloading ? `${C.purple}60` : C.purple,
                    color: '#fff', border: 'none', borderRadius: 10,
                    padding: '13px 20px', fontSize: 14, fontWeight: 700,
                    cursor: downloading ? 'not-allowed' : 'pointer',
                    fontFamily: 'sans-serif',
                  }}
                >
                  {downloading ? '⏳ Generating…' : '↓ Download Print-Ready PNG'}
                </button>
              </div>

              {/* Format picker — comes after the preview/download block. */}
              <div style={card}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
                  Format
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {PRESETS.map(preset => {
                    const active = selectedPresetId === preset.id
                    return (
                      <button
                        key={preset.id}
                        onClick={() => selectPreset(preset)}
                        style={{
                          flex: '1 1 140px',
                          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
                          background: active ? C.purple : 'transparent',
                          border: `1px solid ${active ? C.purple : C.border}`,
                          borderRadius: 10, padding: '12px 14px',
                          cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'sans-serif',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: active ? '#fff' : C.text }}>
                          <preset.icon size={14} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                          {preset.label}
                        </span>
                        <span style={{ fontSize: 11, color: active ? 'rgba(255,255,255,0.65)' : C.muted }}>
                          {formatInchesClean(preset.width)} × {formatInchesClean(preset.height)} in
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Custom size — collapsed by default, inches-first entry. */}
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                  <button onClick={() => setCustomOpen(v => !v)} style={toggleLinkStyle}>
                    Custom size {customOpen ? '▴' : '▾'}
                  </button>
                  {customOpen && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ display: 'flex', gap: 14 }}>
                        <label style={{ flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 11, color: C.muted, marginBottom: 5 }}>Width (in)</span>
                          <input
                            type="number" step="0.1" min={formatInches(MIN_DIM)} max={formatInches(MAX_DIM)}
                            value={formatInches(width)}
                            onChange={e => setCustomWidthIn(e.target.value)}
                            className="ss-input" style={inputStyle}
                          />
                        </label>
                        <label style={{ flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 11, color: C.muted, marginBottom: 5 }}>Height (in)</span>
                          <input
                            type="number" step="0.1" min={formatInches(MIN_DIM)} max={formatInches(MAX_DIM)}
                            value={formatInches(height)}
                            onChange={e => setCustomHeightIn(e.target.value)}
                            className="ss-input" style={inputStyle}
                          />
                        </label>
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
                        {width}×{height}px at 300 DPI
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sign details — address/assignment status and scan count are
                  secondary context now, not a co-equal primary section. */}
              <div style={card}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                  Sign Info
                </div>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 4 }}>{sign?.label}</div>
                <div style={{ fontSize: 12, color: property ? C.muted : '#FB923C', marginBottom: 10 }}>
                  {property ? address : 'Not assigned to a listing yet'}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
                  {scanCount} scan{scanCount === 1 ? '' : 's'}
                  {property && (
                    <>
                      {' · '}
                      <Link href={`/dashboard/properties/${property.id}`} style={{ color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>
                        View analytics →
                      </Link>
                    </>
                  )}
                </div>
                <p style={{ fontSize: 11, color: C.muted, margin: 0, lineHeight: 1.55 }}>
                  Your QR code stays with this sign. Reassign the sign anytime without reprinting.
                </p>
              </div>

              {/* Printing — one line by default, detail behind a toggle. */}
              <div style={card}>
                <p style={{ fontSize: 12, color: C.sub, margin: 0, lineHeight: 1.6 }}>
                  Need printing? Download the PNG and take it to your preferred print shop.
                </p>
                <button onClick={() => setPrintingTipsOpen(v => !v)} style={{ ...toggleLinkStyle, marginTop: 8 }}>
                  Printing tips {printingTipsOpen ? '▴' : '▾'}
                </button>
                {printingTipsOpen && (
                  <p style={{ fontSize: 12, color: C.muted, margin: '10px 0 0', lineHeight: 1.6 }}>
                    Recommended: standard paper for smaller sizes, or 60–120lb cardstock for
                    yard signs and A-frame inserts. Try FedEx Office, Staples, or your
                    brokerage print room — typically low-cost.
                  </p>
                )}
              </div>

            </div>
          </div>

          {/* Hidden QR source for the shared renderer — always rendered at the
              CURRENT layout's exact target size, so svgToImage() never scales. */}
          {qrUrl && (
            <div style={{ position: 'absolute', left: -9999, top: 0, opacity: 0, pointerEvents: 'none' }} aria-hidden>
              <QRCodeSVG
                ref={setQrRef}
                value={qrUrl}
                size={layout.qrSize}
              />
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  )
}
