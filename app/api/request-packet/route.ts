import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { createAdminSupabase } from '../../../lib/supabase-admin'

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { propertyId, email, name } = body as Record<string, unknown>

  if (!propertyId || !(email as string)?.trim() || !(email as string).includes('@')) {
    return NextResponse.json({ error: 'Missing or invalid fields.' }, { status: 400 })
  }

  const supabase = createAdminSupabase()

  const { data: property, error: propError } = await supabase
    .from('properties')
    .select('id, address, agent_phone, active')
    .eq('id', propertyId)
    .single()

  if (propError || !property || !property.active) {
    return NextResponse.json({ error: 'Property not found.' }, { status: 404 })
  }

  const { error: insertError } = await supabase.from('packet_requests').insert({
    property_id: propertyId,
    email:       (email as string).trim(),
    name:        (name as string)?.trim() || null,
  })

  if (insertError) {
    console.error('[request-packet] insert error:', insertError)
    return NextResponse.json({ error: 'Failed to save request. Please try again.' }, { status: 500 })
  }

  // SMS alert to agent
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const from       = process.env.TWILIO_PHONE_NUMBER

  if (property.agent_phone && accountSid && authToken && from) {
    const displayName = (name as string)?.trim()
    const senderLine  = displayName ? `${displayName} (${(email as string).trim()})` : (email as string).trim()
    try {
      await twilio(accountSid, authToken).messages.create({
        to:   property.agent_phone,
        from,
        body: `📄 Packet request from ${senderLine} for ${property.address}. They want the flyer and disclosures. Log in to theQRealtor to view. Reply STOP to opt out.`,
      })
    } catch (smsErr: any) {
      console.error('[request-packet] SMS error:', smsErr?.message)
    }
  }

  return NextResponse.json({ ok: true })
}
