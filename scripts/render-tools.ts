import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import { publicTools, toolsPath, type PublicTool } from '../src/content/tools';
import { TOOL_LIMITS } from '../src/tools/analysis';

const check = process.argv.includes('--check');
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function shell(title: string, description: string, path: string, main: string, toolId = 'tools') {
  const canonical = `https://resumestride.com${path}`;
  const scripts = toolId === 'tools' ? '' : `<script defer src="/_vercel/insights/script.js"></script><script defer src="/tools/tool-analytics.js"></script><script type="module" src="/tools/public-tools.js"></script>`;
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
<meta property="og:type" content="website">
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
<!-- seo:end -->
<link rel="stylesheet" href="/resources.css"><link rel="stylesheet" href="/tools.css">${scripts}</head><body><a class="skip-link" href="#main-content">Skip to content</a><header class="resource-header"><a class="resource-brand" href="/" aria-label="ResumeStride home"><span class="stride-mark" aria-hidden="true"><i></i><i></i></span><span>ResumeStride</span></a><nav aria-label="Main navigation"><a href="/tools/" aria-current="${path === toolsPath ? 'page' : 'false'}">Free tools</a><a href="/resources/">Resources</a><a href="/?jobs=1">Jobs &amp; Match</a><a class="header-action" href="/?builder=1">Build your resume</a></nav></header>${main}<footer class="resource-footer"><div><a class="resource-brand" href="/"><span class="stride-mark" aria-hidden="true"><i></i><i></i></span><span>ResumeStride</span></a><p>Your experience is the starting point.</p></div><nav aria-label="Footer navigation"><a href="/tools/">Free tools</a><a href="/resources/">Resources</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms &amp; refunds</a></nav></footer></body></html>\n`;
}

function inputs(tool: PublicTool): string {
  if (tool.id === 'resume-job-match') return `<div class="tool-input-grid"><label class="tool-field" for="resume-text"><span><b>01</b> Resume text</span><textarea id="resume-text" name="resume" required minlength="40" maxlength="${TOOL_LIMITS.resume}" autocomplete="off" spellcheck="true" placeholder="Paste the resume text you want to review"></textarea><small><span>Processed only in this browser</span><span data-count-for="resume-text">0 / ${TOOL_LIMITS.resume.toLocaleString('en-US')}</span></small></label><label class="tool-field" for="job-description"><span><b>02</b> Job description</span><textarea id="job-description" name="job" required minlength="40" maxlength="${TOOL_LIMITS.job}" autocomplete="off" spellcheck="true" placeholder="Paste the responsibilities and qualifications"></textarea><small><span>Include the full requirements section</span><span data-count-for="job-description">0 / ${TOOL_LIMITS.job.toLocaleString('en-US')}</span></small></label></div>`;
  const bullet = tool.id === 'resume-bullet-checker';
  const id = bullet ? 'resume-bullet' : 'job-description';
  const maximum = bullet ? TOOL_LIMITS.bullet : TOOL_LIMITS.job;
  const placeholder = bullet ? 'Example: Coordinated weekly onboarding for new customer accounts' : 'Paste the responsibilities, qualifications and work-arrangement details';
  return `<label class="tool-field tool-field-single" for="${id}"><span><b>01</b> ${bullet ? 'Resume bullet' : 'Job description'}</span><textarea id="${id}" name="${bullet ? 'bullet' : 'job'}" required minlength="${bullet ? 8 : 40}" maxlength="${maximum}" autocomplete="off" spellcheck="true" placeholder="${placeholder}"></textarea><small><span>Processed only in this browser</span><span data-count-for="${id}">0 / ${maximum.toLocaleString('en-US')}</span></small></label>`;
}

function toolPage(tool: PublicTool): string {
  const content = tool.content.map((section, index) => `<section><span class="content-number">0${index + 1}</span><div><h2>${escape(section.title)}</h2>${section.html}</div></section>`).join('');
  const main = `<main id="main-content" data-public-tool="${tool.id}"><section class="tool-hero"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/tools/">Free tools</a><span aria-hidden="true">/</span><span>${escape(tool.title)}</span></nav><p class="eyebrow">${escape(tool.eyebrow)}</p><h1>${escape(tool.title)}</h1><p class="deck">${escape(tool.deck)}</p><ul class="tool-promises" aria-label="Tool promises"><li>No signup</li><li>Runs in your browser</li><li>No score theater</li></ul></section><section class="tool-workbench" aria-labelledby="workbench-title"><div class="workbench-heading"><div><p class="section-label">Private workbench</p><h2 id="workbench-title">${escape(tool.inputTitle)}</h2><p>${escape(tool.inputNote)}</p></div><div class="privacy-scrap"><strong>Private by design</strong><p>Your text is analyzed locally in this tab. It is not uploaded, saved, placed in the URL or sent to analytics. Clear removes it from the page.</p></div></div><form data-tool-form novalidate>${inputs(tool)}<p class="tool-error" data-tool-error role="alert" hidden></p><div class="tool-actions"><button class="primary-action" type="submit">${escape(tool.submitLabel)} <span aria-hidden="true">→</span></button><button class="clear-action" type="button" data-clear-tool>Clear private text</button></div></form></section><section class="tool-results" data-tool-results tabindex="-1" aria-labelledby="result-title" hidden><div class="results-heading"><p class="section-label">Evidence, not a verdict</p><h2 id="result-title">${escape(tool.resultTitle)}</h2></div><div data-tool-output aria-live="polite"></div><div class="tool-next"><div><p class="section-label">A useful next step</p><h2>${escape(tool.cta.label)}</h2><p>${escape(tool.cta.note)}</p></div><a class="primary-action" href="${tool.cta.href}" data-tool-cta="${tool.cta.destination}">${escape(tool.cta.label)} <span aria-hidden="true">→</span></a></div></section><section class="tool-explainer" aria-label="About this tool">${content}</section><nav class="tool-back" aria-label="More guidance"><a href="/tools/">See all free tools <span aria-hidden="true">→</span></a><a href="/resources/">Read the ResumeStride resources <span aria-hidden="true">→</span></a></nav></main>`;
  return shell(tool.seoTitle, tool.description, tool.path, main, tool.id);
}

