import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — theQRealtor',
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

export default function PrivacyPage() {
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
          <span style={{ fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif", fontSize: '22px', letterSpacing: '-0.5px', lineHeight: 1 }}>
            <span style={{ fontWeight: 300, color: C.text }}>the</span>
            <span style={{ fontWeight: 600, color: '#534AB7' }}>qr</span>
            <span style={{ fontWeight: 300, color: C.text }}>ealtor</span>
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
            Privacy Policy
          </h1>
          <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>
            Last updated: July 3, 2026
          </p>
        </div>

        <div style={{
          background: `${C.purple}10`, border: `1px solid ${C.purple}30`,
          borderRadius: 12, padding: '16px 20px', marginBottom: 44,
          fontSize: 14, color: C.sub, lineHeight: 1.65,
        }}>
          theQRealtor is a lead capture platform for real estate agents. This policy explains what information we collect, how we use it, and how we protect it.
        </div>

        <Section title="1. Information We Collect">
          <p style={{ margin: '0 0 12px' }}>
            <strong style={{ color: C.text }}>Buyer lead data.</strong> When a prospective buyer scans a QR code and submits the lead form on a property page, we collect:
          </p>
          <ul style={{ margin: '0 0 16px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li>Full name</li>
            <li>Phone number</li>
            <li>Email address</li>
            <li>Self-reported purchase intent / buying timeline</li>
          </ul>
          <p style={{ margin: '0 0 12px' }}>
            <strong style={{ color: C.text }}>Agent account data.</strong> When a real estate agent creates an account, we collect their name, email address, and mobile phone number. We use your phone number for two purposes: (1) to prevent duplicate or fraudulent accounts — beta access is limited to one account per phone number — and (2) to deliver SMS lead alerts, if you separately opt in as described in our SMS Consent policy. Agents may also optionally provide a real estate license number (for example, a California DRE number). We store license numbers for profile completeness and may use them in the future to verify active licensure. We do not currently verify license numbers against any state licensing database, use them for account deduplication, or share them with third parties.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            <strong style={{ color: C.text }}>Usage data.</strong> We collect anonymous usage information such as QR code scan counts and page load events to help agents understand their listing performance.
          </p>
          <p style={{ margin: 0 }}>
            When a buyer visits a property page, we also record visit timestamp, whether the visit is a return visit, and days since the buyer's first visit to the same listing. This data is used solely to help agents understand buyer engagement patterns and is never sold or shared with third parties. We also collect standard website analytics such as browser type, device type, and approximate location derived from IP address to improve the service and provide listing performance insights.
          </p>
        </Section>

        <Section title="2. How We Use Your Information">
          <p style={{ margin: '0 0 12px' }}>
            Buyer lead information is used solely to notify the listing agent who placed the QR sign. Specifically:
          </p>
          <ul style={{ margin: '0 0 16px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li>The buyer's name, phone number, email, and purchase intent are delivered to the agent via SMS alert and displayed in the agent's dashboard.</li>
            <li>Lead data is stored securely in our database and accessible only to the agent who owns the property listing.</li>
            <li>Agents may export their leads in CSV format for use in their own CRM systems.</li>
          </ul>
          <p style={{ margin: 0 }}>
            Agent account information is used to operate the service, prevent duplicate or fraudulent accounts, process payments, and send lead alert notifications.
          </p>
        </Section>

        <Section title="3. SMS Communications">
          <p style={{ margin: '0 0 12px' }}>
            Agents who provide a phone number receive SMS notifications when a buyer submits their information. Message frequency varies depending on the number of buyer leads received. Standard message and data rates may apply.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            To stop receiving SMS notifications, text <strong style={{ color: C.text }}>STOP</strong> to the number from which you received the message, or disable SMS alerts in your account Settings. For help, text <strong style={{ color: C.text }}>HELP</strong>.
          </p>
          <p style={{ margin: 0 }}>
            Buyer phone numbers are shared with the listing agent only, and are not used by theQRealtor to send marketing messages to buyers.
          </p>
        </Section>

        <Section title="4. Data Sharing and Third Parties">
          <p style={{ margin: '0 0 12px' }}>
            <strong style={{ color: C.text }}>We do not sell or rent buyer lead information to advertisers, lead marketplaces, or other third parties.</strong>
          </p>
          <p style={{ margin: '0 0 12px' }}>
            We work with the following service providers to operate the platform:
          </p>
          <ul style={{ margin: '0 0 16px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li><strong style={{ color: C.text }}>Supabase</strong> — database and file storage hosting</li>
            <li><strong style={{ color: C.text }}>Twilio</strong> — SMS delivery for agent lead alerts</li>
            <li><strong style={{ color: C.text }}>Stripe</strong> — payment processing for agent subscriptions</li>
            <li><strong style={{ color: C.text }}>Vercel</strong> — application hosting and infrastructure</li>
          </ul>
          <p style={{ margin: 0 }}>
            Each provider is bound by their own privacy policies and data processing agreements. We share only the minimum data necessary to deliver the service.
          </p>
        </Section>

        <Section title="5. Data Retention">
          <p style={{ margin: 0 }}>
            Lead data is retained for as long as the associated agent account is active. Agents may delete individual leads at any time. Upon account deletion, data retention will be handled in accordance with our data retention practices. Contact support@theqrealtor.com for data deletion requests.
          </p>
        </Section>

        <Section title="6. Security">
          <p style={{ margin: 0 }}>
            We use industry-standard measures to protect your data, including encrypted connections (TLS), row-level security on our database, and access controls that ensure agents can only view their own leads. No method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
          </p>
        </Section>

        <Section title="7. Age and Eligibility">
          <p style={{ margin: 0 }}>
            theQRealtor is intended for licensed real estate professionals and individuals of legal age to enter into contracts in their jurisdiction. We do not knowingly collect personal information from individuals under 18 unless they hold a valid real estate license issued by their state. If you believe an unlicensed minor has submitted information through our platform, please contact us at support@theqrealtor.com and we will delete it promptly.
          </p>
        </Section>

        <Section title="8. Changes to This Policy">
          <p style={{ margin: 0 }}>
            We may update this Privacy Policy from time to time. When we do, we will update the "Last updated" date above. Continued use of the service after changes take effect constitutes acceptance of the revised policy.
          </p>
        </Section>

        <Section title="9. Buyer Rights">
          <p style={{ margin: 0 }}>
            Buyers may request access to or deletion of personal information we maintain, subject to applicable law. Requests can be made by contacting{' '}
            <a href="mailto:support@theqrealtor.com" style={{ color: C.purpleL, textDecoration: 'none' }}>
              support@theqrealtor.com
            </a>.
          </p>
        </Section>

        <Section title="10. Contact Us">
          <p style={{ margin: 0 }}>
            If you have questions or concerns about this Privacy Policy, or to request deletion of your data, please contact us at{' '}
            <a href="mailto:support@theqrealtor.com" style={{ color: C.purpleL, textDecoration: 'none' }}>
              support@theqrealtor.com
            </a>.
          </p>
        </Section>

        {/* Footer links */}
        <div style={{ marginTop: 56, paddingTop: 28, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Link href="/" style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>← Back to home</Link>
          <Link href="/terms" style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>Terms of Service</Link>
          <Link href="/auth" style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>Sign in</Link>
        </div>
      </div>
    </div>
  )
}
