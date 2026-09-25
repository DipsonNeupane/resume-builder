type Stage = 'resume' | 'opportunities' | 'match' | 'tailor' | 'application';
const stages: { id: Stage; label: string }[] = [
 { id: 'resume', label: 'Resume' }, { id: 'opportunities', label: 'Opportunities' },
 { id: 'match', label: 'Match' }, { id: 'tailor', label: 'Tailor' }, { id: 'application', label: 'Application' },
];
/** An orientation aid, not a claim that any stage has been completed. */
export function JourneyRail({ current, onResume, onJobs }: { current: Stage; onResume?: () => void; onJobs?: () => void }) {
 return <nav aria-label="Application journey"><ol className="journey-rail" aria-label="Your application journey">{stages.map((stage, i) => {
  const action = stage.id === 'resume' ? onResume : stage.id === 'opportunities' ? onJobs : undefined;
  return <li key={stage.id} aria-current={current === stage.id ? 'step' : undefined}>
   {action ? <button onClick={action}><span aria-hidden="true">0{i + 1}</span>{stage.label}</button> : <span><span aria-hidden="true">0{i + 1}</span>{stage.label}</span>}
  </li>;
 })}</ol></nav>;
}