function hub(): string {
  const cards = publicTools.map((tool, index) => `<li><a href="${tool.path}"><span class="tool-card-number">0${index + 1}</span><span><small>${escape(tool.eyebrow)}</small><strong>${escape(tool.title)}</strong><p>${escape(tool.description)}</p></span><b aria-hidden="true">→</b></a></li>`).join('');
  const description = 'Free, private resume and job-description tools: extract requirements, compare evidence and improve resume bullets without ATS scores or signup.';
  const main = `<main id="main-content"><section class="tools-hub-hero"><div><p class="eyebrow">Free ResumeStride tools</p><h1>Useful answers.<br><em>No score theater.</em></h1></div><div><p>Three private, evidence-first tools for the moments that slow down a job application. Use them without an account, then decide whether you need the fuller ResumeStride workflow.</p><ul class="tool-promises"><li>No signup</li><li>Browser-only analysis</li><li>Traceable results</li></ul></div></section><section class="tool-index" aria-labelledby="tool-index-title"><div><p class="section-label">Choose the problem</p><h2 id="tool-index-title">Start with the document in front of you.</h2></div><ol>${cards}</ol></section><section class="hub-privacy"><p class="section-label">Privacy boundary</p><div><h2>Your career content stays in the tab.</h2><p>These free tools run deterministically in your browser. Pasted resume, job-description and bullet text is not sent to ResumeStride, analytics, URLs, logs or error reports. The page keeps no draft after you leave.</p></div></section><section class="hub-next"><p class="section-label">Learn the method</p><div><h2>Evidence-first job search guidance.</h2><p>Read practical guides for understanding a role, comparing evidence and tailoring without making things up.</p></div><a class="primary-action" href="/resources/">Visit the Resources hub <span aria-hidden="true">→</span></a></section></main>`;
  return shell('Free resume and job search tools | ResumeStride', description, toolsPath, main);
}

function output(file: string, value: string): void {
  mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  if (check) {
    if (readFileSync(file, 'utf8') !== value) throw new Error(`Tool output stale: ${file}. Run npm run tools:generate.`);
  } else writeFileSync(file, value);
}

function compile(source: string, target: string): void {
  const code = ts.transpileModule(readFileSync(source, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, strict: true }, fileName: source }).outputText;
  output(target, code);
}

output('public/tools/index.html', hub());
for (const tool of publicTools) output(`public${tool.path}index.html`, toolPage(tool));
compile('src/tools/analysis.ts', 'public/tools/analysis.js');
compile('src/tools/public-tools.ts', 'public/tools/public-tools.js');
compile('src/tools/tool-analytics.ts', 'public/tools/tool-analytics.js');
console.log(check ? 'Tool pages and browser modules match their sources.' : `Generated tool hub and ${publicTools.length} tools.`);
