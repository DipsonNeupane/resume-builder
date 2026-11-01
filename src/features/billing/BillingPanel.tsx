import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../services/supabase';
import { trackProductEvent } from '../../services/analytics';
import { templates } from '../../model';
import { launchFacts } from '../../content/launchFacts';

type Subscription = { subscriptionId:string; offerKey:string; kind:'pro'|'template'; templateId:string|null; status:string; cancelAtPeriodEnd:boolean; currentPeriodEnd:string|null };
type BillingStatus = { isPro:boolean; activeTemplates:string[]; subscriptions:Subscription[]; salesAvailable:boolean };
type AppliedPilotCode = { code:string; remainingUses:number };

async function serverMessage(response:Response) {
 try { const body=await response.json(); return typeof body?.error==='string'?body.error:''; }
 catch { return ''; }
}

export function BillingPanel({ ownerId, surface='account' }: { ownerId:string; surface?:'account'|'purchase' }) {
 const [status,setStatus]=useState<BillingStatus|null>(null);
 const [message,setMessage]=useState('Checking billing…');
 const [consent,setConsent]=useState(false);
 const [overlapConsent,setOverlapConsent]=useState(false);
 const [promotionCode,setPromotionCode]=useState('');
 const [appliedPilotCode,setAppliedPilotCode]=useState<AppliedPilotCode|null>(null);
 const [codeState,setCodeState]=useState<'idle'|'checking'|'applied'|'invalid'|'error'>('idle');
 const [codeMessage,setCodeMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [busyAction,setBusyAction]=useState<'code'|'checkout'|'portal'|null>(null);
 const active=useRef(true),requestId=useRef(crypto.randomUUID());

 useEffect(()=>{
  active.current=true;
  const controller=new AbortController();
  (async()=>{
   try {
    const {data}=await supabase!.auth.getSession();
    if(data.session?.user.id!==ownerId)return;
    const response=await fetch('/api/subscription-status',{headers:{Authorization:`Bearer ${data.session.access_token}`},signal:controller.signal});
    if(!response.ok)throw new Error();
    const value=await response.json() as BillingStatus;
    if(typeof value.isPro!=='boolean'||typeof value.salesAvailable!=='boolean'||!Array.isArray(value.activeTemplates)||!Array.isArray(value.subscriptions))throw new Error();
    if(!controller.signal.aborted){setStatus(value);setMessage('');}
   } catch { if(!controller.signal.aborted)setMessage('Billing details are temporarily unavailable. Your resume remains available.'); }
  })();
  return()=>{active.current=false;controller.abort();};
 },[ownerId]);

 async function authorizedPost(path:string,body:unknown){
  const {data}=await supabase!.auth.getSession();
  if(data.session?.user.id!==ownerId)throw new Error('Sign in again');
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify(body)});
  if(!response.ok)throw new Error(await serverMessage(response)||'Request could not be completed.');
  return response.json();
 }

 function editPromotionCode(value:string){
  setPromotionCode(value);
  setAppliedPilotCode(null);
  setCodeState('idle');
  setCodeMessage('');
  setConsent(false);
  setMessage('');
  requestId.current=crypto.randomUUID();
 }

 async function applyPromotionCode(){
  if(busy)return;
  const requested=promotionCode.trim();
  if(!requested){setCodeState('invalid');setCodeMessage('Enter a pilot access code first.');return;}
  setBusy(true);setBusyAction('code');setCodeState('checking');setCodeMessage('Checking this code…');setMessage('');
  try{
   const result=await authorizedPost('/api/validate-pilot-code',{code:requested});
   if(result?.valid!==true||typeof result.code!=='string'||result.discountPercent!==100||result.duration!=='forever'||result.maxRedemptions!==3||typeof result.timesRedeemed!=='number')throw new Error('We couldn’t confirm the discount. Please check the code and try again.');
   const remainingUses=Math.max(0,result.maxRedemptions-result.timesRedeemed);
   setPromotionCode(result.code);
   setAppliedPilotCode({code:result.code,remainingUses});
   setCodeState('applied');
   setCodeMessage(`100% off accepted · ${remainingUses} of 3 uses left. Stripe checks availability at checkout.`);
   setConsent(false);
  }catch(error){
   setAppliedPilotCode(null);
   setCodeState('invalid');
   setCodeMessage(error instanceof Error&&error.message?error.message:'That code could not be checked. Try again.');
  }finally{if(active.current){setBusy(false);setBusyAction(null);}}
 }

 async function start(){
  if(busy||!consent||!status?.salesAvailable||(status.activeTemplates.length>0&&!overlapConsent))return;
  const typedCode=promotionCode.trim();
  if(typedCode&&(!appliedPilotCode||typedCode.toLowerCase()!==appliedPilotCode.code.toLowerCase())){
   setCodeState('invalid');
   setCodeMessage('Apply this code to check the discount, or clear the field to continue at the regular price.');
   return;
  }
  setBusy(true);setBusyAction('checkout');setMessage('');
  try{
   const result=await authorizedPost('/api/subscription-checkout',{requestId:requestId.current,offerKey:'pro:monthly',renewalConsent:true,overlapConsent:status.activeTemplates.length>0?overlapConsent:false,...(appliedPilotCode?{promotionCode:appliedPilotCode.code}:{})});
   const destination=new URL(result.url);
   if(destination.origin!=='https://checkout.stripe.com')throw new Error();
   trackProductEvent('checkout_started',{surface:surface==='purchase'?'pricing':'account',user_state:'authenticated',plan:'Pro'});
   window.location.assign(destination.href);
  }catch(error){if(active.current)setMessage(error instanceof Error&&error.message?error.message:'Checkout could not open.');}
  finally{if(active.current){setBusy(false);setBusyAction(null);}}
 }

 async function portal(){
  if(busy)return;setBusy(true);setBusyAction('portal');setMessage('');
  try{const result=await authorizedPost('/api/customer-portal',{});const destination=new URL(result.url);if(destination.protocol!=='https:')throw new Error();window.location.assign(destination.href);}
  catch(error){if(active.current)setMessage(error instanceof Error&&error.message?error.message:'The billing portal could not open.');}
  finally{if(active.current){setBusy(false);setBusyAction(null);}}
 }

 if(!status)return surface==='purchase'?<section className="billing-panel" aria-label="Secure checkout"><h2>Secure checkout</h2><p role="status">{message}</p></section>:null;
 const activeSubscriptions=status.subscriptions.filter(item=>['active','trialing','past_due','unpaid'].includes(item.status));
 const pro=activeSubscriptions.find(item=>item.kind==='pro');
 const templateSubscriptions=activeSubscriptions.filter(item=>item.kind==='template');
 const templateName=(id:string|null)=>templates.find(item=>item.id===id)?.label??'Premium template';
 const endDate=(value:string|null)=>{if(!value)return 'the paid period';const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(undefined,{dateStyle:'medium'}).format(date):'the paid period';};
 const codeNeedsApply=Boolean(promotionCode.trim())&&(!appliedPilotCode||promotionCode.trim().toLowerCase()!==appliedPilotCode.code.toLowerCase());

 return <section className="billing-panel" aria-label="Plan and billing">
  <h2>{surface==='purchase'?'Start Pro':'Plan and billing'}</h2>
  {status.isPro
   ?<><p>Pro includes all 27 templates.</p>{pro&&<p>{pro.cancelAtPeriodEnd?`Renewal off · access through ${pro.currentPeriodEnd?new Date(pro.currentPeriodEnd).toLocaleDateString():'the current period'}.`:pro.status==='trialing'?`Free trial ends ${pro.currentPeriodEnd?new Date(pro.currentPeriodEnd).toLocaleDateString():'in 30 days'} · then US$14.99/month.`:`Renews monthly${pro.currentPeriodEnd?` · next ${new Date(pro.currentPeriodEnd).toLocaleDateString()}`:''}.`}</p>}<button className="button outline" disabled={busy} onClick={portal}>{busy?'Opening…':'Manage billing'}</button></>
   :<>
    <p>Your plan: Free.</p>
    {status.activeTemplates.length>0&&<p className="helper-box"><strong>Pro includes every Premium template.</strong> After your first Pro payment, {status.activeTemplates.length} individual plan{status.activeTemplates.length===1?'':'s'} will stop renewing. Paid access continues through each billing period.</p>}
    <p>All 27 templates, PDF/Word downloads, job matching and resume suggestions.</p>
    {surface==='purchase'&&<div className="pro-checkout-price" aria-live="polite"><strong>{launchFacts.proTrialDays} days free</strong><span>{appliedPilotCode?'then US$0/month with this code':'then US$14.99/month'}</span></div>}
    <label className="field"><span>Pilot access code (optional)</span><input autoComplete="off" maxLength={80} value={promotionCode} disabled={busy} onChange={event=>editPromotionCode(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void applyPromotionCode();}}} aria-describedby="pilot-code-feedback" placeholder="Enter a code" /></label>
    <button className="button outline" type="button" disabled={busy||!promotionCode.trim()||codeState==='applied'} onClick={()=>void applyPromotionCode()}>{codeState==='checking'?'Checking code…':codeState==='applied'?'Code applied':'Apply code'}</button>
    <p id="pilot-code-feedback" className={`field-hint pilot-code-feedback${codeState==='applied'?' is-success':''}${codeState==='invalid'||codeState==='error'?' is-error':''}`} role="status" aria-live="polite">
     {codeMessage||'Apply a code to see your price. Checkout starts only when you continue.'}
    </p>
    {appliedPilotCode&&<p className="field-hint">Code active · US$0/month while subscribed. Check the price in Stripe before subscribing.</p>}
    <label className="checkbox-field"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/>{appliedPilotCode?`I agree to a ${launchFacts.proTrialDays}-day free trial, then US$0/month with this code while active.`:`I agree to a ${launchFacts.proTrialDays}-day free trial, then US$14.99/month until cancelled.`}</label>
    {status.activeTemplates.length>0&&<label className="checkbox-field"><input type="checkbox" checked={overlapConsent} onChange={event=>setOverlapConsent(event.target.checked)}/>After my first Pro payment, stop renewals for my {status.activeTemplates.length} individual template plan{status.activeTemplates.length===1?'':'s'}. Keep their paid access through each billing period.</label>}
    <button className="button" disabled={!consent||busy||!status.salesAvailable||(status.activeTemplates.length>0&&!overlapConsent)||codeNeedsApply} onClick={start}>{busyAction==='checkout'?'Opening secure checkout…':'Review price in secure checkout'}</button>
    <p className="field-hint">US only · Cancel before the trial ends to avoid a charge. <a href="/terms.html">Terms and refund policy</a>.</p>
    {!status.salesAvailable&&<p className="field-hint">New paid subscriptions are not available right now.</p>}
   </>}
  {templateSubscriptions.length>0&&<div className="billing-template-access"><h3>Individual template subscriptions</h3><ul>{templateSubscriptions.map(item=><li key={item.subscriptionId}><strong>{templateName(item.templateId)}</strong><span>{item.cancelAtPeriodEnd?`Renewal off · access through ${endDate(item.currentPeriodEnd)}.`:item.status==='active'||item.status==='trialing'?`Renews at US$1.99/month${item.currentPeriodEnd?` · ${endDate(item.currentPeriodEnd)}`:''}.`:`Payment needs attention · manage billing to review.`}</span></li>)}</ul><p>After access ends, new Premium downloads need Pro. Your resume and past downloads remain yours.</p><button className="button outline" disabled={busy} onClick={portal}>Manage subscriptions</button></div>}
  {message&&<p role="status">{message}</p>}
  {status.isPro&&<p className="field-hint">US only · Cancel anytime · <a href="/terms.html">Terms and refunds</a></p>}
  <p className="field-hint"><a href="/pricing/">Compare Free and Pro</a> before choosing access.</p>
 </section>;
}
