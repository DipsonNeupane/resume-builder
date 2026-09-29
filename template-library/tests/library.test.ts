import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { blank, freeTemplates } from '../../src/model';
import { figures, groupByOrganization, leadIn, linkify, namesEmployer, orderSections, parseSkills, safeHref, sectionRole, skillsInEntry, splitList, toDocument } from '../document';
import { fixtures } from '../fixtures';
import { discoveryLabels, library, type TemplateMeta } from '../registry';
import { PremiumResume, premiumRenderers } from '../templates';

test('registry: 7 free + 20 premium, unique ids, free set mirrors the Builder', () => {
 assert.equal(library.length, 27);
 assert.equal(new Set(library.map(t => t.id)).size, 27);
 assert.deepEqual(library.filter(t => t.tier === 'free').map(t => t.id), freeTemplates.map(t => t.id));
 assert.equal(library.filter(t => t.tier === 'premium').length, 20);
 assert.ok(library.filter(t => t.tier === 'free').every(t => t.status === 'live'));
});

test('registry: every Premium template has a renderer, a stylesheet and a premium.css import', () => {
 const premium = library.filter(t => t.tier === 'premium').map(t => t.id).sort();
 assert.deepEqual(Object.keys(premiumRenderers).sort(), premium);
 const index = readFileSync(new URL('../templates/premium.css', import.meta.url), 'utf8');
 for (const id of premium) {
  assert.ok(existsSync(new URL(`../templates/${id}.css`, import.meta.url)), `${id}.css`);
  assert.match(index, new RegExp(`@import './${id}.css'`));
  assert.match(readFileSync(new URL(`../templates/${id}.css`, import.meta.url), 'utf8'), new RegExp(`\\.pt-${id}\\b`), `${id}.css is scoped to .pt-${id}`);
 }
 assert.ok(library.filter(t => t.tier === 'premium').every(t => t.status === 'live'), 'all 20 are available in the Builder');
});

test('registry: no outcome or ATS claims in any copy', () => {
 const banned = /\bATS\b|guarantee|recruiter[- ]approved|interview rate|best for getting hired|get hired|optimi[sz]ed/i;
 for (const t of library) for (const value of Object.values(t)) if (typeof value === 'string') assert.doesNotMatch(value, banned, `${t.id}: ${value}`);
});

test('discovery labels: tier always, NEW only from a live release date, POPULAR only from caller data', () => {
 const now = new Date('2026-10-01');
 const base = library.find(t => t.id === 'boardroom')!;
 assert.deepEqual(discoveryLabels(base, { now }), ['PREMIUM']);
 const released: TemplateMeta = { ...base, status: 'live', releasedAt: '2026-09-20' };
 assert.deepEqual(discoveryLabels(released, { now }), ['PREMIUM', 'NEW']);
 assert.deepEqual(discoveryLabels({ ...released, releasedAt: '2026-06-01' }, { now }), ['PREMIUM']);
 assert.deepEqual(discoveryLabels({ ...base, status: 'prototype', releasedAt: '2026-09-20' }, { now }), ['PREMIUM'], 'prototypes are never NEW');
 assert.deepEqual(discoveryLabels(library[0], { now, popularIds: new Set([library[0].id]) }), ['FREE', 'POPULAR']);
 assert.deepEqual(discoveryLabels(library[0], { now }), ['FREE']);
});

test('skills: groups, ungrouped runs, parentheses and Arabic commas', () => {
 assert.deepEqual(splitList('Prototyping (Figma, Framer), Research'), ['Prototyping (Figma, Framer)', 'Research']);
 assert.deepEqual(splitList('أ، ب، ج'), ['أ', 'ب', 'ج']);
 assert.deepEqual(parseSkills('Languages: Go, SQL\nKubernetes; Terraform\n\n• Bazel'), [
  { label: 'Languages', items: ['Go', 'SQL'] }, { label: null, items: ['Kubernetes', 'Terraform', 'Bazel'] },
 ]);
});

test('links: only real URLs become links; code names do not', () => {
 assert.deepEqual(linkify('Built with Node.js and ASP.NET/C#').filter(s => s.href), []);
 const parts = linkify('See github.com/example/repo, then https://example.org/a_(b).');
 assert.deepEqual(parts.filter(s => s.href).map(s => s.text), ['github.com/example/repo', 'https://example.org/a_(b)']);
 assert.equal(safeHref('javascript:alert(1)'), undefined);
 assert.equal(safeHref('https://user:pw@example.com'), undefined);
 assert.equal(safeHref('doi:10.1111/abc'), 'https://doi.org/10.1111/abc');
});

