import { ArrowLeft, Check, ShieldCheck } from 'lucide-react';
import { BillingPanel } from './BillingPanel';

type Props = { ownerId: string | null; onBack: () => void; onSignIn: () => void };

export function ProPage({ ownerId, onBack, onSignIn }: Props) {
 return <main className="pro-page" id="main-content"><section className="pro-page-shell">
  <button className="back-link" onClick={onBack}><ArrowLeft size={15}/>Back to home</button>
  <div className="pro-page-grid">
   <div className="pro-page-intro">
    <span className="price-tag">PRO PASS</span>
    <h1>A promising role. A considered application.</h1>
    <p>Get 30 days of ResumeStride Pro for US$19.99. Choose a one-time pass by default, or deliberately opt in to automatic renewal.</p>
    <ul>
     <li><Check size={18}/>Full Match Analysis, requirement by requirement</li>
     <li><Check size={18}/>Up to 20 job results per search, with no once-a-day limit</li>
     <li><Check size={18}/>A separate resume for each saved job, with AI suggestions you accept, reject or edit</li>
     <li><Check size={18}/>PDF and Word downloads included</li>
    </ul>
    <p className="pro-outcome">Understand the match → review each suggestion → download your tailored resume. Your master stays separate. All seven templates remain Free.</p>
    <div className="pro-page-trust"><ShieldCheck size={20}/><span>Checkout is handled securely by Stripe. Fair-use limits apply.</span></div>
   </div>
   <aside className="pro-checkout-card" aria-label="Pro purchase options">
    <div className="pro-checkout-price"><strong>US$19.99</strong><span>/ 30 days</span></div>
    {ownerId?<BillingPanel key={ownerId} ownerId={ownerId} surface="purchase"/>:<><h2>Sign in to continue</h2><p>Your Pro pass will be connected to your ResumeStride account.</p><button className="button" onClick={onSignIn}>Sign in or create account</button></>}
   </aside>
  </div>
 </section></main>;
}
