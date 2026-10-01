"use strict";
(() => {
    const root = document.querySelector('[data-public-tool]');
    const tool = root?.dataset.publicTool ?? '';
    const token = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/;
    const attributionKeys = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'referrer_host']);
    const eventKeys = new Set(['outcome', 'cta_destination', 'review_scope', 'requirement_count']);
    const allowedTools = new Set(['job-requirement-extractor', 'resume-job-match', 'resume-bullet-checker']);
    if (!allowedTools.has(tool) || location.origin !== 'https://apwico.com')
        return;
    const runtime = window;
    runtime.va = runtime.va || function (...args) { (runtime.vaq = runtime.vaq || []).push(args); };
    let attribution = {};
    try {
        const storageKey = 'resumestride.analytics.firstTouch';
        const stored = sessionStorage.getItem(storageKey);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                for (const [key, value] of Object.entries(parsed))
                    if (attributionKeys.has(key) && typeof value === 'string' && token.test(value))
                        attribution[key] = value;
            }
        }
        else {
            for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
                const value = new URL(location.href).searchParams.get(key);
                if (value && token.test(value))
                    attribution[key] = value;
            }
            try {
                const host = new URL(document.referrer).hostname.toLowerCase();
                if (host !== location.hostname && /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})\.)+[A-Za-z]{2,63}$/.test(host))
                    attribution.referrer_host = host;
            }
            catch { /* Direct visit. */ }
            sessionStorage.setItem(storageKey, JSON.stringify(attribution));
        }
    }
    catch {
        attribution = {};
    }
    const event = (name, data = {}) => {
        const safe = { tool_id: tool };
        for (const [key, value] of Object.entries(attribution))
            if (attributionKeys.has(key) && token.test(value))
                safe[key] = value;
        for (const [key, value] of Object.entries(data))
            if (eventKeys.has(key) && token.test(value))
                safe[key] = value;
        runtime.va?.('event', { name, data: safe });
    };
    runtime.rsToolAnalytics = { event };
    event('tool_viewed');
    document.addEventListener('click', click => {
        const link = click.target instanceof Element ? click.target.closest('[data-tool-cta]') : null;
        const destination = link?.dataset.toolCta ?? '';
        if (token.test(destination))
            event('tool_cta_clicked', { cta_destination: destination });
    });
})();
