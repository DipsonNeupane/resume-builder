import { useEffect, useRef, useState } from 'react';
import type { Resume } from '../../model';
import { buildResumeEvidence, proposeSearchesFromResume } from '../jobs/evidence';
import { loadApplications, savePreferences } from '../../services/applicationsApi';
import { trackProductEvent } from '../../services/analytics';
import '../applications/applications.css';

type Props = { ownerId: string | null; sessionLoading: boolean; resume: Resume; onDone: () => void; onSignIn: () => void };
type Workplace = '' | 'remote' | 'hybrid' | 'onsite';
type Level = '' | 'entry' | 'mid' | 'senior' | 'lead' | 'unsure';

// Only priorities a posting can state in structured data (see src/lib/jobPreferences.ts).
const PRIORITY_LABELS = { flexibility: 'Flexibility — remote or hybrid work', stability: 'Stability — full-time rather than contract', pay: 'Pay shown in the posting' } as const;
const DEALBREAKER_LABELS = { onsite: 'On-site only roles', contract: 'Contract or temporary roles', part_time: 'Part-time roles', below_salary: 'Pay below my minimum' } as const;
type Priority = keyof typeof PRIORITY_LABELS;
type Dealbreaker = keyof typeof DEALBREAKER_LABELS;
const STEPS = ['Roles', 'Location', 'Experience', 'Pay', 'Priorities', 'Dealbreakers'] as const;

/** Short, skippable discovery preferences. Preferences shape which roles are shown; they
 * are never treated as evidence of qualification, and no demographic or personality
 * question is asked. Resume-derived roles are suggestions the user must choose. */
