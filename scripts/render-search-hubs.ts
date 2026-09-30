import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { comparisonReviewedOn, comparisonReviewer, comparisons, evidenceIsCurrent, resumeStrideComparisonBoundaries, type ComparisonPage } from '../src/content/comparisons';
import { occupationNextReviewAt, occupations, type OccupationPage } from '../src/content/occupations';
import { formatBoundaries, regionalGuidance, regionalNextReviewAt } from '../src/content/regionalGuidance';
import { searchHubs, type SearchHub } from '../src/content/searchHubs';

const check = process.argv.includes('--check');
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const withoutSeo = (text: string) => text.replace(/<!-- seo:start -->[\s\S]*?<!-- seo:end -->/, '<!-- seo:block -->');

function page(hub: SearchHub): string {
  const canonical = `https://resumestride.com${hub.path}`;
  const sectionLinks = hub.sections.map(section => `<li><a href="#${section.id}">${escape(section.title)}</a></li>`).join('');
  const sections = hub.sections.map(section => `<section id="${section.id}"><h2>${escape(section.title)}</h2>${section.html}</section>`).join('');
  const regionalMatrix = hub.path === '/regions/' ? `<section id="regional-matrix"><h2>Sourced regional matrix</h2>${regionalGuidance.map(region => `<article class="callout"><h3>${escape(region.place)} — ${escape(region.documentTerm)}</h3><h4>Verified from the named source</h4><ul>${region.verifiedGuidance.map(item => `<li>${escape(item)}</li>`).join('')}</ul><h4>Not established by this source</h4><ul>${region.unresolved.map(item => `<li>${escape(item)}</li>`).join('')}</ul><p><strong>Sources:</strong> ${region.sources.map(item => `<a href="${item.url}">${escape(item.label)}</a> (checked ${item.checkedAt})`).join(' · ')}</p></article>`).join('')}</section><section id="format-boundaries"><h2>Cross-border format boundaries</h2>${formatBoundaries.map(item => `<h3>${escape(item.title)}</h3><p>${escape(item.body)}</p>`).join('')}</section>` : '';
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
<!-- seo:end --><link rel="stylesheet" href="/resources.css"><script defer src="/_vercel/insights/script.js"></script><script defer src="/content-analytics.js" data-article-slug="${hub.path.slice(1, -1)}"></script></head><body><a class="skip-link" href="#main-content">Skip to content</a><header class="resource-header"><a class="resource-brand" href="/" aria-label="ResumeStride home"><span class="stride-mark" aria-hidden="true"><i></i><i></i></span><span>ResumeStride</span></a><nav aria-label="Main navigation"><a href="/tools/">Free tools</a><a href="/templates/">Templates</a><a href="/resources/">Resources</a><a href="/pricing/">Pricing</a><a href="/trust/">Trust</a><a href="/start/job" data-content-cta="jobs">Jobs &amp; Match</a><a class="header-action" href="/start/build" data-content-cta="builder">Build your resume</a></nav></header><main id="main-content"><div class="article-hero"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/resources/">Resume resources</a><span aria-hidden="true">/</span><span aria-current="page">${escape(hub.title)}</span></nav><p class="eyebrow">${escape(hub.eyebrow)}</p><h1>${escape(hub.title)}</h1><p class="deck">${escape(hub.deck)}</p></div><div class="article-layout"><aside class="article-aside" aria-label="On this page"><strong>On this page</strong><ol>${sectionLinks}</ol></aside><article class="article-body">${sections}${regionalMatrix}<section class="article-cta"><p class="section-label">Use the evidence</p><h2>${escape(hub.cta.label)}</h2><p>${escape(hub.cta.note)}</p><a class="primary-action" href="${hub.cta.href}" data-content-cta="research_next">${escape(hub.cta.label)} <span aria-hidden="true">→</span></a></section></article></div></main><footer class="resource-footer"><div><a class="resource-brand" href="/"><span class="stride-mark" aria-hidden="true"><i></i><i></i></span><span>ResumeStride</span></a><p>Your experience is the starting point.</p></div><nav aria-label="Footer navigation"><a href="/occupations/">Occupations</a><a href="/regions/">Regions</a><a href="/compare/">Compare</a><a href="/resources/">Resources</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms &amp; refunds</a></nav></footer></body></html>\n`;
}

