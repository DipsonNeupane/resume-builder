import { ArrowLeft, Check, ShieldCheck } from 'lucide-react';
import { BillingPanel } from './BillingPanel';

type Props = { ownerId: string | null; onBack: () => void; onSignIn: () => void };

export function ProPage({ ownerId, onBack, onSignIn }: Props) {
 return <main className="pro-page" id="main-content"><section className="pro-page-shell">
  <button className="back-link" onClick={onBack}><ArrowLeft size={15}/>Back to home</button>
  <div className="pro-page-grid">
   <div className="pro-page-intro">
    <h1>Get APWICO Pro</h1>
    <p>APWICO Pro is US$19.99/month and renews until cancelled. Access continues through the paid billing period.</p>
    <ul>
     <li><Check size={18}/>Full Match Analysis, requirement by requirement</li>
     <li><Check size={18}/>Up to 20 job results per search, with no once-a-day limit</li>
     <li><Check size={18}/>A separate resume for each saved job, with AI suggestions you accept, reject or edit</li>
     <li><Check size={18}/>PDF and Word downloads included</li>
    </ul>
    <div className="pro-page-trust"><ShieldCheck size={20}/><span>Checkout is handled securely by Stripe. Fair-use limits apply.</span></div>
    <p className="field-hint"><a href="/pricing/">Compare plans</a> or review <a href="/trust/">Trust and privacy</a>.</p>
   </div>
   <aside className="pro-checkout-card" aria-label="Pro purchase options">
    <div className="pro-checkout-price"><strong>US$19.99</strong><span>/month</span></div>
    {ownerId?<BillingPanel key={ownerId} ownerId={ownerId} surface="purchase"/>:<><h2>Sign in to continue</h2><p>Sign in to connect Pro to your account. Signing in does not start checkout.</p><button className="button" onClick={onSignIn}>Sign in or create account</button></>}
   </aside>
  </div>
 </section></main>;
}
