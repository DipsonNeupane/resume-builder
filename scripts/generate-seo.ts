import { readFileSync, writeFileSync } from 'node:fs';
import { notFoundHtml, productionOrigin, publicPages, websiteSchema } from '../src/seo/policy';
const check = process.argv.includes('--check');
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
function output(file: string, text: string) {
 if (check) { if (readFileSync(file, 'utf8') !== text) throw new Error(`SEO output stale: ${file}. Run npm run seo:generate.`); }
 else writeFileSync(file, text);
}
for (const [path, details] of Object.entries(publicPages)) {
 const file = path === '/' ? 'index.html' : `public${path}`;
 let html = readFileSync(file, 'utf8');
 const canonical = `${productionOrigin}${path}`;
 const block = `<!-- seo:start -->
<title>${escape(details.title)}</title>
<meta name="description" content="${escape(details.description)}">
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
<meta property="og:title" content="${escape(details.title)}">
<meta property="og:description" content="${escape(details.description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${productionOrigin}/social-card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="ResumeStride — Your experience is the starting point.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(details.title)}">
<meta name="twitter:description" content="${escape(details.description)}">
<meta name="twitter:image" content="${productionOrigin}/social-card.png">
<meta name="twitter:image:alt" content="ResumeStride — Your experience is the starting point.">
${path === '/' ? `<script type="application/ld+json" data-seo-schema>${JSON.stringify(websiteSchema)}</script>\n` : ''}<script src="/seo-guard.js"></script>
<!-- seo:end -->`;
 if (html.includes('<!-- seo:start -->')) html = html.replace(/<!-- seo:start -->[\s\S]*?<!-- seo:end -->/, block);
 else {
  html = html.replace(/<title>[\s\S]*?<\/title>/, '').replace(/<meta name="(?:description|theme-color)"[^>]*>/g, '');
  html = html.replace('</head>', `${block}</head>`);
 }
 output(file, html);
}
output('public/robots.txt', `# Public documents may be crawled. Private URLs emit noindex; do not hide\n# that directive behind a robots.txt disallow. APIs still require authentication.\nUser-agent: *\nAllow: /\n\nSitemap: ${productionOrigin}/sitemap.xml\n`);
output('public/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.keys(publicPages).map(path => `  <url><loc>${productionOrigin}${path}</loc></url>`).join('\n')}\n</urlset>\n`);
output('public/404.html', `${notFoundHtml}\n`);
console.log(check ? 'SEO artifacts match the public allowlist.' : 'SEO artifacts generated.');
