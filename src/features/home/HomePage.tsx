import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, FileText, Search, Upload } from 'lucide-react';
import { PaginatedResumePreview } from '../../components/ResumePreview';
import { example, templates, type Resume } from '../../model';
import { PatinaHero } from './PatinaHero';
import { MatchShowcase } from './MatchShowcase';
import { launchFacts } from '../../content/launchFacts';
import { fixtures } from '../../../template-library/fixtures';
import './landing.css';

const sample = example();
const previewSamples = Object.fromEntries(fixtures.map(fixture => [fixture.id, fixture.resume()]));
const previewFamilies: Partial<Record<Resume['template'], string>> = { boardroom: 'executive', stackline: 'engineer', scholar: 'academic', primer: 'graduate' };
const featuredTemplateIds: Resume['template'][] = ['modern', 'compact', 'boardroom', 'stackline', 'scholar', 'primer'];
const featuredTemplates = templates.filter(template => featuredTemplateIds.includes(template.id));
// The suggestion reworks the sample's own summary using only experience it already lists.
const suggested = 'Customer experience specialist who supports customers across email, phone and live chat, simplifies everyday support processes, and helps new team members build confidence.';
type Props = { onBuild: () => void; onUpload: () => void; onJobs: () => void; onCompare: () => void; onPro: () => void; onTemplate: (template: Resume['template']) => void; onFindJobs: () => void; onOrganize: () => void };

export function HomePage({ onBuild, onUpload, onJobs, onCompare, onPro, onTemplate, onFindJobs, onOrganize }: Props) {
 const [previewTemplate, setPreviewTemplate] = useState<Resume['template']>('modern');
 const previewResume = { ...(previewSamples[previewFamilies[previewTemplate] ?? ''] ?? sample), template: previewTemplate };
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
   <div className="landing-starts-heading"><p className="section-label">Your next step</p><h2 id="start-heading">Where would you like to start?</h2><p>Bring your current resume, create a new one, or check a job you’re interested in.</p></div>
   <div className="start-card-grid">
    <article><Upload aria-hidden="true"/><h3>Upload my resume</h3><p>Import a Word document or a PDF with selectable text. Review the details before continuing. Your file is read in your browser.</p><button className="text-button" onClick={onUpload}>Choose a resume file<ArrowRight size={16} aria-hidden="true"/></button></article>
    <article><FileText aria-hidden="true"/><h3>Build from scratch</h3><p>Choose from 7 free templates and add your experience. Download your resume as a PDF or Word document.</p><button className="text-button" onClick={onBuild}>Build a resume free<ArrowRight size={16} aria-hidden="true"/></button></article>
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
   <div><p className="section-label">Match Analysis · requirement by requirement</p><p>See how your resume matches the job requirements and what you may need to explain.</p><a className="button outline" href="/tools/resume-job-match/" onClick={onCompare}>Compare my resume with a job<ArrowRight size={16} aria-hidden="true"/></a></div>
   <p className="landing-sources">Search <strong>190+ job portals</strong> and employer career sites using your resume or your own criteria.</p>
   <MatchShowcase/>
   <dl className="evidence-key">
    <div><dt><span className="evidence-dot strength"/>Shown in your resume</dt><dd>A line of your resume supports the requirement.</dd></div>
    <div><dt><span className="evidence-dot review"/>Possibly relevant—check this</dt><dd>Partly shown. A little more context may make it clear.</dd></div>
    <div><dt><span className="evidence-dot unknown"/>Not found in your resume</dt><dd>You may have this experience even if it isn’t listed.</dd></div>
    <div><dt><span className="evidence-dot conflict"/>You said you don’t meet this requirement</dt><dd>Only when you’ve said you don’t have something the role requires.</dd></div>
   </dl>
  </section>
  <div className="landing-sheet" ref={sheet}>
  <section className="landing-tailor">
   <div className="section-introduction"><h2>Tailor a separate resume for the roles you choose.</h2><p>Pro creates a separate resume for the job and suggests edits based on what you’ve written. Accept, reject, or edit each suggestion. Your master stays unchanged.</p><button className="text-button" onClick={onPro}>Tailor a saved job with Pro<ArrowRight size={16} aria-hidden="true"/></button></div>
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
   <figure className="home-template-preview" aria-label={`Fictional sample in the ${previewTemplate} template`}><div className="template-first-page" aria-hidden="true" inert><PaginatedResumePreview resume={previewResume}/></div><figcaption>Fictional sample · First page</figcaption><button className="text-button" onClick={()=>onTemplate(previewTemplate)}>Use this template<ArrowRight size={16} aria-hidden="true"/></button></figure>
   <div className="template-gallery" aria-label="Preview a curated selection of resume templates">{featuredTemplates.map(t=><button className="template-choice" data-previewing={previewTemplate===t.id} aria-pressed={previewTemplate===t.id} aria-label={`Preview ${t.label}`} key={t.id} onClick={()=>setPreviewTemplate(t.id)}><span><strong>{t.label}</strong><small>{t.tagline}</small></span><ArrowRight size={16} aria-hidden="true"/></button>)}</div>
  </section>
  </div>
  <section className="landing-pricing" id="pricing">
   <div className="section-introduction"><h2>Start free.<br/><em>Make it yours with Pro.</em></h2></div>
   <div className="plan-comparison"><article><span className="section-label">Free</span><h3>Get your job search organized.</h3><p className="plan-price"><strong>$0</strong><span>no subscription</span></p><ul><li><Check aria-hidden="true"/>Resume builder and 7 free templates</li><li><Check aria-hidden="true"/>{launchFacts.freeDownloads.count} PDF or Word downloads per rolling {launchFacts.freeDownloads.windowDays} days</li><li><Check aria-hidden="true"/>{launchFacts.freeManualRefreshes.count} job searches per rolling {launchFacts.freeManualRefreshes.windowHours} hours, up to {launchFacts.freeResultsPerRefresh} results each</li><li><Check aria-hidden="true"/>Track up to {launchFacts.freeApplications} applications</li><li><Check aria-hidden="true"/>One tailoring trial for one job, with {launchFacts.freeTrialAiRuns} successful AI runs</li></ul><p className="plan-note">No payment card needed. Create a free account to search for jobs, save applications, and download your resume.</p><button className="button outline" onClick={onBuild}>Build my master resume<ArrowRight size={16} aria-hidden="true"/></button></article>
   <article className="plan-pro"><span className="section-label">Pro</span><h3>Tailor your resume for each job.</h3><p className="plan-price"><strong>{launchFacts.proMonthlyPrice}</strong><span>/month</span></p><ul><li><Check aria-hidden="true"/>All 27 templates</li><li><Check aria-hidden="true"/>See how your experience matches each job requirement</li><li><Check aria-hidden="true"/>Up to {launchFacts.proResultsPerSearch} results per search and a separate resume for each saved job</li><li><Check aria-hidden="true"/>Review, edit, or reject every AI suggestion</li></ul><p className="plan-note">Billed monthly. Cancel anytime and keep Pro until the end of your billing period. Available in the US. Fair-use limits apply.</p><button className="button" onClick={onPro}>View Pro options<ArrowRight size={16} aria-hidden="true"/></button></article></div>
  </section>
  <footer className="landing-footer"><div><strong>APWICO</strong><p>Evidence before effort.</p></div><div><a href="mailto:support@apwico.com">support@apwico.com</a><nav aria-label="Site links"><a href="/features/">How it works</a><a href="/tools/">Free tools</a><a href="/resources/">Resources</a><a href="/pricing/">Pricing</a><a href="/trust/">Trust</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms &amp; refunds</a></nav></div></footer>
 </main>;
}
