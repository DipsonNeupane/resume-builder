import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { ResumePreview } from '../../components/ResumePreview';
import { example, templates, type Resume } from '../../model';
import { PatinaHero } from './PatinaHero';
import { MatchShowcase } from './MatchShowcase';
import './landing.css';

const sample = example();
// The suggestion reworks the sample's own summary using only experience it already lists.
const suggested = 'Customer experience specialist who supports customers across email, phone and live chat, simplifies everyday support processes, and helps new team members build confidence.';
const connected = ['Your resume', 'Find or save a role', 'See the evidence', 'You decide', 'A separate version', 'Review each change', 'PDF or Word', 'Apply on the employer’s site'];
type Props = { onBuild: () => void; onUpload: () => void; onJobs: () => void; onPro: () => void; onTemplate: (template: Resume['template']) => void };

export function HomePage({ onBuild, onUpload, onJobs, onPro, onTemplate }: Props) {
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
 return <main className="landing" id="main-content">
  <PatinaHero sample={sample} onBuild={onBuild} onUpload={onUpload} onJobs={onJobs}/>
  <section className="evidence-story landing-match" id="how-it-works">
   <div><p className="section-label">Match Analysis · requirement by requirement</p><h2>Evidence<br/>before effort.</h2><p>Pick a role. Each requirement sits beside the line of your resume that supports it, or an honest note that nothing does yet. Then you decide whether it deserves your evening. It reads evidence. It doesn’t predict hiring.</p><button className="button outline" onClick={onJobs}>Find jobs and see the match<ArrowRight size={16} aria-hidden="true"/></button></div>
   <p className="landing-sources">Search from your resume or your own criteria. Opportunities are sourced across <strong>190+ job portals</strong> and employer career sites.</p>
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
   <div className="section-introduction"><p className="section-label">Only after you decide</p><h2>Worth it?<br/><em>Then tailor it.</em></h2><p>With Pro, a role you choose gets a separate version for this job. AI suggests changes that rework what you’ve already written. You accept, reject or rewrite each one. Your original resume stays unchanged.</p><button className="text-button" onClick={onPro}>Tailor a saved job with Pro<ArrowRight size={16} aria-hidden="true"/></button></div>
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
   <p className="section-label">Kept connected</p>
   <h2>Every step stays tied to the job it’s for.</h2>
   <ol>{connected.map((step, i) => <li key={step} data-decide={step === 'You decide' || undefined}><span>0{i + 1}</span>{step}</li>)}</ol>
   <div className="landing-connected-actions"><button className="text-button" onClick={onBuild}>Build my master resume<ArrowRight size={16} aria-hidden="true"/></button><button className="text-button" onClick={onJobs}>Find opportunities<ArrowRight size={16} aria-hidden="true"/></button></div>
  </section>
  <section className="landing-templates" id="templates">
   <div className="section-introduction"><p className="section-label">Documents</p><h2>7 layouts.<br/>PDF + Word.</h2><p>All seven templates are Free, with A4, US Letter and right-to-left support.</p></div>
   <div className="template-specimen" aria-label={`Fictional sample in the ${previewTemplate} template`}><ResumePreview resume={{...sample,template:previewTemplate}}/></div>
   <div className="template-gallery" aria-label="Choose a free resume template">{templates.map(t=><button className="template-choice" data-previewing={previewTemplate===t.id} onFocus={()=>setPreviewTemplate(t.id)} onMouseEnter={()=>setPreviewTemplate(t.id)} key={t.id} onClick={()=>onTemplate(t.id)}><span><strong>{t.label}</strong><small>{t.tagline}</small></span><ArrowRight size={16} aria-hidden="true"/></button>)}</div>
  </section>
  </div>
  <section className="landing-pricing" id="pricing">
   <div className="section-introduction"><p className="section-label">Free to build. Pro for an active search.</p><h2>Several openings.<br/><em>Limited evenings.</em></h2><p>Before you spend tonight rewriting resumes, see what your experience supports for each role, check what’s unclear, and prepare versions only for the ones you choose. Pro is a 30-day pass for that stretch of your search.</p></div>
   <div className="plan-comparison"><article><span className="section-label">Free</span><h3>Just need a resume? Build it free.</h3><p className="plan-price"><strong>$0</strong><span>to start</span></p><ul><li><Check aria-hidden="true"/>The complete builder and all 7 templates</li><li><Check aria-hidden="true"/>3 PDF or Word downloads per 30-day period</li><li><Check aria-hidden="true"/>1 job search every 24 hours, up to 5 results</li><li><Check aria-hidden="true"/>Save up to 3 jobs, with a Match Analysis preview</li></ul><p className="plan-note">A free account is required for downloads and jobs. PDF and Word share the same download allowance.</p><button className="button outline" onClick={onBuild}>Build my master resume<ArrowRight size={16} aria-hidden="true"/></button></article>
   <article className="plan-pro"><span className="section-label">Pro · 30-day pass</span><h3>From a promising role to a reviewed, job-specific resume.</h3><p className="plan-price"><strong>US$19.99</strong><span>/ 30 days</span></p><ul><li><Check aria-hidden="true"/>See the evidence behind every requirement before you commit</li><li><Check aria-hidden="true"/>A separate version for each saved job you decide to pursue</li><li><Check aria-hidden="true"/>Suggestions you accept, reject or rewrite, with your original resume untouched</li><li><Check aria-hidden="true"/>Download each version as PDF or Word, then apply on the employer’s site</li></ul><p className="plan-note">Includes up to 20 results per search with no once-a-day limit, and more saved jobs. One-time pass by default. Optional automatic renewal is never preselected. Fair-use limits apply.</p><button className="button" onClick={onPro}>View Pro options<ArrowRight size={16} aria-hidden="true"/></button></article></div>
  </section>
  <footer className="landing-footer"><div><strong>ResumeStride<span aria-hidden="true">↗</span></strong><p>Evidence before effort.</p></div><div><a href="mailto:support@resumestride.com">support@resumestride.com</a><nav aria-label="Site links"><a href="/tools/">Free tools</a><a href="/resources/">Resources</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms &amp; refunds</a></nav></div></footer>
 </main>;
}
