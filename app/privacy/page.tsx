import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — theqrealtor',
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

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} style={{ marginBottom: 40 }}>
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
            Last updated: October 7, 2026
          </p>
        </div>

        <div style={{
          background: `${C.purple}10`, border: `1px solid ${C.purple}30`,
          borderRadius: 12, padding: '16px 20px', marginBottom: 44,
          fontSize: 14, color: C.sub, lineHeight: 1.65,
        }}>
          theQRealtor helps real estate agents learn which buyers are interested in their listings. Buyers reach a listing page by scanning a QR code on a sign. This policy explains what we collect, why, who sees it, and how long we keep it.
        </div>

        <Section id="notice-at-collection" title="1. Information we collect">
          <p style={{ margin: '0 0 12px' }}>
            <strong style={{ color: C.text }}>When a buyer views a listing page.</strong> As soon as the page loads, we record activity about that visit, without any name attached:
          </p>
          <ul style={{ margin: '0 0 16px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li>which listing and which sign the visit came from</li>
            <li>whether this is a return visit, and how many days since the first visit, worked out from a small record stored in your own browser for that listing (it is not a cookie and is not used on other websites)</li>
            <li>how far you look through the photos, how long you stay on the page, and whether you tap &ldquo;Request a Showing&rdquo; or &ldquo;Ask the Listing Agent&rdquo;</li>
          </ul>
          <p style={{ margin: '0 0 12px' }}>
            <strong style={{ color: C.text }}>When a buyer submits a request.</strong> If you request a showing or ask a question, we collect what you enter: your name, phone number and/or email address, your question (if any), the contact methods you prefer, and, if you tick the box, your consent to one confirmation text. The activity from that visit is then attached to your request.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            <strong style={{ color: C.text }}>Agent accounts.</strong> When an agent signs up we collect their name, email, mobile number and, optionally, a real estate license number. We use the phone number to prevent duplicate accounts and, if the agent turns them on, to send lead alerts. We do not currently verify license numbers.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: C.text }}>Our hosting provider</strong> keeps standard server logs, including IP addresses, to run and secure the service. We do not use them to profile buyers or to estimate location.
          </p>
        </Section>

        <Section id="interest-scores" title="2. How we use it: buyer interest scores">
          <p style={{ margin: '0 0 12px' }}>
            We use a buyer's activity and request to give the listing agent a Hot, Warm or Cold interest tier, a score and a breakdown of how it was calculated. The signals are return visits, photos viewed, time on the page, and whether the buyer requested a showing or asked a question. The score helps the agent decide whom to follow up with first. It does not hide, delete or block any request, and the agent makes every decision.
          </p>
          <p style={{ margin: 0 }}>
            We also use this information to show agents how their listings and signs perform, to deliver alerts and confirmation texts, to prevent abuse, and to run the service.
          </p>
        </Section>

        <Section id="who-sees-it" title="3. Who sees it">
          <ul style={{ margin: '0 0 16px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li><strong style={{ color: C.text }}>The listing agent</strong> for that property sees your request, your contact details, your interest tier and score, and your activity on their listing. They can export their leads to their own records.</li>
            <li><strong style={{ color: C.text }}>No other agent</strong> sees your information. We have no brokerage, team or MLS sharing.</li>
            <li><strong style={{ color: C.text }}>Service providers</strong> that run the platform for us: Supabase (database and storage), Twilio (text messages), Vercel (hosting) and Stripe (agent billing only; Stripe never receives buyer information). They process data on our behalf under their data processing terms.</li>
            <li><strong style={{ color: C.text }}>Google Maps</strong> receives nothing unless you tap the &ldquo;Take Me There&rdquo; link yourself.</li>
          </ul>
          <p style={{ margin: 0 }}>
            We do not sell personal information, and we do not share it for advertising.
          </p>
        </Section>

        <Section id="text-messages" title="4. Text messages">
          <p style={{ margin: '0 0 12px' }}>
            <strong style={{ color: C.text }}>Buyers.</strong> If you tick the consent box, we send one text confirming your request. We do not send buyers marketing texts. Reply STOP to opt out; we will not text that number again unless it replies START.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            <strong style={{ color: C.text }}>Agents.</strong> Agents who turn on lead alerts receive a text when a buyer requests a showing or asks a question. Reply STOP to unsubscribe or HELP for help, or turn alerts off in Settings.
          </p>
          <p style={{ margin: 0 }}>
            Our number sends messages only. Replies other than STOP, START and HELP are not read or forwarded.
          </p>
        </Section>

        <Section id="retention" title="5. How long we keep it">
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li><strong style={{ color: C.text }}>Buyer requests (leads):</strong> while the listing agent's account is open. The agent can delete a lead at any time.</li>
            <li><strong style={{ color: C.text }}>Anonymous visit records</strong> (no name attached): 24 months, then deleted.</li>
            <li><strong style={{ color: C.text }}>Text consent and opt-out records:</strong> 5 years, so we can show that texts were sent with consent and stopped when asked.</li>
            <li><strong style={{ color: C.text }}>Agent accounts:</strong> while the account is open. Contact us to close an account and request deletion.</li>
          </ul>
        </Section>

        <Section title="6. Your choices and requests">
          <p style={{ margin: 0 }}>
            You can ask us what information we hold about you, or ask us to delete it, by emailing{' '}
            <a href="mailto:hello@theqrealtor.com" style={{ color: C.purpleL, textDecoration: 'none' }}>hello@theqrealtor.com</a>.
            We may need to keep some records, such as text consent and opt-out records, where the law requires or allows it. You can also contact the listing agent directly.
          </p>
        </Section>

        <Section title="7. Security">
          <p style={{ margin: 0 }}>
            We use encrypted connections, database access rules that keep each agent's data separate, and limited internal access. No system is perfectly secure.
          </p>
        </Section>

        <Section title="8. Children">
          <p style={{ margin: 0 }}>
            theQRealtor is not intended for anyone under 18, and we do not knowingly collect their information. If you believe a minor has submitted information, contact us and we will delete it.
          </p>
        </Section>

        <Section title="9. Changes">
          <p style={{ margin: 0 }}>
            When we update this policy, we change the date at the top.
          </p>
        </Section>

        <Section title="10. Contact">
          <p style={{ margin: 0 }}>
            <a href="mailto:hello@theqrealtor.com" style={{ color: C.purpleL, textDecoration: 'none' }}>hello@theqrealtor.com</a>
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
