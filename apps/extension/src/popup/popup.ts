import type { ExtractResult, JobCapture, SaveResult } from '../lib/types.js';
import { defaultAppUrl } from '../lib/config.js';
import { captureSourceUrl, isJobCapture } from '../lib/capture.js';

async function inspectActiveTab(): Promise<ExtractResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { detected: false, state: 'no_job', reason: 'No job detected on this page.' };
  try {
    const [{ result }] = await chrome.scripting.executeScript<ExtractResult>({ target: { tabId: tab.id }, files: ['dist/inject/extract-job.js'] });
    return result;
  } catch {
    const sourceUrl = captureSourceUrl(tab.url || '') || undefined;
    return { detected: false, state: 'no_job', reason: 'No job detected on this page.', sourceUrl, canConfirm: Boolean(sourceUrl) };
  }
}

function sourceLabel(capture: JobCapture): string {
  try { return new URL(capture.sourceUrl).hostname.replace(/^www\./, ''); } catch { return 'External job'; }
}

function shell(root: HTMLElement, state: string, title: string, detail = ''): HTMLElement {
  root.textContent = '';
  const header = document.createElement('header');
  header.innerHTML = '<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><strong>APWICO</strong>';
  const panel = document.createElement('section'); panel.className = `panel ${state}`;
  const eyebrow = document.createElement('span'); eyebrow.className = 'eyebrow'; eyebrow.textContent = state.replace('_', ' ');
  const heading = document.createElement('h1'); heading.textContent = title;
  panel.append(eyebrow, heading);
  if (detail) { const copy = document.createElement('p'); copy.textContent = detail; panel.append(copy); }
  root.append(header, panel);
  return panel;
}

function button(label: string, className = 'primary'): HTMLButtonElement {
  const control = document.createElement('button'); control.type = 'button'; control.className = className; control.textContent = label; return control;
}

async function focusTab(tabId?: number): Promise<void> {
  if (typeof tabId === 'number') await chrome.tabs.update(tabId, { active: true });
  window.close();
}

function renderDetected(root: HTMLElement, capture: JobCapture): void {
  const enriched = Boolean(capture.title.trim() && capture.company.trim());
  const panel = shell(root, 'job_detected', enriched ? capture.title : 'Job detected', enriched ? capture.company : sourceLabel(capture));
  const save = button('Save to APWICO'); panel.append(save);
  const status = document.createElement('p'); status.className = 'status'; status.setAttribute('role', 'status'); panel.append(status);
  save.addEventListener('click', async () => {
    if (save.disabled || !isJobCapture(capture)) return;
    save.disabled = true; save.textContent = 'Saving…'; status.textContent = '';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'resumestride:save-job', capture, appUrl: defaultAppUrl }) as SaveResult;
      if (result.status === 'saved' || result.status === 'already_saved') {
        const already = result.status === 'already_saved';
        const done = shell(root, already ? 'already_saved' : 'saved', already ? 'Already saved' : 'Saved ✓', sourceLabel(capture));
        const open = button('Open in APWICO'); done.append(open); open.addEventListener('click', () => void focusTab(result.tabId));
        return;
      }
      if (result.status === 'signed_out') {
        const signedOut = shell(root, 'signed_out', 'Sign in to APWICO', 'Sign in, then return here and save again.');
        const signIn = button('Sign in to APWICO'); signedOut.append(signIn); signIn.addEventListener('click', () => void focusTab(result.tabId));
        return;
      }
      status.textContent = result.message || 'Could not save this job. Try again.';
    } catch { status.textContent = 'Could not reach APWICO. Check your connection and try again.'; }
    save.disabled = false; save.textContent = 'Try again';
  });
}

function renderNoJob(root: HTMLElement, result: ExtractResult & { detected: false }): void {
  const title = result.state === 'open_detail' ? 'Open the individual job page' : 'No job detected on this page';
  const panel = shell(root, 'no_job', title, result.state === 'open_detail' ? result.reason : 'Open a job posting and try again.');
  if (!result.canConfirm || !result.sourceUrl) return;
  const manual = button('Save job URL manually', 'secondary'); panel.append(manual);
  manual.addEventListener('click', () => {
    if (!window.confirm('Save this URL as a job posting? Only continue if this page is an individual job opportunity.')) return;
    renderDetected(root, { title: '', company: '', description: '', sourceUrl: result.sourceUrl!, capturedAt: new Date().toISOString(), site: 'confirmed' });
  });
}

async function main(): Promise<void> {
  const root = document.getElementById('app'); if (!root) return;
  shell(root, 'loading', 'Checking this page…');
  const result = await inspectActiveTab();
  if (result.detected) renderDetected(root, result.capture); else renderNoJob(root, result);
}

void main().catch(() => { const root = document.getElementById('app'); if (root) shell(root, 'error', 'Could not check this page', 'Close the panel and try again.'); });
