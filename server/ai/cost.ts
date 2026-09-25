/** Pinned initial candidate, subject to quality acceptance before enabling AI.
 * Official model page checked 2026-09-19: $0.40 input / $1.60 output per 1M.
 * https://developers.openai.com/api/docs/models/gpt-4.1-mini
 * Charge cached input at full price conservatively. No tools or images allowed.
 */
export const AI_MODEL = 'gpt-4.1-mini-2025-04-14'
export const MAX_OUTPUT_TOKENS = 3000
export const MAX_INPUT_BYTES = 40000
export function costMicroUsd(inputTokens: number, outputTokens: number): number {
  if (![inputTokens,outputTokens].every(v=>Number.isSafeInteger(v)&&v>=0)) throw new Error('Invalid usage')
  const result=Math.ceil((inputTokens*4+outputTokens*16)/10)
  if (!Number.isSafeInteger(result)) throw new Error('Invalid cost')
  return result
}
/** UTF-8 bytes conservatively bound text tokens; include framing headroom.
 * Caller must pass ALL serialized input, instructions and schema, and retain
 * reservation on timeout/unknown usage. Provider hard cap remains a second gate.
 */
export function reserveCost(serializedRequest: string): number {
  const bytes=new TextEncoder().encode(serializedRequest).byteLength
  if(bytes>MAX_INPUT_BYTES) throw new Error('AI input too large')
  return costMicroUsd(bytes+4096,MAX_OUTPUT_TOKENS)
}
