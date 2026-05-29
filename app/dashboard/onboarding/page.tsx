'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { createBrowserSupabase } from '../../../lib/supabase-browser'

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

const STEPS = [
  { n: 1, title: 'Add Your First Property', desc: 'Tell us about the listing you want to track leads for.' },
  { n: 2, title: 'Generate Your QR Code',   desc: 'Name your sign placement and preview the QR code.' },
  { n: 3, title: 'Download & Go Live',       desc: 'Print your QR code and start capturing buyer leads.' },
]

/* ─── shared styles ──────────────────────────────────────────── */
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600,
  color: '#C4C4D4', marginBottom: 8,
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#13131A', border: '1px solid #252533',
  borderRadius: 10, color: '#FFFFFF', fontSize: 15,
  padding: '12px 14px', outline: 'none',
  fontFamily: 'sans-serif',
}

const primaryBtn: React.CSSProperties = {
  width: '100%', padding: '14px',
  background: '#7C3AED', color: '#FFFFFF',
  border: 'none', borderRadius: 12,
  fontSize: 15, fontWeight: 700, cursor: 'pointer',
  letterSpacing: '-0.01em', fontFamily: 'sans-serif',
}

const secondaryBtn: React.CSSProperties = {
  width: '100%', padding: '14px',
  background: 'transparent', color: '#C4C4D4',
  border: '1px solid #252533', borderRadius: 12,
  fontSize: 15, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'sans-serif',
}

