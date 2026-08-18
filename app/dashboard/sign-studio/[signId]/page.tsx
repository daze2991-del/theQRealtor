'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import NextImage from 'next/image'
import { Rnd } from 'react-rnd'
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

type Template = 'corner' | 'rider' | 'aframe'
type Goal = 'openhouse' | 'yardsign' | 'flyer'

// Preview panels are temporarily hidden across the board while they're not
// ready to ship. The preview components/logic are untouched — flip the
// relevant flag to re-enable a given template's preview independently.
const SHOW_CORNER_OVERLAY_PREVIEW = false
const SHOW_RIDER_PREVIEW = false
const SHOW_AFRAME_PREVIEW = false

interface BrandingState {
  agentName: string
  agentPhone: string
  dre: string
  brokerage: string
  agentPhotoUrl: string
  brokerageLogoUrl: string
}

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

async function svgToImage(svgEl: SVGSVGElement, size: number): Promise<HTMLImageElement> {
  const serializer = new XMLSerializer()
  const svgStr = serializer.serializeToString(svgEl)
  return loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr))
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ')
  let line = ''
  let currentY = y
  words.forEach((word, i) => {
    const testLine = line + (line ? ' ' : '') + word
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, currentY)
      line = word
      currentY += lineHeight
    } else {
      line = testLine
    }
  })
  ctx.fillText(line, x, currentY)
  return currentY
}

async function drawCircularPhoto(
  ctx: CanvasRenderingContext2D,
  src: string,
  cx: number,
  cy: number,
  r: number,
  ringColor = '#FFFFFF',
) {
  try {
    const img = await loadImage(src)
    // center-crop source to square
    const sq = Math.min(img.width, img.height)
    const sx = (img.width - sq) / 2
    const sy = (img.height - sq) / 2
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(img, sx, sy, sq, sq, cx - r, cy - r, r * 2, r * 2)
    ctx.restore()
    // border ring
    const ring = Math.max(4, Math.round(r * 0.08))
    ctx.strokeStyle = ringColor
    ctx.lineWidth = ring
    ctx.beginPath()
    ctx.arc(cx, cy, r + ring / 2, 0, Math.PI * 2)
    ctx.stroke()
  } catch { /* photo load failed, skip */ }
}

// ── download functions ────────────────────────────────────────────────────────

async function downloadCorner(
  signId: string, origin: string, branding: BrandingState,
  address: string, svgRef: SVGSVGElement
) {
  const W = 1200, H = 1200
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!

  // transparent background
  ctx.clearRect(0, 0, W, H)

  // QR box in bottom-right corner
  const boxSize = 380
  const pad = 40
  const bx = W - boxSize - pad
  const by = H - boxSize - pad

  // white rounded card behind QR — taller when agent photo is present
  const cardExtra = branding.agentPhotoUrl ? 96 : 0
  ctx.fillStyle = 'rgba(255,255,255,0.97)'
  roundRect(ctx, bx - 20, by - 20, boxSize + 40, boxSize + 80 + cardExtra, 18)
  ctx.fill()

  // QR code
  const qrImg = await svgToImage(svgRef, boxSize)
  ctx.drawImage(qrImg, bx, by, boxSize, boxSize)

  // "Scan Me" text
  ctx.fillStyle = '#111827'
  ctx.font = 'bold 26px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Scan Me', bx + boxSize / 2, by + boxSize + 44)

  // agent photo: circular, centered between "Scan Me" and agent name
  if (branding.agentPhotoUrl) {
    await drawCircularPhoto(ctx, branding.agentPhotoUrl, bx + boxSize / 2, by + boxSize + 96, 32, '#D1D5DB')
  }

  // agent name
  if (branding.agentName) {
    const nameY = branding.agentPhotoUrl ? by + boxSize + 146 : by + boxSize + 68
    ctx.fillStyle = '#6B7280'
    ctx.font = '20px sans-serif'
    ctx.fillText(branding.agentName, bx + boxSize / 2, nameY)
  }

  const a = document.createElement('a')
  a.download = `corner-qr-${signId}.png`
  a.href = canvas.toDataURL('image/png')
  a.click()
}

