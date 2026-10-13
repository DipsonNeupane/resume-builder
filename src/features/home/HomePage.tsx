import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, FileText, Search, Upload } from 'lucide-react';
import { ResumePreview } from '../../components/ResumePreview';
import { example, templates, type Resume } from '../../model';
import { PatinaHero } from './PatinaHero';
import { MatchShowcase } from './MatchShowcase';
import './landing.css';

const sample = example();
const featuredTemplateIds: Resume['template'][] = ['modern', 'compact', 'boardroom', 'stackline', 'scholar', 'primer'];
const featuredTemplates = templates.filter(template => featuredTemplateIds.includes(template.id));
// The suggestion reworks the sample's own summary using only experience it already lists.
const suggested = 'Customer experience specialist who supports customers across email, phone and live chat, simplifies everyday support processes, and helps new team members build confidence.';
type Props = { onBuild: () => void; onUpload: () => void; onJobs: () => void; onCompare: () => void; onPro: () => void; onTemplate: (template: Resume['template']) => void };

export function HomePage({ onBuild, onUpload, onJobs, onCompare, onPro, onTemplate }: Props) {
 const [previewTemplate, setPreviewTemplate] = useState<Resume['template']>('modern');
 const sheet = useRef<HTMLDivElement>(null);
 // The light sheet rises over the petrol Match section and its fold settles as it
 // lands. Under reduced motion it simply sits in place.
 useEffect(() => {
  const el = sheet.current;
  if (!el) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0;
  const frame = () => {
   raf = 0;
   const top = el.getBoundingClientRect().top;
   const t = reduced ? 1 : Math.min(1, Math.max(0, (window.innerHeight - top) / (window.innerHeight * 0.85)));
   el.style.setProperty('--t', t.toFixed(3));
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', kick);
  kick();
  return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', kick); window.removeEventListener('resize', kick); };
 }, []);
 return <main className="landing landing-approved-c landing-approved-wine" id="main-content">
  <PatinaHero onBuild={onBuild}/>
  <section className="landing-starts" aria-labelledby="start-heading">
   <div className="landing-starts-heading"><p className="section-label">Start with what you have</p><h2 id="start-heading">Three clear ways in.</h2><p>Start with your resume, a blank page, or a job description. Your master resume stays unchanged.</p></div>
   <div className="start-card-grid">
    <article><Upload aria-hidden="true"/><h3>Upload my resume</h3><p>Upload a Word or text-based PDF. It is read in your browser and requires your review.</p><button className="text-button" onClick={onUpload}>Choose a resume file<ArrowRight size={16} aria-hidden="true"/></button></article>
    <article><FileText aria-hidden="true"/><h3>Build from scratch</h3><p>Build a master resume with 7 Free templates, PDF, and editable Word export.</p><button className="text-button" onClick={onBuild}>Build a resume free<ArrowRight size={16} aria-hidden="true"/></button></article>
    <article><Search aria-hidden="true"/><h3>Start with a job</h3><p>Paste a job description and compare each requirement with your resume.</p><a className="text-button" href="/tools/resume-job-match/" onClick={onCompare}>Compare resume and job<ArrowRight size={16} aria-hidden="true"/></a></article>
   </div>
   <ul className="product-proof-strip" aria-label="Product facts">
    <li><Check aria-hidden="true"/>Your master stays unchanged</li>
    <li><Check aria-hidden="true"/>PDF and editable Word</li>
    <li><Check aria-hidden="true"/>No payment card to start</li>
    <li><Check aria-hidden="true"/>A4, Letter and right-to-left</li>
   </ul>
  </section>
  <section className="evidence-story landing-match" id="how-it-works">
   <div><p className="section-label">Match Analysis · requirement by requirement</p><p>See each job requirement beside supporting resume evidence—or a clear note when none is shown. You decide whether the role deserves more effort.</p><a className="button outline" href="/tools/resume-job-match/" onClick={onCompare}>Compare my resume with a job<ArrowRight size={16} aria-hidden="true"/></a></div>
   <p className="landing-sources">Search <strong>190+ job portals</strong> and employer career sites using your resume or your own criteria.</p>
   <MatchShowcase/>
   <dl className="evidence-key">
    <div><dt><span className="evidence-dot strength"/>Clearly demonstrated</dt><dd>A line of your resume supports the requirement.</dd></div>
    <div><dt><span className="evidence-dot review"/>Worth reviewing</dt><dd>Partly shown. A little more context may make it clear.</dd></div>
    <div><dt><span className="evidence-dot unknown"/>Not demonstrated</dt><dd>Your resume doesn’t show it yet. That isn’t a verdict on you.</dd></div>
    <div><dt><span className="evidence-dot conflict"/>Confirmed incompatibility</dt><dd>Only when you’ve said you don’t have something the role requires.</dd></div>
   </dl>
  </section>
  <div className="landing-sheet" ref={sheet}>
  <section className="landing-tailor">
   <div className="section-introduction"><h2>Tailor a separate resume for the roles you choose.</h2><p>Pro creates a separate resume for the job and suggests changes grounded in your existing content. Accept, reject, or edit each suggestion. Your master stays unchanged.</p><button className="text-button" onClick={onPro}>Tailor a saved job with Pro<ArrowRight size={16} aria-hidden="true"/></button></div>
   <div className="tailor-proof" aria-hidden="true">
    <div className="tailor-master"><span className="tailor-tag">Your original resume · unchanged</span><p>{sample.summary}</p></div>
    <div className="tailor-version">
     <span className="tailor-tag is-copper">Separate version · Customer Support Team Lead</span>
     <p className="tailor-label">Suggested change · Profile</p>
     <p className="tailor-after"><ins>{suggested}</ins></p>
     <p className="tailor-why">Draws on three lines already in your experience.</p>
     <div className="tailor-actions"><span className="is-on">Accept</span><span>Reject</span><span>Edit myself</span></div>
    </div>
   </div>
  </section>
  <section className="landing-connected">
   <h2>Resume → Job → Evidence → Your decision → Tailored version → Export and apply</h2>
   <div className="landing-connected-actions"><button className="text-button" onClick={onBuild}>Build my master resume<ArrowRight size={16} aria-hidden="true"/></button><button className="text-button" onClick={onJobs}>Find opportunities<ArrowRight size={16} aria-hidden="true"/></button></div>
  </section>
  <section className="landing-templates" id="templates">
   <div className="section-introduction"><p className="section-label">Documents</p><h2>Explore 27<br/>resume templates.</h2><p>Choose from 7 Free and 20 Premium designs. Every template supports A4, US Letter, and right-to-left text.</p><a className="text-button" href="/templates/">Browse all 27 templates<ArrowRight size={16} aria-hidden="true"/></a></div>
   <div className="template-specimen" aria-label={`Fictional sample in the ${previewTemplate} template`}><ResumePreview resume={{...sample,template:previewTemplate}}/></div>
   <div className="template-gallery" aria-label="Preview a curated selection of resume templates">{featuredTemplates.map(t=><button className="template-choice" data-previewing={previewTemplate===t.id} onFocus={()=>setPreviewTemplate(t.id)} onMouseEnter={()=>setPreviewTemplate(t.id)} key={t.id} onClick={()=>onTemplate(t.id)}><span><strong>{t.label}</strong><small>{t.tagline}</small></span><ArrowRight size={16} aria-hidden="true"/></button>)}</div>
  </section>
  </div>
  <section className="landing-pricing" id="pricing">
   <div className="section-introduction"><h2>Choose the access<br/><em>you need.</em></h2></div>
   <div className="plan-comparison"><article><span className="section-label">Free</span><h3>Build, compare, organize, and track.</h3><p className="plan-price"><strong>$0</strong><span>no subscription</span></p><ul><li><Check aria-hidden="true"/>The complete builder and all 7 Free templates</li><li><Check aria-hidden="true"/>7 PDF or Word downloads per rolling 7 days</li><li><Check aria-hidden="true"/>3 manual refreshes per rolling 24 hours, up to 10 relevant results each</li><li><Check aria-hidden="true"/>Optional fresh automatic refresh about every 24 hours</li><li><Check aria-hidden="true"/>Save and track up to 10 applications, with a Match preview</li></ul><p className="plan-note">A free account is required for downloads and jobs. The browser-only evidence checker works without an account.</p><button className="button outline" onClick={onBuild}>Build my master resume<ArrowRight size={16} aria-hidden="true"/></button></article>
   <article className="plan-pro"><span className="section-label">Pro</span><h3>Full Match Analysis and job-specific resumes.</h3><p className="plan-price"><strong>US$14.99</strong><span>/month</span></p><ul><li><Check aria-hidden="true"/>All 27 templates</li><li><Check aria-hidden="true"/>Full requirement-level Match Analysis</li><li><Check aria-hidden="true"/>Advanced job search and a separate resume for each saved job</li><li><Check aria-hidden="true"/>AI-assisted suggestions you accept, reject or rewrite</li></ul><p className="plan-note">Renews until cancelled; paid access continues through the billing period. New subscriptions are US-only. Fair-use limits apply.</p><button className="button" onClick={onPro}>View Pro options<ArrowRight size={16} aria-hidden="true"/></button></article></div>
  </section>
  <footer className="landing-footer"><div><strong>APWICO</strong><p>Evidence before effort.</p></div><div><a href="mailto:support@apwico.com">support@apwico.com</a><nav aria-label="Site links"><a href="/features/">How it works</a><a href="/tools/">Free tools</a><a href="/resources/">Resources</a><a href="/pricing/">Pricing</a><a href="/trust/">Trust</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms &amp; refunds</a></nav></div></footer>
 </main>;
}
