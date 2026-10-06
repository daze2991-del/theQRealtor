// The Settings page no longer offers a Hot-lead alert toggle, and the SMS
// Lead Alerts description reflects showing/question only.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'

const src = readFileSync(new URL('../app/dashboard/settings/page.tsx', import.meta.url), 'utf8')

describe('Settings page source: Hot-lead toggle removed', () => {
  it('has no "Hot lead alerts" row, and no Hot-lead state/handlers', () => {
    expect(src).not.toContain('Hot lead alerts')
    expect(src).not.toContain('notifyHotLead')
    expect(src).not.toContain('setNotifyHotLead')
    expect(src).not.toContain('notify_hot_lead')
  })

  it('the Lead Notifications list has exactly the showing and question rows', () => {
    const rowKeys = [...src.matchAll(/key:\s*'(showing|question|hot)'/g)].map(m => m[1])
    expect(rowKeys).toEqual(['showing', 'question'])
  })

  it('the SMS Lead Alerts description matches exactly', () => {
    expect(src).toContain('Get a text when a buyer requests a showing or asks a question.')
  })

  it('showing and question toggles are still present, unchanged', () => {
    expect(src).toContain('Showing requests')
    expect(src).toContain('Questions / info requests')
    expect(src).toContain('notifyShowing')
    expect(src).toContain('notifyQuestion')
  })
})