async function downloadRider(
  signId: string, origin: string, branding: BrandingState,
  address: string, svgRef: SVGSVGElement
) {
  // 4x12 inch at 300dpi = 1200x3600
  const W = 1200, H = 3600
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!

  // dark bg
  ctx.fillStyle = '#0F0F13'
  ctx.fillRect(0, 0, W, H)

  // top purple accent bar
  ctx.fillStyle = C.purple
  ctx.fillRect(0, 0, W, 16)

  // address at top
  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 72px sans-serif'
  ctx.textAlign = 'center'
  const addressBottom = address
    ? wrapText(ctx, address, W / 2, 130, W - 120, 90) + 90
    : 130

  // thin purple divider below address
  ctx.fillStyle = C.purple
  ctx.fillRect(80, addressBottom + 20, W - 160, 4)

  // QR code (centered, large)
  const qrSize = 720
  const qrX = (W - qrSize) / 2
  const qrY = addressBottom + 80

  ctx.fillStyle = '#FFFFFF'
  roundRect(ctx, qrX - 24, qrY - 24, qrSize + 48, qrSize + 48, 24)
  ctx.fill()

  const qrImg = await svgToImage(svgRef, qrSize)
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)

  // "Scan For Price + Photos Instantly" below QR
  const belowQR = qrY + qrSize + 60
  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 52px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Scan For Price + Photos Instantly', W / 2, belowQR)

  // divider
  ctx.strokeStyle = C.border
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(80, belowQR + 60)
  ctx.lineTo(W - 80, belowQR + 60)
  ctx.stroke()

  // agent info section
  let infoY = belowQR + 140

  // agent photo: circular, centered above agent name
  if (branding.agentPhotoUrl) {
    await drawCircularPhoto(ctx, branding.agentPhotoUrl, W / 2, infoY, 100)
    infoY += 220  // photo diameter + gap
  }

  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 56px sans-serif'
  ctx.textAlign = 'center'
  if (branding.agentName) ctx.fillText(branding.agentName, W / 2, infoY)

  if (branding.agentPhone) {
    ctx.fillStyle = C.purpleL
    ctx.font = '48px sans-serif'
    ctx.fillText(branding.agentPhone, W / 2, infoY + 80)
  }

  if (branding.dre) {
    ctx.fillStyle = C.muted
    ctx.font = '36px sans-serif'
    ctx.fillText(`DRE# ${branding.dre}`, W / 2, infoY + 148)
  }

  if (branding.brokerage && !branding.brokerageLogoUrl) {
    ctx.fillStyle = C.sub
    ctx.font = '40px sans-serif'
    ctx.fillText(branding.brokerage, W / 2, infoY + 220)
  }

  if (branding.brokerageLogoUrl) {
    try {
      const logoImg = await loadImage(branding.brokerageLogoUrl)
      const logoH = 140
      const logoW = Math.min((logoImg.width / logoImg.height) * logoH, W - 160)
      ctx.drawImage(logoImg, (W - logoW) / 2, infoY + 200, logoW, logoH)
    } catch { /* logo load failed, skip */ }
  }

  // bottom purple bar
  ctx.fillStyle = C.purple
  ctx.fillRect(0, H - 16, W, 16)

  const a = document.createElement('a')
  a.download = `rider-${signId}.png`
  a.href = canvas.toDataURL('image/png')
  a.click()
}

