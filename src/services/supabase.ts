import { diagnosticAuthFetch } from './diagnostics';
import { createClient } from '@supabase/supabase-js';

// Only a publishable key belongs in the browser. Never configure a service-role key here.
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const authConfigured = Boolean(url && key);
export const supabase = authConfigured ? createClient(url!, key!, {
  global: { fetch: diagnosticAuthFetch },
  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
}) : null;
