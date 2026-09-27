import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { guideBySlug, guides, resourcesPath, type Guide } from '../src/content/guides';

const check = process.argv.includes('--check');
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function shell(title: string, description: string, path: string, main: string, slug = 'resources') {
 const canonical = `https://resumestride.com${path}`;
 const ogType = slug === 'resources' ? 'website' : 'article';
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><!-- seo:start -->
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">
<meta name="application-name" content="ResumeStride">
<meta name="theme-color" content="#0b0a09">
<link rel="icon" href="/favicon.ico" sizes="64x64">
<link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any">
<link rel="icon" href="/favicon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
<link rel="manifest" href="/site.webmanifest">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="ResumeStride">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="https://resumestride.com/social-card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="ResumeStride — Your experience is the starting point.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(title)}">
<meta name="twitter:description" content="${escape(description)}">
<meta name="twitter:image" content="https://resumestride.com/social-card.png">
<meta name="twitter:image:alt" content="ResumeStride — Your experience is the starting point.">
<script src="/seo-guard.js"></script>
<!-- seo:end --><link rel="stylesheet" href="/resources.css"><script defer src="/_vercel/insights/script.js"></script><script defer src="/content-analytics.js" data-article-slug="${escape(slug)}"></script></head><body><a class="skip-link" href="#main-content">Skip to content</a><header class="resource-header"><a class="resource-brand" href="/" aria-label="ResumeStride home"><span class="stride-mark" aria-hidden="true"><i></i><i></i></span><span>ResumeStride</span></a><nav aria-label="Main navigation"><a href="/tools/">Free tools</a><a href="${resourcesPath}" aria-current="${path === resourcesPath ? 'page' : 'false'}">Resources</a><a href="/?jobs=1" data-content-cta="jobs">Jobs &amp; Match</a><a class="header-action" href="/?builder=1" data-content-cta="builder">Build your resume</a></nav></header>${main}<footer class="resource-footer"><div><a class="resource-brand" href="/"><span class="stride-mark" aria-hidden="true"><i></i><i></i></span><span>ResumeStride</span></a><p>Your experience is the starting point.</p></div><nav aria-label="Footer navigation"><a href="/tools/">Free tools</a><a href="${resourcesPath}">Resources</a><a href="/#pricing">Pricing</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms &amp; refunds</a></nav></footer></body></html>\n`;
}

function related(guide: Guide) {
 return guide.related.map(slug => {
  const item = guideBySlug.get(slug);
  if (!item) throw new Error(`Unknown related guide: ${slug}`);
  return `<li><a href="${resourcesPath}${item.slug}/"><span>${escape(item.eyebrow)}</span><strong>${escape(item.title)}</strong><b aria-hidden="true">→</b></a></li>`;
 }).join('');
}

function accessibleSectionHtml(html: string) {
 return html.replace(/<div role="row">([\s\S]*?)<\/div>/g, (_, cells: string) => `<div role="row">${cells.replaceAll('<span>', '<span role="cell">')}</div>`);
}

function article(guide: Guide) {
 const main = `<main id="main-content"><div class="article-hero"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="${resourcesPath}">Resume resources</a><span aria-hidden="true">/</span><span>Tailoring</span></nav><p class="eyebrow">${escape(guide.eyebrow)}</p><h1>${escape(guide.title)}</h1><p class="deck">${escape(guide.deck)}</p></div><div class="article-layout"><aside class="article-aside" aria-label="On this page"><strong>On this page</strong><ol>${guide.sections.map(section => `<li><a href="#${section.id}">${escape(section.title.replace(/^\d+\.\s*/, ''))}</a></li>`).join('')}</ol></aside><article class="article-body"><section class="direct-answer" aria-labelledby="short-answer"><p class="section-label">Short answer</p><h2 id="short-answer">Start with evidence, not a score.</h2>${guide.directAnswer}</section>${guide.sections.map(section => `<section id="${section.id}"><h2>${escape(section.title)}</h2>${accessibleSectionHtml(section.html)}</section>`).join('')}<section class="article-cta"><p class="section-label">Put the method into practice</p><h2>${escape(guide.cta.label)}</h2><p>${escape(guide.cta.note)}</p><a class="primary-action" href="${guide.cta.href}" data-content-cta="${escape(guide.cta.destination)}">${escape(guide.cta.label)} <span aria-hidden="true">→</span></a></section></article></div><section class="related-guides" aria-labelledby="related-title"><p class="section-label">Keep going</p><h2 id="related-title">Related resume guides</h2><ul>${related(guide)}</ul><a class="all-guides" href="${resourcesPath}">See all resume resources <span aria-hidden="true">→</span></a></section></main>`;
 return shell(guide.seoTitle, guide.description, `${resourcesPath}${guide.slug}/`, main, guide.slug);
}

function hub() {
 const description = 'Practical, evidence-first resume guides for comparing roles, deciding whether to apply and tailoring your resume without making things up.';
 const cards = guides.map((guide, index) => `<li><a href="${resourcesPath}${guide.slug}/"><span class="guide-number">${String(index + 1).padStart(2, '0')}</span><span><small>${escape(guide.eyebrow)}</small><strong>${escape(guide.title)}</strong><p>${escape(guide.description.replace(/\.$/, ''))}.</p></span><b aria-hidden="true">→</b></a></li>`).join('');
 const main = `<main id="main-content"><section class="hub-hero"><div><p class="eyebrow">Resume resources</p><h1>Make the evidence<br><em>easy to see.</em></h1></div><div><p>Practical guides for understanding a role, deciding whether it fits and making your resume relevant—without turning your experience into a score or a set of copied keywords.</p><div class="hub-principle"><span>Understand the role</span><i aria-hidden="true">→</i><span>Find real evidence</span><i aria-hidden="true">→</i><span>Keep the truth</span></div></div></section><section class="guide-index" aria-labelledby="guide-index-title"><div><p class="section-label">Eight useful starting points</p><h2 id="guide-index-title">Choose the question you are trying to answer.</h2></div><ol>${cards}</ol></section><section class="hub-next"><p class="section-label">A practical next step</p><div><h2>Start with your master resume.</h2><p>Give your experience a reliable home before you decide what each application needs.</p></div><a class="primary-action" href="/?builder=1" data-content-cta="builder">Build your resume <span aria-hidden="true">→</span></a></section></main>`;
 return shell('Resume resources: evidence-first job search guides | ResumeStride', description, resourcesPath, main);
}

function output(file: string, html: string) {
 mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
 if (check) {
  if (readFileSync(file, 'utf8') !== html) throw new Error(`Resource output stale: ${file}. Run npm run resources:generate.`);
 } else writeFileSync(file, html);
}

output('public/resources/index.html', hub());
for (const guide of guides) output(`public/resources/${guide.slug}/index.html`, article(guide));
console.log(check ? 'Resource pages match their content source.' : `Generated resource hub and ${guides.length} guides.`);
