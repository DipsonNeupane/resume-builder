import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileText, RotateCcw, Search, ShieldCheck } from 'lucide-react';

type Props = { onUseResume: () => void; onUseJobDescription: () => void };
type Decision = 'tailor' | 'review' | 'pass' | null;
const suggestions = [
 { id: 'schedule', text: 'Coordinated weekly community programs and volunteer schedules for 25 volunteers.', source: 'Resume source: “Coordinated weekly community programs and volunteer schedules for 25 volunteers.”' },
 { id: 'attendance', text: 'Tracked program attendance in spreadsheets and prepared monthly summaries.', source: 'Resume source: “Tracked attendance in spreadsheets and prepared monthly summaries.”' },
];

/** Closed fictional sandbox: no Resume, owner, storage, or persistence dependency. */
export function FictionalSample({ onUseResume, onUseJobDescription }: Props) {
 const [decision, setDecision] = useState<Decision>(null);
 const [created, setCreated] = useState(false);
 const [accepted, setAccepted] = useState<string[]>([]);
 const versionHeading = useRef<HTMLHeadingElement>(null);
 useEffect(() => { if (created) versionHeading.current?.focus(); }, [created]);
 useEffect(() => {
  if (decision !== 'tailor') { setCreated(false); setAccepted([]); }
 }, [decision]);
 const reset = () => { setDecision(null); setCreated(false); setAccepted([]); };
 return <main id="main-content" className="journey-start sample-journey fictional-sample" aria-labelledby="sample-start-title">
  <div className="journey-start-icon"><FileText aria-hidden="true" /></div><div>
   <span className="section-label">Fictional sample</span>
   <h1 id="sample-start-title">See how evidence becomes a decision</h1>
   <p><strong>This example is fictional</strong> and does not read or change your resume.</p>
   <section className="sample-source" aria-labelledby="sample-source-heading"><h2 id="sample-source-heading">Fictional source resume</h2><p><strong>Jordan Lee · Community Program Coordinator</strong></p><ul><li>Coordinated weekly community programs and volunteer schedules for 25 volunteers.</li><li>Tracked attendance in spreadsheets and prepared monthly summaries.</li><li>Responded to participant questions and resolved schedule conflicts.</li></ul></section>
   <section aria-labelledby="sample-evidence-heading"><h2 id="sample-evidence-heading">Requirement-level evidence</h2><div className="sample-evidence">
    <p><strong>Clearly demonstrated</strong><span>Requirement: coordinate schedules. Resume evidence: weekly programs and volunteer schedules for 25 volunteers.</span></p>
    <p><strong>Worth reviewing</strong><span>Requirement: prepare operational reports. The resume shows attendance spreadsheets and monthly summaries, but not the full reporting scope.</span></p>
    <p><strong>Not demonstrated</strong><span>Requirement: manage procurement. No procurement evidence appears in the fictional resume. That is not proof Jordan lacks the experience.</span></p>
   </div></section>
   <fieldset className="sample-decision-choices"><legend>What does Jordan decide?</legend>
    <label><input type="radio" name="sample-decision" checked={decision === 'tailor'} onChange={() => setDecision('tailor')} />Worth pursuing — create a separate version</label>
    <label><input type="radio" name="sample-decision" checked={decision === 'review'} onChange={() => setDecision('review')} />Review the reporting and procurement requirements first</label>
    <label><input type="radio" name="sample-decision" checked={decision === 'pass'} onChange={() => setDecision('pass')} />Keep looking</label>
   </fieldset>
   <p className={`sample-decision ${decision ? '' : 'visually-hidden'}`} role="status" aria-live="polite">{decision && <><ShieldCheck aria-hidden="true" />This is Jordan’s decision—not a hiring prediction or a system “apply” verdict.</>}</p>
   {decision === 'tailor' && !created && <button className="button" onClick={() => setCreated(true)}>Create a separate version</button>}
   {created && <section className="sample-version" aria-labelledby="sample-version-heading"><h2 ref={versionHeading} tabIndex={-1} id="sample-version-heading">Separate fictional job-specific version</h2>
    <div className="sample-version-state"><p><strong>Master resume</strong><span>Unchanged · 3 original evidence points</span></p><p><strong>Northstar Commons version</strong><span>Separate · suggestions require Jordan’s choice</span></p></div>
    <h3>Suggestions</h3><p>Each suggestion is limited to facts already present in the fictional source resume. Jordan can accept or reject each one.</p>
    <ul className="sample-suggestions">{suggestions.map(item => <li key={item.id}><p>{item.text}</p><small>{item.source}</small><button className="button outline" aria-pressed={accepted.includes(item.id)} onClick={() => setAccepted(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])}>{accepted.includes(item.id) ? <><CheckCircle2 size={15} />Accepted in separate version</> : 'Accept in separate version'}</button></li>)}</ul>
    <p className="field-hint" role="status">{accepted.length} of {suggestions.length} suggestions accepted in the fictional job-specific version. The fictional master remains unchanged.</p>
   </section>}
   <div className="journey-start-actions sample-actions"><button className="button" onClick={onUseResume}>Start with my resume</button><button className="button outline" onClick={onUseJobDescription}><Search size={15} />Start with a job description</button><button className="text-button" onClick={reset}><RotateCcw size={15} />Reset fictional sample</button></div>
  </div>
 </main>;
}
