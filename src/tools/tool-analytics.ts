type ToolEvent = 'tool_viewed' | 'tool_started' | 'tool_completed' | 'tool_cta_clicked';
type SafeData = Record<string, string>;

(() => {
  const root = document.querySelector<HTMLElement>('[data-public-tool]');
  const tool = root?.dataset.publicTool ?? '';
  const token = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/;
  const allowedTools = new Set(['job-requirement-extractor', 'resume-job-match', 'resume-bullet-checker']);
  if (!allowedTools.has(tool) || location.origin !== 'https://resumestride.com') return;
  const runtime = window as typeof window & { va?: (...args: unknown[]) => void; vaq?: unknown[][]; rsToolAnalytics?: { event: (name: ToolEvent, data?: SafeData) => void } };
  runtime.va = runtime.va || function (...args: unknown[]) { (runtime.vaq = runtime.vaq || []).push(args); };
  let attribution: SafeData = {};
  try {
    const storageKey = 'resumestride.analytics.firstTouch';
    const stored = sessionStorage.getItem(storageKey);
    if (stored) attribution = JSON.parse(stored) as SafeData;
    else {
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
        const value = new URL(location.href).searchParams.get(key);
        if (value && token.test(value)) attribution[key] = value;
      }
      try {
        const host = new URL(document.referrer).hostname.toLowerCase();
        if (host !== location.hostname && /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})\.)+[A-Za-z]{2,63}$/.test(host)) attribution.referrer_host = host;
      } catch { /* Direct visit. */ }
      sessionStorage.setItem(storageKey, JSON.stringify(attribution));
    }
  } catch { attribution = {}; }
  const event = (name: ToolEvent, data: SafeData = {}) => {
    const safe: SafeData = { tool_id: tool };
    for (const [key, value] of Object.entries({ ...attribution, ...data })) if (token.test(key) && token.test(value)) safe[key] = value;
    runtime.va?.('event', { name, data: safe });
  };
  runtime.rsToolAnalytics = { event };
  event('tool_viewed');
  document.addEventListener('click', click => {
    const link = click.target instanceof Element ? click.target.closest<HTMLElement>('[data-tool-cta]') : null;
    const destination = link?.dataset.toolCta ?? '';
    if (token.test(destination)) event('tool_cta_clicked', { cta_destination: destination });
  });
})();
