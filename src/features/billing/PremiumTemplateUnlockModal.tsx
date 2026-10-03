import { Lock } from 'lucide-react';
import { useRef, useState } from 'react';
import { Modal } from '../../components/Modal';
import { templates, type PremiumTemplateId } from '../../model';
import { trackProductEvent } from '../../services/analytics';
import { supabase } from '../../services/supabase';
import type { TemplateAccess } from '../../hooks/useTemplateAccess';
import { commercialPolicy } from '../../content/commercial';

type Props = {
 templateId: PremiumTemplateId;
 ownerId: string | null;
 access: TemplateAccess | null;
 onClose: () => void;
 onSignIn: () => void;
 onViewPro: () => void;
};

export function PremiumTemplateUnlockModal({ templateId, ownerId, access, onClose, onSignIn, onViewPro }: Props) {
 const [consent, setConsent] = useState(false);
 const [busy, setBusy] = useState(false);
 const [message, setMessage] = useState('');
 const requestId = useRef(crypto.randomUUID());
 const template = templates.find(item => item.id === templateId)!;

 async function checkout() {
  if (!ownerId) { onClose(); onSignIn(); return; }
  if (!consent || busy || !supabase || !access?.salesAvailable) return;
  setBusy(true); setMessage('');
  try {
   const { data } = await supabase.auth.getSession();
   if (data.session?.user.id !== ownerId) throw new Error('Sign in again before subscribing.');
   const response = await fetch('/api/subscription-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ requestId: requestId.current, offerKey: `template:${templateId}`, renewalConsent: true }) });
   const result = await response.json();
   if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Checkout could not open.');
   const url = new URL(result.url);
   if (url.origin !== 'https://checkout.stripe.com') throw new Error('Checkout could not open.');
   trackProductEvent('checkout_started', { surface: 'builder', user_state: 'authenticated', plan: 'Free' });
   window.location.assign(url.href);
  } catch (error) {
   setMessage(error instanceof Error ? error.message : 'Checkout could not open.');
  } finally { setBusy(false); }
 }

 return <Modal className="premium-unlock-modal" labelledBy="premium-unlock-title" describedBy="premium-unlock-description" onClose={onClose}>
  <span className="price-tag"><Lock size={13} aria-hidden="true" /> PREMIUM</span>
  <h2 id="premium-unlock-title">Unlock {template.label}</h2>
  <p id="premium-unlock-description">{template.label} is US$1.99/month and renews until cancelled. It includes PDF and editable Word downloads with this template, subject to fair-use limits.</p>
  <dl className="premium-choice-summary" aria-label="Access choices"><div><dt>Free</dt><dd>Keep previewing, choose any Free design, and do not purchase.</dd></div><div><dt>One design</dt><dd>US$1.99/month for {template.label} only.</dd></div><div><dt>Pro</dt><dd>US$19.99/month for all Premium designs plus Pro features.</dd></div></dl>
  {!ownerId ? <><p>Sign in to start this subscription. {template.label} will remain selected.</p><button className="button" onClick={()=>{onClose();onSignIn();}}>Sign in to unlock</button></> : access?.isPro ? <p>This template is already included with Pro.</p> : <>
   <label className="checkbox-field"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} />I agree to a recurring US$1.99 monthly subscription for {template.label}. It renews until I cancel; cancellation stops renewal and access continues through the paid period.</label>
   <button className="button" disabled={!consent || busy || !access?.salesAvailable} onClick={checkout}>{busy ? 'Opening…' : 'Continue to secure checkout'}</button>
   <p className="field-hint">New paid subscriptions are available only in the United States. {commercialPolicy.templateAfterCancellation}</p>
   {!access?.salesAvailable && <p className="field-hint">New paid subscriptions are not available right now.</p>}
  </>}
  <button className="button outline" onClick={()=>{onClose();onViewPro();}}>Get Pro — all Premium templates</button>
  {message && <p role="status">{message}</p>}
  <a href="/pricing/">Compare every access path and export policy</a>
  <button className="text-button" onClick={onClose}>Keep previewing — no purchase</button>
 </Modal>;
}
