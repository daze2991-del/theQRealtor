'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { createBrowserSupabase } from '../../../lib/supabase-browser'
import { qrLimitForPlan } from '../../../lib/plans'

/* ─── tokens ─────────────────────────────────────────────────── */
const C = {
  bg:      '#0F0F13',
  card:    '#1A1A24',
  border:  '#252533',
  input:   '#13131A',
  purple:  '#7C3AED',
  purpleL: '#8B5CF6',
  text:    '#FFFFFF',
  sub:     '#C4C4D4',
  muted:   '#6B7280',
} as const

// 5-segment progress: Steps 1–4 + "You're Live"
const SEGMENTS = ['Welcome', 'Property', 'QR Code', 'Print', "You're Live"]

/* ─── shared styles ──────────────────────────────────────────── */
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: C.sub, marginBottom: 8,
}
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: C.input, border: `1px solid ${C.border}`,
  borderRadius: 10, color: C.text, fontSize: 15,
  padding: '12px 14px', outline: 'none', fontFamily: 'sans-serif',
}
const primaryBtn: React.CSSProperties = {
  width: '100%', padding: '14px', background: C.purple, color: '#fff',
  border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
  cursor: 'pointer', letterSpacing: '-0.01em', fontFamily: 'sans-serif',
}
const secondaryBtn: React.CSSProperties = {
  width: '100%', padding: '14px', background: 'transparent', color: C.sub,
  border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 15, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'sans-serif',
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingWizard />
    </Suspense>
  )
}

