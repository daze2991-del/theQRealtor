'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import NextImage from 'next/image'
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
const MIN_DIM = 200
const MAX_DIM = 6000
const DEFAULT_W = 1200
const DEFAULT_H = 3600

function sanitizeDim(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_W
  return Math.max(MIN_DIM, Math.min(MAX_DIM, Math.round(n)))
}

function formatInches(px: number): string {
  return (px / 300).toFixed(1)
}

interface Preset {
  id: string
  label: string
  image: string
  width: number
  height: number
  icon: LucideIcon
}

// Same three use-case cards as before; selecting one now sets a starting
// width/height rather than choosing between different designs — there's only
// one design. Dimensions reuse the exact print-correct pixel values from the
// old per-template canvases (all @300dpi):
//   Sign Rider     1200×3600  (4×12 in)
//   A-Frame Insert 2550×3300  (8.5×11 in)
//   Corner Overlay 1200×1200  (4×4 in)
const PRESETS: Preset[] = [
  { id: 'yardsign',  label: 'Yard sign',             image: '/sign-studio/card_yard_sign_FINAL.png',    width: 1200, height: 3600, icon: Clipboard },
  { id: 'openhouse', label: 'Open house visitors',   image: '/sign-studio/card_open_house_FINAL.png',   width: 2550, height: 3300, icon: Signpost },
  { id: 'flyer',     label: 'Flyer / mailer',        image: '/sign-studio/card_flyer_mailer_FINAL.png', width: 1200, height: 1200, icon: Tag },
]

// ── canvas helpers ────────────────────────────────────────────────────────────

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
// Every measurement is a fraction of `unit` (the smaller of width/height), so
// the design recomputes correctly for any chosen size instead of stretching a
// fixed design — a 1200×1200 square and a 2550×3300 portrait both get
// proportionally sized text and QR, not the same absolute pixel values.
// This is the single source of truth for both the hidden QR source's `size`
// prop and the canvas draw call — both read `layout.qrSize`, so the source
// SVG is always rasterized at exactly the size it's drawn at.
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
// Used for BOTH the live on-screen preview and the downloaded PNG — same
// function, same inputs, so the preview can never drift from what downloads.
// `qrSvgEl` must already be rendered at `computeLayout(width,height).qrSize`
// (the hidden QRCodeSVG's `size` prop is bound to that same layout below).
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
// Always visible — no disabled-behind-a-flag pattern. Renders the exact same
// canvas the download produces, just CSS-scaled down to fit the panel; the
// canvas's own resolution stays full-size, so it's a true preview, not a
// simplified stand-in.
const PREVIEW_MAX_W = 280
const PREVIEW_MAX_H = 420

