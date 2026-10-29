import { HttpError } from '../http/security.ts'

export type ProviderBudgetDatabase = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }> }

export async function reserveProviderRequest(db: ProviderBudgetDatabase, owner: string | null, kind: 'manual'|'automatic'|'pro_page_2'): Promise<void> {
  const result = await db.rpc('jobs_reserve_provider_request', { p_owner: owner, p_kind: kind })
  const data = result.data as Record<string, unknown> | null
  if (result.error || !data || typeof data.allowed !== 'boolean') throw new HttpError(503, 'Fresh job search capacity is temporarily unavailable')
  if (!data.allowed) {
    if (data.reason === 'rate') throw new HttpError(429, 'Another fresh job search is starting. Wait a moment and try again.', 'provider_rate_limit')
    throw new HttpError(429, 'APWICO’s monthly fresh-search capacity has been reached. Saved jobs and existing results remain available; fresh results resume when the monthly provider allowance resets.', 'rate_limit')
  }
}