test('sections: roles from titles and kind; stable ordering; employer grouping', () => {
 const role = (title: string, kind?: 'experience') => sectionRole({ id: 'x', title, entries: [], kind });
 assert.equal(role('Anything', 'experience'), 'experience');
 assert.equal(role('Selected work'), 'projects');
 assert.equal(role('Publications'), 'publications');
 assert.equal(role('Licenses & certifications'), 'certifications');
 assert.equal(role('Hobbies'), 'other');
 const doc = toDocument(fixtures.find(f => f.id === 'engineer')!.resume());
 assert.deepEqual(orderSections(doc.sections, ['projects', 'experience']).map(s => s.role), ['projects', 'experience', 'education', 'certifications']);
 const exec = toDocument(fixtures.find(f => f.id === 'executive')!.resume());
 assert.deepEqual(groupByOrganization(exec.sections[0].entries).map(g => g.entries.length), [3, 1, 1]);
});

test('normalizer never drops content and never invents it', () => {
 const empty = toDocument(blank());
 assert.equal(empty.summary, null);
 assert.equal(empty.skills, null);
 assert.equal(empty.sections.length, 0, 'blank entries produce no sections');
 const doc = toDocument(fixtures.find(f => f.id === 'engineer')!.resume());
 const project = doc.sections.find(s => s.role === 'projects')!.entries[0];
 assert.deepEqual(project.meta.map(m => m.key), ['stack', 'link']);
 assert.equal(project.meta[1].href, 'https://github.com/example/tracekit');
 assert.equal(project.bullets.length, 1);
});

test('every Premium template server-renders every fixture (the PDF path uses static markup)', () => {
 for (const f of fixtures) for (const id of Object.keys(premiumRenderers) as (keyof typeof premiumRenderers)[]) {
  const html = renderToStaticMarkup(createElement(PremiumResume, { id: id!, resume: f.resume() }));
  assert.match(html, new RegExp(`data-template="${id}"`));
  assert.doesNotMatch(html, /<script/i);
 }
});

test('lead-ins: only short answer-first phrases, never URLs', () => {
 assert.deepEqual(leadIn('Cost: cut vendor spend by 18% in two quarters'), { lead: 'Cost:', rest: 'cut vendor spend by 18% in two quarters' });
 assert.deepEqual(leadIn('Market entry — sized a $2B opportunity'), { lead: 'Market entry —', rest: 'sized a $2B opportunity' });
 assert.equal(leadIn('Led a very long sentence that happens to contain a colon much later: here'), null);
 assert.equal(leadIn('See https://example.com: details'), null);
 assert.equal(leadIn('No separator at all'), null);
});

test('figures: emphasis never changes text; years stay plain', () => {
 const line = 'Cut spend by 41% ($30M) across 1,400 people in 2021, 3x faster, 12 teams';
 const parts = figures(line);
 assert.equal(parts.map(p => p.text).join(''), line);
 assert.deepEqual(parts.filter(p => p.figure).map(p => p.text.trim()), ['41%', '$30M', '1,400', '3x', '12']);
});

test('skills in context: literal matches of the user’s own items only', () => {
 const doc = toDocument(fixtures.find(f => f.id === 'engineer')!.resume());
 const role = doc.sections[0].entries[0];
 assert.deepEqual(skillsInEntry(role, doc.skills!.groups), ['Go', 'Kubernetes', 'Terraform', 'GitHub Actions']);
 assert.deepEqual(skillsInEntry({ ...role, bullets: ['Went to the gym'], meta: [], title: '', organization: '' }, doc.skills!.groups), [], '"Go" does not match inside "gym"/"Went"');
});

test('employer nesting: whole-name matches only', () => {
 const doc = toDocument(fixtures.find(f => f.id === 'designer')!.resume());
 const [swaps, system] = doc.sections[0].entries;
 assert.ok(namesEmployer(swaps, 'Carewell'));
 assert.ok(!namesEmployer(swaps, 'Ledgerly'));
 assert.ok(namesEmployer(system, 'Ledgerly'));
 assert.ok(!namesEmployer(swaps, 'Care'), 'substring of a word is not a match');
 assert.ok(!namesEmployer(swaps, ''), 'empty employer never matches');
});
