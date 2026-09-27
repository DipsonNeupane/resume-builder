import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { ResumePreview } from '../../components/ResumePreview';
import { example, templates, type Resume } from '../../model';
import { PatinaHero } from './PatinaHero';
import { MatchShowcase } from './MatchShowcase';
import './landing.css';

const sample = example();
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
  <PatinaHero sample={sample} onBuild={onBuild} onUpload={onUpload}/>
  <section className="evidence-story landing-match">
   <div><p className="section-label">The evidence, before the effort</p><h2>“Not demonstrated”<br/>isn’t “not capable.”</h2><p>Match Analysis puts each requirement next to what your resume actually shows, so you can spot relevant experience, gaps worth filling and details worth adding before you apply. It reads evidence. It doesn’t predict hiring.</p><button className="button outline" onClick={onJobs}>Find jobs and see the match<ArrowRight size={16} aria-hidden="true"/></button></div>
   <MatchShowcase/>
   <dl className="evidence-key"><div><dt><span className="evidence-dot strength"/>Demonstrated</dt><dd>Experience in your resume supports the requirement.</dd></div><div><dt><span className="evidence-dot review"/>Worth reviewing</dt><dd>Partly shown. A little more context may make it clear.</dd></div><div><dt><span className="evidence-dot unknown"/>Not demonstrated</dt><dd>Your resume doesn’t show it yet. You may still have it.</dd></div></dl>
  </section>
  <div className="landing-sheet" ref={sheet}>
  <section className="landing-workflow" id="how-it-works">
   <div className="section-introduction"><p className="section-label">From what you’ve done to what’s next</p><h2>Don’t just send a resume.<br/>Know why you’re sending it.</h2><p>A clear application starts with a clear connection between your experience and the role.</p></div>
   <div className="workflow-spread">
    <div className="workflow-index"><span>01 — Build your foundation</span><h3>Start with the experience<br/>you already have.</h3><p>Work, study, research, projects, caregiving or volunteering. Give your experience a home, in your own words and your own language.</p><button className="text-button" onClick={onBuild}>Create your master resume<ArrowRight size={16} aria-hidden="true"/></button></div>
    <div className="workflow-index"><span>02 — Find the connection</span><h3>See what a role asks.<br/>See what your resume shows.</h3><p>Search opportunities sourced across 190+ job portals and employer career sites, then see the evidence behind each Strong match, Good match or Stretch. A missing detail is something to review, not a verdict on you.</p><button className="text-button" onClick={onJobs}>Find jobs<ArrowRight size={16} aria-hidden="true"/></button></div>
    <div className="workflow-index"><span>03 — Make it relevant</span><h3>Change the emphasis.<br/>Keep the truth.</h3><p>With Pro, a saved job gets its own separate resume while your master stays as it is. Compare each AI suggestion, accept what fits, reject what doesn’t, and edit any word yourself.</p><button className="text-button" onClick={onPro}>See tailoring with Pro<ArrowRight size={16} aria-hidden="true"/></button></div>
   </div>
  </section>
  <section className="landing-templates" id="templates">
   <div className="section-introduction"><p className="section-label">Seven designs. All yours.</p><h2>Let the work<br/>do the talking.</h2><p>Readable layouts for every occupation and career stage. All seven templates are Free, with A4, US Letter and right-to-left support.</p><div className="template-specimen" aria-label={`Fictional sample in the ${previewTemplate} template`}><ResumePreview resume={{...sample,template:previewTemplate}}/></div><p className="template-preview-caption">Fictional sample · {templates.find(t=>t.id===previewTemplate)?.label} template</p></div>
   <div className="template-gallery" aria-label="Choose a free resume template">{templates.map((t,i)=><button className="template-choice" data-previewing={previewTemplate===t.id} onFocus={()=>setPreviewTemplate(t.id)} onMouseEnter={()=>setPreviewTemplate(t.id)} key={t.id} onClick={()=>onTemplate(t.id)}><span className="template-choice-number">0{i+1}</span><span><strong>{t.label}</strong><small>{t.tagline}</small></span><span className="template-free">Free</span><ArrowRight size={18} aria-hidden="true"/></button>)}</div>
  </section>
  </div>
  <section className="decision-story"><p className="section-label">Always your call</p><h2>AI suggests.<br/><em>You decide.</em></h2><div><p>Suggestions rework what your resume already says. See each change before and after, then accept it, reject it or rewrite it yourself. AI never changes your master resume.</p><span>Nothing to invent. Nothing to silently overwrite.</span></div></section>
  <section className="landing-pricing" id="pricing">
   <div className="section-introduction"><p className="section-label">A useful start. A focused next step.</p><h2>Build your foundation.<br/>Then pursue the fit.</h2><p>Start free. Choose Pro when you’re ready to turn a promising opportunity into a tailored application.</p></div>
   <div className="plan-comparison"><article><span className="section-label">Free</span><h3>Get your experience ready.</h3><p className="plan-price"><strong>$0</strong><span>to start</span></p><ul><li><Check aria-hidden="true"/>The complete builder and all 7 templates</li><li><Check aria-hidden="true"/>3 PDF or Word downloads per 30-day period</li><li><Check aria-hidden="true"/>1 job search every 24 hours, up to 5 results</li><li><Check aria-hidden="true"/>Save up to 3 jobs, with a Match Analysis preview</li></ul><p className="plan-note">A free account is required for downloads and jobs. PDF and Word share the same download allowance.</p><button className="button outline" onClick={onBuild}>Build my resume<ArrowRight size={16} aria-hidden="true"/></button></article>
   <article className="plan-pro"><span className="section-label">Pro · 30-day pass</span><h3>Prepare for the opportunity.</h3><p className="plan-price"><strong>US$19.99</strong><span>/ 30 days</span></p><ul><li><Check aria-hidden="true"/>Full Match Analysis, requirement by requirement</li><li><Check aria-hidden="true"/>Up to 20 results per search, no once-a-day limit</li><li><Check aria-hidden="true"/>More saved jobs, each with its own resume</li><li><Check aria-hidden="true"/>AI suggestions you accept, reject or edit</li></ul><p className="plan-note">PDF and Word downloads included. One-time pass by default. Optional automatic renewal is never preselected. Fair-use limits apply.</p><button className="button" onClick={onPro}>View Pro options<ArrowRight size={16} aria-hidden="true"/></button></article></div>
  </section>
  <footer className="landing-footer"><div><strong>ResumeStride<span aria-hidden="true">↗</span></strong><p>Your experience is the starting point.</p></div><div><a href="mailto:support@resumestride.com">support@resumestride.com</a><nav aria-label="Site links"><a href="/tools/">Free tools</a><a href="/resources/">Resources</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms &amp; refunds</a></nav></div></footer>
 </main>;
}
