import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { withExistingSeoBlock } from '../../scripts/seo-block';
import { publicPages } from '../../src/seo/policy';

const complete = '<!-- seo:start -->\n<title>Electrician guide | APWICO</title>\n<link rel="canonical" href="https://apwico.com/occupations/electrician/">\n<!-- seo:end -->';
const page = (block: string, body: string) => `<!doctype html><html><head>${block}</head><body>${body}</body></html>`;

test('regenerating a page body keeps its existing complete SEO head', () => {
  const next = withExistingSeoBlock(page(complete, '<p>old</p>'), page('<!-- seo:start --><!-- seo:end -->', '<p>new</p>'));
  assert.equal(next, page(complete, '<p>new</p>'));
});

test('a new or previously stripped page receives the provisional generator head', () => {
  const provisional = page('<!-- seo:start --><title>New</title><!-- seo:end -->', '<p>new</p>');
  assert.equal(withExistingSeoBlock(undefined, provisional), provisional);
  assert.equal(withExistingSeoBlock(page('<!-- seo:start --><!-- seo:end -->', ''), provisional), provisional);
});

test('replacement text containing dollar patterns is inserted literally', () => {
  const block = '<!-- seo:start --><meta name="description" content="Costs US$14.99 $& $1"><!-- seo:end -->';
  assert.equal(withExistingSeoBlock(page(block, ''), page('<!-- seo:start --><!-- seo:end -->', 'x')), page(block, 'x'));
});

test('every generated page with an SEO block is finalized by generate-seo', () => {
  // Preserving an old block is only safe because generate-seo rewrites every marked page last.
  const owned = new Set(Object.keys(publicPages).map(route => route === '/' ? 'index.html' : route.endsWith('/') ? `public${route}index.html` : `public${route}`));
  const marked: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (name.endsWith('.html') && readFileSync(file, 'utf8').includes('<!-- seo:start -->')) marked.push(file);
    }
  };
  walk('public');
  assert.ok(marked.length > 0);
  assert.deepEqual(marked.filter(file => !owned.has(file)), []);
});

test('published occupation pages carry title, description, canonical and robots metadata', () => {
  for (const route of Object.keys(publicPages).filter(route => route.startsWith('/occupations/'))) {
    const html = readFileSync(`public${route}index.html`, 'utf8');
    assert.match(html, /<title>[^<]+<\/title>/, route);
    assert.match(html, /<meta name="description" content="[^"]+">/, route);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://apwico\\.com${route.replaceAll('/', '\\/')}">`), route);
    assert.match(html, /<meta name="robots" content="index, follow">/, route);
  }
});
