import { lazy, Suspense } from 'react';
import { FileText, Upload } from 'lucide-react';
import type { EntryJourney } from '../../routing/routes';
import type { JobCapturePayload } from '../../services/extensionImport';
import { JobFirstStart } from './JobFirstStart';

const FictionalSample = lazy(() => import('./FictionalSample').then(module => ({ default: module.FictionalSample })));

type Props = {
 journey: EntryJourney;
 onChooseFile: () => void;
 onStartBuilding: () => void;
 onUseRealJob: () => void;
 onUseSample: () => void;
 resumeReady: boolean;
 pendingJob: JobCapturePayload | null;
 onPreserveJob: (capture: JobCapturePayload, next: 'import' | 'build') => void;
 onContinueJob: (capture: JobCapturePayload) => void;
 onRequirementsReviewed?: () => void;
};

export function JourneyStart({ journey, onChooseFile, onStartBuilding, onUseRealJob, onUseSample, resumeReady, pendingJob, onPreserveJob, onContinueJob, onRequirementsReviewed }: Props) {
 if (journey === 'import_first') return <main id="main-content" className="journey-start" aria-labelledby="import-start-title">
  <div className="journey-start-icon"><Upload aria-hidden="true" /></div>
  <div><span className="section-label">Step 1 of 2</span><h1 id="import-start-title">Upload your resume</h1>
   <p>Choose a Word (.docx) or text-based PDF under 8 MB. The file is read in your browser. Columns, graphics, scanned pages, and some fields may not import correctly.</p>
   <ul><li>Your current draft is not replaced until you approve the import.</li><li>Review the recovered master resume section by section before confirming it.</li><li>The imported draft stays in this browser session unless you choose to save it to your account.</li></ul>
   <div className="journey-start-actions"><button className="button" onClick={onChooseFile}>Choose a resume file</button><button className="button outline" onClick={onStartBuilding}>Build instead</button></div>
  </div>
 </main>;

 if (journey === 'build_first') return <main id="main-content" className="journey-start" aria-labelledby="build-start-title">
  <div className="journey-start-icon"><FileText aria-hidden="true" /></div>
  <div><h1 id="build-start-title">Start your master resume</h1>
   <p>Add your name, target role, and one contact method. Then add the experience that matters to you.</p>
   <ul><li>Examples are prompts only; APWICO never inserts qualifications for you.</li><li>Your progress stays in this browsing session unless account saving is explicitly enabled and accepted.</li><li>Choose a template after adding your essentials.</li></ul>
   <div className="journey-start-actions"><button className="button" onClick={onStartBuilding}>Start building</button><button className="button outline" onClick={onChooseFile}>Import instead</button></div>
  </div>
 </main>;

 if (journey === 'job_first') return <JobFirstStart initialJob={pendingJob} resumeReady={resumeReady} onPreserve={onPreserveJob} onContinue={onContinueJob} onFindJobs={onUseRealJob} onUseSample={onUseSample} onRequirementsReviewed={onRequirementsReviewed}/>;

 return <Suspense fallback={<main id="main-content" className="route-loading-page"><h1 className="visually-hidden">Fictional sample</h1><div className="sample-skeleton" aria-hidden="true"><span/><span/><span/></div><p role="status">Loading example…</p></main>}>
  <FictionalSample onUseResume={onChooseFile} onUseJobDescription={() => { window.location.assign('/tools/resume-job-match/'); }} />
 </Suspense>;
}
