'use client'
// .
import { FormEvent, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createBrowserSupabase } from '../../../lib/supabase-browser'

const C = {
  bg:     '#0F0F13',
  card:   '#17131F',
  card2:  '#1E1630',
  border: '#2A1F3D',
  purple: '#7C3AED',
  purpleL:'#A78BFA',
  text:   '#F8FAFC',
  muted:  '#9CA3AF',
  soft:   '#D8B4FE',
}

// ── CTA config ────────────────────────────────────────────────────────────────
const CTAS = [
  {
    id: 'showing',  icon: '📅',
    label: 'Request a Showing', sub: 'Schedule a private tour',
    motivation: 'hot',  btnLabel: 'Request Showing',
    needsPhone: true,
    color: '#FFFFFF', colorBg: '#7C3AED',
  },
  {
    id: 'question', icon: '💬',
    label: 'Ask a Question',    sub: 'Ask a question or request info',
    motivation: 'warm', btnLabel: 'Send Message',
    needsPhone: true,
    color: '#8B5CF6', colorBg: '#1A1A2E',
  },
] as const

type CtaId = typeof CTAS[number]['id']

function formatPrice(price: unknown) {
  if (!price) return null
  const v = Number(price)
  return Number.isNaN(v) ? null : `$${v.toLocaleString()}`
}

function statLabel(value: unknown, s: string, p: string) {
  if (!value) return null
  return `${value} ${Number(value) === 1 ? s : p}`
}

// ── Input style ───────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#0F0A1A', border: `1px solid ${C.border}`,
  borderRadius: 10, color: C.text, fontSize: 16,
  padding: '13px 14px', outline: 'none', fontFamily: 'sans-serif',
}

// ── Format validation ─────────────────────────────────────────────────────────
// US phone: optional +1, then a valid NANP 10-digit number (area/exchange 2-9).
const US_PHONE_RE = /^(\+?1[\s.\-]?)?\(?[2-9]\d{2}\)?[\s.\-]?[2-9]\d{2}[\s.\-]?\d{4}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isValidUSPhone = (v: string) => US_PHONE_RE.test(v.trim())
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim())

