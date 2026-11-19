// The slice of supabase-js the Stripe routes use (from().select/insert/update,
// .eq, .limit, .maybeSingle), executed as real SQL against the in-memory
// Postgres from tests/helpers/planDb.ts. Every statement runs with
// auth.role() = 'service_role' — exactly what the production service-role
// client presents — so trg_protect_profile_entitlements and the 067 downgrade
// trigger run for real on every webhook write.
//
// failNext(table, op) makes the next matching statement return a PostgREST-
// shaped error without touching the database.

import type { PGlite } from '@electric-sql/pglite'

type Op = 'select' | 'insert' | 'update'
type Result = { data: any; error: { code?: string; message: string } | null }

export function makePgSupabase(db: PGlite) {
  const failures: { table: string; op: Op }[] = []
  const log: { table: string; op: Op; values?: Record<string, unknown> }[] = []

  async function run(sql: string, params: unknown[]): Promise<{ rows: any[]; error: Result['error'] }> {
    try {
      await db.query(`select set_config('test.role', 'service_role', false)`)
      const r = await db.query(sql, params)
      return { rows: r.rows as any[], error: null }
    } catch (e: any) {
      return { rows: [], error: { code: e?.code, message: e?.message ?? String(e) } }
    } finally {
      await db.query(`select set_config('test.role', '', false)`)
    }
  }

  function from(table: string) {
    let op: Op = 'select'
    let cols = '*'
    let values: Record<string, unknown> = {}
    const where: [string, unknown][] = []
    let limit: number | null = null
    let single = false

    const exec = async (): Promise<Result> => {
      log.push({ table, op, values: op === 'select' ? undefined : values })
      const i = failures.findIndex(f => f.table === table && f.op === op)
      if (i >= 0) {
        failures.splice(i, 1)
        return { data: null, error: { code: 'XX000', message: `simulated ${op} failure on ${table}` } }
      }
      const params: unknown[] = []
      const p = (v: unknown) => { params.push(v); return `$${params.length}` }
      const whereSql = where.length ? ' where ' + where.map(([c, v]) => `${c} = ${p(v)}`).join(' and ') : ''
      let sql: string
      if (op === 'select') {
        sql = `select ${cols} from public.${table}${whereSql}${limit !== null ? ` limit ${limit}` : ''}`
      } else if (op === 'insert') {
        const keys = Object.keys(values)
        const vals = keys.map(k => p(jsonish(values[k])))
        sql = `insert into public.${table} (${keys.join(', ')}) values (${vals.join(', ')})`
      } else {
        const sets = Object.keys(values).map(k => `${k} = ${p(jsonish(values[k]))}`)
        sql = `update public.${table} set ${sets.join(', ')}${whereSql}`
      }
      const { rows, error } = await run(sql, params)
      if (error) return { data: null, error }
      if (op !== 'select') return { data: null, error: null }
      return { data: single ? rows[0] ?? null : rows, error: null }
    }

    const b: any = {
      select(c = '*') { op = 'select'; cols = c; return b },
      insert(v: Record<string, unknown>) { op = 'insert'; values = v; return b },
      update(v: Record<string, unknown>) { op = 'update'; values = v; return b },
      eq(c: string, v: unknown) { where.push([c, v]); return b },
      limit(n: number) { limit = n; return b },
      maybeSingle() { single = true; return exec() },
      single() { single = true; return exec() },
      then(res: (r: Result) => unknown, rej?: (e: unknown) => unknown) { return exec().then(res, rej) },
    }
    return b
  }

  // auth.admin.getUserById — what lib/billingEmail.ts uses to find the
  // recipient. Register addresses in `users`; `failUserLookup` simulates an error.
  const users = new Map<string, string>()
  const auth = {
    admin: {
      getUserById: async (id: string) => {
        if (failUserLookup.throws) throw new Error('simulated auth lookup crash')
        if (failUserLookup.on) return { data: { user: null }, error: { message: 'simulated auth lookup failure' } }
        const email = users.get(id)
        return { data: { user: email ? { id, email } : null }, error: null }
      },
    },
  }
  const failUserLookup = { on: false, throws: false }

  return {
    client: { from, auth } as any,
    log,
    users,
    failUserLookup,
    failNext(table: string, op: Op) { failures.push({ table, op }) },
  }
}

const jsonish = (v: unknown) => (v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v)
