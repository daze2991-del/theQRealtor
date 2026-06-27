import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — theQRealtor',
}

const C = {
  bg:      '#0F0F13',
  card:    '#1A1A24',
  border:  '#252533',
  purple:  '#7C3AED',
  purpleL: '#8B5CF6',
  text:    '#F0F2F5',
  sub:     '#C4C4D4',
  muted:   '#6B7280',
} as const

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 14px', letterSpacing: '-0.01em' }}>
        {title}
      </h2>
      <div style={{ fontSize: 15, color: C.sub, lineHeight: 1.75 }}>
        {children}
      </div>
    </div>
  )
}

export default function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'sans-serif' }}>
      {/* Nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(15,15,19,0.9)', backdropFilter: 'blur(14px)',
        borderBottom: `1px solid ${C.border}`,
        height: 64, padding: '0 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontWeight: 800, fontSize: 17, color: C.text, letterSpacing: '-0.02em' }}>
            the<span style={{ color: C.purple }}>QR</span>ealtor.
          </span>
        </Link>
        <Link href="/auth" style={{
          background: C.purple, color: '#fff', fontSize: 13, fontWeight: 700,
          textDecoration: 'none', padding: '8px 18px', borderRadius: 8,
        }}>
          Get started free
        </Link>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 740, margin: '0 auto', padding: '64px 32px 96px' }}>
        {/* Header */}
        <div style={{ marginBottom: 52 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.purpleL, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Legal
          </div>
          <h1 style={{ fontSize: 38, fontWeight: 900, color: C.text, margin: '0 0 14px', letterSpacing: '-0.025em', lineHeight: 1.1 }}>
            Terms of Service
          </h1>
          <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>
            Last updated: May 28, 2026
          </p>
        </div>

        <div style={{
          background: `${C.purple}10`, border: `1px solid ${C.purple}30`,
          borderRadius: 12, padding: '16px 20px', marginBottom: 44,
          fontSize: 14, color: C.sub, lineHeight: 1.65,
        }}>
          By creating an account or using theQRealtor, you agree to these Terms of Service. Please read them carefully. If you do not agree, do not use the service.
        </div>

        <Section title="About theQRealtor">
          <p style={{ margin: 0 }}>
            theQRealtor is a real estate engagement platform that helps buyers connect with listing agents through QR-powered property pages. The platform captures buyer-initiated inquiries, provides analytics to agents, and routes leads securely. It does not conduct automated marketing to buyers. Agents — not the platform — are responsible for all direct communication with buyers.
          </p>
        </Section>

        <Section title="1. Service Description">
          <p style={{ margin: '0 0 12px' }}>
            theQRealtor ("Service", "we", "us") provides a QR code lead capture platform for real estate agents. The Service allows agents to:
          </p>
          <ul style={{ margin: '0 0 16px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li>Generate property-specific QR codes for placement on yard signs and marketing materials</li>
            <li>Collect contact information and purchase intent from prospective buyers who scan those codes</li>
            <li>Receive real-time SMS notifications when a buyer submits their information</li>
            <li>Track scan analytics and manage leads through a web dashboard</li>
          </ul>
          <p style={{ margin: 0 }}>
            The Service is intended for licensed real estate professionals and related parties operating in lawful capacities.
          </p>
        </Section>

        <Section title="2. Accounts and Eligibility">
          <p style={{ margin: '0 0 12px' }}>
            You must be at least 18 years old to create an account. By registering, you represent that all information you provide is accurate and that you have the authority to agree to these Terms.
          </p>
          <p style={{ margin: 0 }}>
            You are responsible for maintaining the security of your account credentials. You are liable for all activity that occurs under your account. Notify us immediately at{' '}
            <a href="mailto:support@theqrealtor.com" style={{ color: C.purpleL, textDecoration: 'none' }}>support@theqrealtor.com</a>{' '}
            if you suspect unauthorized access.
          </p>
        </Section>

        <Section title="3. Subscription and Billing">
          <p style={{ margin: '0 0 12px' }}>
            theQRealtor offers free and paid subscription plans. Paid subscriptions are billed in advance on a monthly or annual basis through Stripe. All fees are non-refundable except as required by law or as explicitly stated in a refund policy.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            You may cancel your subscription at any time. Cancellation takes effect at the end of the current billing period. Downgrading to the free plan may restrict access to features and properties beyond the free plan limits.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            We reserve the right to change pricing with 30 days' notice to active subscribers.
          </p>
          <p style={{ margin: 0 }}>
            Beta Agent participants receive free full platform access during the beta testing period. No charge and no payment method is required during beta. Pricing for paid plans will be communicated before any charges occur.
          </p>
        </Section>

        <Section title="4. SMS Messaging — Agent Lead Alerts">
          <p style={{ margin: '0 0 14px' }}>
            <strong style={{ color: C.text }}>Program name:</strong> theQRealtor SMS Lead Alerts
          </p>
          <p style={{ margin: '0 0 12px' }}>
            By providing a mobile phone number and enabling SMS Lead Alerts in your account Settings, you consent to receive automated text messages from theQRealtor notifying you of new buyer leads. These messages are sent when a buyer scans one of your property QR codes and submits their contact information.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            <strong style={{ color: C.text }}>Message frequency:</strong> Message frequency varies based on buyer activity. Agents typically receive 1–10 messages per day during active listing periods. No messages are sent when there is no buyer activity.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            <strong style={{ color: C.text }}>Msg &amp; data rates may apply</strong> depending on your mobile carrier plan.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            <strong style={{ color: C.text }}>To opt out:</strong> Reply <strong style={{ color: C.text }}>STOP</strong> to any message from theQRealtor to unsubscribe at any time. You will receive a confirmation that you have been unsubscribed. You may also disable SMS alerts in your account Settings at any time.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            <strong style={{ color: C.text }}>For help:</strong> Reply <strong style={{ color: C.text }}>HELP</strong> to any message, or contact us at{' '}
            <a href="mailto:support@theqrealtor.com" style={{ color: C.purpleL, textDecoration: 'none' }}>support@theqrealtor.com</a>.
          </p>
          <p style={{ margin: 0 }}>
            For full details on the opt-in process and compliance information, see our{' '}
            <a href="/sms-consent" style={{ color: C.purpleL, textDecoration: 'none' }}>SMS Consent page</a>.
          </p>
        </Section>

        <Section title="5. SMS Messaging — Buyer Data">
          <p style={{ margin: 0 }}>
            When a buyer scans a QR code and submits the lead form, they are providing their contact information voluntarily to be shared with the listing agent. The buyer's submission constitutes consent to be contacted by the agent regarding the property. theQRealtor does not initiate SMS contact with buyers; only the agent receives SMS notifications.
          </p>
        </Section>

        <Section title="6. Acceptable Use">
          <p style={{ margin: '0 0 12px' }}>You agree not to:</p>
          <ul style={{ margin: '0 0 16px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li>Use the Service for any unlawful purpose or in violation of any applicable laws or regulations</li>
            <li>Misrepresent your identity or affiliation with any person or entity</li>
            <li>Use the Service to collect data from individuals without their knowledge or consent</li>
            <li>Attempt to reverse-engineer, scrape, or gain unauthorized access to any part of the Service</li>
            <li>Interfere with or disrupt the integrity or performance of the Service</li>
            <li>Use the Service to transmit spam or unsolicited communications</li>
          </ul>
          <p style={{ margin: 0 }}>
            We reserve the right to suspend or terminate any account found to be in violation of these terms.
          </p>
        </Section>

        <Section title="7. Intellectual Property">
          <p style={{ margin: 0 }}>
            The Service, including its design, code, and content, is owned by theQRealtor and protected by applicable intellectual property laws. Your subscription grants you a limited, non-exclusive, non-transferable license to use the Service. You retain ownership of the data you upload or collect through the Service (e.g., property photos, lead information).
          </p>
        </Section>

        <Section title="8. Disclaimer of Warranties">
          <p style={{ margin: 0 }}>
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES. YOUR USE OF THE SERVICE IS AT YOUR SOLE RISK.
          </p>
        </Section>

        <Section title="9. Limitation of Liability">
          <p style={{ margin: 0 }}>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, THEQREALTOR SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR TOTAL LIABILITY TO YOU FOR ANY CLAIMS RELATING TO THE SERVICE SHALL NOT EXCEED THE AMOUNT PAID BY YOU TO THEQREALTOR IN THE 12 MONTHS PRECEDING THE CLAIM.
          </p>
        </Section>

        <Section title="10. Indemnification">
          <p style={{ margin: 0 }}>
            You agree to indemnify and hold harmless theQRealtor and its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including reasonable attorney's fees) arising from your use of the Service, your violation of these Terms, or your violation of any third-party rights.
          </p>
        </Section>

        <Section title="11. Termination">
          <p style={{ margin: 0 }}>
            Either party may terminate these Terms at any time. We may suspend or terminate your access to the Service without notice if we believe you have violated these Terms. Upon termination, access to the Service may be suspended. Data retention and deletion will be handled in accordance with our Privacy Policy.
          </p>
        </Section>

        <Section title="12. Changes to These Terms">
          <p style={{ margin: 0 }}>
            We may update these Terms from time to time. We will notify registered users of material changes via email or in-app notice. Continued use of the Service after the effective date of changes constitutes acceptance of the revised Terms.
          </p>
        </Section>

        <Section title="13. Governing Law">
          <p style={{ margin: 0 }}>
            These Terms are governed by the laws of the State of California, without regard to its conflict of law principles. Any disputes arising from these Terms or the Service shall be resolved exclusively in the courts located in California.
          </p>
        </Section>

        <Section title="14. Contact">
          <p style={{ margin: 0 }}>
            For questions about these Terms, please contact us at{' '}
            <a href="mailto:support@theqrealtor.com" style={{ color: C.purpleL, textDecoration: 'none' }}>
              support@theqrealtor.com
            </a>.
          </p>
        </Section>

        {/* Footer links */}
        <div style={{ marginTop: 56, paddingTop: 28, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Link href="/" style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>← Back to home</Link>
          <Link href="/privacy" style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>Privacy Policy</Link>
          <Link href="/sms-consent" style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>SMS Consent</Link>
          <Link href="/auth" style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>Sign in</Link>
        </div>
      </div>
    </div>
  )
}
