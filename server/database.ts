import { diagnosticFetch } from './observability.js'
import { createClient } from '@supabase/supabase-js'
import { HttpError } from './http/security.js'

export function databaseConfig(env: NodeJS.ProcessEnv) {
  const url=env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const publicKey=env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY
  const secret=env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !publicKey || !secret) throw new HttpError(503, 'Account service is not configured', 'configuration')
  const parsed=new URL(url)
  if(parsed.protocol!=='https:' || parsed.username || parsed.password || parsed.pathname!=='/') throw new HttpError(503, 'Account service is not configured', 'configuration')
  return {url,publicKey,secret}
}
export function serviceDatabase(env: NodeJS.ProcessEnv) {
  const config=databaseConfig(env)
  return createClient(config.url,config.secret,{global:{fetch:diagnosticFetch('database','database')},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
}
