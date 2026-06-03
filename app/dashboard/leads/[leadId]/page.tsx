'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
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

const MOTIVATION_CFG = {
  hot: {
    label: '🔥 Hot', color: '#EF4444', bg: '#3B0D0D', border: '#EF4444',
    action: 'Call today — this buyer is ready to act now.',
    actionLabel: 'Call Today', actionIcon: '📞',
  },
  motivated: {
    label: '⚡ Motivated', color: '#F97316', bg: '#3B1F0D', border: '#F97316',
    action: 'Text them this week — they\'re actively searching.',
    actionLabel: 'Text Now', actionIcon: '💬',
  },
  warm: {
    label: '👍 Warm', color: '#60A5FA', bg: '#0F2238', border: '#60A5FA',
    action: 'Schedule a follow-up in the next 1–2 weeks.',
    actionLabel: 'Follow Up This Week', actionIcon: '📅',
  },
  cold: {
    label: '❄ Cold', color: '#6B7280', bg: '#1F2937', border: '#6B7280',
    action: 'Add to your email drip campaign for long-term nurture.',
    actionLabel: 'Add to Drip', actionIcon: '📧',
  },
} as const

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return fmtDate(iso)
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, background: '#15151E' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</span>
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
  )
}

function InfoRow({ icon, label, value, href }: { icon: string; label: string; value: string; href?: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
      <span style={{ fontSize: 16, width: 22, textAlign: 'center', flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
        {href ? (
          <a href={href} style={{ fontSize: 14, color: C.purpleL, fontWeight: 600, textDecoration: 'none', wordBreak: 'break-all' }}>{value}</a>
        ) : (
          <div style={{ fontSize: 14, color: C.sub, wordBreak: 'break-all' }}>{value}</div>
        )}
      </div>
    </div>
  )
}

export default function LeadDetailPage() {
  const params = useParams()
  const router = useRouter()
  const leadId = params.leadId as string

  const [lead,       setLead]       = useState<any>(null)
  const [property,   setProperty]   = useState<any>(null)
  const [qrCode,     setQrCode]     = useState<any>(null)
  const [lastScan,   setLastScan]   = useState<string | null>(null)
  const [notes,      setNotes]      = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved,  setNotesSaved]  = useState(false)
  const [loading,    setLoading]    = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }

      const { data: leadData } = await supabase.from('leads').select('*').eq('id', leadId).single()
      if (!leadData) { router.push('/dashboard/leads'); return }
      setLead(leadData)
      setNotes(leadData.notes || '')

      const qrPromise = leadData.qr_id
        ? supabase.from('qrcodes').select('id, label, scan_count, placement').eq('id', leadData.qr_id).single()
        : Promise.resolve({ data: null })
      const scanPromise = leadData.qr_id
        ? supabase.from('scan_events').select('created_at').eq('qr_id', leadData.qr_id)
            .order('created_at', { ascending: false }).limit(1)
        : Promise.resolve({ data: [] })

      const [{ data: propData }, { data: qrData }, { data: scanData }] = await Promise.all([
        supabase.from('properties').select('id, address, city, state').eq('id', leadData.property_id).single(),
        qrPromise,
        scanPromise,
      ])

      setProperty(propData)
      setQrCode(qrData)
      setLastScan((scanData as any[])?.[0]?.created_at ?? null)
      setLoading(false)
    }
    load()
  }, [leadId])

  const saveNotes = async () => {
    setSavingNotes(true)
    setNotesSaved(false)
    const supabase = createBrowserSupabase()
    await supabase.from('leads').update({ notes }).eq('id', leadId)
    setSavingNotes(false)
    setNotesSaved(true)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setNotesSaved(false), 3000)
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 32, height: 32, border: `2px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </DashboardLayout>
    )
  }

  if (!lead) return null

  const cfg = MOTIVATION_CFG[lead.motivation as keyof typeof MOTIVATION_CFG]
  const initials = (lead.name || '??').slice(0, 2).toUpperCase()
  const location = [property?.city, property?.state].filter(Boolean).join(', ')

  return (
    <DashboardLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .notes-area:focus { border-color: ${C.purple} !important; box-shadow: 0 0 0 3px rgba(124,58,237,0.2); }
        @media (max-width: 900px) { .detail-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      {/* Top bar */}
      <div className="db-page-topbar" style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: C.bg, borderBottom: `1px solid ${C.border}`,
        padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 16,
        fontFamily: 'sans-serif',
      }}>
        <Link href="/dashboard/leads" style={{ color: C.muted, fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          ← Leads
        </Link>
        <span style={{ color: C.border }}>|</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.name}</span>
          {cfg && (
            <span style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}50`, borderRadius: 6, padding: '2px 9px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              {cfg.label}
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: '24px 28px 48px', fontFamily: 'sans-serif', flex: 1 }}>

        {/* Lead header */}
        <div style={{ background: C.card, border: `1px solid ${cfg?.border ?? C.border}`, borderRadius: 16, padding: '22px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16, flexShrink: 0,
            background: cfg ? cfg.bg : `${C.purple}28`,
            border: `2px solid ${cfg?.border ?? C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 700, color: cfg?.color ?? C.purpleL,
          }}>{initials}</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 6, letterSpacing: '-0.02em' }}>{lead.name || 'Unknown'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {cfg && (
                <span style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}50`, borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                  {cfg.label}
                </span>
              )}
              <span style={{ fontSize: 13, color: C.muted }}>Lead since {fmtDate(lead.created_at)}</span>
            </div>
          </div>
        </div>

        {/* 2-col layout */}
        <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>

          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Contact */}
            <Section title="Contact Info">
              {lead.phone && <InfoRow icon="📞" label="Phone" value={lead.phone} href={`tel:${lead.phone}`} />}
              {lead.email && <InfoRow icon="✉️" label="Email" value={lead.email} href={`mailto:${lead.email}`} />}
              {!lead.phone && !lead.email && <div style={{ fontSize: 13, color: C.muted }}>No contact info provided.</div>}
              {/* Action buttons */}
              {(lead.phone || lead.email) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  {lead.phone && (
                    <a href={`tel:${lead.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#062014', border: '1px solid #166534', borderRadius: 9, padding: '9px 16px', color: '#4ade80', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                      📞 Call
                    </a>
                  )}
                  {lead.phone && (
                    <a href={`sms:${lead.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, background: `${C.purple}18`, border: `1px solid ${C.purple}40`, borderRadius: 9, padding: '9px 16px', color: C.purpleL, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                      💬 Text
                    </a>
                  )}
                  {lead.email && (
                    <a href={`mailto:${lead.email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0B1E3A', border: '1px solid #1D4ED860', borderRadius: 9, padding: '9px 16px', color: '#60A5FA', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                      ✉️ Email
                    </a>
                  )}
                </div>
              )}
            </Section>

            {/* Property */}
            <Section title="Property">
              {property ? (
                <>
                  <InfoRow icon="📍" label="Address" value={[property.address, location].filter(Boolean).join(' — ')} />
                  {qrCode && (
                    <>
                      <InfoRow icon="🏷️" label="QR Code" value={qrCode.label || 'Unlabeled'} />
                      <InfoRow icon="📊" label="Total Scans" value={`${qrCode.scan_count || 0} scan${qrCode.scan_count !== 1 ? 's' : ''}`} />
                      {qrCode.placement && <InfoRow icon="📌" label="Placement" value={qrCode.placement} />}
                    </>
                  )}
                  <div style={{ marginTop: 8 }}>
                    <Link href={`/p/${property.id}`} target="_blank" style={{ fontSize: 12, color: C.purpleL, fontWeight: 700, textDecoration: 'none' }}>
                      View buyer page →
                    </Link>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: C.muted }}>Property no longer available.</div>
              )}
            </Section>

            {/* Timeline */}
            <Section title="Activity Timeline">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {lastScan && (
                  <div style={{ display: 'flex', gap: 14, paddingBottom: 16, position: 'relative' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${C.purple}28`, border: `1px solid ${C.purple}45`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>📱</div>
                      <div style={{ width: 1, flex: 1, background: C.border, marginTop: 4 }} />
                    </div>
                    <div style={{ paddingTop: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>Scanned QR code</div>
                      <div style={{ fontSize: 12, color: C.muted }}>{fmtDateTime(lastScan)} · {timeAgo(lastScan)}</div>
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#062014', border: '1px solid #166534', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>✅</div>
                  <div style={{ paddingTop: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>Submitted lead form</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{fmtDateTime(lead.created_at)} · {timeAgo(lead.created_at)}</div>
                  </div>
                </div>
              </div>
            </Section>

            {/* Notes */}
            <Section title="Agent Notes">
              <textarea
                className="notes-area"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add notes about this lead — follow-up status, showing details, feedback…"
                rows={5}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: C.bg, border: `1px solid ${C.border}`,
                  borderRadius: 9, color: C.text, fontSize: 14,
                  padding: '12px 14px', resize: 'vertical', outline: 'none',
                  fontFamily: 'sans-serif', lineHeight: 1.6,
                  marginBottom: 10,
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={saveNotes}
                  disabled={savingNotes}
                  style={{
                    background: C.purple, color: '#fff', border: 'none',
                    borderRadius: 9, padding: '9px 20px', fontSize: 13, fontWeight: 700,
                    cursor: savingNotes ? 'not-allowed' : 'pointer',
                    opacity: savingNotes ? 0.7 : 1, fontFamily: 'sans-serif',
                  }}
                >
                  {savingNotes ? 'Saving…' : 'Save Notes'}
                </button>
                {notesSaved && <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 600 }}>✓ Saved</span>}
              </div>
            </Section>

          </div>

          {/* Right column — Suggested Action */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {cfg && (
              <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}40`, borderRadius: 16, padding: '22px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Suggested Action</div>
                <div style={{ fontSize: 26, marginBottom: 10 }}>{cfg.actionIcon}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 8, lineHeight: 1.2 }}>{cfg.actionLabel}</div>
                <p style={{ fontSize: 14, color: C.sub, lineHeight: 1.6, margin: '0 0 18px' }}>{cfg.action}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lead.phone && (
                    <a href={`tel:${lead.phone}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: cfg.color, color: '#fff', border: 'none', borderRadius: 9, padding: '11px 16px', fontSize: 14, fontWeight: 800, textDecoration: 'none', textAlign: 'center' }}>
                      📞 Call {lead.name?.split(' ')[0] || 'Lead'}
                    </a>
                  )}
                  {lead.phone && (
                    <a href={`sms:${lead.phone}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(255,255,255,0.08)', color: C.text, border: `1px solid rgba(255,255,255,0.15)`, borderRadius: 9, padding: '10px 16px', fontSize: 14, fontWeight: 700, textDecoration: 'none', textAlign: 'center' }}>
                      💬 Send Text
                    </a>
                  )}
                  {lead.email && (
                    <a href={`mailto:${lead.email}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(255,255,255,0.08)', color: C.text, border: `1px solid rgba(255,255,255,0.15)`, borderRadius: 9, padding: '10px 16px', fontSize: 14, fontWeight: 700, textDecoration: 'none', textAlign: 'center' }}>
                      ✉️ Send Email
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Lead summary card */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>Lead Summary</div>
              {[
                { label: 'Motivation', value: cfg?.label || lead.motivation || '—' },
                { label: 'Submitted',  value: fmtDate(lead.created_at) },
                { label: 'Property',   value: property?.address || '—' },
                { label: 'QR Code',    value: qrCode?.label || (lead.qr_id ? 'Unlinked' : 'Direct') },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 }}>
                  <span style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>{label}</span>
                  <span style={{ fontSize: 12, color: C.sub, textAlign: 'right', wordBreak: 'break-word', maxWidth: 180 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </DashboardLayout>
  )
}
