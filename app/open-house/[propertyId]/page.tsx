'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createBrowserSupabase } from '../../../lib/supabase-browser'

// Set to true in a future SMS v2 release to show the consent checkbox to buyers
const SMS_FOLLOWUP_ENABLED = false

const C = {
  bg:     '#0F0F13',
  card:   '#17131F',
  card2:  '#1E1630',
  border: '#2A1F3D',
  amber:  '#D97706',
  amberL: '#F59E0B',
  text:   '#F8FAFC',
  muted:  '#9CA3AF',
  soft:   '#D8B4FE',
}

const US_PHONE_RE = /^(\+?1[\s.\-]?)?\(?[2-9]\d{2}\)?[\s.\-]?[2-9]\d{2}[\s.\-]?\d{4}$/
const isValidUSPhone = (v: string) => US_PHONE_RE.test(v.trim())
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim())

function formatPrice(price: unknown) {
  if (!price) return null
  const v = Number(price)
  return Number.isNaN(v) ? null : `$${v.toLocaleString()}`
}

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#0F0A1A', border: `1px solid #2A1F3D`,
  borderRadius: 10, color: '#F8FAFC', fontSize: 16,
  padding: '13px 14px', outline: 'none', fontFamily: 'sans-serif',
}

export default function OpenHouseCheckInPage() {
  const params = useParams()
  const propertyId = params.propertyId as string

  const [property,   setProperty]   = useState<any>(null)
  const [heroPhoto,  setHeroPhoto]  = useState<string | null>(null)
  const [loading,    setLoading]    = useState(true)

  const [name,              setName]              = useState('')
  const [phone,             setPhone]             = useState('')
  const [email,             setEmail]             = useState('')
  const [workingWithAgent,  setWorkingWithAgent]  = useState<boolean | null>(null)
  const [smsConsent,        setSmsConsent]        = useState(false)
  const [submitting,        setSubmitting]        = useState(false)
  const [submitted,         setSubmitted]         = useState(false)
  const [error,             setError]             = useState('')
  const [phoneErr,          setPhoneErr]          = useState('')
  const [emailErr,          setEmailErr]          = useState('')
  const [website,           setWebsite]           = useState('')   // honeypot — must stay empty

  useEffect(() => {
    if (!propertyId) return
    const load = async () => {
      const sb = createBrowserSupabase()
      const [{ data: prop }, { data: pics }] = await Promise.all([
        sb.from('properties').select('*').eq('id', propertyId).single(),
        sb.from('property_photos')
          .select('url')
          .eq('property_id', propertyId)
          .order('sort_order', { ascending: true })
          .limit(1),
      ])
      setProperty(prop)
      setHeroPhoto(pics && pics.length > 0 ? pics[0].url : null)
      setLoading(false)
    }
    load()
  }, [propertyId])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    // Honeypot — bots fill the hidden "website" field. Silently drop the
    // submission and show the success state as if it had gone through.
    if (website.trim()) { setSubmitted(true); return }
    if (!name.trim()) { setError('Please enter your name.'); return }
    if (!phone.trim()) { setError('Please enter your phone number.'); return }
    if (!isValidUSPhone(phone)) { setPhoneErr('Please enter a valid phone number'); return }
    if (email.trim() && !isValidEmail(email)) { setEmailErr('Please enter a valid email address'); return }
    if (workingWithAgent === null) { setError("Please indicate whether you're working with a buyer's agent."); return }

    setSubmitting(true)
    setError('')
    setPhoneErr('')
    setEmailErr('')

    try {
      const res = await fetch('/api/open-house-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          name:               name.trim(),
          phone:              phone.trim(),
          email:              email.trim() || undefined,
          working_with_agent: workingWithAgent,
          sms_consent:        smsConsent,
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

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: `2px solid ${C.amber}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!property) return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      Property not found
    </div>
  )

  const price = formatPrice(property.price)
  const beds  = property.beds  ? `${property.beds} bed${property.beds  !== 1 ? 's' : ''}` : null
  const baths = property.baths ? `${property.baths} bath${property.baths !== 1 ? 's' : ''}` : null

  return (
    <main style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'sans-serif' }}>
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .oh-field:focus { border-color: ${C.amber} !important; box-shadow: 0 0 0 3px rgba(217,119,6,0.2); }
      `}</style>

      <div style={{ maxWidth: 540, margin: '0 auto' }}>

        {/* Hero */}
        {heroPhoto ? (
          <div style={{ height: 240, overflow: 'hidden' }}>
            <img
              src={heroPhoto}
              alt={property.address}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
        ) : (
          <div style={{ height: 120, background: C.card, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>
            🏠
          </div>
        )}

        {/* Property info */}
        <div style={{ padding: '22px 20px 0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.amberL, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>
            Open House
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 14px', lineHeight: 1.2, color: C.text }}>
            Welcome to {property.address}
          </h1>
          {(price || beds || baths) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              {price && (
                <span style={{ background: C.card2, border: `1px solid ${C.amber}35`, color: C.amberL, borderRadius: 8, padding: '6px 13px', fontSize: 14, fontWeight: 700 }}>
                  {price}
                </span>
              )}
              {beds && (
                <span style={{ background: C.card2, border: `1px solid ${C.border}`, color: C.soft, borderRadius: 8, padding: '6px 13px', fontSize: 13, fontWeight: 700 }}>
                  {beds}
                </span>
              )}
              {baths && (
                <span style={{ background: C.card2, border: `1px solid ${C.border}`, color: C.soft, borderRadius: 8, padding: '6px 13px', fontSize: 13, fontWeight: 700 }}>
                  {baths}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Form / Confirmation */}
        <div style={{ padding: '0 20px 20px' }}>
          {submitted ? (
            <div style={{ animation: 'fadeIn 0.25s ease', background: `${C.amber}12`, border: `1px solid ${C.amber}40`, borderRadius: 16, padding: '32px 24px', textAlign: 'center', marginTop: 8 }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 12, lineHeight: 1.3 }}>
                Thanks for visiting!
              </div>
              <p style={{ fontSize: 15, color: C.soft, margin: 0, lineHeight: 1.65 }}>
                Thanks for visiting {property.address}! Your agent has your info and will follow up if anything changes on this property.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {/* Honeypot — hidden from humans; bots that fill it are silently dropped */}
              <input
                type="text" name="website" tabIndex={-1} autoComplete="off"
                value={website} onChange={e => setWebsite(e.target.value)}
                aria-hidden="true" style={{ display: 'none' }}
              />
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 18, marginTop: 4 }}>
                Sign in to check in
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Name */}
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Full Name <span style={{ color: '#EF4444' }}>*</span>
                  </span>
                  <input
                    className="oh-field"
                    type="text" required placeholder="Your name"
                    value={name} onChange={e => setName(e.target.value)}
                    style={inp}
                  />
                </label>

                {/* Phone */}
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Phone <span style={{ color: '#EF4444' }}>*</span>
                  </span>
                  <input
                    className="oh-field"
                    type="tel" inputMode="tel" required placeholder="Your phone number"
                    value={phone}
                    onChange={e => { setPhone(e.target.value); if (phoneErr) setPhoneErr('') }}
                    onBlur={e => setPhoneErr(e.target.value.trim() && !isValidUSPhone(e.target.value) ? 'Please enter a valid phone number' : '')}
                    style={{ ...inp, borderColor: phoneErr ? '#EF4444' : '#2A1F3D' }}
                  />
                  {phoneErr ? (
                    <span style={{ color: '#FCA5A5', fontSize: 12 }}>{phoneErr}</span>
                  ) : (
                    <span style={{ fontSize: 12, color: C.muted }}>So your agent can follow up about this home.</span>
                  )}
                </label>

                {/* Email (optional) */}
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Email <span style={{ opacity: 0.5 }}>(optional)</span>
                  </span>
                  <input
                    className="oh-field"
                    type="email" inputMode="email" placeholder="you@example.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); if (emailErr) setEmailErr('') }}
                    onBlur={e => setEmailErr(e.target.value.trim() && !isValidEmail(e.target.value) ? 'Please enter a valid email address' : '')}
                    style={{ ...inp, borderColor: emailErr ? '#EF4444' : '#2A1F3D' }}
                  />
                  {emailErr && <span style={{ color: '#FCA5A5', fontSize: 12 }}>{emailErr}</span>}
                </label>

                {/* Working with agent toggle */}
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 10 }}>
                    Are you working with a buyer&apos;s agent? <span style={{ color: '#EF4444' }}>*</span>
                  </span>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {(['Yes', 'No'] as const).map(opt => {
                      const isYes = opt === 'Yes'
                      const sel = workingWithAgent === isYes
                      return (
                        <button
                          key={opt} type="button"
                          onClick={() => setWorkingWithAgent(isYes)}
                          style={{
                            flex: 1, padding: '12px', borderRadius: 10, fontSize: 15, fontWeight: 700,
                            border: `2px solid ${sel ? C.amber : C.border}`,
                            background: sel ? `${C.amber}18` : 'transparent',
                            color: sel ? C.amberL : C.muted,
                            cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'sans-serif',
                          }}
                        >
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                  {workingWithAgent === true && (
                    <div style={{ marginTop: 10, padding: '10px 13px', background: '#1A1200', border: `1px solid ${C.amber}35`, borderRadius: 8, fontSize: 13, color: '#FCD34D', lineHeight: 1.5 }}>
                      Please have your agent reach out to the listing agent directly.
                    </div>
                  )}
                </div>

                {/* SMS consent — hidden until SMS_FOLLOWUP_ENABLED = true */}
                {SMS_FOLLOWUP_ENABLED && (
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={smsConsent}
                      onChange={e => setSmsConsent(e.target.checked)}
                      style={{ marginTop: 2, width: 16, height: 16, accentColor: C.amber, cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                      I agree to receive text message follow-ups about this property. Reply STOP to opt out.
                    </span>
                  </label>
                )}

                {error && <p style={{ color: '#FCA5A5', fontSize: 13, margin: 0 }}>{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    background: C.amber, color: '#fff', border: 'none',
                    borderRadius: 12, padding: '15px 18px', fontSize: 16, fontWeight: 900,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.7 : 1, fontFamily: 'sans-serif', marginTop: 4,
                  }}
                >
                  {submitting ? 'Checking in…' : 'Check In'}
                </button>

                {/* Privacy notice */}
                <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', margin: 0, lineHeight: 1.55 }}>
                  Your information is shared only with the listing agent.{' '}
                  <a href="/privacy" style={{ color: C.muted, textDecoration: 'underline' }}>See our Privacy Policy.</a>
                </p>
              </div>
            </form>
          )}
        </div>

        {/* Footer — non-removable */}
        <div style={{ textAlign: 'center', padding: '0 20px 32px', fontSize: 11, color: '#4B5563' }}>
          Powered by theQRealtor
        </div>
      </div>
    </main>
  )
}
