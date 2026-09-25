import { useState } from 'react';
import { ArrowRight, Check, Upload } from 'lucide-react';
import { ResumePreview } from '../../components/ResumePreview';
import { example, templates, type Resume } from '../../model';

const sample = example();
type Props = { onBuild: () => void; onUpload: () => void; onJobs: () => void; onPro: () => void; onTemplate: (template: Resume['template']) => void };

export function HomePage({ onBuild, onUpload, onJobs, onPro, onTemplate }: Props) {
 const [previewTemplate, setPreviewTemplate] = useState<Resume['template']>('modern');
 return <main className="landing" id="main-content">
  <section className="landing-hero">
   <div className="hero-editorial"><p className="section-label">Your experience. Your next move.</p>
    <h1>One career.<br/>More than<br/><em>one version.</em></h1>
    <p className="hero-deck">You shouldn’t have to start over for every application. Build your master resume, see where it fits, and shape a separate version for the role you want.</p>
    <div className="hero-actions"><button className="button large" onClick={onBuild}>Build my resume<ArrowRight size={18}/></button><button className="text-button" onClick={onUpload}><Upload size={16}/>Upload a resume</button></div>
    <p className="hero-footnote">All seven templates free. No card needed to begin.</p>
   </div>
   <div className="career-folio" aria-label="Sample resume and an explanation of the tailoring workflow">
    <div className="folio-heading"><span>01 / Your foundation</span><span>Fictional sample</span></div>
    <div className="folio-paper"><ResumePreview resume={sample}/></div>
    <div className="folio-branch"><span className="branch-line" aria-hidden="true"/><div><span className="section-label">02 / A version for the opportunity</span><strong>Same experience.<br/>A more relevant introduction.</strong><p>Tailor a separate copy. Keep your master.</p></div><ArrowRight size={24} aria-hidden="true"/></div>
   </div>
  </section>
  <div className="journey-story" aria-label="The ResumeStride product journey"><span>Built to move with you</span><ol>{['Experience','Resume','Opportunities','Match','Tailor','Application'].map((s,i)=><li key={s}><span>{s}</span>{i<5&&<ArrowRight size={16} aria-hidden="true"/>}</li>)}</ol></div>
  <section className="landing-workflow" id="how-it-works">
   <div className="section-introduction"><p className="section-label">From what you’ve done to what’s next</p><h2>Don’t just send a resume.<br/>Know why you’re sending it.</h2><p>A clear application starts with a clear connection between your experience and the role.</p></div>
   <div className="workflow-spread">
    <div className="workflow-index"><span>01 — Build your foundation</span><h3>Start with the experience<br/>you already have.</h3><p>Work, study, research, projects, caregiving or volunteering. Give your experience a home, in your own words and your own language.</p><button className="text-button" onClick={onBuild}>Create your master resume<ArrowRight size={16}/></button></div>
    <div className="workflow-index"><span>02 — Find the connection</span><h3>See what a role asks.<br/>See what your resume shows.</h3><p>Discover opportunities and review the evidence behind Strong match, Good match or Stretch. A missing detail is something to review, not a judgment about you.</p><button className="text-button" onClick={onJobs}>Find opportunities<ArrowRight size={16}/></button></div>
    <div className="workflow-index"><span>03 — Make it relevant</span><h3>Change the emphasis.<br/>Keep the truth.</h3><p>With Pro, tailor a separate resume for a saved job. Compare each suggestion, accept what fits, and keep every final word yours.</p><button className="text-button" onClick={onPro}>Explore tailoring with Pro<ArrowRight size={16}/></button></div>
   </div>
  </section>
  <section className="evidence-story">
   <div><p className="section-label">The evidence, before the effort</p><h2>“Not demonstrated”<br/>isn’t “not capable.”</h2><p>Match Analysis reads the evidence in your resume. It helps you notice relevant experience, required qualifications and details worth adding before you apply.</p><button className="button outline" onClick={onJobs}>See where your experience fits<ArrowRight size={16}/></button></div>
   <dl className="evidence-key"><div><dt><span className="evidence-dot strength"/>Demonstrated</dt><dd>Experience in your resume supports the requirement.</dd></div><div><dt><span className="evidence-dot review"/>Worth reviewing</dt><dd>A skill or qualification may need more context.</dd></div><div><dt><span className="evidence-dot unknown"/>Not demonstrated</dt><dd>Your resume doesn’t show it yet. You may still have it.</dd></div></dl>
  </section>
  <section className="landing-templates" id="templates">
   <div className="section-introduction"><p className="section-label">Seven designs. All yours.</p><h2>Let the work<br/>do the talking.</h2><p>Readable layouts for every occupation and career stage. All seven templates are Free, with A4, US Letter and right-to-left support.</p><div className="template-specimen" aria-label={`Fictional sample in the ${previewTemplate} template`}><ResumePreview resume={{...sample,template:previewTemplate}}/></div><p className="template-preview-caption">Fictional sample · {templates.find(t=>t.id===previewTemplate)?.label} template</p></div>
   <div className="template-gallery" aria-label="Choose a free resume template">{templates.map((t,i)=><button className="template-choice" data-previewing={previewTemplate===t.id} onFocus={()=>setPreviewTemplate(t.id)} onMouseEnter={()=>setPreviewTemplate(t.id)} key={t.id} onClick={()=>onTemplate(t.id)}><span className="template-choice-number">0{i+1}</span><span><strong>{t.label}</strong><small>{t.tagline}</small></span><span className="template-free">Free</span><ArrowRight size={18}/></button>)}</div>
  </section>
  <section className="decision-story"><p className="section-label">Always your call</p><h2>AI suggests.<br/><em>You decide.</em></h2><div><p>Your experience is the source. Review suggestions side by side and accept or reject each one. Your master resume stays separate.</p><span>Nothing to invent. Nothing to silently overwrite.</span></div></section>
  <section className="landing-pricing" id="pricing">
   <div className="section-introduction"><p className="section-label">A useful start. A focused next step.</p><h2>Build your foundation.<br/>Then pursue the fit.</h2><p>Start free. Choose Pro when you’re ready to turn a promising opportunity into a tailored application.</p></div>
   <div className="plan-comparison"><article><span className="section-label">Free</span><h3>Get your experience ready.</h3><p className="plan-price"><strong>$0</strong><span>to start</span></p><ul><li><Check/>The complete builder and all 7 templates</li><li><Check/>3 PDF or Word downloads per 30-day period</li><li><Check/>Up to 5 job results per search</li><li><Check/>Save up to 3 jobs, with a Match Analysis preview</li></ul><p className="plan-note">A free account is required for downloads and jobs. PDF and Word share the same download allowance.</p><button className="button outline" onClick={onBuild}>Build my resume<ArrowRight size={16}/></button></article>
   <article className="plan-pro"><span className="section-label">Pro · 30-day pass</span><h3>Prepare for the opportunity.</h3><p className="plan-price"><strong>US$19.99</strong><span>/ 30 days</span></p><ul><li><Check/>Full Match Analysis and more job results</li><li><Check/>Separate resumes for your saved jobs</li><li><Check/>Tailoring suggestions you accept or reject</li><li><Check/>PDF and Word downloads included</li></ul><p className="plan-note">One-time pass by default. Optional automatic renewal is never preselected. Fair-use limits apply.</p><button className="button" onClick={onPro}>View Pro options<ArrowRight size={16}/></button></article></div>
  </section>
  <footer className="landing-footer"><div><strong>ResumeStride<span aria-hidden="true">↗</span></strong><p>Your experience is the starting point.</p></div><div><a href="mailto:support@resumestride.com">support@resumestride.com</a><nav aria-label="Legal"><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms &amp; refunds</a></nav></div></footer>
 </main>;
}
