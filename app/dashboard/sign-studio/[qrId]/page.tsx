'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
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

type Template = 'corner' | 'rider' | 'traffic'
type Goal = 'traffic' | 'openhouse' | 'yardsign' | 'flyer'

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

// ── download functions ────────────────────────────────────────────────────────

async function downloadCorner(
  qrId: string, origin: string, branding: BrandingState,
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

  // white rounded card behind QR
  ctx.fillStyle = 'rgba(255,255,255,0.97)'
  roundRect(ctx, bx - 20, by - 20, boxSize + 40, boxSize + 80, 18)
  ctx.fill()

  // QR code
  const qrImg = await svgToImage(svgRef, boxSize)
  ctx.drawImage(qrImg, bx, by, boxSize, boxSize)

  // "Scan Me" text
  ctx.fillStyle = '#111827'
  ctx.font = 'bold 26px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Scan Me', bx + boxSize / 2, by + boxSize + 44)

  // agent name
  if (branding.agentName) {
    ctx.fillStyle = '#6B7280'
    ctx.font = '20px sans-serif'
    ctx.fillText(branding.agentName, bx + boxSize / 2, by + boxSize + 68)
  }

  const a = document.createElement('a')
  a.download = `corner-qr-${qrId}.png`
  a.href = canvas.toDataURL('image/png')
  a.click()
}

async function downloadRider(
  qrId: string, origin: string, branding: BrandingState,
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
  const infoY = belowQR + 140
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
  a.download = `rider-${qrId}.png`
  a.href = canvas.toDataURL('image/png')
  a.click()
}

