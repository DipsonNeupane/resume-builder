// Runs only after the user clicks the extension. It reads the active, visible job detail
// and never cookies, profiles, messages, search-result lists, or background pages.
(async function () {
  type RawCapture = { title: string; company: string; description: string; location?: string;
    workplace?: 'remote'; employmentType?: string;
    salary?: { min: number; max: number; currency: string; period: string } };
  type Candidate = { raw: RawCapture; site: string; sourceUrl: string; complete: boolean; warnings?: string[] };
  const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  const indeedHosts = new Set(['indeed.com','www.indeed.com','ca.indeed.com','uk.indeed.com','au.indeed.com','in.indeed.com','de.indeed.com','fr.indeed.com','nl.indeed.com','jp.indeed.com','sg.indeed.com','ie.indeed.com','ae.indeed.com','indeed.co.uk','www.indeed.co.uk','indeed.ca','www.indeed.ca','indeed.com.au','www.indeed.com.au','indeed.co.in','www.indeed.co.in','indeed.de','www.indeed.de','indeed.fr','www.indeed.fr','indeed.nl','www.indeed.nl','indeed.co.jp','www.indeed.co.jp','indeed.com.sg','www.indeed.com.sg','indeed.ie','www.indeed.ie','indeed.ae','www.indeed.ae']);
  const clean = (value: unknown): string => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim() : '';
  const blockText = (node: Element | null): string => clean(node?.textContent || '');
  function inertText(html: string): string {
    const template = document.createElement('template'); template.innerHTML = html;
    template.content.querySelectorAll('script,style,iframe,object,embed,form,input,textarea,button,noscript').forEach(node => node.remove());
    template.content.querySelectorAll('p,div,li,br,h1,h2,h3,h4').forEach(node => node.before(document.createTextNode('\n')));
    return (template.content.textContent || '').split('\n').map(line => clean(line)).filter(Boolean).join('\n');
  }
  function truncate(value: string, max: number): { value: string; complete: boolean } {
    const normalized = value.split('\n').map(line => clean(line)).filter(Boolean).join('\n');
    return normalized.length <= max ? { value: normalized, complete: true } : { value: `${normalized.slice(0, max - 1).trim()}…`, complete: false };
  }
  function canonicalSource(raw = location.href): string | null {
    try {
      const url = new URL(raw, location.href); const host = url.hostname.toLowerCase();
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.hash) return null;
      if (/^(?:www\.)?linkedin\.com$/.test(host)) {
        const pathId = url.pathname.match(/^\/jobs\/view\/(?:[^/]*-)?([0-9]{3,20})\/?$/)?.[1];
        const queryId = url.pathname.startsWith('/jobs/search') ? url.searchParams.get('currentJobId') : null;
        const id = pathId || (queryId && /^[0-9]{3,20}$/.test(queryId) ? queryId : null);
        return id ? `https://www.linkedin.com/jobs/view/${id}/` : null;
      }
      if (indeedHosts.has(host)) {
        const id = url.searchParams.get('jk') || url.searchParams.get('vjk');
        return id && /^[A-Za-z0-9_-]{6,80}$/.test(id) ? `${url.origin}/viewjob?jk=${encodeURIComponent(id)}` : null;
      }
      const meaningful = Array.from(url.searchParams.keys()).filter(key => !/^(utm_[a-z_]+|gclid|fbclid)$/i.test(key));
      return meaningful.length ? null : url.origin + (url.pathname==='/'?'/':url.pathname.replace(/\/$/,''));
    } catch { return null; }
  }
  function selectionDraft(): Candidate | null {
    const description = clean(window.getSelection()?.toString() || ''); const sourceUrl = canonicalSource();
    if (!sourceUrl || description.length < 20) return null;
    return { raw:{title:'',company:'',description},site:'selection',sourceUrl,complete:false,warnings:['Only the text you selected was captured. Add the title and company, then confirm you reviewed the full description before sending.'] };
  }
  function lever(): Candidate|null {
    if(location.protocol!=='https:'||!['jobs.lever.co','jobs.eu.lever.co'].includes(location.hostname)||!/^\/[^/]+\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/?$/.test(location.pathname))return null;
    const title=blockText(document.querySelector('.posting-headline h2'));const alt=clean(document.querySelector('.main-header-logo img')?.getAttribute('alt')||'');
    const company=/^(company|company logo|logo)$/i.test(alt)?'':alt.replace(/\s+logo$/i,'').trim();
    const modern=document.querySelectorAll('.section[data-qa="job-description"]');const legacy=document.querySelectorAll('.section-wrapper .posting');const sections=modern.length?modern:legacy;
    const description=Array.from(sections).map(section=>inertText(section.innerHTML)).join('\n');const sourceUrl=canonicalSource();
    return sourceUrl&&title&&description.length>=10&&sections.length===1?{raw:{title,company,description,location:blockText(document.querySelector('.posting-categories .location'))},site:'lever',sourceUrl,complete:true,warnings:company?[]:['The company name was not available. Add it before sending.']}:null;
  }
  function structured():Candidate|null {
    const sourceUrl=canonicalSource();if(!sourceUrl)return null;const host=location.hostname.toLowerCase();if(/^(?:www\.)?linkedin\.com$/.test(host)||indeedHosts.has(host))return null;
    const workday=/(^|\.)myworkdayjobs\.com$/.test(host);if(workday&&!/\/job(?:\/|$)/i.test(location.pathname))return null;const scripts=document.querySelectorAll('script[type="application/ld+json"]');if(scripts.length>20)return null;
    const jobs:Record<string,unknown>[]=[];let bytes=0,nodes=0;
    function visit(value:unknown,depth=0){if(++nodes>160||depth>6)throw new Error('complex');if(Array.isArray(value)){value.forEach(item=>visit(item,depth+1));return;}if(!record(value))return;const type=value['@type'];if(type==='JobPosting'||(Array.isArray(type)&&type.includes('JobPosting')))jobs.push(value);if(value['@graph'])visit(value['@graph'],depth+1);}
    try{for(const script of scripts){const raw=script.textContent||'';bytes+=raw.length;if(bytes>524288)return null;visit(JSON.parse(raw));}}catch{return null;}
    const unique=new Map<string,Record<string,unknown>>();for(const job of jobs)unique.set(JSON.stringify([job.title,record(job.hiringOrganization)?job.hiringOrganization.name:'',job.description,job.url||'']),job);if(unique.size!==1)return null;
    const job=[...unique.values()][0];if(typeof job.url!=='string'||canonicalSource(job.url)!==sourceUrl)return null;
    if(typeof job.title!=='string'||typeof job.description!=='string'||!record(job.hiringOrganization)||typeof job.hiringOrganization.name!=='string')return null;
    const description=inertText(job.description);if(description.length<10)return null;const raw:RawCapture={title:inertText(job.title),company:inertText(job.hiringOrganization.name),description};
    const place=record(job.jobLocation)?job.jobLocation:null;const address=place&&record(place.address)?place.address:null;if(address)raw.location=['addressLocality','addressRegion','addressCountry'].map(key=>clean(address[key])).filter(Boolean).join(', ');
    if(job.jobLocationType==='TELECOMMUTE')raw.workplace='remote';const employment:Record<string,string>={FULL_TIME:'full_time',PART_TIME:'part_time',CONTRACTOR:'contract',TEMPORARY:'temporary',INTERN:'internship'};if(typeof job.employmentType==='string')raw.employmentType=employment[job.employmentType];
    const salary=record(job.baseSalary)?job.baseSalary:null;const amount=salary&&record(salary.value)?salary.value:null;if(salary&&amount&&typeof salary.currency==='string'&&/^[A-Z]{3}$/.test(salary.currency)){const min=amount.minValue??amount.value,max=amount.maxValue??amount.value,period=amount.unitText==='YEAR'?'year':amount.unitText==='HOUR'?'hour':null;if(typeof min==='number'&&typeof max==='number'&&Number.isFinite(min)&&Number.isFinite(max)&&min>=0&&max>=min&&max<=1e12&&period)raw.salary={min,max,currency:salary.currency,period};}
    const site=workday?'workday':'jsonld';
    return {raw,site,sourceUrl,complete:true};
  }
  function fixture():Candidate|null {if(!['localhost','127.0.0.1'].includes(location.hostname)||!/\/extension-fixture\/job-posting/.test(location.pathname))return null;const raw={title:blockText(document.querySelector('[data-resumestride-field="title"]')),company:blockText(document.querySelector('[data-resumestride-field="company"]')),description:blockText(document.querySelector('[data-resumestride-field="description"]'))};const sourceUrl=canonicalSource();return sourceUrl&&(raw.title||raw.company||raw.description)?{raw,site:'fixture',sourceUrl,complete:true}:null;}
  async function greenhouse():Promise<Candidate|null>{if(location.protocol!=='https:'||!['job-boards.greenhouse.io','boards.greenhouse.io'].includes(location.hostname))return null;const match=location.pathname.match(/^\/([A-Za-z0-9_-]{1,100})\/jobs\/([0-9]{1,20})\/?$/);if(!match)return null;
    async function json(url:string):Promise<Record<string,unknown>>{const response=await fetch(url,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('unavailable');const text=await response.text();if(text.length>524288)throw new Error('large');const value:unknown=JSON.parse(text);if(!record(value))throw new Error('invalid');return value;}
    const base=`https://boards-api.greenhouse.io/v1/boards/${match[1]}`;const [job,board]=await Promise.all([json(`${base}/jobs/${match[2]}`),json(base)]);if(String(job.id)!==match[2]||typeof job.title!=='string'||typeof job.content!=='string'||typeof board.name!=='string')throw new Error('mismatch');const decoder=document.createElement('textarea');decoder.innerHTML=job.content;const description=inertText(decoder.value);if(!clean(job.title)||description.length<10)throw new Error('empty');return{raw:{title:job.title,company:board.name,description,location:record(job.location)?clean(job.location.name):''},site:'greenhouse',sourceUrl:canonicalSource()!,complete:true};}
  if(!['http:','https:'].includes(location.protocol))return{supported:false,reason:'APWICO can capture only a public HTTP(S) job page.'};
  const host=location.hostname.toLowerCase();
  if(/^(?:www\.)?linkedin\.com$/.test(host))return{supported:false,reason:'LinkedIn does not permit direct browser-extension capture. Copy the visible job description and paste it below; APWICO will keep the job URL for your review.'};
  if(indeedHosts.has(host))return{supported:false,reason:'Indeed does not permit direct browser-extension capture without written permission. Copy the visible job description and paste it below; APWICO will keep the job URL for your review.'};
  let candidate:Candidate|null=fixture();if(!candidate)candidate=lever();if(!candidate)candidate=structured();if(!candidate){try{candidate=await greenhouse();}catch{return{supported:false,reason:'The job details could not be loaded and verified. Retry, or select the job description and open APWICO again.'};}}if(!candidate)candidate=selectionDraft();
  if(!candidate)return{supported:false,reason:'Select the visible job description, then open APWICO again. You can also paste it into the single description field below.'};
  const description=truncate(candidate.raw.description,12000);const warnings=[...(candidate.warnings||[])];if(!description.complete)warnings.push('The description exceeded the safe capture limit. Review it and confirm before sending.');
  return{supported:true,descriptionComplete:candidate.complete&&description.complete,warnings,capture:{title:truncate(candidate.raw.title,300).value,company:truncate(candidate.raw.company,300).value,description:description.value,location:truncate(candidate.raw.location||'',300).value,...(candidate.raw.workplace?{workplace:candidate.raw.workplace}:{}),...(candidate.raw.employmentType?{employmentType:candidate.raw.employmentType}:{}),...(candidate.raw.salary?{salary:candidate.raw.salary}:{}),site:candidate.site,sourceUrl:candidate.sourceUrl,capturedAt:new Date().toISOString()}};
})();
