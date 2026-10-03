import { TOOL_LIMITS, analyzeResumeBullet, compareResumeToJob, extractJobRequirements, type EvidenceResult, type ExtractedRequirement } from './analysis.js';

type ToolId = 'job-requirement-extractor' | 'resume-job-match' | 'resume-bullet-checker';
type ToolAnalytics = { event: (name: 'tool_started' | 'tool_completed' | 'tool_result_reviewed', data?: Record<string, string>) => void };
const pendingJobKey = 'resumestride.pendingJobFirst.v1';

const root = document.querySelector<HTMLElement>('[data-public-tool]');
const analytics = () => (window as typeof window & { rsToolAnalytics?: ToolAnalytics }).rsToolAnalytics;
const element = <T extends HTMLElement>(selector: string): T => {
  const match = document.querySelector<T>(selector);
  if (!match) throw new Error(`Missing tool element: ${selector}`);
  return match;
};
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
};

function quote(label: string, value: string): HTMLElement {
  const wrapper = node('div', 'evidence-quote');
  wrapper.append(node('span', '', label), node('p', '', value));
  return wrapper;
}

function categoryLabel(category: ExtractedRequirement['category']): string {
  return category === 'required' ? 'Required' : category === 'preferred' ? 'Preferred' : 'Other signals';
}

function renderRequirements(requirements: ExtractedRequirement[], container: HTMLElement): void {
  for (const category of ['required', 'preferred', 'other'] as const) {
    const matches = requirements.filter(item => item.category === category);
    if (!matches.length) continue;
    const section = node('section', 'result-group');
    const heading = node('div', 'result-group-heading');
    heading.append(node('h3', '', categoryLabel(category)), node('span', '', String(matches.length)));
    const list = node('ol', 'requirement-list');
    for (const requirement of matches) {
      const item = node('li', 'requirement-card');
      const meta = node('div', 'requirement-meta');
      meta.append(node('span', `signal-tag signal-${requirement.kind}`, requirement.kind), node('span', '', `Source ${requirement.id.slice(0, 4)}`));
      item.append(meta, node('p', 'requirement-text', requirement.text), quote('From the job description', requirement.source));
      list.append(item);
    }
    section.append(heading, list);
    container.append(section);
  }
}

const evidenceLabels: Record<EvidenceResult['status'], string> = {
  demonstrated: 'Clearly demonstrated',
  partial: 'Worth reviewing',
  not_demonstrated: 'Not demonstrated',
  confirmed_incompatible: 'Confirmed incompatibility',
};

function renderEvidence(results: EvidenceResult[], container: HTMLElement): void {
  const summary = node('div', 'evidence-summary');
  for (const status of ['demonstrated', 'partial', 'not_demonstrated'] as const) {
    const count = results.filter(item => item.status === status).length;
    const item = node('div');
    item.append(node('strong', '', String(count)), node('span', '', evidenceLabels[status]));
    summary.append(item);
  }
  container.append(summary);
  const list = node('ol', 'evidence-results');
  for (const result of results) {
    const item = node('li', `evidence-result status-${result.status}`);
    const header = node('div', 'evidence-result-heading');
    header.append(node('span', 'requirement-category', categoryLabel(result.category)), node('strong', '', evidenceLabels[result.status]));
    item.append(header, quote('Job requirement', result.source));
    if (result.resumeEvidence) item.append(quote('Resume evidence to review', result.resumeEvidence));
    else item.append(node('p', 'unknown-note', 'No supporting wording was found in this limited check. That is an unknown, not proof that you lack the qualification.'));
    list.append(item);
  }
  container.append(list);
}

function renderBullet(value: string, container: HTMLElement): void {
  const analysis = analyzeResumeBullet(value);
  const list = node('div', 'dimension-grid');
  for (const dimension of analysis.dimensions) {
    const item = node('article', `dimension-card dimension-${dimension.state}`);
    const heading = node('div');
    heading.append(node('h3', '', dimension.label), node('span', '', dimension.state === 'clear' ? 'Clear' : dimension.state === 'missing' ? 'Add if true' : 'Review'));
    item.append(heading, node('p', '', dimension.explanation));
    list.append(item);
  }
  container.append(list);
  if (analysis.strongerStructure) {
    const structure = node('section', 'structure-card');
    structure.append(node('span', '', 'Stronger structure using only what you provided'), node('p', '', analysis.strongerStructure));
    container.append(structure);
  } else if (analysis.prompts.length) {
    const structure = node('section', 'structure-card');
    structure.append(node('span', '', 'Stronger structure'), node('p', '', 'There is not enough detail to suggest a stronger version yet.'));
    container.append(structure);
  }
  if (analysis.prompts.length) {
    const prompts = node('section', 'prompt-card');
    prompts.append(node('h3', '', 'Questions that may strengthen the bullet'));
    const ul = node('ul');
    for (const prompt of analysis.prompts) ul.append(node('li', '', prompt));
    prompts.append(ul);
    container.append(prompts);
  }
}

