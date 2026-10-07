// The exact SMS consent paragraph an agent sees before turning on SMS Lead
// Alerts in Settings. Also rendered, word for word, on the SMS consent page
// (app/sms-consent — kept for carrier/campaign registry verification) so the
// two pages can never drift apart. `color` only changes the link color to
// match each page's own palette; the wording and links are identical.
export default function SmsAgentConsentText({ color }: { color: string }) {
  return (
    <>
      By enabling SMS alerts, you consent to receive automated lead notification text messages
      from theqrealtor at the number provided. Message frequency varies. Msg &amp; Data rates
      may apply. Reply STOP to unsubscribe at any time or HELP for help. View our{' '}
      <a href="https://theqrealtor.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color, textDecoration: 'none' }}>Privacy Policy</a>
      {' '}and{' '}
      <a href="https://theqrealtor.com/terms" target="_blank" rel="noopener noreferrer" style={{ color, textDecoration: 'none' }}>Terms</a>.
    </>
  )
}