export function PreferencesSetup({ ownerId, sessionLoading, resume, onDone, onSignIn }: Props) {
  const [step, setStep] = useState(0);
  const [roles, setRoles] = useState<string[]>([]);
  const [roleDraft, setRoleDraft] = useState('');
  const [location, setLocation] = useState('');
  const [workplace, setWorkplace] = useState<Workplace>('');
  const [level, setLevel] = useState<Level>('');
  const [currency, setCurrency] = useState('USD');
  const [period, setPeriod] = useState<'year' | 'hour'>('year');
  const [minimum, setMinimum] = useState('');
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [dealbreakers, setDealbreakers] = useState<Dealbreaker[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const suggestions = proposeSearchesFromResume(resume).map(item => item.title).filter(title => !roles.some(role => role.toLowerCase() === title.toLowerCase()));

  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => {
    if (!ownerId) return;
    let live = true;
    loadApplications(ownerId).then(snapshot => {
      if (!live) return;
      const c = snapshot.preferences.criteria;
      setAutoRefresh(snapshot.preferences.autoRefresh);
      if (c) {
        setRoles([c.title, ...(Array.isArray(c.roles) ? c.roles : [])].filter((role): role is string => typeof role === 'string'));
        if (typeof c.location === 'string') setLocation(c.location);
        if (c.workplace === 'remote' || c.workplace === 'hybrid' || c.workplace === 'onsite') setWorkplace(c.workplace);
        if (typeof c.experienceLevel === 'string') setLevel(c.experienceLevel as Level);
        const salary = c.salary as { currency?: string; period?: 'year' | 'hour'; min?: number | null } | undefined;
        if (salary?.currency) setCurrency(salary.currency);
        if (salary?.period) setPeriod(salary.period);
        if (salary?.min) setMinimum(String(salary.min));
        if (Array.isArray(c.priorities)) setPriorities(c.priorities.filter((item): item is Priority => typeof item === 'string' && item in PRIORITY_LABELS));
        if (Array.isArray(c.dealbreakers)) setDealbreakers(c.dealbreakers as Dealbreaker[]);
      }
      setLoaded(true);
    }).catch(problem => { if (live) { setError(problem instanceof Error ? problem.message : 'Preferences could not be loaded.'); setLoaded(true); } });
    return () => { live = false; };
  }, [ownerId]);

  if (sessionLoading) return <main className="tracker" id="main-content"><p className="route-loading" role="status">Loading…</p></main>;
  if (!ownerId) return <main className="tracker" id="main-content"><h1>Find my jobs</h1><div className="empty-state"><strong>Sign in to get job results.</strong><p>Job search and your preferences are kept in your account. It takes a minute and no resume is required to start.</p><button className="button" onClick={onSignIn}>Sign in or create a free account</button></div></main>;
  if (!loaded) return <main className="tracker" id="main-content"><p className="route-loading" role="status">Loading your preferences…</p></main>;

  const addRole = (value: string) => { const role = value.trim(); if (role && roles.length < 5 && !roles.some(item => item.toLowerCase() === role.toLowerCase())) setRoles(current => [...current, role]); };
  const toggle = <T,>(list: T[], value: T) => list.includes(value) ? list.filter(item => item !== value) : [...list, value];
  const minimumValue = Number(minimum);
  const minimumValid = !minimum || (Number.isFinite(minimumValue) && minimumValue > 0 && /^[A-Z]{3}$/.test(currency));
  const finish = async () => {
    setSaving(true); setError(null);
    const criteria: Record<string, unknown> = { title: roles[0], ...(roles.length > 1 ? { roles: roles.slice(1) } : {}),
      ...(location.trim() ? { location: location.trim() } : {}), ...(workplace ? { workplace } : {}), ...(level ? { experienceLevel: level } : {}),
      ...(minimum && minimumValid ? { salary: { currency, period, min: minimumValue, max: null } } : {}),
      ...(priorities.length ? { priorities } : {}), ...(dealbreakers.filter(item => item !== 'below_salary' || minimum).length ? { dealbreakers: dealbreakers.filter(item => item !== 'below_salary' || minimum) } : {}) };
    try {
      await savePreferences(ownerId, criteria, autoRefresh, buildResumeEvidence(resume));
      trackProductEvent('onboarding_completed', { surface: 'onboarding', user_state: 'authenticated', journey: 'find_jobs' });
      onDone();
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Preferences were not saved. Try again.'); }
    setSaving(false);
  };
  const canContinue = step === 0 ? roles.length > 0 : step === 3 ? minimumValid : true;
  const optional = step > 0;

  return <main className="tracker preferences-setup" id="main-content" aria-labelledby="preferences-title">
    <div className="tracker-heading"><div><span className="section-label">Find my jobs · Step {step + 1} of {STEPS.length}</span><h1 id="preferences-title" ref={heading} tabIndex={-1}>{['Which roles are you looking for?', 'Where do you want to work?', 'What level of role?', 'Target pay (optional)', 'What matters most? (optional)', 'Any dealbreakers? (optional)'][step]}</h1>
      <p>Only the first step is needed. You can change these later without affecting your applications.</p></div></div>
    <ol className="preferences-progress" aria-label="Progress">{STEPS.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} className={index < step ? 'is-done' : ''}>{label}</li>)}</ol>
    <div className="tracker-card">
      {step === 0 && <>
        <div className="role-chips" role="group" aria-label="Chosen roles">{roles.map(role => <span key={role} className="stage-chip">{role} <button className="text-button" aria-label={`Remove ${role}`} onClick={() => setRoles(current => current.filter(item => item !== role))}>×</button></span>)}</div>
        <form className="requirement-review-add" onSubmit={event => { event.preventDefault(); addRole(roleDraft); setRoleDraft(''); }}>
          <label className="field compact"><span>Role title</span><input value={roleDraft} maxLength={200} onChange={event => setRoleDraft(event.target.value)} placeholder="e.g. Customer support specialist" /></label>
          <button className="button outline" type="submit" disabled={!roleDraft.trim() || roles.length >= 5}>Add role</button>
        </form>
        {suggestions.length > 0 && <div><p className="field-hint">Suggested from your resume — add only the ones you want:</p><div className="role-chips">{suggestions.map(title => <button key={title} className="button outline" onClick={() => addRole(title)}>+ {title}</button>)}</div></div>}
        <p className="field-hint">Each search uses one role at a time; you can switch roles in Discover.</p>
      </>}
      {step === 1 && <>
        <label className="field compact"><span>City, region or country (optional)</span><input value={location} maxLength={200} onChange={event => setLocation(event.target.value)} /></label>
        <fieldset className="preferences-options"><legend>Work arrangement</legend>{([['', 'Any'], ['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'On-site']] as const).map(([value, label]) => <label key={value} className="checkbox-field"><input type="radio" name="workplace" checked={workplace === value} onChange={() => setWorkplace(value)} />{label}</label>)}</fieldset>
        <p className="field-hint">Remote/hybrid/on-site is sent as a search filter. A typed location is matched only against locations the posting states; postings without a location stay visible and are marked unknown.</p>
      </>}
      {step === 2 && <fieldset className="preferences-options"><legend>Experience level</legend>{([['entry', 'Entry level'], ['mid', 'Mid level'], ['senior', 'Senior'], ['lead', 'Lead, head or director'], ['unsure', 'Not sure'], ['', 'Skip']] as const).map(([value, label]) => <label key={label} className="checkbox-field"><input type="radio" name="level" checked={level === value} onChange={() => setLevel(value)} />{label}</label>)}
        <p className="field-hint">Used to order results, never to hide them. A role ranks higher when its title (for example “Senior” or “Junior”) or a stated “N+ years of experience” fits your level, and lower when it clearly does not. When a posting states neither, its seniority is shown as unknown and does not change its place. Never treated as evidence of your qualifications.</p></fieldset>}
      {step === 3 && <>
        <div className="quick-add-grid">
          <label className="field compact"><span>Minimum</span><input inputMode="decimal" value={minimum} onChange={event => setMinimum(event.target.value.replace(/[^\d.]/g, ''))} aria-invalid={!minimumValid} /></label>
          <label className="field compact"><span>Currency (3 letters)</span><input value={currency} maxLength={3} onChange={event => setCurrency(event.target.value.toUpperCase())} /></label>
          <label className="field compact"><span>Per</span><select value={period} onChange={event => setPeriod(event.target.value as 'year' | 'hour')}><option value="year">Year</option><option value="hour">Hour</option></select></label>
        </div>
        <p className="field-hint">Compared only with salaries a posting states in the same currency and period. A posting without a salary is shown as “Salary not listed” — it is never counted as meeting your minimum.</p>
      </>}
      {step === 4 && <fieldset className="preferences-options"><legend>Choose any that matter</legend>{(Object.keys(PRIORITY_LABELS) as Priority[]).map(item => <label key={item} className="checkbox-field"><input type="checkbox" checked={priorities.includes(item)} onChange={() => setPriorities(current => toggle(current, item))} />{PRIORITY_LABELS[item]}</label>)}
        <p className="field-hint">Used to order results, never to hide them, and only from what a posting states: its listed work arrangement, employment type or salary. Unstated details are shown as unknown and do not move a role up or down. To hide roles instead, use the next step.</p></fieldset>}
      {step === 5 && <fieldset className="preferences-options"><legend>Hide roles when the posting states…</legend>{(Object.keys(DEALBREAKER_LABELS) as Dealbreaker[]).map(item => <label key={item} className="checkbox-field"><input type="checkbox" disabled={item === 'below_salary' && !minimum} checked={dealbreakers.includes(item)} onChange={() => setDealbreakers(current => toggle(current, item))} />{DEALBREAKER_LABELS[item]}{item === 'below_salary' && !minimum ? ' (add a minimum on the Pay step)' : ''}</label>)}
        <p className="field-hint">Dealbreakers are hard limits: a role is hidden only when its posting states this. Hidden roles are counted and can be shown again in Discover. Your level and priorities never hide a role.</p></fieldset>}
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="stage-confirm-actions">
      {step > 0 && <button className="button outline" onClick={() => setStep(value => value - 1)}>Back</button>}
      {step < STEPS.length - 1 ? <button className="button" disabled={!canContinue} onClick={() => setStep(value => value + 1)}>Continue</button>
        : <button className="button" disabled={saving || !roles.length} onClick={() => void finish()}>{saving ? 'Saving…' : 'Show my jobs'}</button>}
      {optional && step < STEPS.length - 1 && <button className="text-button" onClick={() => setStep(value => value + 1)}>Skip this question</button>}
      {roles.length > 0 && step < STEPS.length - 1 && <button className="text-button" disabled={saving} onClick={() => void finish()}>Save and show jobs now</button>}
    </div>
  </main>;
}
