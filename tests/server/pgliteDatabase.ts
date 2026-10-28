/** A fresh local PGlite database with every migration applied, plus a minimal stand-in for
 * the Supabase service client's `rpc()` so the real server handlers can run against the
 * real SQL functions. Local and offline only: nothing here connects to a hosted project.
 * It does not substitute for hosted Auth, PostgREST or network behavior. */
import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'

const migrationsDir = new URL('../../supabase/migrations/', import.meta.url)

export async function migratedDatabase(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(`
    create role anon nologin; create role service_role nologin bypassrls; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, instance_id uuid, aud text, role text, email text,
      encrypted_password text, email_confirmed_at timestamptz, created_at timestamptz, updated_at timestamptz,
      raw_app_meta_data jsonb, raw_user_meta_data jsonb, is_super_admin boolean);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`)
  for (const file of (await readdir(migrationsDir)).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(file, migrationsDir), 'utf8'))
  }
  return db
}

type RpcResult = { data: unknown; error: { message: string; code?: string } | null }
const shapes = new Map<string, { set: boolean; composite: boolean; json: Set<string> }>()

/** Supabase-shaped results: a scalar function returns its value, a single-row composite an
 * object, and a set-returning function an array of rows. Errors carry message and SQLSTATE. */
export function rpcClient(db: PGlite, calls: string[] = []) {
  return {
    async rpc(name: string, args: Record<string, unknown> = {}): Promise<RpcResult> {
      calls.push(name)
      if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`unsafe rpc name ${name}`)
      let shape = shapes.get(name)
      if (!shape) {
        const found = await db.query<{ set: boolean; typtype: string; names: string[] | null; types: string[] }>(`select p.proretset as set, t.typtype, p.proargnames as names,
          p.proargtypes::regtype[]::text[] as types from pg_proc p join pg_type t on t.oid = p.prorettype
          join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1 limit 1`, [name])
        const row = found.rows[0]
        if (!row) return { data: null, error: { message: `function ${name} not found`, code: '42883' } }
        const json = new Set((row.names ?? []).filter((_, i) => row.types[i] === 'jsonb' || row.types[i] === 'json'))
        shape = { set: row.set, composite: row.typtype === 'c', json }
        shapes.set(name, shape)
      }
      const keys = Object.keys(args)
      const json = shape.json
      const values = keys.map(key => { const value = args[key]; return value !== null && value !== undefined && json.has(key) ? JSON.stringify(value) : value ?? null })
      const call = `public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(', ')})`
      try {
        const result = await db.query<Record<string, unknown>>(shape.set || shape.composite ? `select * from ${call}` : `select ${call} as value`, values)
        if (shape.set) return { data: result.rows, error: null }
        if (shape.composite) { const row = result.rows[0]; return { data: row && Object.values(row).some(v => v !== null) ? row : null, error: null } }
        return { data: result.rows[0]?.value ?? null, error: null }
      } catch (error) {
        const e = error as { message?: string; code?: string }
        return { data: null, error: { message: e.message ?? 'database error', code: e.code } }
      }
    },
  }
}
