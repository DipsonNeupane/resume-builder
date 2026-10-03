import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { clusterByGuideSlug, contentClusters, guideBySlug, guides, resourcesPath, type Guide } from '../src/content/guides';

const check = process.argv.includes('--check');
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const withoutSeo = (text: string) => text.replace(/<!-- seo:start -->[\s\S]*?<!-- seo:end -->/, '<!-- seo:block -->');
const unifiedNav = '<nav aria-label="Main navigation"><a href="/workspace/resume">Resume Builder</a><a href="/start/job">Jobs</a><a href="/features/">How It Works</a><a href="/tools/">Free Tools</a><a href="/templates/">Templates</a><a href="/resources/">Resources</a><a href="/pricing/">Pricing</a></nav>';
const releaseChrome = (html: string) => html
 .replace('<link rel="stylesheet" href="/resources.css">', '<link rel="stylesheet" href="/resources.css"><link rel="stylesheet" href="/apwico-theme.css">')
 .replace(/<nav aria-label="Main navigation">[\s\S]*?<\/nav>/, unifiedNav)
 .replaceAll('Jobs &amp; Match', 'Jobs')
 .replaceAll('Free tools', 'Free Tools')
 .replaceAll('Make the evidence<br><em>easy to see.</em>', 'Job search and resume guides')
 .replaceAll('Practical guides for understanding a role, deciding whether it fits and making your resume relevant—without turning your experience into a score or a set of copied keywords.', 'Practical guides for understanding jobs, comparing your experience, and tailoring your resume truthfully.')
 .replaceAll('<div class="hub-principle"><span>Am I qualified?</span><i aria-hidden="true">→</i><span>What do I demonstrate?</span><i aria-hidden="true">→</i><span>How should I tailor?</span></div>', '')
 .replaceAll('<p class="section-label">Seven intentional clusters</p>', '')
 .replaceAll('Start with the problem slowing down your application.', 'Choose a question')
 .replaceAll('<p>The path is not always linear. Keep unknowns visible, make your own pursue decision and return to the master before creating a job-specific version.</p>', '')
 .replaceAll('A practical next step', 'Ready to start?')
 .replaceAll('Give your experience a reliable home before you decide what each application needs.', 'Build your master resume, then tailor separate versions for the roles you choose.')
 .replaceAll('Put the method into practice', 'Try it')
 .replaceAll('Keep going', 'Related guides')
 .replaceAll('<p class="eyebrow">A practical, evidence-first method</p>', '')
 .replaceAll('<p class="eyebrow">Change relevance, not identity</p>', '')
 .replaceAll('<p class="eyebrow">Worldwide scope without universal rules</p>', '');

