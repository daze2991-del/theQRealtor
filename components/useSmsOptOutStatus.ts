'use client'

import { useEffect, useState } from 'react'

// Client hook over GET /api/sms/opt-out-status. Several dashboard components
// mount at once (layout banner, leads list, Needs Your Attention), so
// concurrent calls share one request, and a result is reused for a few
// seconds. Any failure resolves to "nothing opted out" — this is display only;
// sending is guarded server-side regardless.

export interface SmsOptOutStatus {
  textsOffLeadIds: ReadonlySet<string>
  ownAlertsPaused: boolean
  loaded: boolean
}

const EMPTY: SmsOptOutStatus = { textsOffLeadIds: new Set(), ownAlertsPaused: false, loaded: false }
const REUSE_MS = 15_000

let inflight: Promise<SmsOptOutStatus> | null = null
let cached: { at: number; value: SmsOptOutStatus } | null = null

async function load(): Promise<SmsOptOutStatus> {
  try {
    const res = await fetch('/api/sms/opt-out-status', { cache: 'no-store' })
    if (!res.ok) return { ...EMPTY, loaded: true }
    const body = await res.json() as { textsOffLeadIds?: unknown; ownAlertsPaused?: unknown }
    const ids = Array.isArray(body.textsOffLeadIds) ? body.textsOffLeadIds.filter((x): x is string => typeof x === 'string') : []
    return { textsOffLeadIds: new Set(ids), ownAlertsPaused: body.ownAlertsPaused === true, loaded: true }
  } catch {
    return { ...EMPTY, loaded: true }
  }
}

function getStatus(): Promise<SmsOptOutStatus> {
  if (cached && Date.now() - cached.at < REUSE_MS) return Promise.resolve(cached.value)
  if (!inflight) {
    inflight = load().then(value => {
      cached = { at: Date.now(), value }
      inflight = null
      return value
    })
  }
  return inflight
}

export function useSmsOptOutStatus(): SmsOptOutStatus {
  const [status, setStatus] = useState<SmsOptOutStatus>(EMPTY)
  useEffect(() => {
    let cancelled = false
    getStatus().then(s => { if (!cancelled) setStatus(s) })
    return () => { cancelled = true }
  }, [])
  return status
}
