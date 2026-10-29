import { type Resume } from '../../model';
import { ORIGIN_LABEL, STATE_LABEL, provenanceState, type ProvenanceEntry } from '../../lib/tailoringProvenance';

const FIELD_LABEL: Record<ProvenanceEntry['field'], string> = { headline: 'Headline', summary: 'Summary', skills: 'Skills', title: 'Entry title', description: 'Entry description' };
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** The saved record of accepted tailoring changes, read against `resume` (the live version,
 * or a kept document's own snapshot) so later edits show as edited rather than as accepted. */
export function ProvenanceList({ entries, resume, heading }: { entries: ProvenanceEntry[]; resume: Resume; heading: string }) {
 if (entries.length === 0) return null;
 return <details className="provenance-list">
  <summary>{heading} ({entries.length})</summary>
  <p className="field-hint">Your record of how each accepted change was made and what it was checked against. It does not show that any wording is true.</p>
  <ol>{entries.map(item => { const state = provenanceState(item, resume); return <li key={item.id} data-origin={item.origin} data-state={state}>
   <p><strong>{FIELD_LABEL[item.field]}</strong> · {ORIGIN_LABEL[item.origin]} · <span>{STATE_LABEL[state]}</span> <small>· accepted {dateTime.format(new Date(item.acceptedAt))}</small></p>
   <p className="provenance-text">“{item.keptText}”</p>
   {item.origin === 'user' && item.aiText !== item.keptText && <p className="field-hint">Written by you in place of the AI wording: “{item.aiText}”</p>}
   {item.requirements.length > 0 && <p className="field-hint">Job requirement: {item.requirements.map(requirement => requirement.text).join('; ')}</p>}
   {item.resumeQuotes.length > 0 && <p className="field-hint">From your resume: {item.resumeQuotes.map(quote => `“${quote.quote}” (${quote.location})`).join('; ')}</p>}
   {item.userFact && <p className="field-hint">Fact you added: “{item.userFact}” — written by you, not from your resume</p>}
  </li>; })}</ol>
 </details>;
}
