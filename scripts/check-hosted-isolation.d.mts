// Type declarations for check-hosted-isolation.mjs, so tests/server's
// TypeScript build (tsconfig.server.json) can import it without implicit
// `any`. Kept in sync by hand with the .mjs exports, same convention as this
// repo's other checked-in .d.ts files.

export type Resume = {
  version: 1
  name: string
  headline: string
  email: string
  phone: string
  location: string
  website: string
  summary: string
  skills: string
  profileHeading: string
  skillsHeading: string
  sections: Array<{
    id: string
    title: string
    kind?: 'experience' | 'optional'
    entries: Array<{ id: string; title: string; organization: string; location: string; dates: string; description: string }>
  }>
  template: 'modern' | 'classic' | 'minimal'
  paper: 'A4' | 'Letter'
  accent: string
  direction: 'ltr' | 'rtl'
  language: string
  noExperience: boolean
}

export type IsolationCheck = {
  name: string
  pass: boolean
  status?: number
  note?: string
  code?: string
  removed?: number
  expected?: number
}
export type IsolationResult = { ok: boolean; checks: IsolationCheck[]; runId: string }

export type FetchLike = (
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ status: number; ok?: boolean; text: () => Promise<string> }>

export const DEFAULT_ALLOWED_PROJECT_REF: string
export function assertProjectRef(supabaseUrl: string, allowedRef?: string): string
export function buildFixtureResume(runId: string): Resume
export function runIsolationChecks(config: {
  fetchImpl: FetchLike
  supabaseUrl: string
  apikey: string
  tokenA: string
  tokenB: string
}): Promise<IsolationResult>