/* ─── page ───────────────────────────────────────────────────── */
export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [origin, setOrigin] = useState('')

  // Step 1 state
  const [address, setAddress] = useState('')
  const [agentName, setAgentName] = useState('')
  const [saving, setSaving] = useState(false)
  const [propertyId, setPropertyId] = useState('')

  // Step 2 state
  const [label, setLabel] = useState('')
  const [generatingQR, setGeneratingQR] = useState(false)
  const [qrId, setQrId] = useState('')

  const [error, setError] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
    // Auth guard
    const check = async () => {
      const supabase = createBrowserSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) router.push('/auth')
    }
    check()
  }, [])

  /* ── step 1: create property ── */
  const handleCreateProperty = async () => {
    if (!address.trim()) return
    setSaving(true)
    setError('')
    const supabase = createBrowserSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not signed in.'); setSaving(false); return }
    const { data, error: err } = await supabase
      .from('properties')
      .insert({ address: address.trim(), agent_name: agentName.trim() || null, user_id: user.id, active: true })
      .select('id')
      .single()
    if (err || !data) { setError(err?.message || 'Failed to create property.'); setSaving(false); return }
    setPropertyId(data.id)
    setStep(2)
    setSaving(false)
  }

  /* ── step 2: create QR code ── */
  const handleCreateQR = async () => {
    if (!label.trim() || !propertyId) return
    setGeneratingQR(true)
    setError('')
    const supabase = createBrowserSupabase()
    const { data, error: err } = await supabase
      .from('qrcodes')
      .insert([{ property_id: propertyId, label: label.trim() }])
      .select('id')
      .single()
    if (err || !data) { setError(err?.message || 'Failed to create QR code.'); setGeneratingQR(false); return }
    setQrId(data.id)
    setStep(3)
    setGeneratingQR(false)
  }

  /* ── step 3: download QR ── */
  const downloadQR = () => {
    const svg = document.getElementById('onboarding-qr-svg')
    if (!svg) return
    const serializer = new XMLSerializer()
    const svgStr = serializer.serializeToString(svg)
    const canvas = document.createElement('canvas')
    canvas.width = 600
    canvas.height = 600
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 600, 600)
      ctx.drawImage(img, 0, 0, 600, 600)
      const a = document.createElement('a')
      a.download = `${label.replace(/\s+/g, '-').toLowerCase()}-qr.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr)
  }

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 16px', fontFamily: 'sans-serif',
    }}>
      <style>{`
        @media (max-width: 560px) {
          .ob-steps { flex-direction: column !important; gap: 8px !important; align-items: flex-start !important; }
        }
      `}</style>

      {/* Logo */}
      <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 4L3 13h3v10h6v-6h4v6h6V13h3L14 4z" fill="#7C3AED"/>
        </svg>
        <span style={{ fontWeight: 800, fontSize: 20, color: C.text, letterSpacing: '-0.02em' }}>the<span style={{ color: C.purple }}>QR</span>ealtor.</span>
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 520,
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 20, overflow: 'hidden',
      }}>

        {/* Progress header */}
        <div style={{ padding: '24px 28px 20px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Step {step} of 3
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3].map(n => (
                <div key={n} style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: n <= step ? C.purple : C.border,
                  transition: 'background 0.3s',
                }} />
              ))}
            </div>
          </div>
          <div style={{ height: 4, background: C.border, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 4,
              background: `linear-gradient(90deg, ${C.purple}, ${C.purpleL})`,
              width: `${(step / 3) * 100}%`,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>

        {/* Step body */}
        <div style={{ padding: '28px 28px 32px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            {STEPS[step - 1].title}
          </h1>
          <p style={{ fontSize: 14, color: C.muted, margin: '0 0 28px', lineHeight: 1.5 }}>
            {STEPS[step - 1].desc}
          </p>

          {/* ─── Step 1 ─── */}
          {step === 1 && (
            <div>
              <label style={labelStyle}>Property Address *</label>
              <input
                type="text"
                placeholder="e.g. 123 Oak Avenue, Austin TX 78701"
                value={address}
                onChange={e => setAddress(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateProperty()}
                autoFocus
                style={inputStyle}
              />

              <label style={{ ...labelStyle, marginTop: 18 }}>
                Your Name <span style={{ color: C.muted, fontWeight: 400 }}>(optional — used for SMS lead alerts)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Sarah Johnson"
                value={agentName}
                onChange={e => setAgentName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateProperty()}
                style={inputStyle}
              />

              {error && <p style={{ color: '#F87171', fontSize: 13, margin: '12px 0 0' }}>{error}</p>}

              <button
                onClick={handleCreateProperty}
                disabled={saving || !address.trim()}
                style={{ ...primaryBtn, marginTop: 28, opacity: (!address.trim() || saving) ? 0.5 : 1 }}
              >
                {saving ? 'Saving…' : 'Continue →'}
              </button>
            </div>
          )}

          {/* ─── Step 2 ─── */}
          {step === 2 && (
            <div>
              {/* Property confirmation */}
              <div style={{
                background: `${C.purple}14`, border: `1px solid ${C.purple}35`,
                borderRadius: 12, padding: '12px 16px', marginBottom: 22,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, background: `${C.purple}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, flexShrink: 0,
                }}>✓</div>
                <div>
                  <div style={{ fontSize: 11, color: C.purpleL, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Property created</div>
                  <div style={{ fontSize: 14, color: C.sub, marginTop: 2 }}>{address}</div>
                </div>
              </div>

              <label style={labelStyle}>QR Code Label *</label>
              <input
                type="text"
                placeholder='e.g. "Front Yard Sign" or "Open House Sign"'
                value={label}
                onChange={e => setLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateQR()}
                autoFocus
                style={inputStyle}
              />
              <p style={{ fontSize: 12, color: C.muted, margin: '8px 0 0', lineHeight: 1.5 }}>
                Labels help you know which physical sign captured each lead.
              </p>


              {error && <p style={{ color: '#F87171', fontSize: 13, margin: '12px 0 0' }}>{error}</p>}

              <button
                onClick={handleCreateQR}
                disabled={generatingQR || !label.trim()}
                style={{ ...primaryBtn, marginTop: 24, opacity: (!label.trim() || generatingQR) ? 0.5 : 1 }}
              >
                {generatingQR ? 'Generating…' : 'Generate QR Code →'}
              </button>
            </div>
          )}

          {/* ─── Step 3 ─── */}
          {step === 3 && qrId && origin && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              {/* Success banner */}
              <div style={{
                background: `${C.purple}14`, border: `1px solid ${C.purple}35`,
                borderRadius: 12, padding: '14px 18px',
                width: '100%', display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <span style={{ fontSize: 26 }}>🎉</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Your QR code is live!</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{label} · {address}</div>
                </div>
              </div>

              {/* QR code — large */}
              <div style={{
                background: '#fff', padding: 20, borderRadius: 18,
                boxShadow: `0 0 60px ${C.purple}35`,
              }}>
                <QRCodeSVG
                  id="onboarding-qr-svg"
                  value={`${origin}/q/${qrId}`}
                  size={200}
                />
              </div>

              {/* Scan URL */}
              <div style={{
                background: C.border + '55', borderRadius: 8,
                padding: '8px 14px', width: '100%', textAlign: 'center',
              }}>
                <span style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>
                  {origin}/q/{qrId}
                </span>
              </div>

              <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
                Print this QR code and place it on your yard sign.
                Every scan captures the buyer's info and texts you instantly.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                <button onClick={downloadQR} style={primaryBtn}>
                  ↓ Download QR as PNG
                </button>
                <button onClick={() => router.push('/dashboard')} style={secondaryBtn}>
                  Go to Dashboard →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step labels */}
      <div className="ob-steps" style={{
        display: 'flex', gap: 24, marginTop: 28, flexWrap: 'wrap', justifyContent: 'center',
      }}>
        {STEPS.map(s => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: s.n < step ? C.purple : s.n === step ? C.purple : C.border,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700,
              color: s.n <= step ? '#fff' : C.muted,
              transition: 'all 0.3s',
              flexShrink: 0,
            }}>
              {s.n < step ? '✓' : s.n}
            </div>
            <span style={{
              fontSize: 12, color: s.n < step ? C.purpleL : s.n === step ? C.sub : C.muted,
              fontWeight: s.n === step ? 600 : 400,
              transition: 'color 0.3s',
            }}>
              {s.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
