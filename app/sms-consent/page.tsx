import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'SMS Notification Consent — theQRealtor',
  description: 'Learn how theQRealtor SMS lead alert notifications work and how to opt in or out.',
}

const L = {
  bg:       '#F8FAFC',
  card:     '#FFFFFF',
  border:   '#E2E8F0',
  text:     '#0F172A',
  sub:      '#334155',
  muted:    '#64748B',
  purple:   '#7C3AED',
  purpleL:  '#8B5CF6',
  purpleBg: '#F5F3FF',
  green:    '#16A34A',
  greenBg:  '#F0FDF4',
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: L.purple, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 800,
      }}>{n}</div>
      <div style={{ fontSize: 15, color: L.sub, lineHeight: 1.65, paddingTop: 5 }}>{children}</div>
    </div>
  )
}

export default function SmsConsentPage() {
  return (
    <div style={{ minHeight: '100vh', background: L.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: L.text }}>

      {/* Nav */}
      <nav style={{
        background: L.card, borderBottom: `1px solid ${L.border}`,
        padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <span style={{ fontSize: 22 }}>🏠</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: L.purple, letterSpacing: '-0.02em' }}>
            theQRealtor
          </span>
        </Link>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Link href="/terms" style={{ fontSize: 13, color: L.muted, textDecoration: 'none' }}>Terms</Link>
          <Link href="/privacy" style={{ fontSize: 13, color: L.muted, textDecoration: 'none' }}>Privacy</Link>
        </div>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '56px 24px 96px' }}>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: L.purple, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Compliance
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: L.text, margin: '0 0 14px', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
            SMS Notification Consent
          </h1>
          <p style={{ fontSize: 15, color: L.muted, margin: 0, lineHeight: 1.65 }}>
            This page describes how theQRealtor SMS Lead Alerts work, who receives them, and how to opt in or out.
          </p>
        </div>

        {/* Program description */}
        <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 16, padding: '24px 28px', marginBottom: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: L.text, margin: '0 0 12px' }}>About This Program</h2>
          <p style={{ fontSize: 15, color: L.sub, lineHeight: 1.75, margin: '0 0 14px' }}>
            <strong style={{ color: L.text }}>Program name:</strong> theQRealtor SMS Lead Alerts
          </p>
          <p style={{ fontSize: 15, color: L.sub, lineHeight: 1.75, margin: 0 }}>
            theQRealtor sends automated SMS lead alert notifications to licensed real estate agents. Messages are sent when a buyer scans an agent&apos;s property QR code and submits their contact information. These alerts help agents respond to interested buyers quickly and close more deals.
          </p>
        </div>

        {/* Who receives messages */}
        <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 16, padding: '24px 28px', marginBottom: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: L.text, margin: '0 0 12px' }}>Who Receives Messages</h2>
          <p style={{ fontSize: 15, color: L.sub, lineHeight: 1.75, margin: 0 }}>
            Only licensed real estate agents who have created an account on theQRealtor and explicitly opted in to SMS alerts receive these messages. Buyers who scan QR codes do <strong style={{ color: L.text }}>not</strong> receive SMS messages from theQRealtor.
          </p>
        </div>

        {/* Opt-in steps */}
        <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 16, padding: '24px 28px', marginBottom: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: L.text, margin: '0 0 24px' }}>How Agents Opt In</h2>

          <Step n={1}>
            Agent creates an account at <a href="https://theqrealtor.com" style={{ color: L.purple, textDecoration: 'none', fontWeight: 600 }}>theqrealtor.com</a> and completes profile setup.
          </Step>

          <Step n={2}>
            Agent navigates to <strong style={{ color: L.text }}>Settings → Notifications</strong> and enters their mobile phone number.
          </Step>

          <Step n={3}>
            Agent enables the <strong style={{ color: L.text }}>"SMS Lead Alerts"</strong> toggle.
          </Step>

          <Step n={4}>
            Agent reads and acknowledges the disclosure:
            <div style={{
              marginTop: 10,
              background: L.purpleBg, border: `1px solid ${L.purple}30`,
              borderRadius: 10, padding: '12px 16px',
              fontSize: 13, color: L.sub, lineHeight: 1.6, fontStyle: 'italic',
            }}>
              &ldquo;By enabling SMS alerts, you consent to receive automated lead notification text messages from theQRealtor at the number provided. Message frequency varies based on buyer activity. Msg &amp; data rates may apply. Reply STOP to unsubscribe, HELP for help.&rdquo;
            </div>
          </Step>

          {/* Settings mockup */}
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: L.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
              Settings UI Preview
            </div>
            <div style={{
              background: '#1A1A24', border: '1px solid #252533',
              borderRadius: 14, padding: '6px 0', overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            }}>
              {/* Mock header */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #252533' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#F0F2F5' }}>Notifications</div>
              </div>
              {/* Phone row */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #252533', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#C4C4D4', fontWeight: 500 }}>Mobile Phone Number</div>
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 3 }}>For SMS lead alerts</div>
                </div>
                <div style={{ fontSize: 13, color: '#8B5CF6', fontWeight: 600 }}>+1 (555) 000-0000</div>
              </div>
              {/* Toggle row */}
              <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#C4C4D4', fontWeight: 600 }}>SMS Lead Alerts</div>
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 3 }}>Text me when a buyer submits a lead</div>
                </div>
                {/* Toggle on */}
                <div style={{ width: 44, height: 24, borderRadius: 12, background: '#7C3AED', position: 'relative', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 3, left: 23, width: 18, height: 18, borderRadius: '50%', background: '#fff' }} />
                </div>
              </div>
              {/* Disclosure */}
              <div style={{ padding: '0 20px 14px', fontSize: 11, color: '#6B7280', lineHeight: 1.55 }}>
                By enabling SMS alerts, you consent to receive automated lead notification text messages. Msg &amp; data rates may apply. Reply STOP to unsubscribe.
              </div>
            </div>
          </div>
        </div>

        {/* Message frequency */}
        <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 16, padding: '24px 28px', marginBottom: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: L.text, margin: '0 0 12px' }}>Message Frequency</h2>
          <p style={{ fontSize: 15, color: L.sub, lineHeight: 1.75, margin: '0 0 12px' }}>
            Message frequency varies based on buyer activity. Agents typically receive 1–10 messages per day during active listing periods.
          </p>
          <p style={{ fontSize: 15, color: L.sub, lineHeight: 1.75, margin: 0 }}>
            Messages are only sent when a buyer scans a QR code and submits the contact form. No messages are sent during inactive periods.
          </p>
        </div>

        {/* Opt-out */}
        <div style={{ background: L.greenBg, border: `1px solid ${L.green}30`, borderRadius: 16, padding: '24px 28px', marginBottom: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: L.text, margin: '0 0 14px' }}>How to Opt Out</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>📱</span>
              <p style={{ fontSize: 15, color: L.sub, lineHeight: 1.65, margin: 0 }}>
                Reply <strong style={{ color: L.text, fontFamily: 'monospace', background: L.card, padding: '2px 6px', borderRadius: 4 }}>STOP</strong> to any message from theQRealtor to unsubscribe at any time. You will receive a final confirmation message.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>⚙️</span>
              <p style={{ fontSize: 15, color: L.sub, lineHeight: 1.65, margin: 0 }}>
                Or toggle off <strong style={{ color: L.text }}>SMS Lead Alerts</strong> in your account Settings at any time.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>❓</span>
              <p style={{ fontSize: 15, color: L.sub, lineHeight: 1.65, margin: 0 }}>
                Reply <strong style={{ color: L.text, fontFamily: 'monospace', background: L.card, padding: '2px 6px', borderRadius: 4 }}>HELP</strong> for assistance, or contact us at{' '}
                <a href="mailto:support@theqrealtor.com" style={{ color: L.purple, textDecoration: 'none', fontWeight: 600 }}>support@theqrealtor.com</a>.
              </p>
            </div>
          </div>
        </div>

        {/* Rates & compliance */}
        <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 16, padding: '24px 28px', marginBottom: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: L.text, margin: '0 0 12px' }}>Rates &amp; Compliance</h2>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 15, color: L.sub, lineHeight: 1.65 }}>
            <li><strong style={{ color: L.text }}>Msg &amp; data rates may apply</strong> depending on your mobile carrier plan.</li>
            <li>Messages are sent from a dedicated Twilio number registered for A2P 10DLC campaigns.</li>
            <li>theQRealtor complies with TCPA and carrier requirements for application-to-person (A2P) messaging.</li>
            <li>No third parties receive your phone number from theQRealtor for marketing purposes.</li>
          </ul>
        </div>

        {/* Contact */}
        <div style={{ background: L.card, border: `1px solid ${L.border}`, borderRadius: 16, padding: '24px 28px', marginBottom: 40 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: L.text, margin: '0 0 12px' }}>Contact &amp; Support</h2>
          <p style={{ fontSize: 15, color: L.sub, lineHeight: 1.75, margin: 0 }}>
            For questions about SMS alerts or this consent program, contact us at{' '}
            <a href="mailto:support@theqrealtor.com" style={{ color: L.purple, textDecoration: 'none', fontWeight: 600 }}>
              support@theqrealtor.com
            </a>.
          </p>
        </div>

        {/* Footer links */}
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', paddingTop: 24, borderTop: `1px solid ${L.border}` }}>
          <Link href="/" style={{ fontSize: 13, color: L.muted, textDecoration: 'none' }}>← Back to home</Link>
          <Link href="/terms" style={{ fontSize: 13, color: L.muted, textDecoration: 'none' }}>Terms of Service</Link>
          <Link href="/privacy" style={{ fontSize: 13, color: L.muted, textDecoration: 'none' }}>Privacy Policy</Link>
        </div>
      </div>
    </div>
  )
}
