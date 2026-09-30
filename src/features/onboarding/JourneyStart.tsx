import { lazy, Suspense } from 'react';
import { FileText, Search, Upload } from 'lucide-react';
import type { EntryJourney } from '../../routing/routes';

const FictionalSample = lazy(() => import('./FictionalSample').then(module => ({ default: module.FictionalSample })));

type Props = {
 journey: EntryJourney;
 onChooseFile: () => void;
 onStartBuilding: () => void;
 onUseRealJob: () => void;
 onUseSample: () => void;
};

export function JourneyStart({ journey, onChooseFile, onStartBuilding, onUseRealJob, onUseSample }: Props) {
 if (journey === 'import_first') return <main id="main-content" className="journey-start" aria-labelledby="import-start-title">
  <div className="journey-start-icon"><Upload aria-hidden="true" /></div>
  <div><span className="section-label">Import / Step 1 of 2</span><h1 id="import-start-title">Bring in the resume you already have.</h1>
   <p>Choose a Word (.docx) or text-based PDF smaller than 8 MB. Parsing happens in this browser, is best effort, and may not recover columns, graphics, scanned pages or every field correctly.</p>
   <ul><li>Your current draft is not replaced until you approve the import.</li><li>Review the recovered master resume section by section before confirming it.</li><li>The imported draft stays in this browsing session unless account saving is explicitly enabled and accepted.</li></ul>
   <div className="journey-start-actions"><button className="button" onClick={onChooseFile}>Choose a resume file</button><button className="button outline" onClick={onStartBuilding}>Build instead</button></div>
  </div>
 </main>;

 if (journey === 'build_first') return <main id="main-content" className="journey-start" aria-labelledby="build-start-title">
  <div className="journey-start-icon"><FileText aria-hidden="true" /></div>
  <div><span className="section-label">Build / Your essentials first</span><h1 id="build-start-title">Start with your story, not a design.</h1>
   <p>Add your name, target direction and one contact method first. Then add the experience types that fit you—work, education, projects, volunteering, research or something else.</p>
   <ul><li>Examples are prompts only; ResumeStride never inserts qualifications for you.</li><li>Your progress stays in this browsing session unless account saving is explicitly enabled and accepted.</li><li>Templates and formatting wait until your useful content exists.</li></ul>
   <div className="journey-start-actions"><button className="button" onClick={onStartBuilding}>Start building</button><button className="button outline" onClick={onChooseFile}>Import instead</button></div>
  </div>
 </main>;

 if (journey === 'job_first') return <main id="main-content" className="journey-start" aria-labelledby="job-start-title">
  <div className="journey-start-icon"><Search aria-hidden="true" /></div>
  <div><span className="section-label">Job first / Find and preserve the context</span><h1 id="job-start-title">Begin with the role you are considering.</h1>
   <p>Search for a real role below, or review a job captured with the ResumeStride extension. Saving a job requires an account and keeps that snapshot separate from your resume while you import or build your master.</p>
   <ul><li>A search result is not retained just because you viewed it—save it explicitly.</li><li>Match explains requirement-level evidence; it does not predict hiring.</li><li>A later job-specific resume is a separate version. Your master stays unchanged.</li></ul>
   <div className="journey-start-actions"><button className="button" onClick={onUseRealJob}>Find jobs</button><button className="button outline" onClick={onUseSample}>See a fictional example</button></div>
  </div>
 </main>;

 return <Suspense fallback={<main id="main-content" className="route-loading-page"><h1 className="visually-hidden">Fictional sample</h1><p role="status">Loading fictional sample…</p></main>}>
  <FictionalSample onUseResume={onChooseFile} onUseJobDescription={() => { window.location.assign('/tools/resume-job-match/'); }} />
 </Suspense>;
}
