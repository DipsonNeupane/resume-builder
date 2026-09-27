import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../services/supabase';
import { trackProductEvent } from '../../services/analytics';

// Mirrors the four "in force" statuses server/billing SQL's
// billing_lookup_owner_subscription itself filters to — a status outside
// this set (e.g. 'canceled') can never come back from that RPC, so an
// unrecognized value here means the response should not be trusted.
const KNOWN_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'unpaid'] as const;
type SubscriptionState = { subscriptionId: string; status: typeof KNOWN_SUBSCRIPTION_STATUSES[number]; cancelAtPeriodEnd: boolean };
type BillingStatus = { isPro: boolean; paidThrough: string | null; manualPassAvailable: boolean; recurringAvailable: boolean; subscription: SubscriptionState | null };

function isSubscriptionState(value: unknown): value is SubscriptionState {
 if (!value || typeof value !== 'object') return false;
 const v = value as Record<string, unknown>;
 return typeof v.subscriptionId === 'string' && v.subscriptionId.length > 0
  && typeof v.status === 'string' && (KNOWN_SUBSCRIPTION_STATUSES as readonly string[]).includes(v.status)
  && typeof v.cancelAtPeriodEnd === 'boolean';
}

export function BillingPanel({ ownerId, surface='account' }: { ownerId: string; surface?: 'account'|'purchase' }) {
 const [status,setStatus]=useState<BillingStatus|null>(null);
 const [message,setMessage]=useState('Checking purchase availability…');
 const [busy,setBusy]=useState(false);
 const [subscribeBusy,setSubscribeBusy]=useState(false);
 const [cancelBusy,setCancelBusy]=useState(false);
 // Unchecked by default on every mount (including an account switch, since
 // AuthPanel remounts this component with key={user.id}) — the recurring
 // option is never pre-selected; the one-time pass remains the default path.
 const [renewalOptIn,setRenewalOptIn]=useState(false);
 const active=useRef(true), inFlight=useRef(false), subscribeInFlight=useRef(false), cancelInFlight=useRef(false);
 const requestId=useRef(crypto.randomUUID()), subscribeRequestId=useRef(crypto.randomUUID());
 useEffect(()=>{
  active.current=true; setStatus(null); setMessage('Checking purchase availability…'); setRenewalOptIn(false);
  const controller=new AbortController();
  async function load(){
   try {
    const {data}=await supabase!.auth.getSession();
    if(data.session?.user.id!==ownerId) return;
    const response=await fetch('/api/billing-status',{headers:{Authorization:`Bearer ${data.session.access_token}`},signal:controller.signal});
    if(!response.ok) throw new Error();
    const result:BillingStatus=await response.json();
    if(
     (result.isPro&&result.paidThrough===null)||typeof result.isPro!=='boolean'||typeof result.manualPassAvailable!=='boolean'||typeof result.recurringAvailable!=='boolean'
     ||(result.paidThrough!==null&&(typeof result.paidThrough!=='string'||!Number.isFinite(Date.parse(result.paidThrough))))
     ||(result.subscription!==null&&!isSubscriptionState(result.subscription))
    ) throw new Error();
    if(!controller.signal.aborted){setStatus(result);setMessage('');if(result.isPro)trackProductEvent('pro_activated',{surface:surface==='purchase'?'pricing':'account',user_state:'authenticated',plan:'Pro'});}
   } catch {if(!controller.signal.aborted)setMessage('Purchases are not available yet. Your resume remains available.');}
  }
  void load();
  return ()=>{active.current=false;controller.abort();};
 },[ownerId]);
 async function purchase(){
  if(inFlight.current||!status?.manualPassAvailable||status.subscription||!supabase)return;
  inFlight.current=true;setBusy(true);setMessage('');
  try {
   const {data}=await supabase.auth.getSession();
   if(data.session?.user.id!==ownerId) throw new Error();
   const response=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify({requestId:requestId.current})});
   if(!response.ok)throw new Error();
   const result=await response.json();
   const destination=new URL(result.url);
   if(destination.origin!=='https://checkout.stripe.com')throw new Error();
   // Re-check account after the asynchronous checkout; never redirect a new user.
   const current=await supabase.auth.getSession();
   if(active.current&&current.data.session?.user.id===ownerId){trackProductEvent('checkout_started',{surface:surface==='purchase'?'pricing':'account',user_state:'authenticated',plan:status.isPro?'Pro':'Free'});window.location.assign(destination.href);}
  } catch {if(active.current)setMessage('Checkout could not open. Retry safely, or contact support if you already paid.');}
  finally{inFlight.current=false;if(active.current)setBusy(false);}
 }
 // Reads a server-provided error message from a non-OK JSON response.
 // server/http/security.ts's safeError only ever puts caller-safe, already
 // user-facing text in this field (e.g. "You already have an active
 // subscription.") — a network-level failure with no parseable body falls
 // back to a generic message below instead.
 async function readServerMessage(response: Response): Promise<string> {
  try { const body=await response.json(); return typeof body?.error==='string'?body.error:''; } catch { return ''; }
 }
 async function subscribe(){
  if(subscribeInFlight.current||!status?.recurringAvailable||status.subscription||status.isPro||!renewalOptIn||!supabase)return;
  subscribeInFlight.current=true;setSubscribeBusy(true);setMessage('');
  try {
   const {data}=await supabase.auth.getSession();
   if(data.session?.user.id!==ownerId) throw new Error();
   const response=await fetch('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify({requestId:subscribeRequestId.current,renewalOptIn:true})});
   if(!response.ok){const serverMessage=await readServerMessage(response);throw new Error(serverMessage);}
   const result=await response.json();
   const destination=new URL(result.url);
   if(destination.origin!=='https://checkout.stripe.com')throw new Error();
   const current=await supabase.auth.getSession();
   if(active.current&&current.data.session?.user.id===ownerId){trackProductEvent('checkout_started',{surface:surface==='purchase'?'pricing':'account',user_state:'authenticated',plan:'Free'});window.location.assign(destination.href);}
  } catch(error){if(active.current)setMessage(error instanceof Error&&error.message?error.message:'Checkout could not open. Retry safely, or contact support if you already paid.');}
  finally{subscribeInFlight.current=false;if(active.current)setSubscribeBusy(false);}
 }
 async function cancel(){
  if(cancelInFlight.current||!status?.subscription||status.subscription.cancelAtPeriodEnd||!supabase)return;
  const subscriptionId=status.subscription.subscriptionId;
  cancelInFlight.current=true;setCancelBusy(true);setMessage('');
  try {
   const {data}=await supabase.auth.getSession();
   if(data.session?.user.id!==ownerId) throw new Error();
   const response=await fetch('/api/cancel-subscription',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify({subscriptionId})});
   if(!response.ok){const serverMessage=await readServerMessage(response);throw new Error(serverMessage);}
   const result=await response.json();
   if(result.renewalStopped!==true) throw new Error();
   // Never redirect away or reload — just reflect the new state, and only if
   // the account/subscription this response is for is still the one showing.
   if(active.current) setStatus(current=>current&&current.subscription?.subscriptionId===subscriptionId ? {...current,subscription:{...current.subscription,cancelAtPeriodEnd:true}} : current);
  } catch(error){if(active.current)setMessage(error instanceof Error&&error.message?error.message:'Cancellation could not be confirmed. Retry safely, or contact support if the charge repeats.');}
  finally{cancelInFlight.current=false;if(active.current)setCancelBusy(false);}
 }
 if(!status)return surface==='purchase'?<section className="billing-panel" aria-label="Secure checkout"><h2>Secure checkout</h2><p role="status">{message}</p></section>:null;
 const subscription=status?.subscription??null;
 const willRenew=subscription?.status==='active' && !subscription.cancelAtPeriodEnd;
 const statusLabel=subscription&&(subscription.status==='active'?'active':subscription.status==='trialing'?'in trial':subscription.status==='past_due'?'past due — check your payment method':'unpaid — check your payment method');
 return <section className="billing-panel" aria-label="Pro pass"><h2>{surface==='purchase'?'Choose your payment option':'Plan and billing'}</h2>
  {status&&<>
   <p>{status.isPro?`Pro access until ${new Date(status.paidThrough!).toLocaleString()}.`:'You’re on the Free plan.'}</p>
   {subscription
    ? <div className="field">
       <p>Automatic renewal is {statusLabel}{subscription.cancelAtPeriodEnd?', but turned off. You’ll keep the access you already paid for, then it will end.':willRenew?'. It renews automatically every 30 days at US$19.99 until you cancel.':'.'}</p>
       {!subscription.cancelAtPeriodEnd&&<button className="button outline" disabled={cancelBusy} onClick={cancel}>{cancelBusy?'Turning off…':'Turn off automatic renewal'}</button>}
      </div>
    : <>
       {status.manualPassAvailable&&<><p>US$19.99 for 30 days. One-time payment. No automatic renewal. Buying early adds 30 days after your current pass.</p><button className="button" disabled={busy} onClick={purchase}>{busy?'Opening secure checkout…':status.isPro?'Add 30 days — US$19.99':'Buy 30-day Pro pass — US$19.99'}</button></>}
       {status.recurringAvailable&&(status.isPro
        ? <p className="field-hint">Automatic renewal isn’t available yet while your one-time pass is active. It will be offered again once your paid time expires.</p>
        : <div className="field checkbox-field">
           <label>
            <input type="checkbox" checked={renewalOptIn} disabled={subscribeBusy} onChange={event=>setRenewalOptIn(event.target.checked)} />
            Instead, charge me US$19.99 automatically every 30 days until I cancel.
           </label>
           <button className="button outline" disabled={!renewalOptIn||subscribeBusy} onClick={subscribe}>{subscribeBusy?'Opening secure checkout…':'Start automatic renewal — US$19.99 / 30 days'}</button>
          </div>
       )}
      </>
   }
  </>}
  {message&&<p role="status">{message}</p>}
 <p className="field-hint">Review our <a href="/terms.html">terms and refund policy</a> before purchasing.</p></section>;
}
