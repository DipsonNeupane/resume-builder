import './applications.css';
import { useId, useState } from 'react';
import { CLOSED_REASONS, CLOSED_REASON_LABELS, STAGES, STAGE_HINTS, STAGE_LABELS, localDay, type ApplicationPatch, type ApplicationRecord, type ClosedReason, type Stage } from '../../lib/applications';

type Props = {
  application: ApplicationRecord;
  busy: boolean;
  onChange: (patch: ApplicationPatch) => void;
  label?: string;
};

/** One control for every stage change. Applied asks for the submission date and Closed
 * asks for a reason; every other stage saves on selection. Nothing here infers a stage. */
export function StageControl({ application, busy, onChange, label = 'Stage' }: Props) {
  const id = useId();
  const [pending, setPending] = useState<Stage | null>(null);
  const [appliedOn, setAppliedOn] = useState(application.appliedOn ?? localDay());
  const [reason, setReason] = useState<ClosedReason>(application.closedReason ?? 'no_response');

  const choose = (stage: Stage) => {
    if (stage === application.stage && stage !== 'closed') return;
    if (stage === 'applied' || stage === 'closed') { setPending(stage); return; }
    onChange({ stage });
  };

  return <div className="stage-control">
    <label className="field compact" htmlFor={`${id}-stage`}><span>{label}</span>
      <select id={`${id}-stage`} value={pending ?? application.stage} disabled={busy} onChange={event => choose(event.target.value as Stage)}>
        {STAGES.map(stage => <option key={stage} value={stage}>{STAGE_LABELS[stage]} — {STAGE_HINTS[stage]}</option>)}
      </select>
    </label>
    {pending === 'applied' && <form className="stage-confirm" onSubmit={event => { event.preventDefault(); setPending(null); onChange({ stage: 'applied', appliedOn }); }}>
      <label className="field compact" htmlFor={`${id}-applied`}><span>Date you submitted</span>
        <input id={`${id}-applied`} type="date" required value={appliedOn} max={localDay(new Date(Date.now() + 86_400_000))} onChange={event => setAppliedOn(event.target.value)} />
      </label>
      <div className="stage-confirm-actions"><button className="button" type="submit" disabled={busy || !appliedOn}>Record as applied</button><button className="text-button" type="button" onClick={() => setPending(null)}>Cancel</button></div>
    </form>}
    {pending === 'closed' && <form className="stage-confirm" onSubmit={event => { event.preventDefault(); setPending(null); onChange({ stage: 'closed', closedReason: reason }); }}>
      <label className="field compact" htmlFor={`${id}-reason`}><span>Why is it closed?</span>
        <select id={`${id}-reason`} value={reason} onChange={event => setReason(event.target.value as ClosedReason)}>
          {CLOSED_REASONS.map(item => <option key={item} value={item}>{CLOSED_REASON_LABELS[item]}</option>)}
        </select>
      </label>
      <small className="field-hint">“No response” is kept separate from “Rejected”. APWICO never marks an application rejected on its own.</small>
      <div className="stage-confirm-actions"><button className="button" type="submit" disabled={busy}>Close application</button><button className="text-button" type="button" onClick={() => setPending(null)}>Cancel</button></div>
    </form>}
  </div>;
}
