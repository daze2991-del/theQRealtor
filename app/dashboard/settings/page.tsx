'use client'

import { useEffect, useRef, useState } from 'react'
import { createBrowserSupabase } from '../../../lib/supabase-browser'
import { useRouter } from 'next/navigation'
import DashboardLayout from '../../../components/DashboardLayout'

const C = {
  bg:      '#0F0F13',
  card:    '#1A1A24',
  border:  '#252533',
  purple:  '#7C3AED',
  purpleL: '#8B5CF6',
  text:    '#FFFFFF',
  sub:     '#C4C4D4',
  muted:   '#6B7280',
  danger:  '#EF4444',
} as const

const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#0D1117', border: `1px solid ${C.border}`,
  borderRadius: 9, color: C.text, fontSize: 14, padding: '10px 14px',
  outline: 'none', fontFamily: 'sans-serif',
}

function Section({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode
}) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '18px 24px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</div>
        {description && <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{description}</div>}
      </div>
      <div style={{ padding: '20px 24px' }}>{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.sub, marginBottom: 6 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 12, color: C.muted, marginTop: 5 }}>{hint}</div>}
    </div>
  )
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button" onClick={() => !disabled && onChange(!checked)}
      aria-checked={checked} role="switch"
      style={{
        position: 'relative', width: 44, height: 24, borderRadius: 12,
        background: checked ? C.purple : '#374151', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background 0.2s',
        flexShrink: 0, padding: 0, opacity: disabled ? 0.4 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, borderRadius: '50%', width: 18, height: 18,
        background: '#fff', transition: 'left 0.2s', left: checked ? 23 : 3,
      }} />
    </button>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router

  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [saved, setSaved]         = useState(false)
  const [saveError, setSaveError] = useState('')
  const [testingSMS, setTestingSMS] = useState(false)
  const [testSMSResult, setTestSMSResult] = useState<{ ok?: boolean; error?: string } | null>(null)
  const [theme, setTheme]         = useState<'dark' | 'light' | 'system'>('dark')

  const [userId, setUserId]       = useState('')
  const [email, setEmail]         = useState('')
  const [name, setName]           = useState('')
  const [phone, setPhone]         = useState('')
  const [smsEnabled, setSmsEnabled] = useState(true)

  // account summary
  const [plan, setPlan]               = useState<'free' | 'pro'>('free')
  const [propCount, setPropCount]     = useState(0)
  const [qrCount, setQrCount]         = useState(0)
  const [leadCount, setLeadCount]     = useState(0)
  const [memberSince, setMemberSince] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const supabase = createBrowserSupabase()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { routerRef.current.push('/auth'); return }

        const uid = session.user.id
        setUserId(uid)
        setEmail(session.user.email || '')
        setMemberSince(session.user.created_at
          ? new Date(session.user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          : '')

        const meta = session.user.user_metadata || {}
        setPhone(meta.phone || '')
        setSmsEnabled(meta.sms_enabled !== false)

        const savedTheme = (typeof window !== 'undefined' && localStorage.getItem('qr-theme')) as 'dark' | 'light' | 'system' | null
        if (savedTheme) setTheme(savedTheme)

        const [
          { data: profile },
          { data: props },
        ] = await Promise.all([
          supabase.from('profiles').select('name, plan').eq('id', uid).single(),
          supabase.from('properties').select('id').eq('user_id', uid),
        ])

        if (cancelled) return
        if (profile) { setName(profile.name || ''); setPlan(profile.plan === 'pro' ? 'pro' : 'free') }

        const propIds = (props || []).map((p: any) => p.id)
        setPropCount(propIds.length)

        if (propIds.length > 0) {
          const [{ count: qrCnt }, { count: leadCnt }] = await Promise.all([
            supabase.from('qrcodes').select('id', { count: 'exact', head: true }).in('property_id', propIds),
            supabase.from('leads').select('id', { count: 'exact', head: true }).in('property_id', propIds),
          ])
          if (!cancelled) { setQrCount(qrCnt || 0); setLeadCount(leadCnt || 0) }
        }
      } catch (err) {
        console.error('[SettingsPage] load error:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const save = async () => {
    if (!userId) return
    setSaving(true)
    setSaved(false)
    setSaveError('')
    try {
      const agentPhone = smsEnabled && phone.trim() ? phone.trim() : null
      const profileRes = await fetch('/api/update-profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), smsEnabled, agentPhone }),
      })
      if (!profileRes.ok) {
        const { error: msg } = await profileRes.json().catch(() => ({}))
        throw new Error(msg || 'Failed to update profile.')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const sendTestSMS = async () => {
    setTestingSMS(true)
    setTestSMSResult(null)
    try {
      const res = await fetch('/api/test-sms', { method: 'POST' })
      const data = await res.json()
      setTestSMSResult(res.ok ? { ok: true } : { error: data.error })
    } catch {
      setTestSMSResult({ error: 'Network error. Please try again.' })
    } finally {
      setTestingSMS(false)
    }
  }

  const signOut = async () => {
    setSigningOut(true)
    const supabase = createBrowserSupabase()
    await supabase.auth.signOut()
    routerRef.current.push('/auth')
  }

  const handleTheme = (t: 'dark' | 'light' | 'system') => {
    setTheme(t)
    if (typeof window !== 'undefined') localStorage.setItem('qr-theme', t)
  }

  const themeBtn = (t: 'dark' | 'light' | 'system', label: string): React.CSSProperties => ({
    flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', border: `1px solid ${theme === t ? C.purple : C.border}`,
    background: theme === t ? `${C.purple}20` : 'transparent',
    color: theme === t ? C.purpleL : C.muted,
    transition: 'all 0.15s',
  })

  return (
    <DashboardLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
          <div style={{ width: 32, height: 32, border: `2px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : (
        <>
          {/* Top bar */}
          <div className="db-page-topbar" style={{
            padding: '16px 28px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: C.bg, position: 'sticky', top: 0, zIndex: 10,
          }}>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: C.text, margin: 0 }}>Settings</h1>
            <button
              onClick={save} disabled={saving}
              style={{
                background: saved ? '#052e16' : C.purple,
                color: saved ? '#4ade80' : '#fff',
                border: saved ? '1px solid #16a34a' : 'none',
                borderRadius: 9, padding: '8px 20px', fontSize: 13, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1, transition: 'all 0.2s',
              }}
            >
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
            </button>
          </div>

          <div style={{ padding: '24px 28px', maxWidth: 680, fontFamily: 'sans-serif' }}>

            {saveError && (
              <div style={{ background: '#2D0A0A', border: '1px solid #7F1D1D', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#FCA5A5' }}>
                {saveError}
              </div>
            )}

            {/* Account summary */}
            <div style={{ background: `${C.purple}10`, border: `1px solid ${C.purple}30`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{name || email.split('@')[0]}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{email}</div>
                </div>
                <div style={{
                  background: plan === 'pro' ? `${C.purple}28` : '#1F2937',
                  color: plan === 'pro' ? C.purpleL : '#9CA3AF',
                  border: `1px solid ${plan === 'pro' ? C.purple : '#374151'}`,
                  borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700,
                }}>
                  {plan === 'pro' ? '⚡ Pro Plan' : '🔒 Free Plan'}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[
                  { label: 'Properties', value: propCount },
                  { label: 'QR Codes',   value: qrCount },
                  { label: 'Leads',      value: leadCount },
                  { label: 'Member Since', value: memberSince || '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: typeof value === 'number' ? 18 : 11, fontWeight: 700, color: C.purpleL, lineHeight: 1, marginBottom: 4 }}>{value}</div>
                    <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Profile */}
            <Section title="Profile" description="Your display name and SMS alert phone number.">
              <Field label="Display Name">
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" style={INPUT} />
              </Field>
              <Field label="SMS Alert Phone Number" hint="Lead alerts are sent to this number when a buyer submits their info. Format: +12125551234">
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+12125551234" style={INPUT} />
              </Field>
              <Field label="Email Address">
                <input type="email" value={email} readOnly style={{ ...INPUT, color: C.muted, cursor: 'not-allowed', opacity: 0.7 }} />
              </Field>
            </Section>

            {/* Notifications */}
            <Section title="Notification Preferences" description="Control when and how you receive lead alerts.">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>SMS Lead Alerts</div>
                  <div style={{ fontSize: 13, color: C.muted }}>Receive a text message when a buyer scans your QR code and submits their info. Requires a phone number above.</div>
                </div>
                <Toggle checked={smsEnabled} onChange={setSmsEnabled} disabled={!phone.trim()} />
              </div>
              {(smsEnabled || !!phone.trim()) && (
                <p style={{ margin: '14px 0 0', fontSize: 11, color: C.muted, lineHeight: 1.65 }}>
                  By enabling SMS alerts, you consent to receive automated lead notification text messages
                  from theQRealtor at the number provided. Message frequency varies. Msg &amp; Data rates
                  may apply. Reply STOP to unsubscribe at any time or HELP for help. View our{' '}
                  <a href="https://theqrealtor.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: C.purpleL, textDecoration: 'none' }}>Privacy Policy</a>
                  {' '}and{' '}
                  <a href="https://theqrealtor.com/terms" target="_blank" rel="noopener noreferrer" style={{ color: C.purpleL, textDecoration: 'none' }}>Terms</a>.
                </p>
              )}
              {!phone.trim() && (
                <div style={{ marginTop: 14, fontSize: 12, color: C.muted, background: `${C.purple}12`, border: `1px solid ${C.purple}28`, borderRadius: 8, padding: '8px 12px' }}>
                  Add a phone number above and save to enable SMS alerts.
                </div>
              )}
              {phone.trim() && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Send Test SMS</div>
                      <div style={{ fontSize: 13, color: C.muted }}>Verify your alerts are working by sending a test message to {phone}.</div>
                    </div>
                    <button
                      onClick={sendTestSMS} disabled={testingSMS}
                      style={{
                        background: testSMSResult?.ok ? '#052e16' : `${C.purple}22`,
                        color: testSMSResult?.ok ? '#4ade80' : C.purpleL,
                        border: `1px solid ${testSMSResult?.ok ? '#166534' : C.purple + '55'}`,
                        borderRadius: 9, padding: '8px 18px', fontSize: 13, fontWeight: 600,
                        cursor: testingSMS ? 'not-allowed' : 'pointer',
                        opacity: testingSMS ? 0.7 : 1, whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.2s',
                      }}
                    >
                      {testingSMS ? 'Sending…' : testSMSResult?.ok ? '✓ Sent!' : 'Send Test SMS'}
                    </button>
                  </div>
                  {testSMSResult?.error && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#FCA5A5', background: '#2D0A0A', border: '1px solid #7F1D1D', borderRadius: 8, padding: '8px 12px' }}>
                      {testSMSResult.error}
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* Appearance */}
            <Section title="Appearance" description="Choose how theQRealtor looks to you.">
              <div style={{ display: 'flex', gap: 8 }}>
                {(['dark', 'light', 'system'] as const).map(t => (
                  <button key={t} onClick={() => handleTheme(t)} style={themeBtn(t, t)}>
                    {t === 'dark' ? '🌙 Dark' : t === 'light' ? '☀️ Light' : '💻 System'}
                  </button>
                ))}
              </div>
              {theme !== 'dark' && (
                <div style={{ marginTop: 12, fontSize: 12, color: C.muted, background: `${C.purple}10`, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px' }}>
                  Light and System themes are coming soon. Dark mode is currently active.
                </div>
              )}
            </Section>

            {/* Help & Support */}
            <Section title="Help & Support">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Contact Support</div>
                  <div style={{ fontSize: 13, color: C.muted }}>Have a question or need help? We're here for you.</div>
                </div>
                <a
                  href="mailto:support@theqrealtor.com"
                  style={{
                    background: 'transparent', color: C.purpleL,
                    border: `1px solid ${C.purple}55`, borderRadius: 9,
                    padding: '8px 16px', fontSize: 13, fontWeight: 600,
                    textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  ✉ Email Support
                </a>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: C.muted }}>
                support@theqrealtor.com — we typically respond within 24 hours.
              </div>
            </Section>

            {/* Sign Out */}
            <Section title="Sign Out">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Sign out of your account</div>
                  <div style={{ fontSize: 13, color: C.muted }}>You can sign back in at any time using your email and password.</div>
                </div>
                <button
                  onClick={signOut} disabled={signingOut}
                  style={{
                    background: 'transparent', color: C.sub,
                    border: `1px solid ${C.border}`, borderRadius: 9,
                    padding: '8px 18px', fontSize: 13, fontWeight: 600,
                    cursor: signingOut ? 'not-allowed' : 'pointer',
                    opacity: signingOut ? 0.6 : 1, whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  {signingOut ? 'Signing out…' : 'Sign Out'}
                </button>
              </div>
            </Section>

            {/* Danger Zone */}
            <Section title="Danger Zone">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.danger, marginBottom: 4 }}>Delete Account</div>
                  <div style={{ fontSize: 13, color: C.muted }}>
                    Permanently delete your account, all properties, QR codes, and leads. This cannot be undone.
                  </div>
                </div>
                <button
                  disabled
                  style={{
                    background: 'transparent', color: C.danger,
                    border: `1px solid ${C.danger}55`, borderRadius: 9,
                    padding: '8px 18px', fontSize: 13, fontWeight: 600,
                    cursor: 'not-allowed', opacity: 0.5, whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  Delete Account
                </button>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: C.muted }}>
                To delete your account, contact support@theqrealtor.com.
              </div>
            </Section>

          </div>
        </>
      )}

      {/* Toast */}
      {saved && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 200,
          background: '#052e16', border: '1px solid #16a34a',
          borderRadius: 10, padding: '12px 20px',
          fontSize: 14, fontWeight: 600, color: '#4ade80',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          animation: 'fadeInUp 0.2s ease',
          fontFamily: 'sans-serif',
        }}>
          ✅ Changes saved
        </div>
      )}
    </DashboardLayout>
  )
}
