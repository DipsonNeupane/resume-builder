(() => {
 const current = document.currentScript;
 const slug = current instanceof HTMLScriptElement ? current.dataset.articleSlug : '';
 const token = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/;
 const attributionKeys = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'referrer_host']);
 if (!slug || !token.test(slug) || location.origin !== 'https://resumestride.com') return;
 window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
 const storageKey = 'resumestride.analytics.firstTouch';
 let attribution = {};
 try {
  const stored = sessionStorage.getItem(storageKey);
  if (stored) {
   const parsed = JSON.parse(stored);
   if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    for (const [key, value] of Object.entries(parsed)) if (attributionKeys.has(key) && typeof value === 'string' && token.test(value)) attribution[key] = value;
   }
  }
  else {
   for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const value = new URL(location.href).searchParams.get(key);
    if (value && token.test(value)) attribution[key] = value;
   }
   try {
    const host = new URL(document.referrer).hostname.toLowerCase();
    if (host !== location.hostname && /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})\.)+[A-Za-z]{2,63}$/.test(host)) attribution.referrer_host = host;
   } catch { /* direct visit */ }
   sessionStorage.setItem(storageKey, JSON.stringify(attribution));
  }
 } catch { attribution = {}; }
 window.va('event', { name: 'content_page_view', data: { article_slug: slug, ...attribution } });
 document.addEventListener('click', event => {
  const link = event.target instanceof Element ? event.target.closest('[data-content-cta]') : null;
  const destination = link?.getAttribute('data-content-cta') || '';
  if (destination && token.test(destination)) window.va('event', { name: 'content_cta_clicked', data: { article_slug: slug, cta_destination: destination, ...attribution } });
 });
})();
