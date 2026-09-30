import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { searchHubs, type SearchHub } from '../src/content/searchHubs';

const check = process.argv.includes('--check');
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function page(hub: SearchHub): string {
  const canonical = `https://resumestride.com${hub.path}`;
  const sectionLinks = hub.sections.map(section => `<li><a href="#${section.id}">${escape(section.title)}</a></li>`).join('');
  const sections = hub.sections.map(section => `<section id="${section.id}"><h2>${escape(section.title)}</h2>${section.html}</section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><!-- seo:start -->
<title>${escape(hub.seoTitle)}</title>
<meta name="description" content="${escape(hub.description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">
<meta name="application-name" content="ResumeStride">
<meta name="theme-color" content="#0b0a09">
<link rel="icon" href="/favicon.ico" sizes="64x64">
<link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any">
<link rel="icon" href="/favicon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
<link rel="manifest" href="/site.webmanifest">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ResumeStride">
<meta property="og:title" content="${escape(hub.seoTitle)}">
<meta property="og:description" content="${escape(hub.description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="https://resumestride.com/social-card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="ResumeStride — Your experience is the starting point.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(hub.seoTitle)}">
<meta name="twitter:description" content="${escape(hub.description)}">
<meta name="twitter:image" content="https://resumestride.com/social-card.png">
<meta name="twitter:image:alt" content="ResumeStride — Your experience is the starting point.">
<script src="/seo-guard.js"></script>
<!-- seo:end --><link rel="stylesheet" href="/resources.css"><script defer src="/_vercel/insights/script.js"></script><script defer src="/content-analytics.js" data-article-slug="${hub.path.slice(1, -1)}"></script></head><body><a class="skip-link" href="#main-content">Skip to content</a><header class="resource-header"><a class="resource-brand" href="/" aria-label="ResumeStride home"><span class="stride-mark" aria-hidden="true"><i></i><i></i></span><span>ResumeStride</span></a><nav aria-label="Main navigation"><a href="/tools/">Free tools</a><a href="/templates/">Templates</a><a href="/resources/">Resources</a><a href="/pricing/">Pricing</a><a href="/trust/">Trust</a><a href="/start/job" data-content-cta="jobs">Jobs &amp; Match</a><a class="header-action" href="/start/build" data-content-cta="builder">Build your resume</a></nav></header><main id="main-content"><div class="article-hero"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/resources/">Resume resources</a><span aria-hidden="true">/</span><span>Research</span></nav><p class="eyebrow">${escape(hub.eyebrow)}</p><h1>${escape(hub.title)}</h1><p class="deck">${escape(hub.deck)}</p></div><div class="article-layout"><aside class="article-aside" aria-label="On this page"><strong>On this page</strong><ol>${sectionLinks}</ol></aside><article class="article-body">${sections}<section class="article-cta"><p class="section-label">Use the evidence</p><h2>${escape(hub.cta.label)}</h2><p>${escape(hub.cta.note)}</p><a class="primary-action" href="${hub.cta.href}" data-content-cta="research_next">${escape(hub.cta.label)} <span aria-hidden="true">→</span></a></section></article></div></main><footer class="resource-footer"><div><a class="resource-brand" href="/"><span class="stride-mark" aria-hidden="true"><i></i><i></i></span><span>ResumeStride</span></a><p>Your experience is the starting point.</p></div><nav aria-label="Footer navigation"><a href="/occupations/">Occupations</a><a href="/compare/">Compare</a><a href="/resources/">Resources</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms &amp; refunds</a></nav></footer></body></html>\n`;
}

for (const hub of searchHubs) {
  const file = `public${hub.path}index.html`;
  mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  const html = page(hub);
  if (check) {
    if (readFileSync(file, 'utf8') !== html) throw new Error(`Search hub output stale: ${file}. Run npm run search:generate.`);
  } else writeFileSync(file, html);
}
console.log(check ? 'Search hubs match their content source.' : `Generated ${searchHubs.length} search hubs.`);
