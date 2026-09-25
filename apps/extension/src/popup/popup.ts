// The extension's entire UI. Runs as a real ES module (loaded from popup.html), so unlike the
// injected/content scripts it can freely import the shared lib. Opening the popup is itself the
// user-click that invokes activeTab, so extraction runs immediately against whatever tab was
// active — never on a schedule, never in the background, never on a page the user didn't just
// choose to look at.
import type { ExtractResult, JobCapture } from '../lib/types.js';
import { isAllowedAppUrl, defaultAppUrl, maxDescriptionChars, maxShortFieldChars } from '../lib/config.js';
import { readPending, keepPending, clearPending } from '../lib/pending.js';
import { captureSourceUrl, isJobCapture } from '../lib/capture.js';
import { sanitizeText } from '../lib/sanitize.js';

function field(labelText: string, value: string, maxLength: number, multiline: boolean) {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';
  const span = document.createElement('span');
  span.textContent = labelText;
  const control = document.createElement(multiline ? 'textarea' : 'input') as HTMLInputElement | HTMLTextAreaElement;
  control.maxLength = maxLength;
  control.value = value;
  if (multiline) (control as HTMLTextAreaElement).rows = 6;
  wrapper.append(span, control);
  return { wrapper, control };
}

function originAndPath(url: string): string { return captureSourceUrl(url) || ''; }

async function extractFromActiveTab(): Promise<{ result: ExtractResult; tabUrl: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { result: { supported: false, reason: 'No active tab was found.' }, tabUrl: '' };
  }
  try {
    const [{ result }] = await chrome.scripting.executeScript<ExtractResult>({
      target: { tabId: tab.id },
      files: ['dist/inject/extract-job.js'],
    });
    return { result, tabUrl: tab.url ?? '' };
  } catch {
    // Browser-internal pages (chrome://, the Chrome Web Store, PDF viewer, etc.) refuse script
    // injection outright — this is not a bug to work around, it's the platform correctly
    // keeping activeTab away from pages it was never meant to reach.
    return {
      result: {
        supported: false,
        reason: "ResumeStride can't read this page (it may be a browser-internal page). Type the details yourself below.",
      },
      tabUrl: tab.url ?? '',
    };
  }
}

