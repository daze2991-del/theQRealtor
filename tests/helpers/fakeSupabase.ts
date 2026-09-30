// Shared in-memory fake of the slice of supabase-js used by lib/twilio.ts and
// app/api/submit-lead. Tests only — never touches a real database.

export type Row = Record<string, any>

export function makeFakeDb() {
  const tables: Record<string, Row[]> = {}
  const failReads = new Set<string>()
  const queries: { table: string; op: string; filters: string[] }[] = []
  let seq = 0

  function from(table: string) {
    const st = {
      op: 'select' as 'select' | 'insert' | 'update',
      payload: null as Row | null,
      filters: [] as ((r: Row) => boolean)[],
      filterDesc: [] as string[],
      order: null as { c: string; asc: boolean } | null,
      limit: null as number | null,
      single: null as 'single' | 'maybe' | null,
      head: false,
      returning: false,
    }
    const exec = () => {
      const rows = (tables[table] ??= [])
      queries.push({ table, op: st.op, filters: st.filterDesc })
      const matched = () => rows.filter(r => st.filters.every(f => f(r)))

      if (st.op === 'select') {
        if (failReads.has(table)) return { data: null, count: null, error: { message: `simulated ${table} read failure` } }
        let out = matched()
        if (st.order) {
          const { c, asc } = st.order
          out = [...out].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1))
        }
        if (st.limit !== null) out = out.slice(0, st.limit)
        if (st.head) return { data: null, count: out.length, error: null }
        if (st.single === 'maybe') return { data: out[0] ?? null, error: null }
        if (st.single === 'single') {
          return out[0] ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
        }
        return { data: out, error: null }
      }
      if (st.op === 'insert') {
        const row = { id: `row-${++seq}`, created_at: new Date().toISOString(), ...st.payload }
        rows.push(row)
        return { data: st.returning ? (st.single ? row : [row]) : null, error: null }
      }
      const hit = matched()
      hit.forEach(r => Object.assign(r, st.payload))
      return { data: st.returning ? hit : null, error: null }
    }
    const filter = (desc: string, f: (r: Row) => boolean) => { st.filters.push(f); st.filterDesc.push(desc); return b }
    const b: any = {
      select(_cols?: string, opts?: { head?: boolean }) {
        if (st.op === 'select') { if (opts?.head) st.head = true } else st.returning = true
        return b
      },
      insert(p: Row) { st.op = 'insert'; st.payload = p; return b },
      update(p: Row) { st.op = 'update'; st.payload = p; return b },
      eq: (c: string, v: unknown) => filter(`${c}=${v}`, r => r[c] === v),
      is: (c: string, v: unknown) => filter(`${c} is ${v}`, r => (r[c] ?? null) === v),
      not: (c: string, _op: string, v: unknown) => filter(`${c} not ${v}`, r => (r[c] ?? null) !== v),
      lte: (c: string, v: any) => filter(`${c}<=${v}`, r => r[c] <= v),
      gte: (c: string, v: any) => filter(`${c}>=${v}`, r => r[c] >= v),
      order(c: string, o?: { ascending?: boolean }) { st.order = { c, asc: o?.ascending !== false }; return b },
      limit(n: number) { st.limit = n; return b },
      single() { st.single = 'single'; return Promise.resolve(exec()) },
      maybeSingle() { st.single = 'maybe'; return Promise.resolve(exec()) },
      then: (res: any, rej: any) => Promise.resolve(exec()).then(res, rej),
    }
    return b
  }
  return { client: { from } as any, tables, failReads, queries }
}
