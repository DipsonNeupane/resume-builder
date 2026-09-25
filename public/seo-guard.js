// Run before the app/auth client can consume a callback URL. Fragments never
// reach HTTP middleware. Keep this allowlist aligned with src/seo/policy.ts.
(() => {
 const url = new URL(location.href);
 const publicFragment = ['', '#how-it-works', '#templates', '#pricing', '#main-content'].includes(url.hash);
 const privateEntry = Boolean(url.search) || !publicFragment;
 if (url.origin !== 'https://resumestride.com' || privateEntry) {
  const robots = document.querySelector('meta[name="robots"]');
  if (robots) robots.content = 'noindex, nofollow, noarchive';
 }
 if (privateEntry) {
  document.documentElement.dataset.seoPrivateEntry = 'true';
  document.querySelectorAll('link[rel="canonical"], meta[property="og:url"], script[data-seo-schema]').forEach(node => node.remove());
 }
})();
