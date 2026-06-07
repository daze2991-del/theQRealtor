import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(request: Request) {
  try {
    const { leadData } = await request.json()

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const timeOnPage = leadData.timeOnPageSec
      ? `${Math.floor(leadData.timeOnPageSec / 60)}m ${leadData.timeOnPageSec % 60}s`
      : null

    const userPrompt = [
      `Buyer: ${leadData.name}`,
      leadData.phone ? `Phone: ${leadData.phone}` : null,
      leadData.email ? `Email: ${leadData.email}` : null,
      leadData.contact_preference ? `Contact preference: ${leadData.contact_preference}` : null,
      `Property: ${leadData.propertyAddress}`,
      `Lead submitted: ${new Date(leadData.created_at).toLocaleString()}`,
      `Motivation level: ${leadData.motivation}`,
      leadData.notes ? `Buyer's question: "${leadData.notes}"` : null,
      '',
      'Engagement data:',
      `- Return visit: ${leadData.returnVisit ? 'Yes' : 'No'}`,
      leadData.photosViewed != null ? `- Photos viewed: ${leadData.photosViewed}` : null,
      timeOnPage ? `- Time on page: ${timeOnPage}` : null,
      leadData.ctaClicked ? `- Action taken: ${leadData.ctaClicked === 'showing' ? 'Requested a showing' : 'Asked a question'}` : null,
    ].filter(Boolean).join('\n')

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: `You are a real estate buyer intelligence assistant. Given a buyer's engagement data, write a brief buyer summary for the listing agent. Start with one sentence describing the buyer's engagement level. Then list 4-6 specific engagement facts as short bullet points (e.g. 'Returned to the property page 3 times', 'Viewed 14 photos', 'Spent 6 minutes on page', 'Requested disclosures', 'Asked a question', 'Requested a showing'). End with a Recommended Action: a single sentence telling the agent what to do next and why. Be direct and specific. Do not use generic language.

Format your response exactly like this:
[One sentence summary about engagement level]

• [Bullet point 1]
• [Bullet point 2]
• [Bullet point 3]
[more bullets as needed]

RECOMMENDED ACTION: [One direct sentence]`,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const parts = text.split(/RECOMMENDED ACTION:/i)
    const summary = parts[0].trim()
    const recommendedAction = parts[1]?.trim() ?? ''

    return NextResponse.json({ summary, recommendedAction })
  } catch (err: any) {
    console.error('[lead-summary]', err)
    return NextResponse.json({ error: err.message ?? 'Failed to generate summary' }, { status: 500 })
  }
}
