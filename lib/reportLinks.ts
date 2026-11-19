// Browser helper: the signed-in agent's own seller-report tokens, keyed by
// property id. Fetched from the server because report_token is no longer
// readable with the browser Supabase client (migration 070).
export async function fetchReportTokens(): Promise<Record<string, string>> {
  try {
    const res = await fetch('/api/properties/report-links')
    if (!res.ok) return {}
    const body = await res.json()
    return (body?.links ?? {}) as Record<string, string>
  } catch {
    return {}
  }
}

export function withReportTokens<T extends { id: string }>(rows: T[], tokens: Record<string, string>): (T & { report_token: string | null })[] {
  return rows.map(r => ({ ...r, report_token: tokens[r.id] ?? null }))
}