async function downloadAFrame(
  signId: string, origin: string, branding: BrandingState,
  address: string, svgRef: SVGSVGElement
) {
  // 8.5x11 at 300dpi = 2550x3300 portrait A-frame insert
  const W = 2550, H = 3300
  const badgePurple = '#534AB7'
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!

  // white background
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)

  // purple header bar
  const headerH = 520
  ctx.fillStyle = badgePurple
  ctx.fillRect(0, 0, W, headerH)

  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 180px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('OPEN HOUSE', W / 2, headerH / 2)
  ctx.textBaseline = 'alphabetic'

  // QR code, centered
  const qrSize = 1500
  const qrX = (W - qrSize) / 2
  const qrY = headerH + 240
  const qrImg = await svgToImage(svgRef, qrSize)
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)

  // "Scan for Photos & Details"
  ctx.fillStyle = '#111827'
  ctx.font = 'bold 90px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Scan for Photos & Details', W / 2, qrY + qrSize + 150)

  // "theqrealtor" wordmark, "qr" in brand purple, centered as a whole
  const wordY = H - 220
  ctx.font = 'bold 72px sans-serif'
  const partThe = 'the', partQr = 'qr', partEaltor = 'ealtor'
  const wThe = ctx.measureText(partThe).width
  const wQr = ctx.measureText(partQr).width
  const wEaltor = ctx.measureText(partEaltor).width
  let x = W / 2 - (wThe + wQr + wEaltor) / 2
  ctx.textAlign = 'left'
  ctx.fillStyle = '#111827'
  ctx.fillText(partThe, x, wordY); x += wThe
  ctx.fillStyle = badgePurple
  ctx.fillText(partQr, x, wordY); x += wQr
  ctx.fillStyle = '#111827'
  ctx.fillText(partEaltor, x, wordY)

  const a = document.createElement('a')
  a.download = `aframe-${signId}.png`
  a.href = canvas.toDataURL('image/png')
  a.click()
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
  const [template, setTemplate] = useState<Template>('rider')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [goal, setGoal] = useState<Goal | null>(null)

  const [branding, setBranding] = useState<BrandingState>({
    agentName: '',
    agentPhone: '',
    dre: '',
    brokerage: '',
    agentPhotoUrl: '',
    brokerageLogoUrl: '',
  })

  const qrSvgRef = useRef<SVGSVGElement>(null)
  const qrSvgLargeRef = useRef<SVGSVGElement>(null)

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setBranding(prev => {
      if (prev.agentPhotoUrl) URL.revokeObjectURL(prev.agentPhotoUrl)
      return { ...prev, agentPhotoUrl: url }
    })
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setBranding(prev => {
      if (prev.brokerageLogoUrl) URL.revokeObjectURL(prev.brokerageLogoUrl)
      return { ...prev, brokerageLogoUrl: url }
    })
  }

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

      // pre-fill branding from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, phone, dre, brokerage')
        .eq('id', session.user.id)
        .single()

      if (profile) {
        setBranding(prev => ({
          ...prev,
          agentName: profile.name || '',
          agentPhone: profile.phone || '',
          dre: profile.dre || '',
          brokerage: profile.brokerage || '',
        }))
      }

      setLoading(false)
    }
    load()
  }, [signId])

  // The QR encodes the SIGN, not a property: /p/{signId} resolves through the
  // sign's current assignment at scan time, so a printed sign survives
  // reassignment without reprinting.
  const qrUrl = origin ? `${origin}/p/${signId}` : ''
  const address = property?.address || ''

  const showPreview =
    (template === 'corner' && SHOW_CORNER_OVERLAY_PREVIEW) ||
    (template === 'rider' && SHOW_RIDER_PREVIEW) ||
    (template === 'aframe' && SHOW_AFRAME_PREVIEW)

  const handleDownload = async (type: string) => {
    const svgEl = document.getElementById(`ss-qr-large`) as unknown as SVGSVGElement
    if (!svgEl || !origin) return
    setDownloading(type)
    try {
      if (type === 'corner') await downloadCorner(signId, origin, branding, address, svgEl)
      else if (type === 'rider') await downloadRider(signId, origin, branding, address, svgEl)
      else if (type === 'aframe') await downloadAFrame(signId, origin, branding, address, svgEl)
    } finally {
      setDownloading(null)
    }
  }

  const field = (label: string, key: keyof BrandingState, placeholder: string) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
        {label}
      </label>
      <input
        value={branding[key]}
        onChange={e => setBranding(prev => ({ ...prev, [key]: e.target.value }))}
        placeholder={placeholder}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
          color: C.text, fontSize: 14, padding: '9px 12px', outline: 'none',
          fontFamily: 'sans-serif',
        }}
      />
    </div>
  )

  const TEMPLATES: { id: Template; label: string; desc: string; icon: LucideIcon; dims: string }[] = [
    { id: 'corner', label: 'Corner Overlay', desc: 'Print-ready QR overlay for flyers and mailers. Print on standard paper and trim.', icon: Tag, dims: '1200×1200' },
    { id: 'rider', label: 'Sign Rider', desc: 'Print-ready rider for yard signs. Print on cardstock or heavy paper (60-120lb).', icon: Clipboard, dims: '1200×3600 (4×12 in)' },
    { id: 'aframe', label: 'A-Frame Insert', desc: 'Standard portrait insert for a real estate A-frame sign holder. Print on cardstock or heavy paper (60-120lb).', icon: Signpost, dims: '2550×3300 (8.5×11 in)' },
  ]

  const GOALS: { id: Goal; label: string; template: Template; image: string }[] = [
    { id: 'yardsign',  label: 'Yard sign',             template: 'rider',  image: '/sign-studio/card_yard_sign_FINAL.png' },
    { id: 'openhouse', label: 'Open house visitors',   template: 'aframe', image: '/sign-studio/card_open_house_FINAL.png' },
    { id: 'flyer',     label: 'Flyer / mailer',        template: 'corner', image: '/sign-studio/card_flyer_mailer_FINAL.png' },
  ]

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

  const dlBtn = (type: string, label: string, color = C.purple): React.CSSProperties => ({
    background: downloading === type ? `${color}60` : color,
    color: '#fff', border: 'none', borderRadius: 9,
    padding: '10px 20px', fontSize: 13, fontWeight: 700,
    cursor: downloading ? 'not-allowed' : 'pointer',
    fontFamily: 'sans-serif', whiteSpace: 'nowrap' as const,
    opacity: downloading && downloading !== type ? 0.5 : 1,
  })

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
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '28px', fontFamily: 'sans-serif' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, maxWidth: 1200 }}>

              {/* LEFT: Branding panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Agent branding */}
                <div style={card}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
                    Agent Branding
                  </div>
                  {field('Agent Name', 'agentName', 'Jane Smith')}
                  {field('Phone', 'agentPhone', '(555) 000-0000')}
                  {field('DRE #', 'dre', '01234567')}
                  {field('Brokerage', 'brokerage', 'Compass / KW / eXp...')}

                  {/* Photo upload */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
                      Agent Photo <span style={{ color: C.border, fontWeight: 400, fontSize: 10 }}>(optional)</span>
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {branding.agentPhotoUrl && (
                        <img src={branding.agentPhotoUrl} alt="Agent" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `2px solid ${C.purple}` }} />
                      )}
                      <label style={{
                        flex: 1, background: C.bg, border: `1px dashed ${C.border}`, borderRadius: 8,
                        color: C.muted, fontSize: 12, padding: '8px 12px', cursor: 'pointer', textAlign: 'center',
                      }}>
                        {branding.agentPhotoUrl ? 'Change photo' : 'Upload photo'}
                        <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={handlePhotoUpload} />
                      </label>
                    </div>
                  </div>

                  {/* Logo upload */}
                  <div style={{ marginBottom: 4 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
                      Brokerage Logo <span style={{ color: C.border, fontWeight: 400, fontSize: 10 }}>(optional PNG/JPG)</span>
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {branding.brokerageLogoUrl && (
                        <img src={branding.brokerageLogoUrl} alt="Logo" style={{ height: 32, maxWidth: 80, objectFit: 'contain', flexShrink: 0, background: '#fff', borderRadius: 4, padding: 2 }} />
                      )}
                      <label style={{
                        flex: 1, background: C.bg, border: `1px dashed ${C.border}`, borderRadius: 8,
                        color: C.muted, fontSize: 12, padding: '8px 12px', cursor: 'pointer', textAlign: 'center',
                      }}>
                        {branding.brokerageLogoUrl ? 'Change logo' : 'Upload logo'}
                        <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={handleLogoUpload} />
                      </label>
                    </div>
                  </div>
                </div>

                {/* QR info */}
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
                    printed code points to the new listing. Any address text printed on
                    the artwork won&apos;t update, though.
                  </p>
                </div>

              </div>

              {/* RIGHT: Template picker + preview + download */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Goal selector */}
                <div style={card}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4, letterSpacing: '-0.01em' }}>
                    Where are you capturing buyers?
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Select your use case — we'll pick the best template.</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'stretch' }}>
                    {GOALS.map(g => {
                      const active = goal === g.id
                      const tmpl = TEMPLATES.find(t => t.id === g.template)!
                      return (
                        <button
                          key={g.id}
                          onClick={() => { setGoal(g.id); setTemplate(g.template) }}
                          style={{
                            ...btnStyle(active),
                            display: 'flex', flexDirection: 'column', alignItems: 'stretch',
                            padding: 0, gap: 0, textAlign: 'left', overflow: 'hidden',
                            height: '100%',
                          }}
                        >
                          <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9' }}>
                            <NextImage
                              src={g.image}
                              alt={g.label}
                              width={480}
                              height={270}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                          </div>
                          <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: active ? '#fff' : C.text, lineHeight: 1.2, overflowWrap: 'break-word' }}>{g.label}</span>
                            <span style={{ fontSize: 10, lineHeight: 1.4, minHeight: 28, color: active ? 'rgba(255,255,255,0.55)' : C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <tmpl.icon size={12} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                              <span style={{ overflowWrap: 'break-word', minWidth: 0 }}>{tmpl.label} · {tmpl.dims}</span>
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  {goal && (() => {
                    const tmpl = TEMPLATES.find(t => t.id === template)!
                    return (
                      <div style={{ marginTop: 12, padding: '10px 14px', background: `${C.purple}18`, borderRadius: 8, border: `1px solid ${C.purple}35`, fontSize: 12, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <tmpl.icon size={14} strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 1, color: C.purpleL }} />
                        <span>
                          <span style={{ color: C.purpleL, fontWeight: 700 }}>{tmpl.label}</span>
                          <span style={{ color: C.muted }}> — {tmpl.desc}</span>
                        </span>
                      </div>
                    )
                  })()}
                </div>

                {/* Preview */}
                {showPreview && (
                  <div style={card}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
                      Preview
                    </div>

                    {template === 'corner' && (
                      <CornerPreview qrUrl={qrUrl} />
                    )}
                    {template === 'rider' && (
                      <RiderPreview qrUrl={qrUrl} branding={branding} address={address} />
                    )}
                    {template === 'aframe' && (
                      <AFramePreview qrUrl={qrUrl} />
                    )}
                  </div>
                )}

                {/* Download buttons */}
                <div style={card}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
                    Download
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {template === 'corner' && (
                      <button style={dlBtn('corner', '')} onClick={() => handleDownload('corner')} disabled={!!downloading}>
                        {downloading === 'corner' ? '⏳ Generating…' : '⬇ Download Print-Ready PNG'}
                      </button>
                    )}
                    {template === 'rider' && (
                      <button style={dlBtn('rider', '')} onClick={() => handleDownload('rider')} disabled={!!downloading}>
                        {downloading === 'rider' ? '⏳ Generating…' : '⬇ Download Print-Ready PNG'}
                      </button>
                    )}
                    {template === 'aframe' && (
                      <button style={dlBtn('aframe', '')} onClick={() => handleDownload('aframe')} disabled={!!downloading}>
                        {downloading === 'aframe' ? '⏳ Generating…' : '⬇ Download Print-Ready PNG'}
                      </button>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: C.sub, marginTop: 12, lineHeight: 1.6 }}>
                    💡 {template === 'corner'
                      ? 'Recommended: Print on standard paper, cut to size, at FedEx Office, Staples, or your brokerage print room. Typically low-cost.'
                      : 'Recommended: Print on 60-120lb cardstock at FedEx Office, Staples, or your brokerage print room. Typically low-cost.'}
                  </p>
                </div>

              </div>
            </div>
          </div>

          {/* Hidden high-res QR for canvas download */}
          {qrUrl && (
            <div style={{ position: 'absolute', left: -9999, top: 0, opacity: 0, pointerEvents: 'none' }} aria-hidden>
              <QRCodeSVG id="ss-qr-large" value={qrUrl} size={720} />
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  )
}

// ── preview components ────────────────────────────────────────────────────────

// Natural (unscaled) badge footprint — the resize handle scales visual
// content via CSS transform rather than reflowing it, so this stays fixed.
const CORNER_BADGE_W = 180
const CORNER_BADGE_H = 96

function CornerPreview({ qrUrl }: { qrUrl: string }) {
  const badgePurple = '#534AB7'
  const containerRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null)

  // Default to the bottom-right corner at natural size, matching the old
  // fixed placement — measured (not hardcoded) since the container is a
  // responsive square. Session-only: nothing here is persisted, so it
  // resets to this default on every mount/page load.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setBox({
      x: Math.max(0, width - CORNER_BADGE_W - 16),
      y: Math.max(0, height - CORNER_BADGE_H - 16),
      width: CORNER_BADGE_W,
      height: CORNER_BADGE_H,
    })
  }, [])

  const scale = box ? box.width / CORNER_BADGE_W : 1

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', paddingBottom: '100%', background: '#6B7280', borderRadius: 10, overflow: 'hidden' }}>
      {/* real flyer photo backdrop — preview only, for placement context */}
      <NextImage
        src="/sign-studio/card_flyer_mailer_FINAL.png"
        alt="Flyer preview"
        fill
        sizes="(max-width: 768px) 100vw, 400px"
        style={{ objectFit: 'cover' }}
      />

      {/* draggable / resizable QR badge — position & scale are session-only, never persisted */}
      {box && (
        <Rnd
          bounds="parent"
          lockAspectRatio
          size={{ width: box.width, height: box.height }}
          position={{ x: box.x, y: box.y }}
          minWidth={CORNER_BADGE_W * 0.6}
          maxWidth={CORNER_BADGE_W * 2.2}
          enableResizing={{
            top: false, right: false, bottom: false, left: false,
            topRight: false, bottomLeft: false, topLeft: false, bottomRight: true,
          }}
          resizeHandleStyles={{
            bottomRight: {
              width: 14, height: 14, borderRadius: '50%',
              background: '#fff', border: `2px solid ${badgePurple}`,
              boxShadow: '0 1px 4px rgba(0,0,0,0.4)', right: -6, bottom: -6,
            },
          }}
          onDragStop={(_e, d) => setBox(prev => (prev ? { ...prev, x: d.x, y: d.y } : prev))}
          onResizeStop={(_e, _dir, ref, _delta, position) => {
            setBox({ width: ref.offsetWidth, height: ref.offsetHeight, ...position })
          }}
          style={{ cursor: 'move' }}
        >
          <div style={{
            position: 'relative', width: CORNER_BADGE_W, height: CORNER_BADGE_H,
            transform: `scale(${scale})`, transformOrigin: 'top left',
            background: '#fff', borderRadius: 14,
            boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'stretch', gap: 10,
            padding: '10px 14px 10px 10px',
            overflow: 'hidden', boxSizing: 'border-box',
          }}>
            {/* diagonal peel / corner-flag detail */}
            <div style={{
              position: 'absolute', top: 0, right: 0, width: 0, height: 0,
              borderStyle: 'solid', borderWidth: '0 18px 18px 0',
              borderColor: `transparent ${badgePurple} transparent transparent`,
              opacity: 0.85,
            }} />

            {qrUrl ? <QRCodeSVG value={qrUrl} size={68} /> : <div style={{ width: 68, height: 68, background: '#eee' }} />}

            {/* thin vertical divider */}
            <div style={{ width: 1, background: '#E5E7EB', alignSelf: 'stretch' }} />

            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, fontFamily: 'sans-serif' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>Scan For</div>
              <div style={{
                background: badgePurple, color: '#fff', fontSize: 9, fontWeight: 700,
                borderRadius: 999, padding: '3px 8px', width: 'fit-content', letterSpacing: 0.2,
              }}>
                Price + Photos
              </div>
              <div style={{ fontSize: 8, fontWeight: 700, color: badgePurple, letterSpacing: 0.3, marginTop: 2 }}>
                theqrealtor
              </div>
            </div>
          </div>
        </Rnd>
      )}
    </div>
  )
}

