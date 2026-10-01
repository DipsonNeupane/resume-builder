import { useMemo, useState } from 'react';

export type ProductOutcome = 'application_prepared'|'application_submitted'|'interview_received'|'offer_received'|'declined'|'withdrawn';
export type TimeSavedBucket = 'under_15_minutes'|'15_to_30_minutes'|'31_to_60_minutes'|'over_60_minutes'|'unsure';
export type OutcomeReport = {
  id: string; savedJobId: string; outcome: ProductOutcome; provenance: 'self_reported';
  occurredOn: string|null; timeSavedBucket: TimeSavedBucket|null; clarityRating: number|null;
  confidenceRating: number|null; consentVersion: 'outcomes-v1'; consentedAt: string;
  methodologyVersion: 'outcomes-v1'; reportedAt: string; updatedAt: string;
};
export type OutcomeReportInput = Pick<OutcomeReport,'outcome'|'occurredOn'|'timeSavedBucket'|'clarityRating'|'confidenceRating'> & { consent: true; consentVersion: 'outcomes-v1' };

const outcomeLabels: Record<ProductOutcome,string> = {
  application_prepared:'Application prepared', application_submitted:'Application submitted',
  interview_received:'Interview received', offer_received:'Offer received',
  declined:'Opportunity declined', withdrawn:'Application withdrawn',
};
const timeLabels: Record<TimeSavedBucket,string> = {
  under_15_minutes:'Under 15 minutes', '15_to_30_minutes':'15–30 minutes',
  '31_to_60_minutes':'31–60 minutes', over_60_minutes:'More than 60 minutes', unsure:'Not sure',
};

type Props = { reports: OutcomeReport[]; busy: boolean; available: boolean; onReport: (report: OutcomeReportInput) => Promise<void> };

export function OutcomeReportPanel({ reports, busy, available, onReport }: Props) {
  const [outcome,setOutcome]=useState<ProductOutcome>('application_prepared');
  const [occurredOn,setOccurredOn]=useState('');
  const [timeSaved,setTimeSaved]=useState<TimeSavedBucket|'none'>('none');
  const [clarity,setClarity]=useState(0);
  const [confidence,setConfidence]=useState(0);
  const [consent,setConsent]=useState(false);
  const sorted=useMemo(()=>reports.slice().sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)),[reports]);
  const submit=async()=>{
    if(!consent||busy||!available)return;
    await onReport({outcome,occurredOn:occurredOn||null,timeSavedBucket:timeSaved==='none'?null:timeSaved,clarityRating:clarity||null,confidenceRating:confidence||null,consent:true,consentVersion:'outcomes-v1'});
    setConsent(false);
  };
  return <details className="job-workflow outcome-report">
    <summary>Share an outcome voluntarily</summary>
    <p className="field-hint">This self-report is optional. APWICO records it separately from platform-observed actions and will not claim it caused an interview, offer or other result. No resume text, job text, job URL, notes or contact details are included.</p>
    {!available&&<p className="field-hint" role="alert">Voluntary outcome reporting is temporarily unavailable. Your saved job and application update are unaffected.</p>}
    <div className="job-workflow-grid">
      <label className="field"><span>Outcome</span><select value={outcome} onChange={event=>setOutcome(event.target.value as ProductOutcome)}>{Object.entries(outcomeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field"><span>Date (optional)</span><input type="date" max={new Date().toISOString().slice(0,10)} value={occurredOn} onChange={event=>setOccurredOn(event.target.value)}/></label>
      <label className="field"><span>Estimated time saved (optional)</span><select value={timeSaved} onChange={event=>setTimeSaved(event.target.value as TimeSavedBucket|'none')}><option value="none">Prefer not to say</option>{Object.entries(timeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field"><span>Clarity after using APWICO (optional)</span><select value={clarity} onChange={event=>setClarity(Number(event.target.value))}><option value={0}>Prefer not to say</option>{[1,2,3,4,5].map(value=><option key={value} value={value}>{value} of 5</option>)}</select></label>
      <label className="field"><span>Confidence in my next step (optional)</span><select value={confidence} onChange={event=>setConfidence(Number(event.target.value))}><option value={0}>Prefer not to say</option>{[1,2,3,4,5].map(value=><option key={value} value={value}>{value} of 5</option>)}</select></label>
      <label className="checkbox-field full"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/>I choose to save this self-reported outcome and optional bounded feedback for product learning.</label>
    </div>
    <button className="button outline" disabled={!available||busy||!consent} onClick={()=>void submit()}>{busy?'Saving…':'Save voluntary outcome'}</button>
    {sorted.length>0&&<div><h4>Outcomes I reported</h4><ul>{sorted.map(report=><li key={report.id}>{outcomeLabels[report.outcome]}{report.occurredOn?` · ${new Intl.DateTimeFormat(undefined,{dateStyle:'medium'}).format(new Date(`${report.occurredOn}T00:00:00`))}`:''} <small>Self-reported</small></li>)}</ul></div>}
  </details>;
}