function detailShell(path: string, eyebrow: string, title: string, deck: string, body: string, cta: string): string {
  const comparison = path.startsWith('compare/');
  const aside = comparison
    ? `<aside class="article-aside" aria-label="Comparison checks"><strong>Comparison checks</strong><ol><li>Free output</li><li>Paid terms</li><li>Evidence method</li><li>Version safety</li><li>Unknowns</li></ol></aside>`
    : `<aside class="article-aside" aria-label="Decision path"><strong>Decision path</strong><ol><li>Am I qualified?</li><li>What evidence do I have?</li><li>Is this worth my effort?</li><li>What needs clarification?</li><li>How do I tailor truthfully?</li></ol></aside>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><!-- seo:start --><!-- seo:end --><link rel="stylesheet" href="/resources.css"><script defer src="/_vercel/insights/script.js"></script><script defer src="/content-analytics.js" data-article-slug="${escape(path.replaceAll('/', '-'))}"></script></head><body><a class="skip-link" href="#main-content">Skip to content</a><header class="resource-header"><a class="resource-brand" href="/" aria-label="ResumeStride home"><span class="stride-mark" aria-hidden="true"><i></i><i></i></span><span>ResumeStride</span></a><nav aria-label="Main navigation"><a href="/tools/">Free tools</a><a href="/templates/">Templates</a><a href="/resources/">Resources</a><a href="/pricing/">Pricing</a><a href="/trust/">Trust</a><a href="/start/job" data-content-cta="jobs">Jobs &amp; Match</a></nav></header><main id="main-content"><div class="article-hero"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/resources/">Resources</a><span aria-hidden="true">/</span><a href="/${path.split('/')[0]}/">${comparison ? 'Compare' : 'Occupations'}</a><span aria-hidden="true">/</span><span aria-current="page">${escape(title)}</span></nav><p class="eyebrow">${escape(eyebrow)}</p><h1>${escape(title)}</h1><p class="deck">${escape(deck)}</p></div><div class="article-layout">${aside}<article class="article-body">${body}<section class="article-cta"><p class="section-label">Use your own evidence</p><h2>Check the job in front of you</h2><p>Generic research cannot decide whether you should apply. Compare the actual source wording with your own resume evidence.</p><a class="primary-action" href="/tools/resume-job-match/" data-content-cta="research_next">${escape(cta)} <span aria-hidden="true">→</span></a></section></article></div></main><footer class="resource-footer"><div><a class="resource-brand" href="/" aria-label="ResumeStride home"><span class="stride-mark" aria-hidden="true"><i></i><i></i></span><span>ResumeStride</span></a><p>Your experience is the starting point.</p></div><nav aria-label="Footer navigation"><a href="/occupations/">Occupations</a><a href="/regions/">Regions</a><a href="/compare/">Compare</a><a href="/trust/">Trust</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms &amp; refunds</a></nav></footer></body></html>\n`;
}

function occupationPage(item: OccupationPage): string {
  const list = (items: string[]) => `<ul>${items.map(value => `<li>${escape(value)}</li>`).join('')}</ul>`;
  const sourceList = item.sources.map(source => `<li><a href="${source.url}">${escape(source.label)}</a> — ${escape(source.jurisdiction)}; checked ${source.checkedAt}${source.version ? `; ${escape(source.version)}` : ''}</li>`).join('');
  const body = `<aside class="callout warning"><strong>Occupation research is a question set—not proof.</strong><p>${escape(item.selectionReason)} This page does not claim that every employer uses these requirements or that this is a top ResumeStride search.</p><p><strong>Editorial review:</strong> ResumeStride evidence review; reviewed ${item.sources[0].checkedAt}; next source review ${occupationNextReviewAt}. This is source-scope review, not professional credential or regulator approval.</p></aside><section><h2>What the named jurisdiction sources describe</h2><p>${escape(item.workContext)}</p></section><section><h2>Structure the resume around evidence</h2>${list(item.structure)}</section><section><h2>Flexible sections</h2>${list(item.flexibleSections)}</section><section><h2>Skills belong beside context</h2>${list(item.skillsInContext)}</section><section><h2>Common requirement patterns to verify</h2>${list(item.requirementPatterns)}</section><section><h2>Make one bullet inspectable</h2><p><strong>Weak, fictional example:</strong> ${escape(item.weakBullet)}</p><p><strong>Stronger, fictional example:</strong> ${escape(item.strongBullet)}</p><p>${escape(item.strongBulletWhy)}</p></section><section><h2>Map requirement to evidence—without a verdict</h2><p><strong>Example requirement:</strong> ${escape(item.evidenceExample.requirement)}</p><div class="evidence-grid"><div><strong>Direct evidence</strong><span>${escape(item.evidenceExample.direct)}</span></div><div><strong>Worth reviewing</strong><span>${escape(item.evidenceExample.adjacent)}</span></div><div><strong>Not demonstrated</strong><span>${escape(item.evidenceExample.unknown)} This is an unknown in the document, not proof the person lacks the qualification.</span></div></div></section><section><h2>Template to inspect—not a hiring promise</h2><p><a href="/templates/${item.template.id}/">${escape(item.template.label)}</a>: ${escape(item.template.reason)}</p></section><section><h2>Regional boundary</h2><p>${escape(item.regionalNote)}</p><p><a href="/regions/">Review the sourced regional guidance</a>.</p></section><section><h2>Sources</h2><p>Primary public sources are dated individually below. Employer and regulator instructions take precedence.</p><ul>${sourceList}</ul></section>`;
  return detailShell(`occupations/${item.slug}`, item.category.replace('-', ' '), item.title, item.description, body, 'Compare my evidence');
}

