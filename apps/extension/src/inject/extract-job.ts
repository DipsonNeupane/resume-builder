// User-clicked isolated-world capture. Local fixture text and exact Greenhouse public
// Job Board GET endpoints only; never applications, cookies, or arbitrary page scraping.
// This classic script returns a Promise which chrome.scripting.executeScript awaits.
(async function () {
  function sanitizeText(raw: unknown, maxChars: number): string {
    if (typeof raw !== 'string') return '';
    const stripped = raw
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return stripped.length > maxChars ? `${stripped.slice(0, maxChars - 1).trim()}…` : stripped;
  }

  function textOf(selector: string): string {
    const el = document.querySelector(selector);
    return el ? el.textContent || '' : '';
  }

  type RawCapture = { title: string; company: string; description: string; location?: string;
    workplace?: 'remote'; employmentType?: string;
    salary?: { min: number; max: number; currency: string; period: string } };
  function inertText(html: string): string {
    const template = document.createElement('template'); template.innerHTML = html;
    template.content.querySelectorAll('script,style,iframe,object,embed,form,input,textarea,button').forEach(node => node.remove());
    template.content.querySelectorAll('p,div,li,br,h1,h2,h3,h4').forEach(node => node.before(document.createTextNode('\n')));
    return template.content.textContent || '';
  }
  const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  // Only a single unambiguous JobPosting. Never collect a results list, arbitrary page text,
  // contact fields, embedded account data, or referenced URLs. No network requests here.
  function structuredJob(): RawCapture | null {
    // Query-only job identity cannot be preserved while stripping private parameters.
    if (location.hash) return null;
    if (Array.from(new URLSearchParams(location.search).keys()).some(key => !/^(utm_[a-z_]+|gclid|fbclid)$/i.test(key))) return null;
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    if (scripts.length > 16) return null;
    const jobs: Record<string, unknown>[] = []; let bytes = 0; let nodes = 0;
    function visit(v: unknown, depth = 0) {
      if (++nodes > 100 || depth > 5) throw new Error('Structured data too complex');
      if (Array.isArray(v)) { for (const item of v) visit(item, depth + 1); return; }
      if (!record(v)) return;
      if (v['@type'] === 'JobPosting' || (Array.isArray(v['@type']) && v['@type'].includes('JobPosting'))) jobs.push(v);
      if (v['@graph']) visit(v['@graph'], depth + 1);
    }
    for (const script of scripts) {
      const raw = script.textContent || ''; bytes += raw.length;
      if (bytes > 262144) return null;
      try { visit(JSON.parse(raw)); } catch { return null; }
    }
    if (jobs.length !== 1) return null;
    const job = jobs[0];
    if (typeof job.url === 'string') {
      try { const url = new URL(job.url, location.href); if (url.origin + url.pathname !== location.origin + location.pathname) return null; } catch { return null; }
    }
    if (typeof job.title !== 'string' || typeof job.description !== 'string' || !record(job.hiringOrganization) || typeof job.hiringOrganization.name !== 'string') return null;
    const description = inertText(job.description);
    if (!job.title.trim() || !job.hiringOrganization.name.trim() || !description.trim()) return null;
    const result: RawCapture = { title: inertText(job.title), company: inertText(job.hiringOrganization.name), description };
    const place = record(job.jobLocation) ? job.jobLocation : null;
    const address = place && record(place.address) ? place.address : null;
    if (address) result.location = ['addressLocality','addressRegion','addressCountry'].map(k => typeof address[k] === 'string' ? address[k] : '').filter(Boolean).join(', ');
    if (job.jobLocationType === 'TELECOMMUTE') result.workplace = 'remote';
    const employment: Record<string, string> = { FULL_TIME: 'full_time', PART_TIME: 'part_time', CONTRACTOR: 'contract', TEMPORARY: 'temporary', INTERN: 'internship' };
    if (typeof job.employmentType === 'string') result.employmentType = employment[job.employmentType];
    const salary = record(job.baseSalary) ? job.baseSalary : null;
    const amount = salary && record(salary.value) ? salary.value : null;
    if (salary && amount && typeof salary.currency === 'string' && /^[A-Z]{3}$/.test(salary.currency)) {
      const min = amount.minValue ?? amount.value; const max = amount.maxValue ?? amount.value;
      const period = amount.unitText === 'YEAR' ? 'year' : amount.unitText === 'HOUR' ? 'hour' : null;
      if (typeof min === 'number' && typeof max === 'number' && Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max >= min && max <= 1e12 && period) result.salary = { min, max, currency: salary.currency, period };
    }
    return result;
  }
  function leverJob(): RawCapture | null {
    if (location.protocol !== 'https:' || !['jobs.lever.co','jobs.eu.lever.co'].includes(location.hostname) || !/^\/[^/]+\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/?$/.test(location.pathname)) return null;
    const title = textOf('.posting-headline h2');
    const company = document.querySelector('.main-header-logo img')?.getAttribute('alt') || '';
    const sections = document.querySelectorAll('.section-wrapper .posting');
    if (!title.trim() || !company.trim() || !sections.length || sections.length > 20) return null;
    const description = Array.from(sections).map(section => inertText(section.innerHTML)).join('\n');
    if (!description.trim() || description.length > 262144) return null;
    return { title, company, description, location: textOf('.posting-categories .location') };
  }

  // Local development fixture adapter.
  function extractFixtureAdapter(): RawCapture | null {
    const isLocalHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const isFixturePath = /\/extension-fixture\/job-posting/.test(location.pathname);
    if (!isLocalHost || !isFixturePath) return null;
    const raw: RawCapture = {
      title: textOf('[data-resumestride-field="title"]'),
      company: textOf('[data-resumestride-field="company"]'),
      description: textOf('[data-resumestride-field="description"]'),
    };
    if (!raw.title && !raw.company && !raw.description) return null;
    return raw;
  }

  // Greenhouse documents these GET endpoints as public and unauthenticated.
  // Only the single job explicitly opened by the user is requested; never applications.
  async function extractGreenhouse(): Promise<RawCapture | null> {
    if (location.protocol !== 'https:' || !['job-boards.greenhouse.io', 'boards.greenhouse.io'].includes(location.hostname)) return null;
    const match = location.pathname.match(/^\/([A-Za-z0-9_-]{1,100})\/jobs\/([0-9]{1,20})\/?$/);
    if (!match) return null;
    async function publicJson(url: string): Promise<Record<string, unknown>> {
      const response = await fetch(url, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(10000) });
      if (!response.ok || !response.body) throw new Error('Job is unavailable');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 524288) { await reader.cancel(); throw new Error('Job response is too large'); } chunks.push(next.value); } }
      finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid job response');
      return value as Record<string, unknown>;
    }
    const base = 'https://boards-api.greenhouse.io/v1/boards/' + match[1];
    const [job, board] = await Promise.all([publicJson(base + '/jobs/' + match[2]), publicJson(base)]);
    if (String(job.id) !== match[2] || typeof job.title !== 'string' || typeof job.content !== 'string' || typeof board.name !== 'string') throw new Error('Job details did not match this page');
    // Decode API HTML entities inside an inert textarea, then an inert template.
    // Neither is attached to the document; no script, image or embedded form executes.
    const decoder = document.createElement('textarea'); decoder.innerHTML = job.content;
    const template = document.createElement('template'); template.innerHTML = decoder.value;
    template.content.querySelectorAll('script,style,iframe,object,embed,form,input,textarea,button').forEach(node => node.remove());
    template.content.querySelectorAll('p,div,li,br,h1,h2,h3,h4').forEach(node => { node.before(document.createTextNode('\n')); });
    const description = template.content.textContent || '';
    if (!job.title.trim() || !description.trim()) throw new Error('Job description is empty');
    return { title: job.title, company: board.name, description, location: record(job.location) && typeof job.location.name === 'string' ? job.location.name : '' };
  }

  if (!['http:','https:'].includes(location.protocol) || /(^|\.)(linkedin\.com|indeed\.[a-z.]+)$/.test(location.hostname)) return { supported: false, reason: 'This site is not supported. Enter the job details manually.' };
  let raw: RawCapture | null = extractFixtureAdapter();
  let site = raw ? 'fixture' : 'jsonld';
  if (!raw) raw = structuredJob();
  if (!raw) { raw = leverJob(); if (raw) site = 'lever'; }
  if (!raw) {
    try { raw = await extractGreenhouse(); if (raw) site = 'greenhouse'; }
    catch { return { supported: false, reason: 'The public job details could not be loaded or verified. The posting may have closed. No resume was sent; retry or enter the details below.' }; }
  }

  if (!raw) {
    return {
      supported: false,
      reason:
        "ResumeStride doesn't have a reviewed way to read job details from this page yet (supported: verified JobPosting structured data, public Greenhouse pages, selected Lever pages, and the local test page). Type the title, company, and description yourself below — nothing was read from this page.",
    };
  }

  return {
    supported: true,
    capture: {
      title: sanitizeText(raw.title, 300),
      company: sanitizeText(raw.company, 300),
      description: sanitizeText(raw.description, 12000),
      location: sanitizeText(raw.location, 300),
      ...(raw.workplace ? { workplace: raw.workplace } : {}),
      ...(raw.employmentType ? { employmentType: raw.employmentType } : {}),
      ...(raw.salary ? { salary: raw.salary } : {}),
      site,
      sourceUrl: location.origin + location.pathname,
      capturedAt: new Date().toISOString(),
    },
  };
})();
