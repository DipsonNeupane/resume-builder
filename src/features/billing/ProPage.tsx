import { ArrowLeft, Check, ShieldCheck } from 'lucide-react';
import { BillingPanel } from './BillingPanel';
import { launchFacts } from '../../content/launchFacts';

type Props = { ownerId: string | null; onBack: () => void; onSignIn: () => void };

export function ProPage({ ownerId, onBack, onSignIn }: Props) {
 return <main className="pro-page" id="main-content"><section className="pro-page-shell">
  <button className="back-link" onClick={onBack}><ArrowLeft size={15}/>Back to home</button>
  <div className="pro-page-grid">
   <div className="pro-page-intro">
    <h1>Get APWICO Pro</h1>
    <p>{launchFacts.proTrialDays} days free, then US$14.99/month. Cancel anytime before the trial ends.</p>
    <ul>
     <li><Check size={18}/>Full match details for every requirement</li>
     <li><Check size={18}/>Up to 20 job results per search</li>
     <li><Check size={18}/>A separate resume for each job, with edits you control</li>
     <li><Check size={18}/>PDF and Word downloads included</li>
    </ul>
    <div className="pro-page-trust"><ShieldCheck size={20}/><span>Secure checkout · Fair-use limits apply</span></div>
    <p className="field-hint"><a href="/pricing/">Compare plans</a> · <a href="/trust/">Privacy</a></p>
   </div>
   <aside className="pro-checkout-card" aria-label="Pro purchase options">
    {!ownerId&&<div className="pro-checkout-price"><strong>{launchFacts.proMonthlyPrice}</strong><span>/month after {launchFacts.proTrialDays} free days</span></div>}
    {ownerId?<BillingPanel key={ownerId} ownerId={ownerId} surface="purchase"/>:<><h2>Sign in to continue</h2><p>Sign in or create a free account to start.</p><button className="button" onClick={onSignIn}>Sign in or create account</button></>}
   </aside>
  </div>
 </section></main>;
}
