import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, FileText, Search, Upload } from 'lucide-react';
import { ResumePreview } from '../../components/ResumePreview';
import { example, templates, type Resume } from '../../model';
import { PatinaHero } from './PatinaHero';
import { MatchShowcase } from './MatchShowcase';
import { launchFacts } from '../../content/launchFacts';
import './landing.css';

const sample = example();
const featuredTemplateIds: Resume['template'][] = ['modern', 'compact', 'boardroom', 'stackline', 'scholar', 'primer'];
const featuredTemplates = templates.filter(template => featuredTemplateIds.includes(template.id));
// The suggestion reworks the sample's own summary using only experience it already lists.
const suggested = 'Customer experience specialist who supports customers across email, phone and live chat, simplifies everyday support processes, and helps new team members build confidence.';
type Props = { onBuild: () => void; onUpload: () => void; onJobs: () => void; onCompare: () => void; onPro: () => void; onTemplate: (template: Resume['template']) => void; onFindJobs: () => void; onOrganize: () => void };

export function HomePage({ onBuild, onUpload, onJobs, onCompare, onPro, onTemplate, onFindJobs, onOrganize }: Props) {
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
  <PatinaHero onBuild={onBuild} onFindJobs={onFindJobs} onOrganize={onOrganize}/>
  <section className="landing-starts" aria-labelledby="start-heading">
   <div className="landing-starts-heading"><p className="section-label">Pick a starting point</p><h2 id="start-heading">Start where you are.</h2><p>Upload a resume, build one, or compare it with a job.</p></div>
   <div className="start-card-grid">
    <article><Upload aria-hidden="true"/><h3>Bring a resume</h3><p>Upload a Word file or text PDF. Review it before saving.</p><button className="text-button" onClick={onUpload}>Choose a resume file<ArrowRight size={16} aria-hidden="true"/></button></article>
    <article><FileText aria-hidden="true"/><h3>Build from scratch</h3><p>Choose a free layout and download PDF or Word.</p><button className="text-button" onClick={onBuild}>Build a resume free<ArrowRight size={16} aria-hidden="true"/></button></article>
    <article><Search aria-hidden="true"/><h3>Start with a job</h3><p>Compare job requirements with your resume.</p><a className="text-button" href="/tools/resume-job-match/" onClick={onCompare}>Compare resume and job<ArrowRight size={16} aria-hidden="true"/></a></article>
   </div>
   <ul className="product-proof-strip" aria-label="Product facts">
    <li><Check aria-hidden="true"/>Tailored versions stay separate</li>
    <li><Check aria-hidden="true"/>Download PDF or editable Word</li>
    <li><Check aria-hidden="true"/>Start free, no card needed</li>
    <li><Check aria-hidden="true"/>A4, US Letter, and right-to-left</li>
   </ul>
  </section>
  <section className="evidence-story landing-match" id="how-it-works">
   <div><p className="section-label">Match Analysis</p><p>Compare each job requirement with your resume. You decide whether to apply.</p><a className="button outline" href="/tools/resume-job-match/" onClick={onCompare}>Compare my resume with a job<ArrowRight size={16} aria-hidden="true"/></a></div>
   <p className="landing-sources">Search <strong>190+ job sites</strong> with your resume or your own criteria.</p>
   <MatchShowcase/>
   <dl className="evidence-key">
    <div><dt><span className="evidence-dot strength"/>Evidence found</dt><dd>Your resume shows this.</dd></div>
    <div><dt><span className="evidence-dot review"/>Related evidence</dt><dd>Review the connection.</dd></div>
    <div><dt><span className="evidence-dot unknown"/>Not in your resume</dt><dd>That doesn’t mean you lack it.</dd></div>
    <div><dt><span className="evidence-dot conflict"/>You marked a mismatch</dt><dd>Only you can confirm this.</dd></div>
   </dl>
  </section>
  <div className="landing-sheet" ref={sheet}>
  <section className="landing-tailor">
   <div className="section-introduction"><h2>Tailor a separate resume for the roles you choose.</h2><p>Pro suggests edits from your experience. Review each one; your original stays unchanged.</p><button className="text-button" onClick={onPro}>Tailor a saved job with Pro<ArrowRight size={16} aria-hidden="true"/></button></div>
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
   <div className="section-introduction"><p className="section-label">Documents</p><h2>Explore 27<br/>resume templates.</h2><p>7 free designs and 20 premium designs, in A4 or US Letter.</p><a className="text-button" href="/templates/">Browse templates<ArrowRight size={16} aria-hidden="true"/></a></div>
   <div className="template-specimen" aria-label={`Fictional sample in the ${previewTemplate} template`}><ResumePreview resume={{...sample,template:previewTemplate}}/></div>
   <div className="template-gallery" aria-label="Preview a curated selection of resume templates">{featuredTemplates.map(t=><button className="template-choice" data-previewing={previewTemplate===t.id} onFocus={()=>setPreviewTemplate(t.id)} onMouseEnter={()=>setPreviewTemplate(t.id)} key={t.id} onClick={()=>onTemplate(t.id)}><span><strong>{t.label}</strong><small>{t.tagline}</small></span><ArrowRight size={16} aria-hidden="true"/></button>)}</div>
  </section>
  </div>
  <section className="landing-pricing" id="pricing">
   <div className="section-introduction"><h2>Plans for every stage<br/><em>of your search.</em></h2></div>
   <div className="plan-comparison"><article><span className="section-label">Free</span><h3>Build a resume and keep your search organized.</h3><p className="plan-price"><strong>$0</strong><span>no subscription</span></p><ul><li><Check aria-hidden="true"/>Resume builder and 7 free templates</li><li><Check aria-hidden="true"/>{launchFacts.freeDownloads.count} PDF or Word downloads every {launchFacts.freeDownloads.windowDays} days</li><li><Check aria-hidden="true"/>{launchFacts.freeManualRefreshes.count} job searches every {launchFacts.freeManualRefreshes.windowHours} hours · up to {launchFacts.freeResultsPerRefresh} results each</li><li><Check aria-hidden="true"/>Track {launchFacts.freeApplications} applications with match previews</li><li><Check aria-hidden="true"/>Tailor one resume for one job · up to {launchFacts.freeTrialAiRuns} suggestions</li></ul><p className="plan-note">Free account for downloads, job search and tracking. Compare a pasted job without one.</p><button className="button outline" onClick={onBuild}>Build a resume<ArrowRight size={16} aria-hidden="true"/></button></article>
   <article className="plan-pro"><span className="section-label">Pro</span><h3>See how your experience lines up with each job.</h3><p className="plan-price"><strong>{launchFacts.proMonthlyPrice}</strong><span>/month after {launchFacts.proTrialDays} free days</span></p><ul><li><Check aria-hidden="true"/>All 27 resume templates</li><li><Check aria-hidden="true"/>Match every job requirement</li><li><Check aria-hidden="true"/>Up to 20 results per search</li><li><Check aria-hidden="true"/>A separate resume for each job</li><li><Check aria-hidden="true"/>Review and edit resume suggestions</li></ul><p className="plan-note">{launchFacts.proTrialDays} days free, then {launchFacts.proMonthlyPrice}/month. Cancel before the trial ends. US only; fair-use limits apply.</p><button className="button" onClick={onPro}>Explore Pro<ArrowRight size={16} aria-hidden="true"/></button></article></div>
  </section>
  <footer className="landing-footer"><div><strong>APWICO</strong><p>Evidence before effort.</p></div><div><a href="mailto:support@apwico.com">support@apwico.com</a><nav aria-label="Site links"><a href="/features/">How it works</a><a href="/tools/">Free tools</a><a href="/resources/">Resources</a><a href="/pricing/">Pricing</a><a href="/trust/">Trust</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms &amp; refunds</a></nav></div></footer>
 </main>;
}