function comparisonPage(item: ComparisonPage): string {
  const list = (items: string[]) => `<ul>${items.map(value => `<li>${escape(value)}</li>`).join('')}</ul>`;
  const sources = item.sources.map(sourceItem => `<li><a href="${sourceItem.url}">${escape(sourceItem.label)}</a> — ${escape(sourceItem.locale)}${sourceItem.currency ? ` / ${escape(sourceItem.currency)}` : ' / currency not applicable or not stably established'}; checked ${sourceItem.checkedAt}; review by ${sourceItem.nextReviewAt}</li>`).join('');
  const body = `<aside class="callout warning"><strong>No winner and no private-system claims.</strong><p>This page compares current, vendor-described public facts with ResumeStride’s published boundaries. Verify the purchase screen before paying.</p><p><strong>Editorial review:</strong> ${comparisonReviewer}; reviewed ${comparisonReviewedOn}.</p></aside><section><h2>Relevant strengths</h2>${list(item.strengths)}</section><section><h2>Important boundaries</h2>${list(item.boundaries)}</section><section><h2>Free and paid access</h2><h3>Free</h3><p>${escape(item.freeAccess)}</p><h3>Paid</h3><p>${escape(item.paidAccess)}</p></section><section><h2>Workflow</h2><p>${escape(item.workflow)}</p></section><section><h2>How evidence is presented</h2><p>${escape(item.evidenceMethod)}</p></section><section><h2>Billing and cancellation</h2><p>${escape(item.billing)}</p></section><section><h2>ResumeStride facts and boundaries</h2><p><a href="/pricing/">Pricing and recurring terms</a>, <a href="/trust/">product boundaries</a> and <a href="/features/job-match/">Match behavior</a> were reviewed ${comparisonReviewedOn} under the same evidence standard.</p>${list([...resumeStrideComparisonBoundaries])}</section><section><h2>Official sources and review dates</h2><ul>${sources}</ul><p>Pricing facts expire after 30 days; feature facts after 90 days. An expired fact must be rechecked or removed.</p></section>`;
  return detailShell(`compare/${item.slug}`, 'Dated factual comparison', `${item.vendor} and ResumeStride`, item.description, body, 'Try the evidence workflow');
}

for (const hub of searchHubs) {
  if (hub.path === '/regions/' && !evidenceIsCurrent(regionalNextReviewAt)) throw new Error(`Regional evidence expired on ${regionalNextReviewAt}; recheck before generation.`);
  const file = `public${hub.path}index.html`;
  mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  const html = page(hub);
  if (check) {
    if (withoutSeo(readFileSync(file, 'utf8')) !== withoutSeo(html)) throw new Error(`Search hub output stale: ${file}. Run npm run search:generate.`);
  } else writeFileSync(file, html);
}
for (const occupation of occupations) {
  if (!evidenceIsCurrent(occupationNextReviewAt)) throw new Error(`Occupation evidence expired on ${occupationNextReviewAt}; recheck before generation.`);
  const file = `public/occupations/${occupation.slug}/index.html`; mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  const html = occupationPage(occupation); if (check) { if (withoutSeo(readFileSync(file, 'utf8')) !== withoutSeo(html)) throw new Error(`Occupation output stale: ${file}.`); } else writeFileSync(file, html);
}
for (const comparison of comparisons) {
  const expired = comparison.sources.find(source => !evidenceIsCurrent(source.nextReviewAt));
  if (expired) throw new Error(`${comparison.vendor} evidence expired on ${expired.nextReviewAt}; recheck or remove the claim before generation.`);
  const file = `public/compare/${comparison.slug}/index.html`; mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  const html = comparisonPage(comparison); if (check) { if (withoutSeo(readFileSync(file, 'utf8')) !== withoutSeo(html)) throw new Error(`Comparison output stale: ${file}.`); } else writeFileSync(file, html);
}
console.log(check ? 'Search pages match their content sources.' : `Generated ${searchHubs.length} hubs, ${occupations.length} occupations and ${comparisons.length} comparisons.`);
