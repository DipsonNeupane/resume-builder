// User-clicked isolated-world capture. Stable structured page data plus exact Greenhouse
// job-page/public Job Board data only; never applications, cookies, or results cards.
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
  const uuidPath = /^\/[^/]+\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/?$/;

  type Site = 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'linkedin' | 'indeed' | 'ziprecruiter' | 'jsonld' | 'fixture' | 'confirmed';

  function sourceUrl(): string {
    const url = new URL(location.href);
    url.hash = '';
    const identityKeys = new Set(['id', 'job', 'jobid', 'job_id', 'gh_jid', 'jk', 'vjk', 'lvk', 'reqid', 'position', 'postingid']);
    const preserved = Array.from(url.searchParams.entries())
      .filter(([key, item]) => identityKeys.has(key.toLowerCase()) && item.length > 0 && item.length <= 200)
      .sort(([a], [b]) => a.localeCompare(b));
    url.search = '';
    for (const [key, item] of preserved) url.searchParams.append(key, item);
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  }

  function knownDetailSite(): Site | null {
    const host = location.hostname.toLowerCase();
    if ((host === 'www.linkedin.com' || host.endsWith('.linkedin.com')) && /^\/jobs\/view\/(?:[^/]*-)?\d+\/?$/.test(location.pathname)) return 'linkedin';
    if (/(^|\.)indeed\.[a-z.]+$/.test(host) && /^\/(?:m\/)?viewjob\/?$/i.test(location.pathname) && !!(new URLSearchParams(location.search).get('jk') || new URLSearchParams(location.search).get('vjk'))) return 'indeed';
    if ((host === 'ziprecruiter.com' || host.endsWith('.ziprecruiter.com')) && (/^\/jobs\/[^/]+\/[^/]+/.test(location.pathname) || /^\/c\/[^/]+\/Job\/[^/]+/.test(location.pathname) || /^[A-Za-z0-9_-]{3,200}$/.test(new URLSearchParams(location.search).get('lvk') || ''))) return 'ziprecruiter';
    if (['job-boards.greenhouse.io', 'boards.greenhouse.io'].includes(host) && /^\/[A-Za-z0-9_-]{1,100}\/jobs\/[0-9]{1,20}\/?$/.test(location.pathname)) return 'greenhouse';
    if (['jobs.lever.co', 'jobs.eu.lever.co'].includes(host) && uuidPath.test(location.pathname)) return 'lever';
    if (host === 'jobs.ashbyhq.com' && uuidPath.test(location.pathname)) return 'ashby';
    if (host.endsWith('.myworkdayjobs.com') && /\/job\//.test(location.pathname)) return 'workday';
    if ((host === 'localhost' || host === '127.0.0.1') && /\/extension-fixture\/job-posting/.test(location.pathname)) return 'fixture';
    return null;
  }

  function structuredSite(): 'lever' | 'ashby' | 'workday' | 'jsonld' {
    if (['jobs.lever.co', 'jobs.eu.lever.co'].includes(location.hostname) && uuidPath.test(location.pathname)) return 'lever';
    if (location.hostname === 'jobs.ashbyhq.com' && uuidPath.test(location.pathname)) return 'ashby';
    if (location.hostname.endsWith('.myworkdayjobs.com') && /\/job\//.test(location.pathname)) return 'workday';
    return 'jsonld';
  }

  function isKnownStableDetailPath(): boolean {
    return structuredSite() !== 'jsonld';
  }

  function structuredLocation(value: unknown): string {
    const places = Array.isArray(value) ? value.slice(0, 20) : [value];
    const labels: string[] = [];
    for (const placeValue of places) {
      if (!record(placeValue)) continue;
      const address = record(placeValue.address) ? placeValue.address : null;
      if (!address) continue;
      const label = ['addressLocality', 'addressRegion', 'addressCountry']
        .map(key => typeof address[key] === 'string' ? address[key].trim() : '')
        .filter(Boolean)
        .join(', ');
      if (label && !labels.includes(label)) labels.push(label);
    }
    return labels.join('; ');
  }

  // Only a single unambiguous JobPosting. Never collect a results list, arbitrary page text,
  // contact fields, embedded account data, or referenced URLs. No network requests here.
  function structuredJob(): RawCapture | null {
    if (location.hash) return null;
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
    const locationLabel = structuredLocation(job.jobLocation);
    if (locationLabel) result.location = locationLabel;
    if (job.jobLocationType === 'TELECOMMUTE') result.workplace = 'remote';
    const employment: Record<string, string> = { FULL_TIME: 'full_time', PART_TIME: 'part_time', CONTRACTOR: 'contract', TEMPORARY: 'temporary', INTERN: 'internship' };
    const employmentType = Array.isArray(job.employmentType) ? job.employmentType.find(value => typeof value === 'string' && employment[value]) : job.employmentType;
    if (typeof employmentType === 'string') result.employmentType = employment[employmentType];
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
    if (location.protocol !== 'https:' || !['jobs.lever.co','jobs.eu.lever.co'].includes(location.hostname) || !uuidPath.test(location.pathname)) return null;
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

  // Current Greenhouse pages ship the opened job as serialized Remix loader data. Parse
  // the inert JSON assignment instead of depending on visual selectors or executing page
  // code. The documented public API remains a compatibility fallback for older boards.
  async function extractGreenhouse(): Promise<RawCapture | null> {
    if (location.protocol !== 'https:' || !['job-boards.greenhouse.io', 'boards.greenhouse.io'].includes(location.hostname)) return null;
    const match = location.pathname.match(/^\/([A-Za-z0-9_-]{1,100})\/jobs\/([0-9]{1,20})\/?$/);
    if (!match) return null;
    const remixPrefix = 'window.__remixContext = ';
    for (const script of Array.from(document.scripts).slice(0, 16)) {
      const source = script.textContent || '';
      if (!source.startsWith(remixPrefix) || source.length > 524288) continue;
      try {
        const serialized = source.slice(remixPrefix.length).trim().replace(/;$/, '');
        const context: unknown = JSON.parse(serialized);
        if (!record(context) || !record(context.state) || !record(context.state.loaderData)) continue;
        const route = context.state.loaderData['routes/$url_token_.jobs_.$job_post_id'];
        if (!record(route) || String(route.jobPostId) !== match[2] || !record(route.jobPost)) continue;
        const job = route.jobPost;
        if (typeof job.title !== 'string' || typeof job.company_name !== 'string' || typeof job.content !== 'string') continue;
        const description = inertText(job.content);
        if (!job.title.trim() || !job.company_name.trim() || !description.trim()) continue;
        return {
          title: job.title,
          company: job.company_name,
          description,
          location: typeof job.job_post_location === 'string' ? job.job_post_location : '',
        };
      } catch { /* Try the documented public endpoint fallback. */ }
    }
    // Greenhouse removes its hydration script after the client starts. Its rendered job
    // document retains scoped semantic job classes; read only that job container and never
    // the application form or surrounding page.
    const jobRoot = document.querySelector('main.job-post');
    const titleElement = jobRoot?.querySelector('.job__title h1');
    const descriptionElement = jobRoot?.querySelector('.job__description');
    const title = titleElement?.textContent || '';
    const renderedDescription = descriptionElement ? inertText(descriptionElement.innerHTML) : '';
    const documentTitlePrefix = `Job Application for ${title.trim()} at `;
    const logoCompany = Array.from(jobRoot?.querySelectorAll('img[alt$=" Logo"]') || [])
      .map(image => image.getAttribute('alt')?.replace(/ Logo$/, '') || '')
      .find(Boolean) || '';
    const company = document.title.startsWith(documentTitlePrefix)
      ? document.title.slice(documentTitlePrefix.length)
      : logoCompany;
    if (title.trim() && company.trim() && renderedDescription.trim()) {
      return { title, company, description: renderedDescription, location: jobRoot?.querySelector('.job__location')?.textContent || '' };
    }
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

  if (!['http:','https:'].includes(location.protocol)) return { detected: false, state: 'no_job', reason: 'No job detected on this page.' };
  const detailSite = knownDetailSite();
  const restrictedDetail = detailSite === 'linkedin' || detailSite === 'indeed' || detailSite === 'ziprecruiter';
  if (restrictedDetail) {
    return { detected: true, capture: { title: '', company: '', description: '', site: detailSite, sourceUrl: sourceUrl(), capturedAt: new Date().toISOString() } };
  }
  let raw: RawCapture | null = extractFixtureAdapter();
  let site: Site = raw ? 'fixture' : structuredSite();
  if (!raw) raw = structuredJob();
  if (!raw) { raw = leverJob(); if (raw) site = 'lever'; }
  if (!raw) {
    try { raw = await extractGreenhouse(); if (raw) site = 'greenhouse'; }
    catch { /* A recognized detail URL remains saveable without enrichment. */ }
  }

  if (!raw) {
    const knownListingPage =
      (['job-boards.greenhouse.io', 'boards.greenhouse.io'].includes(location.hostname) && !/^\/[A-Za-z0-9_-]{1,100}\/jobs\/[0-9]{1,20}\/?$/.test(location.pathname)) ||
      (['jobs.lever.co', 'jobs.eu.lever.co'].includes(location.hostname) && !uuidPath.test(location.pathname)) ||
      (location.hostname === 'jobs.ashbyhq.com' && !uuidPath.test(location.pathname)) ||
      (location.hostname.endsWith('.myworkdayjobs.com') && !/\/job\//.test(location.pathname));
    if (detailSite) return { detected: true, capture: { title: '', company: '', description: '', site: detailSite, sourceUrl: sourceUrl(), capturedAt: new Date().toISOString() } };
    return knownListingPage
      ? { detected: false, state: 'open_detail', reason: 'Open an individual job page to save it.' }
      : { detected: false, state: 'no_job', reason: 'No job detected on this page.', sourceUrl: sourceUrl(), canConfirm: true };
  }

  return {
    detected: true,
    capture: {
      title: sanitizeText(raw.title, 300),
      company: sanitizeText(raw.company, 300),
      description: sanitizeText(raw.description, 12000),
      location: sanitizeText(raw.location, 300),
      ...(raw.workplace ? { workplace: raw.workplace } : {}),
      ...(raw.employmentType ? { employmentType: raw.employmentType } : {}),
      ...(raw.salary ? { salary: raw.salary } : {}),
      site,
      sourceUrl: sourceUrl(),
      capturedAt: new Date().toISOString(),
    },
  };
})();
