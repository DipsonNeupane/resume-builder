// Run before the app/auth client can consume a callback URL. Fragments never
// reach HTTP middleware. Keep this allowlist aligned with src/seo/policy.ts.
(() => {
 const url = new URL(location.href);
 const contentPath = url.pathname.startsWith('/features/') || url.pathname.startsWith('/resources/') || url.pathname.startsWith('/tools/') || url.pathname.startsWith('/templates/') || url.pathname === '/occupations/' || url.pathname === '/compare/' || url.pathname === '/pricing/' || url.pathname === '/trust/';
 const publicPath = url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/privacy.html' || url.pathname === '/terms.html' || contentPath;
 const contentFragment = contentPath && (url.hash === '' || /^#[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.hash));
 const publicFragment = contentFragment || ['', '#how-it-works', '#templates', '#pricing', '#main-content'].includes(url.hash);
 const campaignKeys = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']);
 const campaignToken = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/;
 const seen = new Set();
 const publicCampaign = Boolean(url.search) && [...url.searchParams].every(([key, value]) => {
  if (!campaignKeys.has(key) || seen.has(key) || !campaignToken.test(value)) return false;
  seen.add(key); return true;
 });
 const privateEntry = !publicPath || (Boolean(url.search) && !publicCampaign) || !publicFragment;
 if (url.origin !== 'https://resumestride.com' || privateEntry) {
  const robots = document.querySelector('meta[name="robots"]');
  if (robots) robots.content = 'noindex, nofollow, noarchive';
 }
 if (privateEntry) {
  document.documentElement.dataset.seoPrivateEntry = 'true';
  document.querySelectorAll('link[rel="canonical"], meta[property="og:url"], script[data-seo-schema]').forEach(node => node.remove());
 }
})();
