'use client'

import { FormEvent, useEffect, useState } from 'react'
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

  useEffect(() => {
    const loadProperty = async () => {
      const supabase = createBrowserSupabase()
      const [{ data, error }, { data: photoData }] = await Promise.all([
        supabase.from('properties').select('*').eq('id', propertyId).single(),
        supabase.from('property_photos').select('*').eq('property_id', propertyId).order('order', { ascending: true }),
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

  const previewPhotos = photos.slice(0, Math.min(3, photos.length))
  const lockedPhotos = photos.slice(previewPhotos.length, previewPhotos.length + 3)
  const price = formatPrice(property.price)
  const beds = statLabel(property.beds, 'bed', 'beds')
  const baths = statLabel(property.baths, 'bath', 'baths')
  const location = [property.city, property.state].filter(Boolean).join(', ')

  return (
    <main style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'sans-serif' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .buyer-shell { max-width: 1120px; margin: 0 auto; padding: 24px; }
        .hero-grid { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(260px, 0.85fr); gap: 10px; min-height: 420px; }
        .hero-stack { display: grid; gap: 10px; }
        .field:focus { border-color: ${C.purple}; box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.2); }
        @media (max-width: 780px) {
          .buyer-shell { padding: 14px; }
          .hero-grid { grid-template-columns: 1fr; min-height: auto; }
          .hero-stack { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .details-grid { grid-template-columns: 1fr !important; }
          .gallery-grid { grid-template-columns: 1fr !important; }
          .motivation-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div className="buyer-shell">
        <section className="hero-grid" aria-label="Property preview photos">
          {previewPhotos.length > 0 ? (
            <>
              <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 8, background: '#18181B', minHeight: 320 }}>
                <img
                  src={previewPhotos[0].url}
                  alt={property.address}
                  style={{ width: '100%', height: '100%', minHeight: 320, objectFit: 'cover', display: 'block' }}
                />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,15,19,0.05) 35%, rgba(15,15,19,0.76))' }} />
              </div>
              <div className="hero-stack">
                {(previewPhotos.length > 1 ? previewPhotos.slice(1) : previewPhotos).map((photo, index) => (
                  <div key={photo.id || photo.url || index} style={{ overflow: 'hidden', borderRadius: 8, background: '#18181B', minHeight: 155 }}>
                    <img src={photo.url} alt="" style={{ width: '100%', height: '100%', minHeight: 155, objectFit: 'cover', display: 'block' }} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ gridColumn: '1 / -1', minHeight: 320, borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}>
              Photos coming soon
            </div>
          )}
        </section>

        <section className="details-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 390px', gap: 28, alignItems: 'start', paddingTop: 30 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 18 }}>
              <div>
                {price && <div style={{ color: C.purple2, fontSize: 30, fontWeight: 900, marginBottom: 8 }}>{price}</div>}
                <h1 style={{ fontSize: 34, lineHeight: 1.08, fontWeight: 900, margin: 0, maxWidth: 720 }}>{property.address}</h1>
                {location && <p style={{ color: C.muted, fontSize: 15, margin: '9px 0 0' }}>{location}</p>}
              </div>
              {property.agent_name && (
                <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 8, padding: '13px 15px', alignSelf: 'flex-start' }}>
                  <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>Listing Agent</div>
                  <div style={{ color: C.text, fontSize: 16, fontWeight: 800 }}>{property.agent_name}</div>
                </div>
              )}
            </div>

            {(beds || baths) && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 26 }}>
                {[beds, baths].filter(Boolean).map(stat => (
                  <span key={stat} style={{ border: `1px solid ${C.border}`, background: '#15111C', color: C.soft, borderRadius: 8, padding: '10px 14px', fontSize: 14, fontWeight: 800 }}>
                    {stat}
                  </span>
                ))}
              </div>
            )}

            {!submitted && (
              <section style={{ position: 'relative', overflow: 'hidden', border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, minHeight: 230 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, padding: 12, filter: 'blur(7px)', transform: 'scale(1.02)', opacity: 0.72 }}>
                  {(lockedPhotos.length ? lockedPhotos : previewPhotos).slice(0, 3).map((photo, index) => (
                    <img key={photo.id || photo.url || index} src={photo.url} alt="" style={{ width: '100%', height: 190, objectFit: 'cover', borderRadius: 6 }} />
                  ))}
                </div>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,15,19,0.35), rgba(15,15,19,0.92))', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
                  <div>
                    <div style={{ color: C.text, fontSize: 22, fontWeight: 900, marginBottom: 8 }}>More photos and full details are locked</div>
                    <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.55, margin: 0 }}>Unlock the full gallery, description, and agent follow-up for this listing.</p>
                  </div>
                </div>
              </section>
            )}

            {submitted && (
              <section>
                <div style={{ border: `1px solid rgba(124, 58, 237, 0.45)`, background: 'rgba(124, 58, 237, 0.16)', borderRadius: 8, padding: 18, marginBottom: 24 }}>
                  <h2 style={{ fontSize: 22, margin: '0 0 6px', fontWeight: 900 }}>Thanks, {name.trim()}.</h2>
                  <p style={{ color: C.soft, margin: 0, lineHeight: 1.55 }}>You're all set! 🎉 Details about this property will be sent to you shortly.</p>
                </div>

                {property.description && (
                  <div style={{ marginBottom: 26 }}>
                    <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 10px' }}>Description</h2>
                    <p style={{ color: '#D4D4D8', fontSize: 16, lineHeight: 1.75, margin: 0 }}>{property.description}</p>
                  </div>
                )}

                {photos.length > 0 && (
                  <div>
                    <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 14px' }}>Full Gallery</h2>
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

          {!submitted && (
            <form onSubmit={handleSubmit} style={{ position: 'sticky', top: 18, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24, boxShadow: '0 24px 80px rgba(0,0,0,0.34)' }}>
              <h2 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 8px' }}>Get Instant Access to This Home</h2>
              <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.55, margin: '0 0 14px' }}>🔒 Your information goes directly to the listing agent. No spam. No obligation.</p>
              <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, margin: '0 0 22px', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 6 }}>Already working with a buyer's agent? Please have your agent contact the listing agent directly.</p>

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

                <p style={{ color: C.soft, fontSize: 13, lineHeight: 1.5, margin: 0 }}>📅 Want a private showing? Submit your info and the listing agent will contact you directly.</p>

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
                  {submitting ? 'Loading...' : 'View Price & Photos →'}
                </button>

                <p style={{ color: C.muted, fontSize: 11, lineHeight: 1.55, margin: '14px 0 0', textAlign: 'center' }}>
                  By submitting your information you consent to be contacted by the listing agent regarding this property. If you are currently represented by a buyer's agent, please inform your agent of your interest in this property. Message and data rates may apply.{' '}
                  <a href="/privacy" style={{ color: C.muted, textDecoration: 'underline' }}>View our Privacy Policy</a>.
                </p>
              </div>
            </form>
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