function OnboardingWizard() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [userId, setUserId]   = useState('')
  const [origin, setOrigin]   = useState('')
  const [plan, setPlan]       = useState('free')
  const [qrCount, setQrCount] = useState(0)

  const [step, setStep]                 = useState(1)
  const [propertyId, setPropertyId]     = useState('')
  const [propertyAddress, setPropertyAddress] = useState('')

  // Step 2 — property form
  const [address, setAddress]         = useState('')
  const [city, setCity]               = useState('')
  const [stateVal, setStateVal]       = useState('')
  const [price, setPrice]             = useState('')
  const [beds, setBeds]               = useState('')
  const [baths, setBaths]             = useState('')
  const [description, setDescription] = useState('')
  const [propertyCreated, setPropertyCreated] = useState(false)
  const [savingProperty, setSavingProperty]   = useState(false)

  // Step 2 — photos (optional, non-blocking)
  const [photos, setPhotos]           = useState<any[]>([])
  const [uploading, setUploading]     = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step 3 — QR
  const [qrLabel, setQrLabel]           = useState('')
  const [generatingQR, setGeneratingQR] = useState(false)
  const [qrId, setQrId]                 = useState('')
  const [limitReached, setLimitReached] = useState(false)

  // Step 4
  const [finishing, setFinishing] = useState(false)

  const [error, setError] = useState('')

  /* ── load + derive resume step from DB state ── */
  useEffect(() => {
    setOrigin(window.location.origin)
    const load = async () => {
      const supabase = createBrowserSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }
      setUserId(session.user.id)

      const [{ data: profile }, { data: props }] = await Promise.all([
        supabase.from('profiles').select('plan').eq('id', session.user.id).single(),
        supabase.from('properties').select('id, address').eq('user_id', session.user.id).order('created_at', { ascending: false }),
      ])
      setPlan((profile?.plan as string) || 'free')

      const properties = props || []
      let pid = '', addr = '', qrExists = false, qrCnt = 0
      if (properties.length > 0) {
        pid  = properties[0].id
        addr = properties[0].address
        const propertyIds = properties.map((p: any) => p.id)
        // qrcodes has a permissive public-read policy — scope the count to the
        // user's own properties explicitly (RLS alone would count all rows).
        const { count } = await supabase
          .from('qrcodes').select('id', { count: 'exact', head: true })
          .in('property_id', propertyIds)
        qrCnt = count || 0
        qrExists = qrCnt > 0
      }
      setPropertyId(pid)
      setPropertyAddress(addr)
      setQrCount(qrCnt)
      if (pid) { setPropertyCreated(true); setAddress(addr) }

      // Resume: DB progress clamps how far you can be; ?step is honored within bounds.
      const urlStep = parseInt(searchParams.get('step') || '', 10)
      const maxAllowed = qrExists ? 4 : pid ? 3 : 2
      const resume = !isNaN(urlStep)
        ? Math.min(Math.max(urlStep, 1), maxAllowed)
        : (qrExists ? 4 : pid ? 3 : 1)
      setStep(resume)
      setLoading(false)
    }
    load()
  }, [])

  // Keep the URL in sync with the active step (carry property id forward).
  const goToStep = (n: number, pid?: string) => {
    setStep(n)
    const id = pid ?? propertyId
    const q = new URLSearchParams()
    q.set('step', String(n))
    if (id) q.set('pid', id)
    router.replace(`/dashboard/onboarding?${q.toString()}`)
  }

  // Step 3 guard — never render the QR form without a property.
  useEffect(() => {
    if (!loading && step === 3 && !propertyId) goToStep(2)
  }, [loading, step, propertyId])

  /* ── completion / skip ── */
  const markCompleted = async () => {
    const supabase = createBrowserSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', session.user.id)
    }
  }

  const handleSkip = async () => {
    await markCompleted()
    router.push('/dashboard')
  }

  const handleFinish = async () => {
    setFinishing(true)
    await markCompleted()
    router.push('/dashboard/welcome')
  }

  /* ── Step 2: create property ── */
  const handleCreateProperty = async () => {
    if (!address.trim()) { setError('Property address is required.'); return }
    setSavingProperty(true); setError('')
    const supabase = createBrowserSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not signed in.'); setSavingProperty(false); return }

    const num = (v: string) => (v.trim() && !isNaN(Number(v)) ? Number(v) : null)
    const int = (v: string) => (v.trim() && !isNaN(parseInt(v, 10)) ? parseInt(v, 10) : null)

    const { data, error: err } = await supabase
      .from('properties')
      .insert({
        user_id: user.id, active: true,
        address: address.trim(),
        city: city.trim() || null,
        state: stateVal.trim() || null,
        price: num(price),
        beds: int(beds),
        baths: num(baths),
        description: description.trim() || null,
      })
      .select('id, address')
      .single()
    if (err || !data) { setError(err?.message || 'Failed to create property.'); setSavingProperty(false); return }

    setPropertyId(data.id)
    setPropertyAddress(data.address)
    setPropertyCreated(true)
    setSavingProperty(false)
  }

  /* ── Step 2: optional photo upload (non-blocking) ── */
  const uploadPhotos = useCallback(async (files: FileList | null) => {
    if (!files || !propertyId || !userId) return
    const arr = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, 10 - photos.length)
    if (arr.length === 0) return
    setUploading(true); setUploadError('')
    const supabase = createBrowserSupabase()
    for (const file of arr) {
      const ext = file.name.split('.').pop() || 'jpg'
      const storagePath = `${userId}/${propertyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('property-photos').upload(storagePath, file, { cacheControl: '3600', upsert: false })
      if (upErr) { setUploadError(`Upload failed: ${upErr.message}`); continue }
      const { data: { publicUrl } } = supabase.storage.from('property-photos').getPublicUrl(storagePath)
      const { error: dbErr } = await supabase.from('property_photos').insert({ property_id: propertyId, url: publicUrl, storage_path: storagePath, sort_order: photos.length })
      if (dbErr) { setUploadError(`Failed to save photo: ${dbErr.message}`); continue }
    }
    const { data: pics } = await supabase.from('property_photos').select('*').eq('property_id', propertyId).order('sort_order', { ascending: true })
    setPhotos(pics || [])
    setUploading(false)
  }, [propertyId, userId, photos.length])

  /* ── Step 3: generate QR (server trigger is the source of truth for the limit) ── */
  const handleGenerateQR = async () => {
    if (!qrLabel.trim() || !propertyId) return
    const limit = qrLimitForPlan(plan)
    if (limit !== null && qrCount >= limit) { setLimitReached(true); return }

    setGeneratingQR(true); setError('')
    const supabase = createBrowserSupabase()
    const { data, error: err } = await supabase
      .from('qrcodes')
      .insert({ property_id: propertyId, label: qrLabel.trim(), placement: 'Yard Sign', type: 'property', scan_count: 0 })
      .select('id')
      .single()
    if (err || !data) {
      // Migration 024 trigger rejects over-limit inserts with errcode 23514.
      if (err && (err.code === '23514' || /limit reached/i.test(err.message || ''))) {
        setLimitReached(true)
      } else {
        setError(err?.message || 'Failed to generate QR code.')
      }
      setGeneratingQR(false); return
    }
    setQrId(data.id)
    setQrCount(c => c + 1)
    setGeneratingQR(false)
    goToStep(4)
  }

  /* ── Step 4: download PNG ── */
  // Renders a branded card matching the on-screen preview (minus the address,
  // which is redundant on a physical sign already placed at that address).
  // Layout (top→bottom): instruction text → QR code → muted wordmark.
  // All proportions derived from the on-screen card:
  //   card width 260px, side padding 16px → content 228px, QR 212px (93%).
  //   Canvas is 600px wide: side padding 40px → content 520px, QR 480px (92%).
  //   Text sizes scale ~2.31× (600/260): 12px card text → 28px canvas.
  const downloadQR = () => {
    const svg = document.getElementById('wizard-qr-svg')
    if (!svg) return
    const svgStr = new XMLSerializer().serializeToString(svg)

    const W = 600
    const pad = 40           // side padding
    const qrSize = 480       // ≈92% of content width, matches card's 212/228
    const topPad = 46        // matches card's 20px top padding scaled
    const instrY = topPad + 28  // baseline of instruction text
    const qrTop  = instrY + 22  // gap below instruction text (card: ~14px gap to QR)
    const qrBot  = qrTop + qrSize
    const wmY    = qrBot + 38   // gap below QR (card: 14px marginTop scaled)
    const H      = wmY + 30     // bottom padding

    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // White background
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, W, H)

      // "Scan to view this home" — muted, matches card's #6B7280 at 12px
      ctx.textAlign = 'center'
      ctx.fillStyle = '#6B7280'
      ctx.font = '300 28px system-ui, -apple-system, Arial, sans-serif'
      ctx.fillText('Scan to view this home', W / 2, instrY)

      // QR code — centred, dominant
      ctx.drawImage(img, pad, qrTop, qrSize, qrSize)

      // "Powered by theqrealtor" — three-weight wordmark, all muted.
      // Draw each segment sequentially, measuring width to position the next.
      const wmFontSize = 23  // matches card's 10px × 2.31 scale
      const segments: [string, string, string][] = [
        ['300', '#9CA3AF', 'Powered by the'],
        ['700', '#8B8AC4', 'qr'],
        ['500', '#9CA3AF', 'ealtor'],
      ]
      // Measure total width first so we can centre the whole wordmark.
      let totalWidth = 0
      for (const [weight, , text] of segments) {
        ctx.font = `${weight} ${wmFontSize}px system-ui, -apple-system, Arial, sans-serif`
        totalWidth += ctx.measureText(text).width
      }
      let x = (W - totalWidth) / 2
      ctx.textAlign = 'left'
      for (const [weight, color, text] of segments) {
        ctx.font = `${weight} ${wmFontSize}px system-ui, -apple-system, Arial, sans-serif`
        ctx.fillStyle = color
        ctx.fillText(text, x, wmY)
        x += ctx.measureText(text).width
      }

      const a = document.createElement('a')
      a.download = `${(qrLabel || 'property').replace(/\s+/g, '-').toLowerCase()}-qr.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr)
  }

  // The real buyer URL this QR encodes.
  const buyerUrl = propertyId ? `${origin}/p/${propertyId}` : ''
  const limit = qrLimitForPlan(plan)
  const atLimit = limit !== null && qrCount >= limit

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 34, height: 34, border: `2px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '32px 16px', fontFamily: 'sans-serif',
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .ob-field:focus { border-color: ${C.purple} !important; box-shadow: 0 0 0 3px rgba(124,58,237,0.2); }
        @media (max-width: 560px) { .ob-grid2 { grid-template-columns: 1fr !important; } }
      `}</style>

      {/* Logo */}
      <div style={{ marginBottom: 26 }}>
        <span style={{ fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif", fontSize: '18px', letterSpacing: '-0.5px', lineHeight: 1 }}>
          <span style={{ fontWeight: 300, color: C.text }}>the</span>
          <span style={{ fontWeight: 700, color: '#534AB7' }}>qr</span>
          <span style={{ fontWeight: 500, color: C.text }}>ealtor</span>
        </span>
      </div>

      {/* Card */}
      <div style={{ width: '100%', maxWidth: 540, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden' }}>

        {/* Progress header — 5 segments */}
        <div style={{ padding: '20px 28px 18px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {step > 1 && (
                <button onClick={() => goToStep(step - 1)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'sans-serif', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                  ← Back
                </button>
              )}
              <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Step {step} of 4
              </span>
            </div>
            <button onClick={handleSkip} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'sans-serif' }}>
              Skip for now →
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {SEGMENTS.map((seg, i) => (
              <div key={seg} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{
                  height: 4, borderRadius: 4,
                  background: i < step ? `linear-gradient(90deg, ${C.purple}, ${C.purpleL})` : C.border,
                  transition: 'background 0.3s',
                }} />
                <span style={{ fontSize: 9.5, color: i < step ? C.purpleL : C.muted, textAlign: 'center', letterSpacing: '0.01em' }}>{seg}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Step body */}
        <div style={{ padding: '28px 28px 32px' }}>

          {/* ─── STEP 1 — Welcome ─── */}
          {step === 1 && (
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
                Let&apos;s get your first lead capture set up
              </h1>
              <p style={{ fontSize: 14, color: C.muted, margin: '0 0 24px', lineHeight: 1.5 }}>
                Three quick steps and your yard sign starts capturing buyer leads.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                {([
                  {
                    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.purpleL} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V10.5z"/><path d="M9 22V13h6v9"/></svg>,
                    title: 'Add your property', desc: 'Address and a few details buyers want to see.',
                  },
                  {
                    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.purpleL} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h2v2h-2zm4 0h2v2h-2zm-4 4h2v2h-2zm4 0h2v2h-2zm-4 4h2"/><path d="M20 18h2v4h-2"/></svg>,
                    title: 'Generate your QR code', desc: 'A scannable code that links straight to your listing.',
                  },
                  {
                    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.purpleL} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
                    title: 'Download and print', desc: 'Print it out and place it on your yard sign. This QR code is permanently linked to this listing.',
                  },
                ] as const).map(({ icon, title, desc }) => (
                  <div key={title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: C.input, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${C.purple}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{title}</div>
                      <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2, lineHeight: 1.5 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => goToStep(2)} style={primaryBtn}>Let&apos;s get started →</button>
            </div>
          )}

          {/* ─── STEP 2 — Add property ─── */}
          {step === 2 && (
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Add your property</h1>
              <p style={{ fontSize: 14, color: C.muted, margin: '0 0 24px', lineHeight: 1.5 }}>
                Tell us about the listing you want to track leads for.
              </p>

              {!propertyCreated ? (
                <>
                  <label style={labelStyle}>Property Address *</label>
                  <input className="ob-field" type="text" placeholder="e.g. 123 Oak Avenue" value={address} onChange={e => setAddress(e.target.value)} autoFocus style={inputStyle} />

                  <div className="ob-grid2" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginTop: 16 }}>
                    <div>
                      <label style={labelStyle}>City</label>
                      <input className="ob-field" type="text" placeholder="Austin" value={city} onChange={e => setCity(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>State</label>
                      <input className="ob-field" type="text" placeholder="TX" value={stateVal} onChange={e => setStateVal(e.target.value)} style={inputStyle} />
                    </div>
                  </div>

                  <div className="ob-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 16 }}>
                    <div>
                      <label style={labelStyle}>Price</label>
                      <input className="ob-field" type="number" inputMode="numeric" placeholder="650000" value={price} onChange={e => setPrice(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Beds</label>
                      <input className="ob-field" type="number" inputMode="numeric" placeholder="3" value={beds} onChange={e => setBeds(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Baths</label>
                      <input className="ob-field" type="number" inputMode="numeric" placeholder="2" value={baths} onChange={e => setBaths(e.target.value)} style={inputStyle} />
                    </div>
                  </div>

                  <label style={{ ...labelStyle, marginTop: 16 }}>Description</label>
                  <textarea className="ob-field" placeholder="Bright open floor plan, updated kitchen…" value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }} />

                  {error && <p style={{ color: '#F87171', fontSize: 13, margin: '14px 0 0' }}>{error}</p>}

                  <button onClick={handleCreateProperty} disabled={savingProperty || !address.trim()} style={{ ...primaryBtn, marginTop: 24, opacity: (!address.trim() || savingProperty) ? 0.5 : 1 }}>
                    {savingProperty ? 'Saving…' : 'Save & Add Photos →'}
                  </button>
                </>
              ) : (
                <>
                  {/* Property created confirmation */}
                  <div style={{ background: `${C.purple}14`, border: `1px solid ${C.purple}35`, borderRadius: 12, padding: '12px 16px', marginBottom: 22, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `${C.purple}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>✓</div>
                    <div>
                      <div style={{ fontSize: 11, color: C.purpleL, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Property created</div>
                      <div style={{ fontSize: 14, color: C.sub, marginTop: 2 }}>{propertyAddress}</div>
                    </div>
                  </div>

                  {/* Optional photos — non-blocking */}
                  <label style={labelStyle}>Photos <span style={{ color: C.muted, fontWeight: 400 }}>(optional)</span></label>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { uploadPhotos(e.target.files); if (fileInputRef.current) fileInputRef.current.value = '' }} />
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading || photos.length >= 10} style={{ ...secondaryBtn, opacity: uploading ? 0.6 : 1 }}>
                    {uploading ? 'Uploading…' : photos.length > 0 ? '+ Add more photos' : '+ Upload photos'}
                  </button>

                  {photos.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                      {photos.map(p => (
                        <img key={p.id} src={p.url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}` }} />
                      ))}
                    </div>
                  )}

                  {uploadError && <p style={{ color: '#F87171', fontSize: 12.5, margin: '12px 0 0', lineHeight: 1.5 }}>{uploadError} — you can still continue; the property is saved.</p>}

                  <p style={{ fontSize: 12, color: C.muted, margin: '14px 0 0', lineHeight: 1.5 }}>
                    Photos are optional — you can add or change them anytime from the property page.
                  </p>

                  <button onClick={() => goToStep(3, propertyId)} style={{ ...primaryBtn, marginTop: 22 }}>Continue →</button>
                </>
              )}
            </div>
          )}

          {/* ─── STEP 3 — Generate QR ─── */}
          {step === 3 && propertyId && (
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Generate your QR code</h1>
              <p style={{ fontSize: 14, color: C.muted, margin: '0 0 22px', lineHeight: 1.5 }}>
                Name your sign placement and preview the code buyers will scan.
              </p>

              {/* Live QR preview — encodes the real buyer URL */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
                <div style={{ background: '#fff', padding: 16, borderRadius: 16, boxShadow: `0 0 50px ${C.purple}30` }}>
                  {origin && propertyId ? <QRCodeSVG value={buyerUrl} size={150} /> : <div style={{ width: 150, height: 150 }} />}
                </div>
              </div>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <span style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>{buyerUrl}</span>
              </div>

              {/* Plan usage meter */}
              <div style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.sub }}>
                  <span>QR codes used</span>
                  <span style={{ fontWeight: 700 }}>{limit === null ? `${qrCount} · Unlimited` : `${qrCount} of ${limit}`}</span>
                </div>
                {limit !== null && (
                  <div style={{ height: 4, background: C.border, borderRadius: 4, overflow: 'hidden', marginTop: 8 }}>
                    <div style={{ height: '100%', borderRadius: 4, width: `${Math.min(100, Math.round((qrCount / limit) * 100))}%`, background: `linear-gradient(90deg, ${C.purple}, ${C.purpleL})` }} />
                  </div>
                )}
              </div>

              {(limitReached || atLimit) ? (
                <div style={{ background: '#2D1A06', border: '1px solid #92400E', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#FCD34D', marginBottom: 6 }}>QR code limit reached</div>
                  <div style={{ fontSize: 13, color: C.sub, marginBottom: 14, lineHeight: 1.5 }}>
                    You&apos;ve used all {limit} QR codes on your plan. Upgrade to add more.
                  </div>
                  <button onClick={() => router.push('/dashboard/billing')} style={{ ...primaryBtn, padding: '12px', background: '#D97706' }}>Upgrade plan →</button>
                </div>
              ) : (
                <>
                  <label style={labelStyle}>QR Code Label *</label>
                  <input className="ob-field" type="text" placeholder='e.g. "Front Yard Sign"' value={qrLabel} onChange={e => setQrLabel(e.target.value)} autoFocus style={inputStyle} />
                  <p style={{ fontSize: 12, color: C.muted, margin: '8px 0 0', lineHeight: 1.5 }}>Labels help you know which physical sign captured each lead.</p>

                  {error && <p style={{ color: '#F87171', fontSize: 13, margin: '12px 0 0' }}>{error}</p>}

                  <button onClick={handleGenerateQR} disabled={generatingQR || !qrLabel.trim()} style={{ ...primaryBtn, marginTop: 22, opacity: (!qrLabel.trim() || generatingQR) ? 0.5 : 1 }}>
                    {generatingQR ? 'Generating…' : 'Generate QR Code →'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* ─── STEP 4 — Download, print or assign ─── */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ background: `${C.purple}14`, border: `1px solid ${C.purple}35`, borderRadius: 12, padding: '14px 18px', width: '100%', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `${C.purple}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.purpleL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Your QR code is ready!</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{qrLabel || 'Your sign'} · {propertyAddress}</div>
                </div>
              </div>

              {/* Branded QR card */}
              <div style={{ background: '#fff', borderRadius: 18, padding: '20px 16px 16px', width: 260, textAlign: 'center', boxShadow: `0 0 60px ${C.purple}35` }}>
                <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 14 }}>Scan to view this home</div>
                {origin && propertyId && <QRCodeSVG id="wizard-qr-svg" value={buyerUrl} size={212} />}
                <div style={{ marginTop: 14 }}>
                  <span style={{ fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif", fontSize: '10px', letterSpacing: '-0.3px', lineHeight: 1 }}>
                    <span style={{ fontWeight: 300, color: '#9CA3AF' }}>Powered by the</span>
                    <span style={{ fontWeight: 700, color: '#8B8AC4' }}>qr</span>
                    <span style={{ fontWeight: 500, color: '#9CA3AF' }}>ealtor</span>
                  </span>
                </div>
              </div>

              <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', margin: '20px 0 0', lineHeight: 1.6 }}>
                Print it and place it on your yard sign. Every scan is tracked. You get the buyer&apos;s details when they request info or a showing.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 22 }}>
                <button onClick={downloadQR} style={primaryBtn}>↓ Download QR Code (PNG)</button>
                <button onClick={handleFinish} disabled={finishing} style={{ ...secondaryBtn, opacity: finishing ? 0.6 : 1 }}>
                  {finishing ? 'Finishing…' : 'Finish →'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
