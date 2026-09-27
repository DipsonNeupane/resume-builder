import { isPublicAttributionLocation, isPublicLocation, noindex, privateMetadata, productionOrigin, publicPages, websiteSchema, type AppPage } from './policy';

function meta(key: string, value: string, property = false) {
 const attr = property ? 'property' : 'name';
 let element = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
 if (!element) { element = document.createElement('meta'); element.setAttribute(attr, key); document.head.append(element); }
 element.content = value;
}
export function updateAppHead(page: AppPage, privateOverlay: boolean, sensitiveEntry: boolean) {
 const url = new URL(window.location.href);
 const isHome = page === 'home' && !privateOverlay && !sensitiveEntry && (isPublicLocation(url) || isPublicAttributionLocation(url));
 const details = page === 'home' ? publicPages['/'] : privateMetadata[page];
 document.title = details.title;
 meta('description', details.description);
 meta('robots', isHome && url.origin === productionOrigin ? 'index, follow' : noindex);
 for (const [key, value] of Object.entries({ 'og:title': details.title, 'og:description': details.description, 'og:type': 'website', 'og:site_name': 'ResumeStride' })) meta(key, value, true);
 meta('twitter:title', details.title); meta('twitter:description', details.description);
 document.head.querySelectorAll('link[rel="canonical"], meta[property="og:url"], script[data-seo-schema]').forEach(node => node.remove());
 if (isHome) {
  const canonical = document.createElement('link'); canonical.rel = 'canonical'; canonical.href = `${productionOrigin}/`; document.head.append(canonical);
  meta('og:url', canonical.href, true);
  const schema = document.createElement('script'); schema.type = 'application/ld+json'; schema.dataset.seoSchema = ''; schema.textContent = JSON.stringify(websiteSchema); document.head.append(schema);
 }
}
