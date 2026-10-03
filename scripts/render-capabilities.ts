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

const navigation = `<header class="resource-header"><a class="resource-brand" href="/" aria-label="APWICO home"><span class="stride-mark" aria-hidden="true"><i></i><i></i></span><span>APWICO</span></a><nav aria-label="Main navigation"><a href="/workspace/resume">Resume Builder</a><a href="/start/job">Jobs</a><a href="/features/" aria-current="page">How It Works</a><a href="/tools/">Free Tools</a><a href="/templates/">Templates</a><a href="/resources/">Resources</a><a href="/pricing/">Pricing</a></nav></header>`;
const footer = `<footer class="resource-footer"><div><a class="resource-brand" href="/"><span class="stride-mark" aria-hidden="true"><i></i><i></i></span><span>APWICO</span></a><p>Your experience is the starting point.</p></div><nav aria-label="Footer navigation"><a href="/features/">How it works</a><a href="/tools/">Free tools</a><a href="/templates/">Templates</a><a href="/resources/">Resources</a><a href="/pricing/">Pricing</a><a href="/trust/">Trust</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms &amp; refunds</a></nav></footer>`;

function shell(path: string, title: string, description: string, main: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><!-- seo:start --><title>${escape(title)}</title><meta name="description" content="${escape(description)}"><meta name="robots" content="index, follow"><link rel="canonical" href="https://apwico.com${path}"><!-- seo:end --><link rel="stylesheet" href="/resources.css"><link rel="stylesheet" href="/features.css"><link rel="stylesheet" href="/apwico-theme.css"></head><body><a class="skip-link" href="#main-content">Skip to content</a>${navigation}${main}${footer}</body></html>\n`;
}

function card(capability: Capability, index: number) {
  return `<li><a href="${capabilitiesPath}${capability.slug}/"><span>${String(index + 1).padStart(2, '0')}</span><div>${capability.eyebrow ? `<small>${escape(capability.eyebrow)}</small>` : ''}<strong>${escape(capability.title)}</strong><p>${escape(capability.description)}</p></div><b aria-hidden="true">→</b></a></li>`;
}

const hub = `<main id="main-content"><section class="capability-hero"><div><p class="eyebrow">How APWICO works</p><h1>From job requirements to a tailored resume.</h1></div><p>Review the role, compare its requirements with your experience, decide whether to pursue it, and tailor a separate resume without changing your master.</p></section><section class="problem-path" aria-labelledby="problem-path-title"><h2 id="problem-path-title">Five steps</h2><ol><li>What does the job require?</li><li>What does my resume demonstrate?</li><li>Is this role worth my effort?</li><li>What needs clarification?</li><li>How should I tailor my resume?</li></ol></section><section class="capability-index" aria-labelledby="capability-index-title"><div><h2 id="capability-index-title">What you can do in APWICO</h2></div><ol>${capabilities.map(card).join('')}</ol></section><section class="capability-principles" aria-labelledby="principles-title"><p class="section-label">Product boundaries</p><div><h2 id="principles-title">Your evidence. Your decision. Your master stays unchanged.</h2><p>APWICO shows what your documents demonstrate and what remains unclear. You make the decision, and every job-specific resume stays separate from your master. <a href="/features/match-methodology/">Read the public Match methodology and limitations.</a></p></div><a class="primary-action" href="/tools/resume-job-match/">Try the free evidence check <span aria-hidden="true">→</span></a></section></main>`;
output('public/features/index.html', shell('/features/', 'How APWICO works: evidence before effort', 'See how APWICO connects job requirements, resume evidence, user decisions, safe job-specific versions and concrete export formats.', hub));

for (const capability of capabilities) {
  const path = `${capabilitiesPath}${capability.slug}/`;
  const facts = capability.facts.map((fact, index) => `<article><span>${String(index + 1).padStart(2, '0')}</span><h2>${escape(fact.title)}</h2><p>${escape(fact.body)}</p></article>`).join('');
  const boundaries = capability.boundaries.map(item => `<li>${escape(item)}</li>`).join('');
  const main = `<main id="main-content"><section class="capability-detail-hero"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/features/">How it works</a><span aria-hidden="true">/</span><span>${escape(capability.title)}</span></nav>${capability.eyebrow ? `<p class="eyebrow">${escape(capability.eyebrow)}</p>` : ''}<h1>${escape(capability.title)}</h1><p>${escape(capability.promise)}</p></section><section class="capability-facts" aria-label="Capability details">${facts}</section><section class="capability-boundaries" aria-labelledby="boundaries-title"><div><h2 id="boundaries-title">Limits</h2></div><ul>${boundaries}</ul></section><section class="capability-action"><div><h2>${escape(capability.action.label)}</h2><p>${escape(capability.action.note)}</p></div><a class="primary-action" href="${capability.action.href}">${escape(capability.action.label)} <span aria-hidden="true">→</span></a></section></main>`;
  output(`public${path}index.html`, shell(path, capability.seoTitle, capability.description, main));
}

console.log(check ? 'Capability pages match their content source.' : `Generated capability hub and ${capabilities.length} detail pages.`);
