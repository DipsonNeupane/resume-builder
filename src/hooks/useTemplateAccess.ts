import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

export type OfferSubscription = {
 subscriptionId: string;
 offerKey: string;
 kind: 'pro' | 'template';
 templateId: string | null;
 status: string;
 cancelAtPeriodEnd: boolean;
 currentPeriodEnd: string | null;
};

export type TemplateAccess = {
 isPro: boolean;
 activeTemplates: string[];
 subscriptions: OfferSubscription[];
 salesAvailable: boolean;
};

export type TemplateAccessState =
 | { status: 'loading' | 'unavailable'; access: null }
 | { status: 'ready'; access: TemplateAccess };

const guestAccess: TemplateAccess = { isPro: false, activeTemplates: [], subscriptions: [], salesAvailable: false };

function isAccess(value: unknown): value is TemplateAccess {
 if (!value || typeof value !== 'object') return false;
 const candidate = value as Partial<TemplateAccess>;
 return typeof candidate.isPro === 'boolean'
  && Array.isArray(candidate.activeTemplates)
  && candidate.activeTemplates.every(item => typeof item === 'string')
  && Array.isArray(candidate.subscriptions)
  && typeof candidate.salesAvailable === 'boolean';
}

/** One account-scoped access snapshot drives every Builder access label and action.
 * The server remains authoritative for checkout and document generation.
 */
export function useTemplateAccess(ownerId: string | null, enabled: boolean): TemplateAccessState {
 const [state, setState] = useState<TemplateAccessState>(() => ownerId ? { status: 'loading', access: null } : { status: 'ready', access: guestAccess });

 useEffect(() => {
  if (!enabled) return;
  if (!ownerId || !supabase) { setState({ status: 'ready', access: guestAccess }); return; }
  const client = supabase;
  const controller = new AbortController();
  setState({ status: 'loading', access: null });
  void (async () => {
   try {
    const before = (await client.auth.getSession()).data.session;
    if (before?.user.id !== ownerId) throw new Error('Account changed');
    const response = await fetch('/api/subscription-status', { headers: { Authorization: `Bearer ${before.access_token}` }, signal: controller.signal });
    if (!response.ok) throw new Error('Unavailable');
    const access: unknown = await response.json();
    if (!isAccess(access)) throw new Error('Invalid access response');
    const after = (await client.auth.getSession()).data.session;
    if (!controller.signal.aborted && after?.user.id === ownerId) setState({ status: 'ready', access });
   } catch {
    if (!controller.signal.aborted) setState({ status: 'unavailable', access: null });
   }
  })();
  return () => controller.abort();
 }, [enabled, ownerId]);

 return state;
}