async function downloadTraffic(
  qrId: string, origin: string, branding: BrandingState,
  address: string, svgRef: SVGSVGElement, landscape: boolean
) {
  // 8.5x11 at 300dpi = 2550x3300 (portrait), 3300x2550 (landscape)
  const W = landscape ? 3300 : 2550
  const H = landscape ? 2550 : 3300
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!

  // pure black bg
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, W, H)

  if (landscape) {
    // left side: text, right side: QR
    const qrSize = H - 240
    const qrX = W - qrSize - 120
    const qrY = 120

    ctx.fillStyle = '#FFFFFF'
    roundRect(ctx, qrX - 20, qrY - 20, qrSize + 40, qrSize + 40, 24)
    ctx.fill()
    const qrImg = await svgToImage(svgRef, qrSize)
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)

    // left text
    const textX = 120
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `bold ${Math.floor(H * 0.13)}px sans-serif`
    ctx.textAlign = 'left'
    ctx.fillText('SCAN', textX, H * 0.26)
    ctx.fillText('FOR', textX, H * 0.26 + H * 0.15)
    ctx.fillText('HOME', textX, H * 0.26 + H * 0.30)
    ctx.fillText('INFO', textX, H * 0.26 + H * 0.45)

    // NO APP NEEDED
    ctx.fillStyle = '#CCCCCC'
    ctx.font = `bold ${Math.floor(H * 0.048)}px sans-serif`
    ctx.fillText('NO APP NEEDED', textX, H * 0.26 + H * 0.56)

    let agentY = H * 0.26 + H * 0.66
    if (branding.agentName) {
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `bold ${Math.floor(H * 0.065)}px sans-serif`
      ctx.fillText(branding.agentName, textX, agentY)
      agentY += H * 0.08
    }
    if (branding.agentPhone) {
      ctx.fillStyle = C.purpleL
      ctx.font = `bold ${Math.floor(H * 0.054)}px sans-serif`
      ctx.fillText(branding.agentPhone, textX, agentY)
    }

    // watermark bottom-left
    ctx.fillStyle = '#333333'
    ctx.font = `${Math.floor(H * 0.022)}px sans-serif`
    ctx.fillText('theQRealtor.com', textX, H - Math.floor(H * 0.025))
  } else {
    // portrait: stacked
    ctx.fillStyle = '#FFFFFF'
    const fontSize = Math.floor(W * 0.14)
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('SCAN FOR', W / 2, fontSize * 1.1)
    ctx.fillText('HOME INFO', W / 2, fontSize * 2.15)

    // massive QR in center (65% of width)
    const qrSize = Math.floor(W * 0.65)
    const qrX = (W - qrSize) / 2
    const qrY = Math.floor(fontSize * 2.6)

    ctx.fillStyle = '#FFFFFF'
    roundRect(ctx, qrX - 20, qrY - 20, qrSize + 40, qrSize + 40, 24)
    ctx.fill()
    const qrImg = await svgToImage(svgRef, qrSize)
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)

    // "NO APP NEEDED" below QR
    const noAppY = qrY + qrSize + Math.floor(W * 0.07)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `bold ${Math.floor(W * 0.055)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('NO APP NEEDED', W / 2, noAppY)

    // agent info — bold, prominent
    let bottomY = noAppY + Math.floor(W * 0.08)
    if (branding.agentName) {
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `bold ${Math.floor(W * 0.065)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(branding.agentName, W / 2, bottomY)
      bottomY += Math.floor(W * 0.08)
    }
    if (branding.agentPhone) {
      ctx.fillStyle = C.purpleL
      ctx.font = `bold ${Math.floor(W * 0.054)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(branding.agentPhone, W / 2, bottomY)
    }

    // theQRealtor watermark at very bottom
    ctx.fillStyle = '#333333'
    ctx.font = `${Math.floor(W * 0.025)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('theQRealtor.com', W / 2, H - Math.floor(W * 0.03))
  }

  const a = document.createElement('a')
  a.download = `traffic-${landscape ? 'landscape' : 'portrait'}-${qrId}.png`
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
  const qrId = params.qrId as string

  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(true)
  const [qrCode, setQrCode] = useState<any>(null)
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

      const { data: qr } = await supabase.from('qrcodes').select('*').eq('id', qrId).single()
      if (!qr) { router.push('/dashboard/qr-codes'); return }
      setQrCode(qr)

      const { data: prop } = await supabase.from('properties').select('*').eq('id', qr.property_id).single()
      setProperty(prop)

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
  }, [qrId])

  const qrUrl = origin ? `${origin}/q/${qrId}` : ''
  const address = property?.address || ''

  const handleDownload = async (type: string) => {
    const svgEl = document.getElementById(`ss-qr-large`) as unknown as SVGSVGElement
    if (!svgEl || !origin) return
    setDownloading(type)
    try {
      if (type === 'corner') await downloadCorner(qrId, origin, branding, address, svgEl)
      else if (type === 'rider') await downloadRider(qrId, origin, branding, address, svgEl)
      else if (type === 'traffic-p') await downloadTraffic(qrId, origin, branding, address, svgEl, false)
      else if (type === 'traffic-l') await downloadTraffic(qrId, origin, branding, address, svgEl, true)
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

  const TEMPLATES: { id: Template; label: string; desc: string; icon: string; dims: string }[] = [
    { id: 'corner', label: 'Corner Overlay', desc: 'Print-ready QR overlay for yard sign photos. Print on standard paper and trim.', icon: '🏷️', dims: '1200×1200' },
    { id: 'rider', label: 'Sign Rider', desc: 'Print-ready rider for yard signs. Print on cardstock or heavy paper (60-120lb).', icon: '📋', dims: '1200×3600 (4×12 in)' },
    { id: 'traffic', label: 'Traffic Sign', desc: 'Bold print-ready sign for open houses and intersections. Print on 8.5x11 cardstock or heavy paper.', icon: '🚗', dims: '2550×3300 (8.5×11 in)' },
  ]

  const GOALS: { id: Goal; icon: string; label: string; template: Template }[] = [
    { id: 'traffic',   icon: '🚗', label: 'Drive-by traffic',     template: 'traffic' },
    { id: 'openhouse', icon: '🏡', label: 'Open house visitors',   template: 'corner'  },
    { id: 'yardsign',  icon: '🪧', label: 'Yard sign',             template: 'rider'   },
    { id: 'flyer',     icon: '📄', label: 'Flyer / mailer',        template: 'corner'  },
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
            <Link href="/dashboard/qr-codes" style={{ color: C.muted, fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
              ← QR Codes
            </Link>
            <span style={{ color: C.border }}>|</span>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.01em' }}>
                Sign Studio
              </h1>
              {qrCode && (
                <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>{qrCode.label}</p>
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
                    QR Code Info
                  </div>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 4 }}>{qrCode?.label}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>{address}</div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: C.purpleL }}>{qrCode?.scan_count || 0}</div>
                      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scans</div>
                    </div>
                  </div>
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                    {GOALS.map(g => {
                      const active = goal === g.id
                      const tmpl = TEMPLATES.find(t => t.id === g.template)!
                      return (
                        <button
                          key={g.id}
                          onClick={() => { setGoal(g.id); setTemplate(g.template) }}
                          style={{
                            ...btnStyle(active),
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                            padding: '14px', gap: 5, textAlign: 'left',
                          }}
                        >
                          <span style={{ fontSize: 28, lineHeight: 1 }}>{g.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: active ? '#fff' : C.text, lineHeight: 1.2 }}>{g.label}</span>
                          <span style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.55)' : C.muted, marginTop: 1 }}>
                            {tmpl.icon} {tmpl.label} · {tmpl.dims}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {goal && (() => {
                    const tmpl = TEMPLATES.find(t => t.id === template)!
                    return (
                      <div style={{ marginTop: 12, padding: '10px 14px', background: `${C.purple}18`, borderRadius: 8, border: `1px solid ${C.purple}35`, fontSize: 12 }}>
                        <span style={{ color: C.purpleL, fontWeight: 700 }}>{tmpl.icon} {tmpl.label}</span>
                        <span style={{ color: C.muted }}> — {tmpl.desc}</span>
                      </div>
                    )
                  })()}
                </div>

                {/* Preview */}
                <div style={card}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
                    Preview
                  </div>

                  {template === 'corner' && (
                    <CornerPreview qrUrl={qrUrl} branding={branding} />
                  )}
                  {template === 'rider' && (
                    <RiderPreview qrUrl={qrUrl} branding={branding} address={address} />
                  )}
                  {template === 'traffic' && (
                    <TrafficPreview qrUrl={qrUrl} branding={branding} address={address} />
                  )}
                </div>

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
                    {template === 'traffic' && (
                      <>
                        <button style={dlBtn('traffic-p', '')} onClick={() => handleDownload('traffic-p')} disabled={!!downloading}>
                          {downloading === 'traffic-p' ? '⏳ Generating…' : '⬇ Print-Ready PNG (Portrait 8.5×11)'}
                        </button>
                        <button style={{ ...dlBtn('traffic-l', ''), background: downloading === 'traffic-l' ? '#0055A460' : '#0055A4' }} onClick={() => handleDownload('traffic-l')} disabled={!!downloading}>
                          {downloading === 'traffic-l' ? '⏳ Generating…' : '⬇ Print-Ready PNG (Landscape 11×8.5)'}
                        </button>
                      </>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: C.sub, marginTop: 12, lineHeight: 1.6 }}>
                    💡 Recommended: Print on 60-120lb cardstock at FedEx Office, Staples, or your brokerage print room. Most locations offer same-day printing for under $5.
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

function CornerPreview({ qrUrl, branding }: { qrUrl: string; branding: BrandingState }) {
  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '100%', background: '#6B7280', borderRadius: 10, overflow: 'hidden' }}>
      {/* simulated yard sign background */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #1a3a6a 0%, #2e6fcc 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 18, fontWeight: 700, fontFamily: 'sans-serif', letterSpacing: 2 }}>
          FOR SALE
        </div>
      </div>
      {/* QR sticker in bottom-right */}
      <div style={{
        position: 'absolute', bottom: 16, right: 16,
        background: 'rgba(255,255,255,0.97)', borderRadius: 10, padding: '8px 8px 4px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
      }}>
        {qrUrl ? <QRCodeSVG value={qrUrl} size={80} /> : <div style={{ width: 80, height: 80, background: '#eee' }} />}
        <div style={{ fontSize: 9, color: '#374151', textAlign: 'center', fontWeight: 700, marginTop: 3, fontFamily: 'sans-serif' }}>
          Scan Me
        </div>
        {branding.agentName && (
          <div style={{ fontSize: 8, color: '#6B7280', textAlign: 'center', fontFamily: 'sans-serif' }}>{branding.agentName}</div>
        )}
      </div>
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

function TrafficPreview({ qrUrl, branding, address }: { qrUrl: string; branding: BrandingState; address: string }) {
  return (
    <div style={{ maxWidth: 260, margin: '0 auto' }}>
      <div style={{
        background: '#000', borderRadius: 10, overflow: 'hidden',
        border: '1px solid #252533', padding: '16px', fontFamily: 'sans-serif',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: 3, lineHeight: 1.2, marginBottom: 12 }}>
          SCAN FOR<br />HOME INFO
        </div>
        <div style={{ background: '#fff', borderRadius: 8, padding: 8, display: 'inline-block', marginBottom: 8 }}>
          {qrUrl ? <QRCodeSVG value={qrUrl} size={140} /> : <div style={{ width: 140, height: 140, background: '#eee' }} />}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#ccc', marginBottom: 10, letterSpacing: 1 }}>NO APP NEEDED</div>
        {branding.agentName && (
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 2 }}>{branding.agentName}</div>
        )}
        {branding.agentPhone && (
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8B5CF6', marginBottom: 6 }}>{branding.agentPhone}</div>
        )}
        <div style={{ fontSize: 8, color: '#444', marginTop: 4 }}>theQRealtor.com</div>
      </div>
      <div style={{ fontSize: 10, color: '#6B7280', textAlign: 'center', marginTop: 6, fontFamily: 'sans-serif' }}>8.5×11 in / 11×8.5 in</div>
    </div>
  )
}
