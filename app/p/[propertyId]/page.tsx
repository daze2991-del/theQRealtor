'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createBrowserSupabase } from '../../../lib/supabase-browser'

const C = {
  bg: '#0F0F13',
  panel: '#17131F',
  panel2: '#21182F',
  border: '#332641',
  purple: '#7C3AED',
  purple2: '#A78BFA',
  text: '#F8FAFC',
  muted: '#A1A1AA',
  soft: '#D8B4FE',
}

const MOTIVATION_OPTIONS = [
  { label: 'Just browsing', value: 'cold' },
  { label: 'Looking in 6–12 months', value: 'warm' },
  { label: 'Looking in 1–6 months', value: 'motivated' },
  { label: 'Ready now', value: 'hot' },
]

function formatPrice(price: unknown) {
  if (!price) return null
  const value = Number(price)
  if (Number.isNaN(value)) return null
  return `$${value.toLocaleString()}`
}

function statLabel(value: unknown, singular: string, plural: string) {
  if (!value) return null
  return `${value} ${Number(value) === 1 ? singular : plural}`
}

export default function PropertyPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const propertyId = params.propertyId as string
  const qrId = searchParams.get('qr')

  const [property, setProperty] = useState<any>(null)
  const [photos, setPhotos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [motivationLevel, setMotivationLevel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  // Carousel — all photos free, no gate
  const [slideIndex, setSlideIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    const loadProperty = async () => {
      const supabase = createBrowserSupabase()
      const [{ data, error }, { data: photoData }] = await Promise.all([
        supabase.from('properties').select('*').eq('id', propertyId).single(),
        supabase.from('property_photos').select('*').eq('property_id', propertyId).order('sort_order', { ascending: true }),
      ])
      if (error) console.error(error)
      setProperty(data)
      setPhotos(photoData || [])
      setLoading(false)
    }
    if (propertyId) loadProperty()
  }, [propertyId])

  useEffect(() => {
    const trackScan = async () => {
      if (!qrId) return
      const supabase = createBrowserSupabase()
      await supabase.from('scan_events').insert([{ qr_id: qrId, property_id: propertyId }])
    }
    if (propertyId) trackScan()
  }, [propertyId, qrId])

  const goNext = () => { if (slideIndex < photos.length - 1) setSlideIndex(slideIndex + 1) }
  const goPrev = () => { if (slideIndex > 0) setSlideIndex(slideIndex - 1) }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const delta = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(delta) > 40) { if (delta > 0) goNext(); else goPrev() }
    touchStartX.current = null
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim() || !phone.trim() || !email.trim() || !motivationLevel) {
      setError('Please fill in your name, phone number, email, and buying timeline.')
      return
    }
    if (!email.includes('@') || !email.includes('.')) {
      setError('Please enter a valid email address.')
      return
    }
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/submit-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          qrId: qrId || null,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          motivation: motivationLevel,
        }),
      })

      if (res.status === 429) {
        setError('Too many submissions. Please wait a minute and try again.')
        setSubmitting(false)
        return
      }
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}))
        setError(msg || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: `2px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!property) {
    return <div style={{ minHeight: '100vh', padding: 40, color: C.text, background: C.bg, fontFamily: 'sans-serif' }}>Property not found</div>
  }

  const currentPhoto = photos[slideIndex] ?? null
  const price = formatPrice(property.price)
  const beds = statLabel(property.beds, 'bed', 'beds')
  const baths = statLabel(property.baths, 'bath', 'baths')
  const location = [property.city, property.state].filter(Boolean).join(', ')
  const agentName = property.agent_name || 'the listing agent'
  const agentPhone = property.agent_phone || null
  const showDots = photos.length > 1 && photos.length <= 14

  return (
    <main style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'sans-serif' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes carouselFade { from { opacity: 0; transform: scale(1.015); } to { opacity: 1; transform: scale(1); } }
        @keyframes unlockPop { 0% { transform: scale(0.95); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        .carousel-img { animation: carouselFade 0.22s ease; }
        .buyer-shell { max-width: 1120px; margin: 0 auto; padding: 24px; }
        .photo-carousel { height: 480px; }
        .field:focus { border-color: ${C.purple}; box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.2); }
        @media (max-width: 780px) {
          .buyer-shell { padding: 14px; }
          .photo-carousel { height: 260px; }
          .details-grid { grid-template-columns: 1fr !important; }
          .motivation-grid { grid-template-columns: 1fr !important; }
          .carousel-arrow { display: none !important; }
        }
      `}</style>

      <div className="buyer-shell">

        {/* ── Carousel — all photos free ── */}
        {photos.length > 0 ? (
          <section
            className="photo-carousel"
            style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#18181B', userSelect: 'none', cursor: 'grab' }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {currentPhoto && (
              <img
                key={slideIndex}
                className="carousel-img"
                src={currentPhoto.url}
                alt={`${property.address} — photo ${slideIndex + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            )}

            {/* Counter */}
            {photos.length > 1 && (
              <div style={{ position: 'absolute', top: 12, right: 14, background: 'rgba(0,0,0,0.52)', color: '#fff', fontSize: 12, fontWeight: 700, borderRadius: 20, padding: '4px 10px', backdropFilter: 'blur(4px)', letterSpacing: '0.03em' }}>
                {slideIndex + 1} / {photos.length}
              </div>
            )}

            {/* Left arrow */}
            {slideIndex > 0 && (
              <button className="carousel-arrow" onClick={goPrev} aria-label="Previous photo"
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.48)', color: '#fff', border: 'none', borderRadius: '50%', width: 40, height: 40, fontSize: 22, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                ‹
              </button>
            )}

            {/* Right arrow */}
            {slideIndex < photos.length - 1 && (
              <button className="carousel-arrow" onClick={goNext} aria-label="Next photo"
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.48)', color: '#fff', border: 'none', borderRadius: '50%', width: 40, height: 40, fontSize: 22, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                ›
              </button>
            )}

            {/* Dots */}
            {showDots && (
              <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5, pointerEvents: 'none' }}>
                {photos.map((_, i) => (
                  <div key={i} style={{ width: i === slideIndex ? 20 : 7, height: 7, borderRadius: 4, background: i === slideIndex ? '#fff' : 'rgba(255,255,255,0.45)', transition: 'all 0.2s', flexShrink: 0 }} />
                ))}
              </div>
            )}
          </section>
        ) : (
          <div style={{ height: 280, borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}>
            Photos coming soon
          </div>
        )}

        {/* ── Details + form ── */}
        <section className="details-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 390px', gap: 28, alignItems: 'start', paddingTop: 30 }}>
          <div>
            {/* Price / address / location */}
            <div style={{ marginBottom: 18 }}>
              {price && <div style={{ color: C.purple2, fontSize: 30, fontWeight: 900, marginBottom: 8 }}>{price}</div>}
              <h1 style={{ fontSize: 34, lineHeight: 1.08, fontWeight: 900, margin: 0, maxWidth: 720 }}>{property.address}</h1>
              {location && <p style={{ color: C.muted, fontSize: 15, margin: '9px 0 0' }}>{location}</p>}
            </div>

            {/* Beds / baths */}
            {(beds || baths) && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 26 }}>
                {[beds, baths].filter(Boolean).map(stat => (
                  <span key={stat} style={{ border: `1px solid ${C.border}`, background: '#15111C', color: C.soft, borderRadius: 8, padding: '10px 14px', fontSize: 14, fontWeight: 800 }}>
                    {stat}
                  </span>
                ))}
              </div>
            )}

            {/* Description */}
            {property.description && (
              <p style={{ color: '#D4D4D8', fontSize: 16, lineHeight: 1.75, margin: '0 0 28px' }}>{property.description}</p>
            )}

            {/* ── Agent contact card ── */}
            {!submitted ? (
              /* Locked — shows agent name, blurred phone, CTA */
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', background: C.panel }}>
                {/* Card header */}
                <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, background: 'rgba(124,58,237,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.purple2, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Listing Agent</span>
                </div>

                <div style={{ padding: '18px 18px 20px' }}>
                  {/* Agent identity */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: `${C.purple}28`, border: `2px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                      👤
                    </div>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{agentName !== 'the listing agent' ? agentName : 'Listing Agent'}</div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Licensed Real Estate Agent</div>
                    </div>
                  </div>

                  {/* Masked phone */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 9, marginBottom: 16 }}>
                    <span style={{ fontSize: 16 }}>📞</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: C.muted, letterSpacing: '0.2em', filter: 'blur(5px)', userSelect: 'none', flex: 1 }}>
                      ●●● ●●● ●●●●
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: `${C.purple}22`, border: `1px solid ${C.purple}40`, borderRadius: 6, padding: '3px 8px', flexShrink: 0 }}>
                      <span style={{ fontSize: 11 }}>🔒</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.purple2 }}>Locked</span>
                    </div>
                  </div>

                  {/* Request showing — disabled */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'rgba(255,255,255,0.02)', border: `1px dashed ${C.border}`, borderRadius: 9, marginBottom: 18, opacity: 0.55 }}>
                    <span style={{ fontSize: 16 }}>📅</span>
                    <span style={{ fontSize: 13, color: C.muted }}>Request a Showing</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11 }}>🔒</span>
                  </div>

                  <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.55, margin: '0 0 16px' }}>
                    Get {agentName !== 'the listing agent' ? `${agentName}'s` : "the agent's"} direct number. No Zillow middleman — you connect straight to the listing agent.
                  </p>

                  <button
                    type="button"
                    onClick={() => document.getElementById('lead-form')?.scrollIntoView({ behavior: 'smooth' })}
                    style={{ width: '100%', background: C.purple, color: '#fff', border: 'none', borderRadius: 9, padding: '13px 18px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'sans-serif' }}
                  >
                    Get Direct Number 📞
                  </button>
                </div>
              </div>
            ) : (
              /* Unlocked — phone revealed, Request Showing active */
              <div style={{ border: `1px solid rgba(124,58,237,0.5)`, borderRadius: 14, overflow: 'hidden', background: C.panel, animation: 'unlockPop 0.3s ease' }}>
                <div style={{ padding: '13px 18px', borderBottom: `1px solid rgba(124,58,237,0.2)`, background: 'rgba(124,58,237,0.12)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>✅</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.purple2, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Direct Access Unlocked</span>
                </div>

                <div style={{ padding: '18px 18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: `${C.purple}28`, border: `2px solid ${C.purple}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                      👤
                    </div>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{agentName !== 'the listing agent' ? agentName : 'Listing Agent'}</div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Licensed Real Estate Agent</div>
                    </div>
                  </div>

                  {agentPhone && (
                    <a href={`tel:${agentPhone}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 9, marginBottom: 10, textDecoration: 'none' }}>
                      <span style={{ fontSize: 18 }}>📞</span>
                      <span style={{ fontSize: 16, fontWeight: 800, color: '#4ade80', flex: 1 }}>{agentPhone}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 6, padding: '3px 9px', flexShrink: 0 }}>Call</span>
                    </a>
                  )}

                  {agentPhone && (
                    <a href={`sms:${agentPhone}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: `${C.purple}12`, border: `1px solid ${C.purple}35`, borderRadius: 9, marginBottom: 18, textDecoration: 'none' }}>
                      <span style={{ fontSize: 18 }}>💬</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.purple2, flex: 1 }}>Send a text</span>
                    </a>
                  )}

                  {/* Request a Showing — active */}
                  <a
                    href={agentPhone ? `tel:${agentPhone}` : '#'}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', boxSizing: 'border-box', background: C.purple, color: '#fff', border: 'none', borderRadius: 9, padding: '14px 18px', fontSize: 15, fontWeight: 900, textDecoration: 'none', textAlign: 'center' }}
                  >
                    📅 Request a Showing
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* ── Right column: form or success ── */}
          {!submitted ? (
            <form id="lead-form" onSubmit={handleSubmit} style={{ position: 'sticky', top: 18, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24, boxShadow: '0 24px 80px rgba(0,0,0,0.34)' }}>
              <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 6px', lineHeight: 1.25 }}>
                Get the Agent's Direct Number
              </h2>
              <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.55, margin: '0 0 20px' }}>
                No middleman. No Zillow. Your info goes straight to the listing agent.
              </p>

              <div style={{ display: 'grid', gap: 15 }}>
                <label style={{ display: 'grid', gap: 7, color: C.muted, fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Name
                  <input className="field" type="text" required placeholder="Your full name" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
                </label>

                <label style={{ display: 'grid', gap: 7, color: C.muted, fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Phone
                  <input className="field" type="tel" required placeholder="Your phone number" value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} />
                </label>

                <label style={{ display: 'grid', gap: 7, color: C.muted, fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Email
                  <input className="field" type="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
                </label>

                <div>
                  <div style={{ color: C.muted, fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>When are you looking to buy?</div>
                  <div className="motivation-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {MOTIVATION_OPTIONS.map(opt => (
                      <button key={opt.value} type="button" onClick={() => setMotivationLevel(opt.value)} style={{ background: motivationLevel === opt.value ? C.purple : C.panel2, color: motivationLevel === opt.value ? '#fff' : C.text, border: `1px solid ${motivationLevel === opt.value ? C.purple : C.border}`, borderRadius: 8, padding: '11px 10px', minHeight: 46, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'sans-serif' }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {error && <p style={{ color: '#FCA5A5', fontSize: 14, margin: 0 }}>{error}</p>}

                <button type="submit" disabled={submitting} style={{ background: C.purple, color: '#fff', border: 'none', borderRadius: 8, padding: '14px 18px', fontSize: 16, fontWeight: 900, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1, fontFamily: 'sans-serif' }}>
                  {submitting ? 'Loading...' : 'Get Agent\'s Direct Number 📞'}
                </button>

                <p style={{ color: C.muted, fontSize: 11, lineHeight: 1.55, margin: '10px 0 0', textAlign: 'center' }}>
                  Already working with a buyer's agent? Have your agent contact the listing agent directly. By submitting you consent to be contacted regarding this property.{' '}
                  <a href="/privacy" style={{ color: C.muted, textDecoration: 'underline' }}>Privacy Policy</a>.
                </p>
              </div>
            </form>
          ) : (
            <div style={{ position: 'sticky', top: 18 }}>
              <div style={{ background: 'rgba(124,58,237,0.14)', border: `1px solid rgba(124,58,237,0.4)`, borderRadius: 8, padding: '18px 20px', marginBottom: 16 }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 6 }}>You're in, {name.trim()}! 🎉</div>
                <p style={{ color: C.soft, fontSize: 14, margin: 0, lineHeight: 1.55 }}>
                  {agentName !== 'the listing agent' ? agentName : 'The listing agent'} will reach out to you shortly at {phone.trim()}.
                </p>
              </div>

              {agentPhone && (
                <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
                    Direct Contact
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 16 }}>
                    {agentName !== 'the listing agent' ? agentName : 'Listing Agent'}
                  </div>
                  <a href={`tel:${agentPhone}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#062014', border: '1px solid #166534', borderRadius: 9, padding: '12px 16px', color: '#4ade80', fontSize: 14, fontWeight: 800, textDecoration: 'none', marginBottom: 8 }}>
                    📞 Call {agentPhone}
                  </a>
                  <a href={`sms:${agentPhone}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: `${C.purple}18`, border: `1px solid ${C.purple}40`, borderRadius: 9, padding: '12px 16px', color: C.purple2, fontSize: 14, fontWeight: 800, textDecoration: 'none' }}>
                    💬 Send a Text
                  </a>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

const inputStyle = {
  width: '100%',
  background: '#100D16',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  color: C.text,
  fontSize: 15,
  padding: '12px 13px',
  boxSizing: 'border-box' as const,
  outline: 'none',
  fontFamily: 'sans-serif',
}