function render(root: HTMLElement, result: ExtractResult, tabUrl: string): void {
  root.textContent = '';

  const heading = document.createElement('h1');
  heading.textContent = 'ResumeStride job capture';
  root.appendChild(heading);
  const steps = document.createElement('div');
  steps.className = 'capture-steps';
  const current = document.createElement('strong'); current.textContent = '01 Review job';
  const next = document.createElement('span'); next.textContent = '02 Open in ResumeStride';
  steps.append(current, next); root.appendChild(steps);

  const notice = document.createElement('p');
  notice.className = 'notice';
  notice.textContent = result.supported
    ? 'Review the captured job details before sending them to ResumeStride. Your resume has not been sent.'
    : result.reason;
  root.appendChild(notice);
  if (result.supported && result.capture.description.endsWith('…')) {
    const warning = document.createElement('p');
    warning.className = 'notice';
    warning.textContent = 'This posting exceeds the capture limit. Only the beginning is included; review and replace it with the most relevant duties and requirements before tailoring.';
    root.appendChild(warning);
  }

  const initialCapture: JobCapture = result.supported
    ? result.capture
    : { title: '', company: '', description: '', sourceUrl: originAndPath(tabUrl), capturedAt: new Date().toISOString() };

  const form = document.createElement('form');
  const titleField = field('Job title', initialCapture.title, maxShortFieldChars, false);
  const companyField = field('Company', initialCapture.company, maxShortFieldChars, false);
  const locationField = field('Location (optional)', initialCapture.location || '', 300, false);
  const sourceField = field('Source URL', initialCapture.sourceUrl, 2000, false);
  const descriptionField = field('Job description', initialCapture.description, maxDescriptionChars, true);
  const appUrlField = field('ResumeStride app URL', defaultAppUrl, 200, false);
  const appUrlHint = document.createElement('p');
  appUrlHint.className = 'hint';
  appUrlHint.textContent = 'Defaults to the production ResumeStride site. For local testing, use http://localhost or http://127.0.0.1 on port 5173, 5183, or 5185.';
  function select(label: string, values: string[], current: string) {
    const wrapper = document.createElement('label'); wrapper.className = 'field'; wrapper.textContent = label;
    const control = document.createElement('select');
    values.forEach(value => { const option = document.createElement('option'); option.value = value; option.textContent = value.replaceAll('_', ' '); control.append(option); });
    control.value = current; wrapper.append(control); return { wrapper, control };
  }
  const workplace = select('Workplace (optional)', ['unknown','remote','hybrid','onsite','field'], initialCapture.workplace || 'unknown');
  const employment = select('Employment type (optional)', ['unknown','full_time','part_time','contract','temporary','internship'], initialCapture.employmentType || 'unknown');
  const salaryMin = field('Salary minimum (optional)', initialCapture.salary?.min.toString() || '', 20, false);
  const salaryMax = field('Salary maximum (optional)', initialCapture.salary?.max.toString() || '', 20, false);
  const currency = field('Salary currency (ISO code)', initialCapture.salary?.currency || '', 3, false);
  const period = select('Salary period', ['year','hour'], initialCapture.salary?.period || 'year');
  const preferences = document.createElement('details'); preferences.className = 'capture-options';
  const preferencesLabel = document.createElement('summary'); preferencesLabel.textContent = 'Location, workplace & salary';
  preferences.append(preferencesLabel, locationField.wrapper, workplace.wrapper, employment.wrapper, salaryMin.wrapper, salaryMax.wrapper, currency.wrapper, period.wrapper);
  const connection = document.createElement('details'); connection.className = 'capture-options';
  const connectionLabel = document.createElement('summary'); connectionLabel.textContent = 'Source & connection';
  connection.append(connectionLabel, sourceField.wrapper, appUrlField.wrapper, appUrlHint);
  form.append(titleField.wrapper, companyField.wrapper, descriptionField.wrapper, preferences, connection);
  const { sourceUrl: _source, capturedAt: _time, site: _site, original: priorOriginal, originalSourceUrl: _originalUrl, ...originalFields } = initialCapture;
  function reviewedCapture(): JobCapture {
    return {
      title: sanitizeText(titleField.control.value, maxShortFieldChars),
      company: sanitizeText(companyField.control.value, maxShortFieldChars),
      description: sanitizeText(descriptionField.control.value, maxDescriptionChars),
      location: sanitizeText(locationField.control.value, 300),
      workplace: workplace.control.value as JobCapture['workplace'],
      employmentType: employment.control.value as JobCapture['employmentType'],
      salary: salaryMin.control.value || salaryMax.control.value || currency.control.value ? { min: salaryMin.control.value.trim() ? Number(salaryMin.control.value) : NaN, max: salaryMax.control.value.trim() ? Number(salaryMax.control.value) : NaN, currency: currency.control.value.toUpperCase(), period: period.control.value as 'hour' | 'year' } : null,
      sourceUrl: captureSourceUrl(sourceField.control.value) ?? sourceField.control.value,
      capturedAt: initialCapture.capturedAt,
      originalSourceUrl: initialCapture.originalSourceUrl ?? initialCapture.sourceUrl,
      site: initialCapture.site || 'manual', original: priorOriginal || originalFields,
    };
  }
  let pendingWrite = Promise.resolve();
  form.addEventListener('input', () => {
    const capture = reviewedCapture();
    if (isJobCapture(capture)) pendingWrite = pendingWrite.then(() => keepPending(capture)).catch(() => { status.textContent = 'Could not preserve this capture for retry. Keep this popup open.'; });
  });
  const discard = document.createElement('button'); discard.type = 'button'; discard.textContent = 'Discard capture / capture current tab';
  discard.addEventListener('click', async () => { await pendingWrite; await clearPending(); const next = await extractFromActiveTab(); if (next.result.supported) await keepPending(next.result.capture); render(root, next.result, next.tabUrl); });
  form.append(discard);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.textContent = 'Send reviewed details to ResumeStride';
  form.appendChild(submitButton);

  const status = document.createElement('p');
  status.className = 'status';
  status.setAttribute('role', 'status');
  form.appendChild(status);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const capture = reviewedCapture();
    if (!isJobCapture(capture)) { status.textContent = 'Review the source URL and salary fields. Use an HTTP(S) URL without credentials and a valid salary range/currency.'; return; }
    if (!capture.title && !capture.company && !capture.description) {
      status.textContent = 'Add at least a title, company, or description before sending.';
      return;
    }
    let appUrl: URL;
    try {
      appUrl = new URL(appUrlField.control.value);
    } catch {
      status.textContent = 'Enter a valid app URL, e.g. http://localhost:5173/';
      return;
    }
    const isAllowedDestination = isAllowedAppUrl(appUrl);
    if (!isAllowedDestination) {
      status.textContent = 'Use https://resumestride.com, or for local testing http://localhost or http://127.0.0.1 on port 5173, 5183 or 5185 — with path / and no credentials, query or fragment.';
      return;
    }
    if (submitButton.disabled) return;
    submitButton.disabled = true;
    status.textContent = 'Opening a separate ResumeStride tab…';
    try {
      await pendingWrite;
      await keepPending(capture);
      const response = await chrome.runtime.sendMessage({type:'resumestride:send-reviewed-job',capture,appUrl:appUrl.toString()});
      const received = response?.received === true;
      status.textContent=received?'ResumeStride received the details. Switch to the new tab to save the job and see how you match.':'Delivery was not confirmed. Check the new tab before retrying. This capture is kept for up to 30 minutes in this browser session; reopen the extension to retry.';
    } catch {
      status.textContent='Could not open or reach ResumeStride. Check the local server and try again.';
    } finally { submitButton.disabled=false; }

  });

  root.appendChild(form);
}

async function main(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  root.textContent = 'Reading the current tab…';
  const pending = await readPending();
  if (pending) { render(root, { supported: true, capture: pending }, ''); return; }
  const { result, tabUrl } = await extractFromActiveTab();
  if (result.supported) await keepPending(result.capture);
  render(root, result, tabUrl);
}

void main().catch(() => { const root = document.getElementById('app'); if (root) root.textContent = 'Capture could not start. Close and reopen the extension to retry.'; });
