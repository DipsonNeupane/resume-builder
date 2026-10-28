import '../applications/applications.css';
import { useEffect, useState, type FormEvent } from 'react';
import type { RequirementEdits } from '../../lib/applications';

type Category = 'required' | 'preferred' | 'nice_to_have';
export type ReviewRequirement = { id: string; text: string; category: Category; origin?: 'posting' | 'user'; originalCategory?: Category };
type Props = { requirements: ReviewRequirement[]; edits: RequirementEdits | null; busy: boolean; onSave: (edits: { removed: string[]; categories: Record<string, Category>; added: { text: string; category: Category }[] }) => Promise<boolean> };

const LABELS: Record<Category, string> = { required: 'Required', preferred: 'Preferred', nice_to_have: 'Nice to have' };

/** Step 1 of preparing an application: the owner checks what the posting asks for.
 * Posting wording is never rewritten here; corrections and additions are stored as
 * the owner's edits and labelled as such. */
export function RequirementReview({ requirements, edits, busy, onSave }: Props) {
  const posting = requirements.filter(item => item.origin !== 'user');
  const initialCategories = () => Object.fromEntries(posting.map(item => [item.id, item.category])) as Record<string, Category>;
  const [categories, setCategories] = useState<Record<string, Category>>(initialCategories);
  const [removed, setRemoved] = useState<string[]>(edits?.removed ?? []);
  const [added, setAdded] = useState<{ text: string; category: Category }[]>(() => (edits?.added ?? []).map(({ text, category }) => ({ text, category })));
  const [draft, setDraft] = useState('');
  const [draftCategory, setDraftCategory] = useState<Category>('required');
  const [status, setStatus] = useState<string | null>(null);
  const signature = JSON.stringify([requirements.map(item => [item.id, item.category]), edits]);
  useEffect(() => {
    setCategories(initialCategories()); setRemoved(edits?.removed ?? []);
    setAdded((edits?.added ?? []).map(({ text, category }) => ({ text, category })));
  }, [signature]);

  const original = (item: ReviewRequirement): Category => item.originalCategory ?? item.category;
  const save = async () => {
    const changed = Object.fromEntries(posting.filter(item => categories[item.id] !== original(item)).map(item => [item.id, categories[item.id]]));
    setStatus('Saving your review…');
    const ok = await onSave({ removed, categories: { ...Object.fromEntries(Object.entries(edits?.categories ?? {}).filter(([id]) => !posting.some(item => item.id === id))), ...changed }, added });
    setStatus(ok ? 'Review saved. The evidence below now uses your corrections.' : 'Not saved. Your changes are still here; try again.');
  };
  const add = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (text.length < 3 || added.length >= 10) return;
    setAdded(current => [...current, { text, category: draftCategory }]);
    setDraft('');
  };

  return <section className="requirement-review" aria-labelledby="requirement-review-title">
    <h3 id="requirement-review-title">1. Check what this job asks for</h3>
    <p className="field-hint">Correct anything APWICO extracted wrongly. The posting’s own wording is kept; your corrections are labelled and only affect this application.</p>
    <ul className="requirement-review-list">
      {posting.map(item => {
        const isRemoved = removed.includes(item.id);
        return <li key={item.id} className={isRemoved ? 'is-removed' : ''}>
          <p><span className="section-label">From the posting</span>{item.text}</p>
          {isRemoved ? <p className="field-hint">Removed by you. <button className="text-button" onClick={() => setRemoved(current => current.filter(id => id !== item.id))}>Restore</button></p>
            : <div className="requirement-review-controls">
              <label className="field compact"><span>Classification</span><select value={categories[item.id]} disabled={busy} onChange={event => setCategories(current => ({ ...current, [item.id]: event.target.value as Category }))}>
                {(Object.keys(LABELS) as Category[]).map(category => <option key={category} value={category}>{LABELS[category]}</option>)}</select></label>
              {categories[item.id] !== original(item) && <small className="field-hint">Changed by you — the posting reads as {LABELS[original(item)]}.</small>}
              <button className="text-button" disabled={busy} onClick={() => setRemoved(current => [...current, item.id])}>Remove — not a real requirement</button>
            </div>}
        </li>;
      })}
      {added.map((item, index) => <li key={`added-${index}`}><p><span className="section-label">Added by you</span>{item.text}</p>
        <div className="requirement-review-controls">
          <label className="field compact"><span>Classification</span><select value={item.category} disabled={busy} onChange={event => setAdded(current => current.map((entry, at) => at === index ? { ...entry, category: event.target.value as Category } : entry))}>
            {(Object.keys(LABELS) as Category[]).map(category => <option key={category} value={category}>{LABELS[category]}</option>)}</select></label>
          <button className="text-button" disabled={busy} onClick={() => setAdded(current => current.filter((_, at) => at !== index))}>Remove</button>
        </div></li>)}
    </ul>
    {(edits?.removed?.length ?? 0) > removed.length && <p className="field-hint">Some items you removed earlier will be restored when you save.</p>}
    <form className="requirement-review-add" onSubmit={add}>
      <label className="field compact"><span>Add a requirement the extraction missed</span><input value={draft} maxLength={300} onChange={event => setDraft(event.target.value)} disabled={busy || added.length >= 10} /></label>
      <label className="field compact"><span>Classification</span><select value={draftCategory} onChange={event => setDraftCategory(event.target.value as Category)}>{(Object.keys(LABELS) as Category[]).map(category => <option key={category} value={category}>{LABELS[category]}</option>)}</select></label>
      <button className="button outline" type="submit" disabled={busy || draft.trim().length < 3 || added.length >= 10}>Add</button>
    </form>
    <button className="button" disabled={busy} onClick={() => void save()}>Save requirement review</button>
    <p className="field-hint" role="status" aria-live="polite">{status}</p>
  </section>;
}
