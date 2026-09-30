import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { capabilities, capabilitiesPath, type Capability } from '../src/content/capabilities';

const check = process.argv.includes('--check');
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const withoutSeo = (text: string) => text.replace(/<!-- seo:start -->[\s\S]*?<!-- seo:end -->/, '<!-- seo:block -->');

function output(file: string, value: string) {
  mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  if (check) {
    if (withoutSeo(readFileSync(file, 'utf8')) !== withoutSeo(value)) throw new Error(`Capability output stale: ${file}. Run npm run capabilities:generate.`);
  } else writeFileSync(file, value);
}

const navigation = `<header class="resource-header"><a class="resource-brand" href="/" aria-label="ResumeStride home"><span class="stride-mark" aria-hidden="true"><i></i><i></i></span><span>ResumeStride</span></a><nav aria-label="Main navigation"><a href="/features/" aria-current="page">How it works</a><a href="/tools/">Free tools</a><a href="/templates/">Templates</a><a href="/resources/">Resources</a><a href="/pricing/">Pricing</a><a class="header-action" href="/start/job">Check a job</a></nav></header>`;
const footer = `<footer class="resource-footer"><div><a class="resource-brand" href="/"><span class="stride-mark" aria-hidden="true"><i></i><i></i></span><span>ResumeStride</span></a><p>Your experience is the starting point.</p></div><nav aria-label="Footer navigation"><a href="/features/">How it works</a><a href="/tools/">Free tools</a><a href="/templates/">Templates</a><a href="/resources/">Resources</a><a href="/pricing/">Pricing</a><a href="/trust/">Trust</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms &amp; refunds</a></nav></footer>`;

function shell(path: string, title: string, description: string, main: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><!-- seo:start --><title>${escape(title)}</title><meta name="description" content="${escape(description)}"><meta name="robots" content="index, follow"><link rel="canonical" href="https://resumestride.com${path}"><!-- seo:end --><link rel="stylesheet" href="/resources.css"><link rel="stylesheet" href="/features.css"></head><body><a class="skip-link" href="#main-content">Skip to content</a>${navigation}${main}${footer}</body></html>\n`;
}

function card(capability: Capability, index: number) {
  return `<li><a href="${capabilitiesPath}${capability.slug}/"><span>${String(index + 1).padStart(2, '0')}</span><div><small>${escape(capability.eyebrow)}</small><strong>${escape(capability.title)}</strong><p>${escape(capability.description)}</p></div><b aria-hidden="true">→</b></a></li>`;
}

const hub = `<main id="main-content"><section class="capability-hero"><div><p class="eyebrow">How ResumeStride works</p><h1>Decide where your effort belongs.</h1></div><p>Start with the role, compare its requirements with evidence you actually have, make your own pursuit decision, then tailor a separate version without changing the master resume.</p></section><section class="problem-path" aria-labelledby="problem-path-title"><p class="section-label">The decision path</p><h2 id="problem-path-title">Five questions, in the order they become useful.</h2><ol><li>Am I qualified for this job?</li><li>Does my experience demonstrate what they want?</li><li>Is this job worth applying to?</li><li>What is missing or needs clarification?</li><li>How should I tailor for this specific job?</li></ol></section><section class="capability-index" aria-labelledby="capability-index-title"><div><p class="section-label">Implemented capabilities</p><h2 id="capability-index-title">Follow the evidence into the workspace.</h2></div><ol>${capabilities.map(card).join('')}</ol></section><section class="capability-principles" aria-labelledby="principles-title"><p class="section-label">Product boundaries</p><div><h2 id="principles-title">No score theater. No invented experience. No silent master edits.</h2><p>ResumeStride shows what the reviewed documents demonstrate and what remains unknown. The user keeps decision authority, and every job-specific resume stays separate from the master. <a href="/features/match-methodology/">Read the public Match methodology and limitations.</a></p></div><a class="primary-action" href="/tools/resume-job-match/">Try the free evidence check <span aria-hidden="true">→</span></a></section></main>`;
output('public/features/index.html', shell('/features/', 'How ResumeStride works: evidence before effort', 'See how ResumeStride connects job requirements, resume evidence, user decisions, safe job-specific versions and concrete export formats.', hub));

for (const capability of capabilities) {
  const path = `${capabilitiesPath}${capability.slug}/`;
  const facts = capability.facts.map((fact, index) => `<article><span>${String(index + 1).padStart(2, '0')}</span><h2>${escape(fact.title)}</h2><p>${escape(fact.body)}</p></article>`).join('');
  const boundaries = capability.boundaries.map(item => `<li>${escape(item)}</li>`).join('');
  const main = `<main id="main-content"><section class="capability-detail-hero"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/features/">How it works</a><span aria-hidden="true">/</span><span>${escape(capability.title)}</span></nav><p class="eyebrow">${escape(capability.eyebrow)}</p><h1>${escape(capability.title)}</h1><p>${escape(capability.promise)}</p></section><section class="capability-facts" aria-label="Verified capability details">${facts}</section><section class="capability-boundaries" aria-labelledby="boundaries-title"><div><p class="section-label">Important boundaries</p><h2 id="boundaries-title">What this capability does not promise</h2></div><ul>${boundaries}</ul></section><section class="capability-action"><div><p class="section-label">Next step</p><h2>${escape(capability.action.label)}</h2><p>${escape(capability.action.note)}</p></div><a class="primary-action" href="${capability.action.href}">${escape(capability.action.label)} <span aria-hidden="true">→</span></a></section></main>`;
  output(`public${path}index.html`, shell(path, capability.seoTitle, capability.description, main));
}

console.log(check ? 'Capability pages match their content source.' : `Generated capability hub and ${capabilities.length} detail pages.`);