function shell(title: string, description: string, path: string, main: string, slug = 'resources') {
 const canonical = `https://apwico.com${path}`;
 const ogType = slug === 'resources' ? 'website' : 'article';
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><!-- seo:start -->
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">
<meta name="application-name" content="APWICO">
<meta name="theme-color" content="#0b0a09">
<link rel="icon" href="/favicon.ico" sizes="64x64">
<link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any">
<link rel="icon" href="/favicon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
<link rel="manifest" href="/site.webmanifest">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="APWICO">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="https://apwico.com/social-card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="APWICO — Your experience is the starting point.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(title)}">
<meta name="twitter:description" content="${escape(description)}">
<meta name="twitter:image" content="https://apwico.com/social-card.png">
<meta name="twitter:image:alt" content="APWICO — Your experience is the starting point.">
<script src="/seo-guard.js"></script>
<!-- seo:end --><link rel="stylesheet" href="/resources.css"><script defer src="/_vercel/insights/script.js"></script><script defer src="/content-analytics.js" data-article-slug="${escape(slug)}"></script></head><body><a class="skip-link" href="#main-content">Skip to content</a><header class="resource-header"><a class="resource-brand" href="/" aria-label="APWICO home"><span class="stride-mark" aria-hidden="true"><i></i><i></i></span><span>APWICO</span></a><nav aria-label="Main navigation"><a href="/tools/">Free tools</a><a href="/templates/">Templates</a><a href="${resourcesPath}" aria-current="${path === resourcesPath ? 'page' : 'false'}">Resources</a><a href="/pricing/">Pricing</a><a href="/trust/">Trust</a><a href="/start/job" data-content-cta="jobs">Jobs &amp; Match</a><a class="header-action" href="/start/build" data-content-cta="builder">Build your resume</a></nav></header>${main}<footer class="resource-footer"><div><a class="resource-brand" href="/"><span class="stride-mark" aria-hidden="true"><i></i><i></i></span><span>APWICO</span></a><p>Your experience is the starting point.</p></div><nav aria-label="Footer navigation"><a href="/tools/">Free tools</a><a href="/templates/">Templates</a><a href="${resourcesPath}">Resources</a><a href="/occupations/">Occupations</a><a href="/compare/">Compare tools</a><a href="/pricing/">Pricing</a><a href="/trust/">Trust</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms &amp; refunds</a></nav></footer></body></html>\n`;
}

function related(guide: Guide) {
 return guide.related.map(slug => {
  const item = guideBySlug.get(slug);
  if (!item) throw new Error(`Unknown related guide: ${slug}`);
 return `<li><a href="${resourcesPath}${item.slug}/"><strong>${escape(item.title)}</strong><b aria-hidden="true">→</b></a></li>`;
 }).join('');
}

function accessibleSectionHtml(html: string) {
 return html.replace(/<div role="row">([\s\S]*?)<\/div>/g, (_, cells: string) => `<div role="row">${cells.replaceAll('<span>', '<span role="cell">')}</div>`);
}

function article(guide: Guide) {
 const cluster = clusterByGuideSlug.get(guide.slug);
 if (!cluster) throw new Error(`Guide is missing a content cluster: ${guide.slug}`);
 const answerHeading = guide.directAnswerTitle ? `<h2 id="short-answer">${escape(guide.directAnswerTitle)}</h2>` : '';
 const main = `<main id="main-content"><div class="article-hero"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="${resourcesPath}">Resume resources</a><span aria-hidden="true">/</span><span>${escape(cluster.label)}</span></nav><h1>${escape(guide.title)}</h1><p class="deck">${escape(guide.deck)}</p></div><div class="article-layout"><aside class="article-aside" aria-label="On this page"><strong>On this page</strong><ol>${guide.sections.map(section => `<li><a href="#${section.id}">${escape(section.title.replace(/^\d+\.\s*/, ''))}</a></li>`).join('')}</ol></aside><article class="article-body"><section class="direct-answer"${answerHeading?' aria-labelledby="short-answer"':''}><p class="section-label">Short answer</p>${answerHeading}${guide.directAnswer}</section>${guide.sections.map(section => `<section id="${section.id}"><h2>${escape(section.title)}</h2>${accessibleSectionHtml(section.html)}</section>`).join('')}<section class="article-cta"><p class="section-label">Try it</p><h2>${escape(guide.cta.label)}</h2><p>${escape(guide.cta.note)}</p><a class="primary-action" href="${guide.cta.href}" data-content-cta="${escape(guide.cta.destination)}">${escape(guide.cta.label)} <span aria-hidden="true">→</span></a></section></article></div><section class="related-guides" aria-labelledby="related-title"><h2 id="related-title">Related guides</h2><ul>${related(guide)}</ul><a class="all-guides" href="${resourcesPath}">See all resume resources <span aria-hidden="true">→</span></a></section></main>`;
 return shell(guide.seoTitle, guide.description, `${resourcesPath}${guide.slug}/`, main, guide.slug);
}

function hub() {
 const description = 'Practical, evidence-first resume guides for comparing roles, deciding whether to apply and tailoring your resume without making things up.';
 let index = 0;
 const clusters = contentClusters.map(cluster => {
  const cards = cluster.slugs.map(slug => {
   const guide = guideBySlug.get(slug);
   if (!guide) throw new Error(`Content cluster references unknown guide: ${slug}`);
   index += 1;
   return `<li><a href="${resourcesPath}${guide.slug}/"><span class="guide-number">${String(index).padStart(2, '0')}</span><span><strong>${escape(guide.title)}</strong><p>${escape(guide.description.replace(/\.$/, ''))}.</p></span><b aria-hidden="true">→</b></a></li>`;
  }).join('');
  return `<section class="cluster" aria-labelledby="cluster-${cluster.id}"><header><p class="section-label">${escape(cluster.label)}</p><h2 id="cluster-${cluster.id}">${escape(cluster.question)}</h2></header><ol>${cards}</ol></section>`;
 }).join('');
 const main = `<main id="main-content"><section class="hub-hero"><div><p class="eyebrow">Resume resources</p><h1>Make the evidence<br><em>easy to see.</em></h1></div><div><p>Practical guides for understanding a role, deciding whether it fits and making your resume relevant—without turning your experience into a score or a set of copied keywords.</p><div class="hub-principle"><span>Am I qualified?</span><i aria-hidden="true">→</i><span>What do I demonstrate?</span><i aria-hidden="true">→</i><span>How should I tailor?</span></div></div></section><div class="cluster-index"><div class="cluster-intro"><h2>Choose a question</h2></div>${clusters}<section class="cluster" aria-labelledby="research-paths"><header><h2 id="research-paths">Research</h2></header><ol><li><a href="/occupations/"><span class="guide-number">A</span><span><small>Occupation research</small><strong>Use occupation data as questions, not copied claims</strong><p>Explore occupation guides based on current public sources.</p></span><b aria-hidden="true">→</b></a></li><li><a href="/compare/"><span class="guide-number">B</span><span><small>Product comparison</small><strong>Compare tools through dated, primary-source facts</strong><p>Compare output, pricing, privacy, evidence, and user control.</p></span><b aria-hidden="true">→</b></a></li></ol></section></div><section class="hub-next"><p class="section-label">Ready to start?</p><div><h2>Start with your master resume.</h2><p>Build your master resume, then tailor separate versions for the roles you choose.</p></div><a class="primary-action" href="/start/build" data-content-cta="builder">Build your resume <span aria-hidden="true">→</span></a></section></main>`;
 return shell('Resume resources: evidence-first job search guides | APWICO', description, resourcesPath, main);
}

function output(file: string, html: string) {
 html = releaseChrome(html);
 mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
 if (check) {
  if (withoutSeo(readFileSync(file, 'utf8')) !== withoutSeo(html)) throw new Error(`Resource output stale: ${file}. Run npm run resources:generate.`);
 } else writeFileSync(file, html);
}

output('public/resources/index.html', hub());
for (const guide of guides) output(`public/resources/${guide.slug}/index.html`, article(guide));
console.log(check ? 'Resource pages match their content source.' : `Generated resource hub and ${guides.length} guides.`);