function RiderPreview({ qrUrl, branding, address }: { qrUrl: string; branding: BrandingState; address: string }) {
  const C2 = { bg: '#0F0F13', purple: '#7C3AED', purpleL: '#8B5CF6', text: '#fff', sub: '#C4C4D4', muted: '#6B7280' }
  return (
    <div style={{ maxWidth: 200, margin: '0 auto' }}>
      <div style={{
        background: C2.bg, borderRadius: 10, overflow: 'hidden',
        border: '1px solid #252533', fontFamily: 'sans-serif',
      }}>
        {/* top purple stripe */}
        <div style={{ height: 5, background: C2.purple }} />
        <div style={{ padding: '14px 16px', textAlign: 'center' }}>
          {address && (
            <div style={{ fontSize: 10, color: '#fff', fontWeight: 800, marginBottom: 8, lineHeight: 1.4 }}>{address}</div>
          )}
          <div style={{ background: '#fff', borderRadius: 6, padding: 6, display: 'inline-block', marginBottom: 6 }}>
            {qrUrl ? <QRCodeSVG value={qrUrl} size={100} /> : <div style={{ width: 100, height: 100, background: '#eee' }} />}
          </div>
          <div style={{ fontSize: 8, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Scan For Price + Photos Instantly</div>
          <div style={{ borderTop: '1px solid #252533', paddingTop: 8, marginTop: 4 }}>
            {branding.agentName && <div style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{branding.agentName}</div>}
            {branding.agentPhone && <div style={{ fontSize: 9, color: C2.purpleL }}>{branding.agentPhone}</div>}
            {branding.dre && <div style={{ fontSize: 8, color: C2.muted }}>DRE# {branding.dre}</div>}
            {branding.brokerageLogoUrl
              ? <img src={branding.brokerageLogoUrl} alt="logo" style={{ height: 18, maxWidth: 80, objectFit: 'contain', marginTop: 3 }} />
              : branding.brokerage && <div style={{ fontSize: 9, color: C2.sub }}>{branding.brokerage}</div>
            }
          </div>
        </div>
        <div style={{ height: 5, background: C2.purple }} />
      </div>
      <div style={{ fontSize: 10, color: '#6B7280', textAlign: 'center', marginTop: 6, fontFamily: 'sans-serif' }}>4×12 in print size</div>
    </div>
  )
}

function AFramePreview({ qrUrl }: { qrUrl: string }) {
  const badgePurple = '#534AB7'
  return (
    <div style={{ maxWidth: 220, margin: '0 auto' }}>
      <div style={{
        background: '#fff', borderRadius: 10, overflow: 'hidden',
        border: '1px solid #252533', fontFamily: 'sans-serif',
      }}>
        {/* purple header bar */}
        <div style={{ background: badgePurple, padding: '16px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: 1.5 }}>OPEN HOUSE</div>
        </div>
        {/* white body */}
        <div style={{ padding: '20px 16px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', marginBottom: 10 }}>
            {qrUrl ? <QRCodeSVG value={qrUrl} size={120} /> : <div style={{ width: 120, height: 120, background: '#eee' }} />}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>Scan for Photos &amp; Details</div>
        </div>
        {/* footer wordmark */}
        <div style={{ padding: '0 16px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#111827' }}>
            the<span style={{ color: badgePurple }}>qr</span>ealtor
          </div>
        </div>
      </div>
      <div style={{ fontSize: 10, color: '#6B7280', textAlign: 'center', marginTop: 6, fontFamily: 'sans-serif' }}>8.5×11 in print size</div>
    </div>
  )
}
