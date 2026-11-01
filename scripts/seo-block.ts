import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const seoBlockPattern = /<!-- seo:start -->[\s\S]*?<!-- seo:end -->/;
const emptySeoBlock = '<!-- seo:start --><!-- seo:end -->';

/**
 * Page generators emit a provisional head; `scripts/generate-seo.ts` owns the final marked block
 * for every public page and runs last in `npm run seo:generate`. Keep a page's existing complete
 * block when its body is rewritten, so a chain that stops early (for example on an expired
 * evidence guard) cannot leave published pages without title, description, canonical or robots.
 */
export function withExistingSeoBlock(existing: string | undefined, html: string): string {
  const current = existing?.match(seoBlockPattern)?.[0];
  if (!current || current === emptySeoBlock || !seoBlockPattern.test(html)) return html;
  return html.replace(seoBlockPattern, () => current);
}

export function writeKeepingSeoBlock(file: string, html: string): void {
  writeFileSync(file, withExistingSeoBlock(existsSync(file) ? readFileSync(file, 'utf8') : undefined, html));
}
