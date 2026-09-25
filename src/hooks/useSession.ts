import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

// Shared by AuthPanel (sign-in/out UI) and the builder (account-scoped cloud
// sync), so both react to the same session instead of keeping two independent
// listeners that could disagree about whether someone is signed in.
export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState('');
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) { setUser(session?.user ?? null); setLoading(false); }
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setError('Your sign-in link or session could not be restored. Request a new link below.');
      setUser(data.session?.user ?? null); setLoading(false);
    }).catch(() => { if (active) { setError('Unable to restore your session. Please try again.'); setLoading(false); } });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return { user, loading, error };
}