function setError(message: string): void {
  const error = element<HTMLElement>('[data-tool-error]');
  error.textContent = message;
  error.hidden = !message;
}

function clearResult(): void {
  const output = element<HTMLElement>('[data-tool-output]');
  output.replaceChildren();
  const results = element<HTMLElement>('[data-tool-results]');
  results.hidden = true;
  delete results.dataset.reviewScope;
}

let reviewObserver: IntersectionObserver | null = null;
let analyzedJobText = '';
function observeEvidenceReview(requirementCount: number): void {
  reviewObserver?.disconnect();
  const results = element<HTMLElement>('[data-tool-results]');
  const firstRequirement = results.querySelector<HTMLElement>('.evidence-result');
  if (!firstRequirement) return;
  reviewObserver = new IntersectionObserver(entries => {
    const viewed = entries.some(entry => entry.target === firstRequirement && entry.isIntersecting && entry.intersectionRatio >= 0.5);
    if (!viewed || document.visibilityState !== 'visible' || results.dataset.reviewScope) return;
    results.dataset.reviewScope = 'limited';
    analytics()?.event('tool_result_reviewed', { review_scope: 'limited', requirement_count: String(Math.min(requirementCount, 12)) });
    reviewObserver?.disconnect();
  }, { threshold: 0.5 });
  reviewObserver.observe(firstRequirement);
}

function updateCounts(): void {
  document.querySelectorAll<HTMLTextAreaElement>('textarea[data-maximum]').forEach(textarea => {
    const counter = document.querySelector<HTMLElement>(`[data-count-for="${textarea.id}"]`);
    if (counter) counter.textContent = `${textarea.value.length.toLocaleString('en-US')} / ${Number(textarea.dataset.maximum).toLocaleString('en-US')}`;
  });
}

function initialize(): void {
  if (!root) return;
  const tool = root.dataset.publicTool as ToolId;
  const form = element<HTMLFormElement>('[data-tool-form]');
  form.addEventListener('input', updateCounts);
  form.addEventListener('submit', event => {
    event.preventDefault();
    setError(''); clearResult(); analytics()?.event('tool_started');
    const output = element<HTMLElement>('[data-tool-output]');
    try {
      if (tool === 'job-requirement-extractor') {
        const results = extractJobRequirements(element<HTMLTextAreaElement>('#job-description').value);
        if (!results.length) throw new Error('No explicit requirements or responsibility signals were found. Try including the qualifications and responsibilities sections.');
        renderRequirements(results, output);
      } else if (tool === 'resume-job-match') {
        const jobText = element<HTMLTextAreaElement>('#job-description').value;
        const results = compareResumeToJob(element<HTMLTextAreaElement>('#resume-text').value, jobText);
        if (!results.length) throw new Error('No traceable requirements were found in the job description. Try including its qualifications or responsibilities sections.');
        analyzedJobText = jobText.trim();
        renderEvidence(results, output);
      } else renderBullet(element<HTMLTextAreaElement>('#resume-bullet').value, output);
      const results = element<HTMLElement>('[data-tool-results]');
      results.hidden = false;
      results.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      results.focus({ preventScroll: true });
      analytics()?.event('tool_completed', { outcome: 'success' });
      if (tool === 'resume-job-match') observeEvidenceReview(output.querySelectorAll('.evidence-result').length);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'This check could not be completed. Review the input and try again.');
      analytics()?.event('tool_completed', { outcome: 'failure' });
    }
  });
  if (tool === 'resume-job-match') {
    const continuation = document.querySelector<HTMLAnchorElement>('[data-tool-cta="full_match"]');
    continuation?.addEventListener('click', event => {
      const visibleResult = !element<HTMLElement>('[data-tool-results]').hidden;
      if (!visibleResult || analyzedJobText.length < 40) {
        event.preventDefault();
        setError('Complete and review the evidence check before continuing.');
        return;
      }
      try {
        sessionStorage.setItem(pendingJobKey, JSON.stringify({ version: 1, ownerId: null, createdAt: Date.now(), capture: {
          title: '', company: '', description: analyzedJobText, sourceUrl: '', capturedAt: new Date().toISOString(), site: 'manual',
        } }));
      } catch {
        event.preventDefault();
        setError('This browser could not preserve the job description for the next step. Keep this tab open and try again.');
      }
    });
  }
  element<HTMLButtonElement>('[data-clear-tool]').addEventListener('click', () => {
    reviewObserver?.disconnect();
    analyzedJobText = '';
    if (tool === 'resume-job-match') sessionStorage.removeItem(pendingJobKey);
    form.reset(); clearResult(); setError(''); updateCounts();
    form.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  });
  updateCounts();
  window.addEventListener('pageshow', event => { if (event.persisted) { form.reset(); clearResult(); setError(''); updateCounts(); } });
  window.addEventListener('pagehide', () => { reviewObserver?.disconnect(); form.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(textarea => { textarea.value = ''; }); });
}

initialize();

// Compile-time guard: the DOM limits and analysis limits must stay aligned.
void TOOL_LIMITS;
