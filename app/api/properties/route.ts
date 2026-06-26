import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { getBetaStatus } from '@/lib/beta'

export async function POST(req: Request) {
  const supabase = createServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('beta_joined_at')
    .eq('id', user.id)
    .single()

  const { expired } = getBetaStatus(profile?.beta_joined_at)
  if (expired) {
    return NextResponse.json({ error: 'Your beta has ended.' }, { status: 403 })
  }

  const { address, agent_name, agent_phone, city, state, price, beds, baths, description } = await req.json()

  const { data, error } = await supabase
    .from('properties')
    .insert({
      address,
      agent_name,
      agent_phone: agent_phone || null,
      city,
      state,
      price: price ? Number(price) : null,
      beds: beds ? Number(beds) : null,
      baths: baths ? Number(baths) : null,
      description,
      user_id: user.id,
      active: true,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Failed to create property.' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id })
}
