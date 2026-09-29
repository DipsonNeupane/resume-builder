import { FileSearch, FileText, Search, ShieldCheck, Upload } from 'lucide-react';
import type { EntryJourney } from '../../routing/routes';

type Props = {
 journey: EntryJourney;
 onChooseFile: () => void;
 onStartBuilding: () => void;
 onUseRealJob: () => void;
 onUseSample: () => void;
};

export function JourneyStart({ journey, onChooseFile, onStartBuilding, onUseRealJob, onUseSample }: Props) {
 if (journey === 'import_first') return <section className="journey-start" aria-labelledby="import-start-title">
  <div className="journey-start-icon"><Upload aria-hidden="true" /></div>
  <div><span className="section-label">Import / Step 1 of 2</span><h2 id="import-start-title">Bring in the resume you already have.</h2>
   <p>Choose a Word (.docx) or text-based PDF smaller than 8 MB. Parsing happens in this browser, is best effort, and may not recover columns, graphics, scanned pages or every field correctly.</p>
   <ul><li>Your current draft is not replaced until you approve the import.</li><li>Review the recovered master resume section by section before confirming it.</li><li>The imported draft stays in this browsing session unless account saving is explicitly enabled and accepted.</li></ul>
   <div className="journey-start-actions"><button className="button" onClick={onChooseFile}>Choose a resume file</button><button className="button outline" onClick={onStartBuilding}>Build instead</button></div>
  </div>
 </section>;

 if (journey === 'build_first') return <section className="journey-start" aria-labelledby="build-start-title">
  <div className="journey-start-icon"><FileText aria-hidden="true" /></div>
  <div><span className="section-label">Build / Your essentials first</span><h2 id="build-start-title">Start with your story, not a design.</h2>
   <p>Add your name, target direction and one contact method first. Then add the experience types that fit you—work, education, projects, volunteering, research or something else.</p>
   <ul><li>Examples are prompts only; ResumeStride never inserts qualifications for you.</li><li>Your progress stays in this browsing session unless account saving is explicitly enabled and accepted.</li><li>Templates and formatting wait until your useful content exists.</li></ul>
  </div>
 </section>;

 if (journey === 'job_first') return <section className="journey-start" aria-labelledby="job-start-title">
  <div className="journey-start-icon"><Search aria-hidden="true" /></div>
  <div><span className="section-label">Job first / Find and preserve the context</span><h2 id="job-start-title">Begin with the role you are considering.</h2>
   <p>Search for a real role below, or review a job captured with the ResumeStride extension. Saving a job requires an account and keeps that snapshot separate from your resume while you import or build your master.</p>
   <ul><li>A search result is not retained just because you viewed it—save it explicitly.</li><li>Match explains requirement-level evidence; it does not predict hiring.</li><li>A later job-specific resume is a separate version. Your master stays unchanged.</li></ul>
   <div className="journey-start-actions"><button className="button outline" onClick={onUseSample}>See a fictional example</button></div>
  </div>
 </section>;

 return <section className="journey-start sample-journey" aria-labelledby="sample-start-title">
  <div className="journey-start-icon"><FileSearch aria-hidden="true" /></div>
  <div><span className="section-label">Fictional sample / Nothing is saved</span><h2 id="sample-start-title">See how evidence informs a decision.</h2>
   <p><strong>Jordan Lee</strong>, a fictional community-program coordinator, is considering a fictional Operations Coordinator role at <strong>Northstar Commons</strong>.</p>
   <div className="sample-evidence" aria-label="Fictional evidence example">
    <p><strong>Clearly demonstrated</strong><span>Coordinated weekly programs and volunteer schedules.</span></p>
    <p><strong>Worth reviewing</strong><span>Tracked attendance in spreadsheets; the job asks for broader reporting.</span></p>
    <p><strong>Not demonstrated</strong><span>No procurement evidence appears in the fictional resume. That is not proof Jordan lacks it.</span></p>
   </div>
   <p className="sample-decision"><ShieldCheck aria-hidden="true" />Jordan—not ResumeStride—decides whether the role is worth pursuing. Any tailoring would create a separate version grounded only in this fictional resume.</p>
   <div className="journey-start-actions"><button className="button" onClick={onChooseFile}>Use my resume instead</button><button className="button outline" onClick={onUseRealJob}>Find a real job</button></div>
  </div>
 </section>;
}