export default function PropertyPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  // The URL id is either a property id (legacy QR codes / shared links) or a
  // sign id (reusable-sign QR codes going forward). Both are UUIDs, so the id
  // is resolved server-side first — signs and sign_assignments are owner-only
  // under RLS and unreadable from the anon client.
  const urlId = params.propertyId as string
  const qrId = searchParams.get('qr')

  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [signId, setSignId]         = useState<string | null>(null)
  const [signUnassigned, setSignUnassigned] = useState(false)

  const [property,  setProperty]  = useState<any>(null)
  const [photos,    setPhotos]    = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)

  // Carousel
  const [slide,     setSlide]     = useState(0)
  const touchX      = useRef<number | null>(null)
  const visitedMax  = useRef(0)
  const pageStart   = useRef(Date.now())

  // Engagement tracking
  const scanEventId    = useRef<string | null>(null)
  const visitCount     = useRef(1)   // 1 = first visit, incremented each return
  const daysSinceFirst = useRef(0)
  const ctaClickedRef  = useRef<string | null>(null)

  // Form
  const [intent,      setIntent]      = useState<CtaId | null>(null)
  const [name,        setName]        = useState('')
  const [phone,       setPhone]       = useState('')
  const [email,       setEmail]       = useState('')
  const [question,    setQuestion]    = useState('')
  const [contactPref, setContactPref] = useState<string[]>(['Text', 'Email'])
  const [submitting,  setSubmitting]  = useState(false)
  const [submitted,   setSubmitted]   = useState(false)
  const [error,       setError]       = useState('')
  const [phoneErr,    setPhoneErr]    = useState('')
  const [emailErr,    setEmailErr]    = useState('')
  const [website,     setWebsite]     = useState('')   // honeypot — must stay empty

  // Packet form
  const [packetOpen,       setPacketOpen]       = useState(false)
  const [packetEmail,      setPacketEmail]      = useState('')
  const [packetName,       setPacketName]       = useState('')
  const [packetSubmitting, setPacketSubmitting] = useState(false)
  const [packetSubmitted,  setPacketSubmitted]  = useState(false)
  const [packetError,      setPacketError]      = useState('')

  // Resolve the URL id: sign with an active assignment → its property; sign
  // without one → branded "not assigned" state; anything else → treat the id
  // as a property id (existing behavior, unchanged).
  useEffect(() => {
    if (!urlId) return
    let cancelled = false
    const resolve = async () => {
      try {
        const res = await fetch('/api/signs/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: urlId }),
        })
        if (res.ok) {
          const data = await res.json() as { sign: boolean; propertyId?: string | null }
          if (cancelled) return
          if (data.sign) {
            if (data.propertyId) {
              setSignId(urlId)
              setPropertyId(data.propertyId)
            } else {
              setSignUnassigned(true)
              setLoading(false)
            }
            return
          }
        }
      } catch { /* resolution unavailable — fall through to property routing */ }
      if (!cancelled) setPropertyId(urlId)
    }
    resolve()
    return () => { cancelled = true }
  }, [urlId])

  // Load property
  useEffect(() => {
    if (!propertyId) return
    const load = async () => {
      const sb = createBrowserSupabase()
      const [{ data: prop }, { data: pics }] = await Promise.all([
        sb.from('properties').select('*').eq('id', propertyId).single(),
        sb.from('property_photos').select('*').eq('property_id', propertyId).order('sort_order', { ascending: true }),
      ])
      setProperty(prop)
      setPhotos(pics || [])
      setLoading(false)
    }
    load()
  }, [propertyId])

  // Return-visit detection + scan_event creation
  useEffect(() => {
    if (!propertyId) return

    // Visit-count tracking via localStorage: { firstVisit: ms, count: N }
    const key    = `rv_${propertyId}`
    const stored = localStorage.getItem(key)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { firstVisit: number; count: number }
        daysSinceFirst.current = Math.floor((Date.now() - parsed.firstVisit) / 86_400_000)
        visitCount.current     = parsed.count + 1
        localStorage.setItem(key, JSON.stringify({ firstVisit: parsed.firstVisit, count: parsed.count + 1 }))
      } catch {
        // Legacy format was a bare timestamp string — migrate it
        const firstVisit = Number(stored)
        daysSinceFirst.current = Math.floor((Date.now() - firstVisit) / 86_400_000)
        visitCount.current     = 2
        localStorage.setItem(key, JSON.stringify({ firstVisit, count: 2 }))
      }
    } else {
      localStorage.setItem(key, JSON.stringify({ firstVisit: Date.now(), count: 1 }))
    }

    // Create a scan_event for every page visit; only include qr_id when
    // QR-originated. Sign-routed visits stamp BOTH sign_id and property_id on
    // insert — property_id is a write-once snapshot and is never updated after.
    const scanRow: Record<string, unknown> = {
      property_id:            propertyId,
      return_visit:           visitCount.current > 1,
      days_since_first_visit: daysSinceFirst.current,
    }
    if (qrId) scanRow.qr_id = qrId
    if (signId) scanRow.sign_id = signId
    createBrowserSupabase()
      .from('scan_events')
      .insert([scanRow])
      .select('id')
      .single()
      .then(({ data }) => { if (data?.id) scanEventId.current = data.id })
  }, [propertyId, qrId, signId])

  // Flush engagement data on page-unload (non-converting visits)
  useEffect(() => {
    const onUnload = () => {
      if (!scanEventId.current) return
      const payload = JSON.stringify({
        scanEventId:  scanEventId.current,
        timeOnPageSec: Math.round((Date.now() - pageStart.current) / 1000),
        photosViewed:  visitedMax.current + 1,
        ctaClicked:    ctaClickedRef.current,
        converted:     false,
      })
      navigator.sendBeacon('/api/update-engagement', new Blob([payload], { type: 'application/json' }))
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  // Track furthest photo seen
  useEffect(() => {
    visitedMax.current = Math.max(visitedMax.current, slide)
  }, [slide])

  // Carousel nav
  const goNext = () => setSlide(s => Math.min(s + 1, photos.length - 1))
  const goPrev = () => setSlide(s => Math.max(s - 1, 0))

  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX }
  const onTouchEnd   = (e: React.TouchEvent) => {
    if (touchX.current === null) return
    const d = touchX.current - e.changedTouches[0].clientX
    if (Math.abs(d) > 40) { if (d > 0) goNext(); else goPrev() }
    touchX.current = null
  }

  // Submit
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    // Honeypot — bots fill the hidden "website" field. Silently drop the
    // submission and show the success state as if it had gone through.
    if (website.trim()) { setSubmitted(true); return }
    // showing + question: name required, and at least one of phone/email.
    // Message is optional. Format-validate whichever contact fields are filled.
    const hasPhone = !!phone.trim()
    const hasEmail = !!email.trim()

    if (!name.trim()) { setError('Please enter your name.'); return }
    if (!hasPhone && !hasEmail) {
      setError('Provide at least one — the agent will use this to follow up.')
      return
    }
    const pErr = hasPhone && !isValidUSPhone(phone) ? 'Enter a valid US phone number.' : ''
    const eErr = hasEmail && !isValidEmail(email) ? 'Enter a valid email address.' : ''
    setPhoneErr(pErr); setEmailErr(eErr)
    if (pErr || eErr) { setError(''); return }

    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/submit-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          qrId:       qrId || null,
          signId:     signId || null,
          name:              name.trim(),
          phone:             phone.trim() || undefined,
          email:             email.trim() || undefined,
          motivation:        CTAS.find(c => c.id === intent)!.motivation,
          questionText:      question.trim() || undefined,
          contactPreference: contactPref.length > 0 ? contactPref.join(', ') : undefined,
          scanEventId: scanEventId.current,
          engagement: {
            timeOnPageSec:       Math.round((Date.now() - pageStart.current) / 1000),
            photosViewed:        visitedMax.current + 1,
            ctaClicked:          intent,
            visitCount:          visitCount.current,
            daysSinceFirstVisit: daysSinceFirst.current,
          },
        }),
      })
      if (res.status === 429) { setError('Too many submissions. Please wait a minute.'); setSubmitting(false); return }
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}))
        setError(msg || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
    } catch {
      setError('Network error. Please check your connection.')
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setSubmitting(false)
  }

  const closeSheet = () => { setIntent(null); setSubmitted(false); setError(''); setPhoneErr(''); setEmailErr(''); setName(''); setPhone(''); setEmail(''); setQuestion(''); setWebsite(''); setContactPref(['Text', 'Email']) }
  const closePacket = () => { setPacketOpen(false); setPacketSubmitted(false); setPacketError(''); setPacketEmail(''); setPacketName('') }

  const handlePacketSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!packetEmail.trim() || !packetEmail.includes('@')) { setPacketError('Please enter a valid email address.'); return }
    setPacketSubmitting(true)
    setPacketError('')
    try {
      const res = await fetch('/api/request-packet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, email: packetEmail.trim(), name: packetName.trim() || undefined }),
      })
      if (!res.ok) { const { error: msg } = await res.json().catch(() => ({})); setPacketError(msg || 'Something went wrong.'); setPacketSubmitting(false); return }
    } catch { setPacketError('Network error. Please check your connection.'); setPacketSubmitting(false); return }
    setPacketSubmitted(true)
    setPacketSubmitting(false)
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: `2px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  // Sign scanned before the agent assigned it to a listing — a normal state
  // (agents scan-test fresh signs), not an error.
  if (signUnassigned) return (
    <main style={{ minHeight: '100vh', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif" }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{ marginBottom: 28 }}>
          <span style={{ fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif", letterSpacing: '-0.5px' }}>
            <span style={{ fontSize: '18px', fontWeight: 300, color: '#1a1a1a' }}>the</span>
            <span style={{ fontSize: '18px', fontWeight: 700, color: '#534AB7' }}>qr</span>
            <span style={{ fontSize: '18px', fontWeight: 500, color: '#1a1a1a' }}>ealtor</span>
          </span>
        </div>
        <div style={{ background: '#EEEDFE', borderRadius: 20, padding: '44px 28px' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🪧</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: '0 0 10px', lineHeight: 1.3 }}>
            This sign hasn&apos;t been assigned to a listing yet
          </h1>
          <p style={{ fontSize: 14, color: '#4B5563', margin: 0, lineHeight: 1.6 }}>
            Check back soon — once the agent connects this sign to a listing, you&apos;ll see the property here.
          </p>
        </div>
      </div>
    </main>
  )

  if (!property) return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      Property not found
    </div>
  )

  const price    = formatPrice(property.price)
  const beds     = statLabel(property.beds, 'bed', 'beds')
  const baths    = statLabel(property.baths, 'bath', 'baths')
  const location = [property.city, property.state].filter(Boolean).join(', ')
  const mapUrl   = `https://maps.google.com/?q=${encodeURIComponent([property.address, property.city, property.state].filter(Boolean).join(', '))}`
  const agentName  = property.agent_name || null
  const agentPhone = property.agent_phone || null
  const showDots   = photos.length > 1 && photos.length <= 14
  const activeCta  = CTAS.find(c => c.id === intent)


  return (
    <main style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'sans-serif' }}>
      <style>{`
        @keyframes spin     { to { transform: rotate(360deg); } }
        @keyframes fadeIn   { from { opacity: 0; transform: scale(1.01); } to { opacity: 1; transform: scale(1); } }
        @keyframes slideUp  { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes popIn    { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        .photo-img { animation: fadeIn 0.22s ease; }
        .sheet     { animation: slideUp 0.3s cubic-bezier(0.32,0.72,0,1); }
        .field:focus { border-color: ${C.purple} !important; box-shadow: 0 0 0 3px rgba(124,58,237,0.2); }
        .field::placeholder { color: rgba(255,255,255,0.6); }
        .cta-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(0,0,0,0.35); }
        .cta-btn { transition: transform 0.12s, box-shadow 0.12s; }
        @media (min-width: 640px) {
          .buyer-wrap { max-width: 600px; margin: 0 auto; }
          .carousel   { height: 420px !important; }
          .form-sheet-wrap { align-items: center !important; }
          .form-sheet { border-radius: 20px !important; max-width: 480px; }
        }
      `}</style>

      <div className="buyer-wrap">

        {/* ── PHASE 1: Carousel — all photos free ── */}
        {photos.length > 0 ? (
          <div
            className="carousel"
            style={{ position: 'relative', height: 300, background: '#18181B', userSelect: 'none' }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <img
              key={slide}
              className="photo-img"
              src={photos[slide].url}
              alt={`${property.address} — photo ${slide + 1}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />

            {/* Counter */}
            {photos.length > 1 && (
              <div style={{ position: 'absolute', top: 12, right: 14, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 12, fontWeight: 700, borderRadius: 20, padding: '4px 10px', backdropFilter: 'blur(4px)' }}>
                {slide + 1} / {photos.length}
              </div>
            )}

            {/* Arrows */}
            {slide > 0 && (
              <button onClick={goPrev} aria-label="Previous" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: 38, height: 38, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>‹</button>
            )}
            {slide < photos.length - 1 && (
              <button onClick={goNext} aria-label="Next" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: 38, height: 38, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>›</button>
            )}

            {/* Dots */}
            {showDots && (
              <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5, pointerEvents: 'none' }}>
                {photos.map((_, i) => (
                  <div key={i} style={{ width: i === slide ? 20 : 6, height: 6, borderRadius: 3, background: i === slide ? '#fff' : 'rgba(255,255,255,0.4)', transition: 'all 0.2s', flexShrink: 0 }} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ height: 240, background: C.card, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 14 }}>
            Photos coming soon
          </div>
        )}

        {/* ── Property info ── */}
        <div style={{ padding: '22px 18px 0' }}>
          {price && <div style={{ color: '#ffffff', fontSize: 28, fontWeight: 900, marginBottom: 6, letterSpacing: '-0.02em' }}>{price}</div>}
          {price && <span style={{ display: 'block', width: 48, height: 2, background: '#534AB7', margin: '8px 0' }} />}
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 4px', lineHeight: 1.15, color: C.text }}>{property.address}</h1>
          {location && <p style={{ color: C.muted, fontSize: 14, margin: '0 0 14px' }}>{location}</p>}

          {(beds || baths) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
              {[beds, baths].filter(Boolean).map(stat => (
                <span key={stat} style={{ background: C.card2, border: `1px solid ${C.border}`, color: C.soft, borderRadius: 8, padding: '8px 13px', fontSize: 13, fontWeight: 700 }}>
                  {stat}
                </span>
              ))}
            </div>
          )}

          {/* Directions — secondary/outline button (opens native maps on mobile, Google Maps on desktop) */}
          {property.address && (
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="cta-btn"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'transparent', border: `1px solid ${C.purple}`,
                color: C.purpleL, borderRadius: 12, padding: '11px 18px',
                fontSize: 14, fontWeight: 800, textDecoration: 'none',
                marginBottom: 18,
              }}
            >
              📍 Take Me There →
            </a>
          )}

          {property.description && (
            <p style={{ color: '#D4D4D8', fontSize: 15, lineHeight: 1.75, margin: '0 0 18px' }}>{property.description}</p>
          )}
        </div>

        {/* ── PHASE 2: CTA buttons ── */}
        <div style={{ padding: '0 18px 32px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Connect with the Agent
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {CTAS.map(cta => (
              <button
                key={cta.id}
                className="cta-btn"
                onClick={() => { ctaClickedRef.current = cta.id; setIntent(cta.id); setSubmitted(false); setError(''); setPhoneErr(''); setEmailErr(''); setName(''); setPhone(''); setEmail(''); setQuestion(''); setContactPref(['Text', 'Email']) }}
                style={{
                  background: cta.colorBg, border: `1px solid ${cta.color}40`,
                  borderRadius: 14, padding: '16px 14px',
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'sans-serif',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}
              >
                <span style={{ fontSize: 24, lineHeight: 1 }}>{cta.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: cta.color, lineHeight: 1.2 }}>{cta.label}</span>
                <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.3 }}>{cta.sub}</span>
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, margin: '14px 0 0' }}>
            * By connecting with the listing agent, you confirm you are not currently represented by a buyer&apos;s agent. If you are working with an agent, please have them contact the listing agent directly.
          </p>

          {/* Packet CTA — only when agent has enabled it */}
          {property.packet_enabled && (
            <button
              className="cta-btn"
              onClick={() => { closeSheet(); setPacketOpen(true) }}
              style={{
                marginTop: 10, width: '100%',
                background: '#1A1200', border: '1px solid #92400E40',
                borderRadius: 14, padding: '16px 18px',
                cursor: 'pointer', textAlign: 'left', fontFamily: 'sans-serif',
                display: 'flex', alignItems: 'center', gap: 14,
              }}
            >
              <span style={{ fontSize: 28, lineHeight: 1 }}>📄</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>Get Property Packet</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Flyer, disclosures &amp; floorplans</div>
              </div>
              <span style={{ marginLeft: 'auto', color: '#FCD34D', fontSize: 18 }}>›</span>
            </button>
          )}
        </div>

      </div>

      {/* ── PHASE 3 & 4: Form / Success bottom sheet ── */}
      {intent !== null && (
        <div
          className="form-sheet-wrap"
          onClick={closeSheet}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div
            className="form-sheet sheet"
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', background: '#17131F', borderRadius: '20px 20px 0 0',
              padding: '0 0 env(safe-area-inset-bottom)', maxHeight: '92vh', overflowY: 'auto',
            }}
          >
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: C.border }} />
            </div>

            {!submitted ? (
              /* ── Form ── */
              <form onSubmit={handleSubmit} style={{ padding: '4px 20px 28px' }}>
                {/* Honeypot — hidden from humans; bots that fill it are silently dropped */}
                <input
                  type="text" name="website" tabIndex={-1} autoComplete="off"
                  value={website} onChange={e => setWebsite(e.target.value)}
                  aria-hidden="true" style={{ display: 'none' }}
                />
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: C.text, lineHeight: 1.2 }}>
                      {activeCta?.icon} {activeCta?.label}
                    </div>
                    {agentName && (
                      <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                        with {agentName}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={closeSheet} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: C.muted, borderRadius: '50%', width: 34, height: 34, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Showing notes textarea — Request a Showing CTA only (optional) */}
                  {intent === 'showing' && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notes <span style={{ opacity: 0.6 }}>(optional)</span></span>
                      <div style={{ background: '#534AB7', border: `1px solid ${C.border}`, borderRadius: 10 }}>
                        <textarea
                          className="field"
                          placeholder="e.g. Preferred dates/times, questions for the agent…"
                          value={question}
                          onChange={e => setQuestion(e.target.value)}
                          rows={3}
                          style={{ background: 'transparent', color: '#ffffff', width: '100%', border: 'none', outline: 'none', resize: 'none', padding: '12px', fontSize: 16, fontFamily: 'sans-serif', lineHeight: 1.55 }}
                        />
                      </div>
                    </label>
                  )}

                  {/* Question textarea — Ask a Question CTA only (optional) */}
                  {intent === 'question' && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your Message <span style={{ opacity: 0.6 }}>(optional)</span></span>
                      <div style={{ background: '#0F0A1A', border: `1px solid ${C.border}`, borderRadius: 10 }}>
                        <textarea
                          className="field"
                          placeholder="e.g. When is the next open house? What are the parking options? Is the price negotiable?"
                          value={question}
                          onChange={e => setQuestion(e.target.value)}
                          rows={3}
                          style={{ background: 'transparent', color: '#ffffff', width: '100%', border: 'none', outline: 'none', resize: 'none', padding: '12px', fontSize: 16, fontFamily: 'sans-serif', lineHeight: 1.55 }}
                        />
                      </div>
                    </label>
                  )}

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your Name</span>
                    <input className="field" type="text" required placeholder="Full name" value={name} onChange={e => setName(e.target.value)} style={inp} />
                  </label>

                  {/* Phone OR email — at least one is required */}
                  <div style={{ fontSize: 11, color: C.soft, marginTop: -2 }}>
                    Provide at least one — the agent will use this to follow up.
                  </div>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Phone</span>
                    <input
                      className="field" type="tel" inputMode="tel" placeholder="Your phone number"
                      value={phone}
                      onChange={e => { setPhone(e.target.value); if (phoneErr) setPhoneErr('') }}
                      onBlur={e => setPhoneErr(e.target.value.trim() && !isValidUSPhone(e.target.value) ? 'Enter a valid US phone number.' : '')}
                      style={{ ...inp, borderColor: phoneErr ? '#EF4444' : C.border }}
                    />
                    {phoneErr && <span style={{ color: '#FCA5A5', fontSize: 12 }}>{phoneErr}</span>}
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email</span>
                    <input
                      className="field" type="email" inputMode="email" placeholder="you@example.com"
                      value={email}
                      onChange={e => { setEmail(e.target.value); if (emailErr) setEmailErr('') }}
                      onBlur={e => setEmailErr(e.target.value.trim() && !isValidEmail(e.target.value) ? 'Enter a valid email address.' : '')}
                      style={{ ...inp, borderColor: emailErr ? '#EF4444' : C.border }}
                    />
                    {emailErr && <span style={{ color: '#FCA5A5', fontSize: 12 }}>{emailErr}</span>}
                  </label>

                  {/* Contact preference checkboxes */}
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
                      How may the listing agent contact you?
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {[
                        { value: 'Phone Call', icon: '📞' },
                        { value: 'Text',       icon: '💬' },
                        { value: 'Email',      icon: '✉️' },
                      ].map(({ value, icon }) => {
                        const checked = contactPref.includes(value)
                        return (
                          <label
                            key={value}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 13px', borderRadius: 10, background: checked ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${checked ? C.purple + '70' : C.border}` }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={ev => setContactPref(prev =>
                                ev.target.checked ? [...prev, value] : prev.filter(p => p !== value)
                              )}
                              style={{ width: 16, height: 16, accentColor: C.purple, cursor: 'pointer', flexShrink: 0 }}
                            />
                            <span style={{ fontSize: 14, color: C.text }}>{icon} {value}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  {error && <p style={{ color: '#FCA5A5', fontSize: 13, margin: 0 }}>{error}</p>}

                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      background: activeCta?.color ?? C.purple, color: '#fff', border: 'none',
                      borderRadius: 12, padding: '15px 18px', fontSize: 16, fontWeight: 900,
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      opacity: submitting ? 0.7 : 1, fontFamily: 'sans-serif', marginTop: 4,
                    }}
                  >
                    {submitting ? 'Sending…' : `${activeCta?.btnLabel} →`}
                  </button>

                  {/* Privacy notice */}
                  <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', margin: 0, lineHeight: 1.55 }}>
                    Your information is shared only with the listing agent.{' '}
                    <a href="/privacy" style={{ color: C.muted, textDecoration: 'underline' }}>See our Privacy Policy.</a>
                  </p>

                  {/* Consent line */}
                  <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', margin: 0, lineHeight: 1.55 }}>
                    By submitting, you authorize the listing agent to contact you using the methods you selected. Standard message and data rates may apply.
                  </p>

                  {/* Trust line */}
                  <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', margin: 0, lineHeight: 1.55 }}>
                    Your info goes only to the listing agent for this property — not shared with other agents.
                  </p>
                </div>
              </form>
            ) : (
              /* ── PHASE 4: Success ── */
              <div style={{ padding: '4px 20px 32px', animation: 'popIn 0.25s ease' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                  <button onClick={closeSheet} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: C.muted, borderRadius: '50%', width: 34, height: 34, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>

                {/* Confirmation */}
                <div style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.35)', borderRadius: 14, padding: '18px 18px 16px', marginBottom: 20 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: C.text, marginBottom: 6 }}>
                    {activeCta?.id === 'question' ? 'Message Sent!' : 'Showing Requested!'}
                  </div>
                  <p style={{ fontSize: 14, color: C.soft, margin: 0, lineHeight: 1.55 }}>
                    {agentName ? `${agentName} will` : 'The listing agent will'} be in touch with you shortly.
                  </p>
                </div>

                {/* Agent direct contact — revealed */}
                {agentPhone && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                      Agent's Direct Number
                    </div>
                    <a href={`tel:${agentPhone}`} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(74,222,128,0.09)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 12, padding: '13px 16px', textDecoration: 'none', marginBottom: 8 }}>
                      <span style={{ fontSize: 20 }}>📞</span>
                      <span style={{ fontSize: 17, fontWeight: 800, color: '#4ade80', flex: 1 }}>{agentPhone}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.15)', borderRadius: 6, padding: '3px 9px' }}>Call</span>
                    </a>
                    <a href={`sms:${agentPhone}`} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 12, padding: '13px 16px', textDecoration: 'none' }}>
                      <span style={{ fontSize: 20 }}>💬</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: C.purpleL, flex: 1 }}>Send a Text Message</span>
                    </a>
                  </div>
                )}

                {/* Request Showing CTA (if not already chosen) */}
                {activeCta?.id !== 'showing' && agentPhone && (
                  <a href={`tel:${agentPhone}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: C.purple, color: '#fff', borderRadius: 12, padding: '14px 18px', textDecoration: 'none', fontSize: 15, fontWeight: 900 }}>
                    📅 Request a Showing
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Packet form sheet ── */}
      {packetOpen && (
        <div
          className="form-sheet-wrap"
          onClick={closePacket}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div
            className="form-sheet sheet"
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', background: '#17131F', borderRadius: '20px 20px 0 0', padding: '0 0 env(safe-area-inset-bottom)', maxHeight: '92vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: C.border }} />
            </div>

            {!packetSubmitted ? (
              <form onSubmit={handlePacketSubmit} style={{ padding: '4px 20px 28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: C.text, lineHeight: 1.2 }}>📄 Get Property Packet</div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Flyer, disclosures &amp; floorplans</div>
                  </div>
                  <button type="button" onClick={closePacket} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: C.muted, borderRadius: '50%', width: 34, height: 34, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your Name (optional)</span>
                    <input className="field" type="text" placeholder="Full name" value={packetName} onChange={e => setPacketName(e.target.value)} style={inp} />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email *</span>
                    <input className="field" type="email" required placeholder="you@example.com" value={packetEmail} onChange={e => setPacketEmail(e.target.value)} style={inp} />
                  </label>

                  {packetError && <p style={{ color: '#FCA5A5', fontSize: 13, margin: 0 }}>{packetError}</p>}

                  <button
                    type="submit"
                    disabled={packetSubmitting}
                    style={{ background: '#D97706', color: '#fff', border: 'none', borderRadius: 12, padding: '15px 18px', fontSize: 16, fontWeight: 900, cursor: packetSubmitting ? 'not-allowed' : 'pointer', opacity: packetSubmitting ? 0.7 : 1, fontFamily: 'sans-serif', marginTop: 4 }}
                  >
                    {packetSubmitting ? 'Sending…' : 'Request Packet →'}
                  </button>

                  <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', margin: 0, lineHeight: 1.55 }}>
                    The agent will send the packet directly to your email.
                  </p>
                </div>
              </form>
            ) : (
              <div style={{ padding: '4px 20px 32px', animation: 'popIn 0.25s ease' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                  <button onClick={closePacket} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: C.muted, borderRadius: '50%', width: 34, height: 34, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
                <div style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.35)', borderRadius: 14, padding: '18px 18px 16px' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: C.text, marginBottom: 6 }}>Request Sent!</div>
                  <p style={{ fontSize: 14, color: C.soft, margin: 0, lineHeight: 1.55 }}>
                    Check your email — the agent will send your packet shortly.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
