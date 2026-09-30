// Reminder line on the buyer page's post-submit success screen.
//
// Shown whenever the buyer ticked the SMS consent box AND gave a phone number,
// and IDENTICAL for every such buyer. It deliberately makes no API call and
// never looks at opt-out status: varying the message by status would reveal
// to whoever is holding the phone whether that number once replied STOP.
// Pure render — no hooks, no effects, no fetch.

export const SMS_CONFIRMATION_REMINDER =
  "You'll get a confirmation text shortly. Didn't get it? If you've ever replied STOP to us, text START to (620) 522-8398 to turn texts back on."

export default function SmsConfirmationReminder({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <p style={{ fontSize: 12, color: '#9CA3AF', margin: '10px 0 0', lineHeight: 1.55 }}>
      {SMS_CONFIRMATION_REMINDER}
    </p>
  )
}
