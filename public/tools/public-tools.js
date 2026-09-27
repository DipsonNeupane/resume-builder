import { TOOL_LIMITS, analyzeResumeBullet, compareResumeToJob, extractJobRequirements } from './analysis.js';
const root = document.querySelector('[data-public-tool]');
const analytics = () => window.rsToolAnalytics;
const element = (selector) => {
    const match = document.querySelector(selector);
    if (!match)
        throw new Error(`Missing tool element: ${selector}`);
    return match;
};
const node = (tag, className, text) => {
    const item = document.createElement(tag);
    if (className)
        item.className = className;
    if (text !== undefined)
        item.textContent = text;
    return item;
};
function quote(label, value) {
    const wrapper = node('div', 'evidence-quote');
    wrapper.append(node('span', '', label), node('p', '', value));
    return wrapper;
}
function categoryLabel(category) {
    return category === 'required' ? 'Required' : category === 'preferred' ? 'Preferred' : 'Other signals';
}
function renderRequirements(requirements, container) {
    for (const category of ['required', 'preferred', 'other']) {
        const matches = requirements.filter(item => item.category === category);
        if (!matches.length)
            continue;
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
const evidenceLabels = {
    demonstrated: 'Clearly demonstrated',
    partial: 'Worth reviewing',
    not_demonstrated: 'Not demonstrated',
    confirmed_incompatible: 'Confirmed incompatibility',
};
function renderEvidence(results, container) {
    const summary = node('div', 'evidence-summary');
    for (const status of ['demonstrated', 'partial', 'not_demonstrated']) {
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
        if (result.resumeEvidence)
            item.append(quote('Resume evidence to review', result.resumeEvidence));
        else
            item.append(node('p', 'unknown-note', 'No supporting wording was found in this limited check. That is an unknown, not proof that you lack the qualification.'));
        list.append(item);
    }
    container.append(list);
}
function renderBullet(value, container) {
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
    }
    if (analysis.prompts.length) {
        const prompts = node('section', 'prompt-card');
        prompts.append(node('h3', '', 'Questions that may strengthen the bullet'));
        const ul = node('ul');
        for (const prompt of analysis.prompts)
            ul.append(node('li', '', prompt));
        prompts.append(ul);
        container.append(prompts);
    }
}
function setError(message) {
    const error = element('[data-tool-error]');
    error.textContent = message;
    error.hidden = !message;
}
function clearResult() {
    const output = element('[data-tool-output]');
    output.replaceChildren();
    element('[data-tool-results]').hidden = true;
}
function updateCounts() {
    document.querySelectorAll('textarea[data-maximum]').forEach(textarea => {
        const counter = document.querySelector(`[data-count-for="${textarea.id}"]`);
        if (counter)
            counter.textContent = `${textarea.value.length.toLocaleString('en-US')} / ${Number(textarea.dataset.maximum).toLocaleString('en-US')}`;
    });
}
function initialize() {
    if (!root)
        return;
    const tool = root.dataset.publicTool;
    const form = element('[data-tool-form]');
    form.addEventListener('input', updateCounts);
    form.addEventListener('submit', event => {
        event.preventDefault();
        setError('');
        clearResult();
        analytics()?.event('tool_started');
        const output = element('[data-tool-output]');
        try {
            if (tool === 'job-requirement-extractor') {
                const results = extractJobRequirements(element('#job-description').value);
                if (!results.length)
                    throw new Error('No explicit requirements or responsibility signals were found. Try including the qualifications and responsibilities sections.');
                renderRequirements(results, output);
            }
            else if (tool === 'resume-job-match') {
                const results = compareResumeToJob(element('#resume-text').value, element('#job-description').value);
                if (!results.length)
                    throw new Error('No traceable requirements were found in the job description. Try including its qualifications or responsibilities sections.');
                renderEvidence(results, output);
            }
            else
                renderBullet(element('#resume-bullet').value, output);
            const results = element('[data-tool-results]');
            results.hidden = false;
            results.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
            results.focus({ preventScroll: true });
            analytics()?.event('tool_completed', { outcome: 'success' });
        }
        catch (error) {
            setError(error instanceof Error ? error.message : 'This check could not be completed. Review the input and try again.');
            analytics()?.event('tool_completed', { outcome: 'failure' });
        }
    });
    element('[data-clear-tool]').addEventListener('click', () => {
        form.reset();
        clearResult();
        setError('');
        updateCounts();
        form.querySelector('textarea')?.focus();
    });
    updateCounts();
    window.addEventListener('pageshow', event => { if (event.persisted) {
        form.reset();
        clearResult();
        setError('');
        updateCounts();
    } });
    window.addEventListener('pagehide', () => { form.querySelectorAll('textarea').forEach(textarea => { textarea.value = ''; }); });
}
initialize();
// Compile-time guard: the DOM limits and analysis limits must stay aligned.
void TOOL_LIMITS;
