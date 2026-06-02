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

// Photos 0–(FREE_LIMIT-1) are always visible; photo FREE_LIMIT+ require lead submission
const FREE_LIMIT = 4

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

  // Carousel state
  const [slideIndex, setSlideIndex] = useState(0)
  const [showGate, setShowGate] = useState(false)
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

  // After form submit, dismiss gate and advance to first gated photo
  useEffect(() => {
    if (submitted && showGate) {
      setShowGate(false)
      setSlideIndex(FREE_LIMIT)
    }
  }, [submitted])

  const goNext = () => {
    const next = slideIndex + 1
    if (next >= photos.length) return
    if (next >= FREE_LIMIT && !submitted) {
      setShowGate(true)
      return
    }
    setSlideIndex(next)
    setShowGate(false)
  }

  const goPrev = () => {
    if (showGate) {
      setShowGate(false)
      return
    }
    if (slideIndex > 0) setSlideIndex(slideIndex - 1)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const delta = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(delta) > 40) {
      if (delta > 0) goNext()
      else goPrev()
    }
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

  const gatedPhotos = photos.slice(FREE_LIMIT)
  // When gate is showing, display the first gated photo (blurred) as background
  const displayIndex = showGate ? FREE_LIMIT : slideIndex
  const currentPhoto = photos[displayIndex] ?? null
  const price = formatPrice(property.price)
  const beds = statLabel(property.beds, 'bed', 'beds')
  const baths = statLabel(property.baths, 'bath', 'baths')
  const location = [property.city, property.state].filter(Boolean).join(', ')
  const agentLabel = property.agent_name || 'the listing agent'
  const showDots = photos.length > 1 && photos.length <= 14

  return (
    <main style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'sans-serif' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes carouselFade { from { opacity: 0; transform: scale(1.015); } to { opacity: 1; transform: scale(1); } }
        .carousel-img { animation: carouselFade 0.22s ease; }
        .buyer-shell { max-width: 1120px; margin: 0 auto; padding: 24px; }
        .photo-carousel { height: 480px; }
        .field:focus { border-color: ${C.purple}; box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.2); }
        @media (max-width: 780px) {
          .buyer-shell { padding: 14px; }
          .photo-carousel { height: 260px; }
          .details-grid { grid-template-columns: 1fr !important; }
          .gallery-grid { grid-template-columns: 1fr !important; }
          .motivation-grid { grid-template-columns: 1fr !important; }
          .carousel-arrow { display: none !important; }
        }
      `}</style>

      <div className="buyer-shell">

        {/* ── Carousel ── */}
        {photos.length > 0 ? (
          <section
            className="photo-carousel"
            style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#18181B', userSelect: 'none', cursor: 'grab' }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Photo */}
            {currentPhoto && (
              <img
                key={displayIndex}
                className="carousel-img"
                src={currentPhoto.url}
                alt={`${property.address} — photo ${displayIndex + 1}`}
                style={{
                  width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                  ...(showGate ? { filter: 'blur(14px)', transform: 'scale(1.06)', transition: 'filter 0.2s' } : {}),
                }}
              />
            )}

            {/* Gate overlay */}
            {showGate && !submitted && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,5,14,0.72)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px 20px', gap: 12 }}>
                {/* Back button */}
                <button
                  onClick={() => setShowGate(false)}
                  style={{ position: 'absolute', top: 14, left: 14, background: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.75)', border: 'none', borderRadius: 20, padding: '6px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(4px)', fontFamily: 'sans-serif' }}
                >
                  ← Back
                </button>
                <div style={{ fontSize: 34, lineHeight: 1 }}>🔓</div>
                <div style={{ color: C.text, fontSize: 21, fontWeight: 900, lineHeight: 1.3, maxWidth: 300 }}>
                  Unlock all {photos.length} photos + connect with {agentLabel}
                </div>
                <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.55, margin: 0, maxWidth: 270 }}>
                  Fill in your info below to see every photo and get direct access to the listing agent.
                </p>
                <button
                  onClick={() => document.getElementById('lead-form')?.scrollIntoView({ behavior: 'smooth' })}
                  style={{ background: C.purple, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 26px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'sans-serif', marginTop: 4 }}
                >
                  See All {photos.length} Photos →
                </button>
              </div>
            )}

            {/* Counter "2 / 7" */}
            {photos.length > 1 && (
              <div style={{ position: 'absolute', top: 12, right: 14, background: 'rgba(0,0,0,0.52)', color: '#fff', fontSize: 12, fontWeight: 700, borderRadius: 20, padding: '4px 10px', backdropFilter: 'blur(4px)', letterSpacing: '0.03em' }}>
                {displayIndex + 1} / {photos.length}
              </div>
            )}

            {/* Left arrow */}
            {!showGate && slideIndex > 0 && (
              <button
                className="carousel-arrow"
                onClick={goPrev}
                aria-label="Previous photo"
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.48)', color: '#fff', border: 'none', borderRadius: '50%', width: 40, height: 40, fontSize: 22, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
              >
                ‹
              </button>
            )}

            {/* Right arrow */}
            {!showGate && displayIndex < photos.length - 1 && (
              <button
                className="carousel-arrow"
                onClick={goNext}
                aria-label="Next photo"
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.48)', color: '#fff', border: 'none', borderRadius: '50%', width: 40, height: 40, fontSize: 22, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
              >
                ›
              </button>
            )}

            {/* Dot indicators */}
            {showDots && (
              <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5, pointerEvents: 'none' }}>
                {photos.map((_, i) => {
                  const isActive = i === displayIndex
                  const isGated = i >= FREE_LIMIT && !submitted
                  return (
                    <div
                      key={i}
                      style={{
                        width: isActive ? 20 : 7,
                        height: 7,
                        borderRadius: 4,
                        background: isActive
                          ? '#fff'
                          : isGated
                            ? 'rgba(255,255,255,0.2)'
                            : 'rgba(255,255,255,0.5)',
                        transition: 'all 0.2s',
                        flexShrink: 0,
                      }}
                    />
                  )
                })}
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

            {/* Description — always free */}
            {property.description && (
              <p style={{ color: '#D4D4D8', fontSize: 16, lineHeight: 1.75, margin: '0 0 28px' }}>{property.description}</p>
            )}

            {/* Gate CTA — remaining photos + agent access */}
            {!submitted && (
              <section style={{ position: 'relative', overflow: 'hidden', border: `1px solid ${C.border}`, borderRadius: 12, background: C.panel, minHeight: gatedPhotos.length > 0 ? 240 : 150 }}>
                {gatedPhotos.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, padding: 12, filter: 'blur(8px)', transform: 'scale(1.04)', opacity: 0.6 }}>
                    {gatedPhotos.slice(0, 3).map((photo, index) => (
                      <img key={photo.id || photo.url || index} src={photo.url} alt="" style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 6 }} />
                    ))}
                  </div>
                )}
                <div style={{ position: 'absolute', inset: 0, background: gatedPhotos.length > 0 ? 'linear-gradient(180deg, rgba(15,15,19,0.15) 0%, rgba(15,15,19,0.88) 55%)' : undefined, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '28px 24px', gap: 10 }}>
                  <div style={{ fontSize: 26, lineHeight: 1 }}>📸</div>
                  <div style={{ color: C.text, fontSize: 20, fontWeight: 900, lineHeight: 1.3 }}>
                    {gatedPhotos.length > 0
                      ? `See all ${photos.length} photos + connect with ${agentLabel}`
                      : `Connect with ${agentLabel}`}
                  </div>
                  <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.55, margin: 0, maxWidth: 360 }}>
                    {gatedPhotos.length > 0
                      ? `${gatedPhotos.length} more photo${gatedPhotos.length !== 1 ? 's' : ''} available — plus get direct access to the listing agent for showings and pricing.`
                      : 'Get direct access to the listing agent for showings, pricing, and more.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => document.getElementById('lead-form')?.scrollIntoView({ behavior: 'smooth' })}
                    style={{ marginTop: 4, background: C.purple, color: '#fff', border: 'none', borderRadius: 8, padding: '11px 22px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'sans-serif' }}
                  >
                    {gatedPhotos.length > 0 ? `See All ${photos.length} Photos →` : 'Contact the Agent →'}
                  </button>
                </div>
              </section>
            )}

            {/* Post-submit: thank you + full gallery */}
            {submitted && (
              <section>
                <div style={{ border: `1px solid rgba(124, 58, 237, 0.45)`, background: 'rgba(124, 58, 237, 0.16)', borderRadius: 8, padding: 18, marginBottom: 24 }}>
                  <h2 style={{ fontSize: 22, margin: '0 0 6px', fontWeight: 900 }}>Thanks, {name.trim()}!</h2>
                  <p style={{ color: C.soft, margin: 0, lineHeight: 1.55 }}>
                    {property.agent_name ? `${property.agent_name} will` : 'The listing agent will'} be in touch with you shortly. 🎉
                  </p>
                </div>

                {gatedPhotos.length > 0 && (
                  <div>
                    <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 14px' }}>All Photos</h2>
                    <div className="gallery-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                      {photos.map((photo, index) => (
                        <img
                          key={photo.id || photo.url || index}
                          src={photo.url}
                          alt={`${property.address} photo ${index + 1}`}
                          style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Right column */}
          {!submitted ? (
            <form id="lead-form" onSubmit={handleSubmit} style={{ position: 'sticky', top: 18, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24, boxShadow: '0 24px 80px rgba(0,0,0,0.34)' }}>
              <h2 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 6px' }}>
                {gatedPhotos.length > 0 ? `See All ${photos.length} Photos & Contact the Agent` : 'Contact the Listing Agent'}
              </h2>
              <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.55, margin: '0 0 20px' }}>Your info goes directly to the listing agent — no spam, no obligation.</p>

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
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setMotivationLevel(opt.value)}
                        style={{
                          background: motivationLevel === opt.value ? C.purple : C.panel2,
                          color: motivationLevel === opt.value ? '#fff' : C.text,
                          border: `1px solid ${motivationLevel === opt.value ? C.purple : C.border}`,
                          borderRadius: 8,
                          padding: '11px 10px',
                          minHeight: 46,
                          fontSize: 13,
                          fontWeight: 800,
                          cursor: 'pointer',
                          fontFamily: 'sans-serif',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {error && <p style={{ color: '#FCA5A5', fontSize: 14, margin: 0 }}>{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    background: C.purple,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '14px 18px',
                    fontSize: 16,
                    fontWeight: 900,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                    fontFamily: 'sans-serif',
                  }}
                >
                  {submitting ? 'Loading...' : gatedPhotos.length > 0 ? 'See All Photos & Contact Agent →' : 'Contact the Agent →'}
                </button>

                <p style={{ color: C.muted, fontSize: 11, lineHeight: 1.55, margin: '10px 0 0', textAlign: 'center' }}>
                  Already working with a buyer's agent? Have your agent contact the listing agent directly. By submitting you consent to be contacted regarding this property. Message and data rates may apply.{' '}
                  <a href="/privacy" style={{ color: C.muted, textDecoration: 'underline' }}>Privacy Policy</a>.
                </p>
              </div>
            </form>
          ) : property.agent_name ? (
            <div style={{ position: 'sticky', top: 18 }}>
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24 }}>
                <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Listing Agent</div>
                <div style={{ color: C.text, fontSize: 20, fontWeight: 900, marginBottom: 16 }}>{property.agent_name}</div>
                <div style={{ background: 'rgba(124,58,237,0.12)', border: `1px solid rgba(124,58,237,0.3)`, borderRadius: 8, padding: '12px 14px', fontSize: 13, color: C.soft, lineHeight: 1.55 }}>
                  📅 Your request has been sent. {property.agent_name} will reach out to schedule a showing.
                </div>
              </div>
            </div>
          ) : null}
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