function SignPreview({
  width, height, qrSvgEl, qrUrl,
}: {
  width: number; height: number; qrSvgEl: SVGSVGElement | null; qrUrl: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !qrSvgEl || !qrUrl) return
    let cancelled = false
    renderSignToCanvas(canvas, width, height, qrSvgEl).catch(() => { /* image load failed, leave prior frame */ })
    return () => { cancelled = true }
  }, [width, height, qrSvgEl, qrUrl])

  const scale = Math.min(PREVIEW_MAX_W / width, PREVIEW_MAX_H / height)
  const dispW = Math.round(width * scale)
  const dispH = Math.round(height * scale)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <canvas
        ref={canvasRef}
        style={{
          width: dispW, height: dispH,
          borderRadius: 8, border: `1px solid ${C.border}`,
          background: '#fff', display: 'block',
        }}
      />
      <div style={{ fontSize: 11, color: C.muted }}>
        {width}×{height}px · {formatInches(width)}×{formatInches(height)} in @300dpi
      </div>
    </div>
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

  const selectPreset = (preset: Preset) => {
    setSelectedPresetId(preset.id)
    setSize({ width: preset.width, height: preset.height })
  }

  const setCustomWidth = (raw: string) => {
    setSelectedPresetId(null)
    setSize(prev => ({ ...prev, width: Number(raw) }))
  }
  const setCustomHeight = (raw: string) => {
    setSelectedPresetId(null)
    setSize(prev => ({ ...prev, height: Number(raw) }))
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

  // shared card style
  const card: React.CSSProperties = {
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24,
  }

  const btnStyle = (active?: boolean): React.CSSProperties => ({
    background: active ? C.purple : 'transparent',
    color: active ? '#fff' : C.sub,
    border: `1px solid ${active ? C.purple : C.border}`,
    borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'sans-serif',
  })

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.text, fontSize: 14, padding: '9px 12px', outline: 'none',
    fontFamily: 'sans-serif',
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
                Edit Sign/QR
              </h1>
              {sign && (
                <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>{sign.label}</p>
              )}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '28px', fontFamily: 'sans-serif' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, maxWidth: 1200 }}>

              {/* LEFT: Sign info */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={card}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                    Sign Info
                  </div>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 4 }}>{sign?.label}</div>
                  <div style={{ fontSize: 12, color: property ? C.muted : '#FB923C', marginBottom: 12 }}>
                    {property ? address : 'Not assigned to a listing yet'}
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: C.purpleL }}>{scanCount}</div>
                      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scans</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: C.muted, margin: 0, lineHeight: 1.55 }}>
                    This QR is permanent to the sign — reassign the sign and the same
                    printed code points to the new listing.
                  </p>
                </div>
              </div>

              {/* RIGHT: Size picker + preview + download */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Size picker */}
                <div style={card}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4, letterSpacing: '-0.01em' }}>
                    Choose a starting size
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Pick a use case for a print-correct starting size, or set a custom size below.</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                    {PRESETS.map(preset => {
                      const active = selectedPresetId === preset.id
                      return (
                        <button
                          key={preset.id}
                          onClick={() => selectPreset(preset)}
                          style={{
                            ...btnStyle(active),
                            display: 'flex', flexDirection: 'column', alignItems: 'stretch',
                            padding: 0, gap: 0, textAlign: 'left', overflow: 'hidden',
                            maxWidth: '420px', width: '100%',
                          }}
                        >
                          <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9' }}>
                            <NextImage
                              src={preset.image}
                              alt={preset.label}
                              width={480}
                              height={270}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                          </div>
                          <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2, minHeight: 32, color: active ? '#fff' : C.text, overflowWrap: 'break-word' }}>{preset.label}</span>
                            <span style={{ fontSize: 10, lineHeight: 1.4, minHeight: 28, marginTop: 'auto', color: active ? 'rgba(255,255,255,0.55)' : C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <preset.icon size={12} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                              <span style={{ overflowWrap: 'break-word', minWidth: 0 }}>
                                {preset.width}×{preset.height} ({formatInches(preset.width)}×{formatInches(preset.height)} in)
                              </span>
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Custom size override */}
                  <div style={{ paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                      Custom size
                    </div>
                    <div style={{ display: 'flex', gap: 14 }}>
                      <label style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 11, color: C.muted, marginBottom: 5 }}>Width (px)</span>
                        <input
                          type="number" min={MIN_DIM} max={MAX_DIM}
                          value={size.width}
                          onChange={e => setCustomWidth(e.target.value)}
                          className="ss-input" style={inputStyle}
                        />
                      </label>
                      <label style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 11, color: C.muted, marginBottom: 5 }}>Height (px)</span>
                        <input
                          type="number" min={MIN_DIM} max={MAX_DIM}
                          value={size.height}
                          onChange={e => setCustomHeight(e.target.value)}
                          className="ss-input" style={inputStyle}
                        />
                      </label>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
                      = {formatInches(width)} × {formatInches(height)} in at 300 DPI (print resolution)
                    </div>
                  </div>
                </div>

                {/* Preview — always visible, no disabled-behind-a-flag state */}
                <div style={card}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
                    Preview
                  </div>
                  <SignPreview width={width} height={height} qrSvgEl={qrSourceEl} qrUrl={qrUrl} />
                </div>

                {/* Download */}
                <div style={card}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
                    Download
                  </div>
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    style={{
                      background: downloading ? `${C.purple}60` : C.purple,
                      color: '#fff', border: 'none', borderRadius: 9,
                      padding: '10px 20px', fontSize: 13, fontWeight: 700,
                      cursor: downloading ? 'not-allowed' : 'pointer',
                      fontFamily: 'sans-serif',
                    }}
                  >
                    {downloading ? '⏳ Generating…' : '⬇ Download Print-Ready PNG'}
                  </button>
                  <p style={{ fontSize: 12, color: C.sub, marginTop: 12, lineHeight: 1.6 }}>
                    💡 Recommended: print on standard paper for smaller sizes, or 60–120lb
                    cardstock for yard signs and A-frame inserts, at FedEx Office, Staples,
                    or your brokerage print room. Typically low-cost.
                  </p>
                </div>

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
