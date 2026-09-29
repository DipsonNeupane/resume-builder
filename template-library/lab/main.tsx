import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans-sc/400.css';
import '../fonts/fonts.css';
import './fallback-fonts.css';
import '../../src/styles.css';
import '../templates/premium.css';
import './lab.css';
import { PaginatedResumePreview } from '../../src/components/ResumePreview';
import { freeTemplates, isResume, migrate, templateIds, type FreeTemplateId, type Resume } from '../../src/model';
import { fixtures } from '../fixtures';
import { library, discoveryLabels, templateMeta, type LibraryId, type PremiumId, type TemplateMeta } from '../registry';
import { PremiumResume, premiumRenderers } from '../templates';
import { Paginated } from './Paginated';

type View = 'single' | 'compare' | 'grid';
type Width = 'desktop' | 'mobile';
const isFree = (id: LibraryId): id is FreeTemplateId => freeTemplates.some(template=>template.id===id);
const renderable = (id: LibraryId) => isFree(id) || Boolean(premiumRenderers[id as PremiumId]);

function readParams() {
 const p = new URLSearchParams(location.search);
 const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => (allowed as readonly string[]).includes(p.get(key) ?? '') ? p.get(key) as T : fallback;
 const ids = library.map(t => t.id);
 return {
  t: pick<LibraryId>('t', ids, 'boardroom'), b: pick<LibraryId>('b', ids, 'modern'),
  f: pick('f', fixtures.map(f => f.id), 'executive'), paper: pick('paper', ['fixture', 'A4', 'Letter'] as const, 'fixture'),
  view: pick<View>('view', ['single', 'compare', 'grid'], 'single'), w: pick<Width>('w', ['desktop', 'mobile'], 'desktop'),
  print: p.get('print') === '1',
 };
}

function Document({ id, resume, onPages }: { id: LibraryId; resume: Resume; onPages?: (n: number) => void }) {
 const freeRef = useRef<HTMLDivElement>(null);
 useEffect(() => {
  if (!isFree(id) || !onPages || !freeRef.current) return;
  const el = freeRef.current;
  const read = () => { const n = Number(el.querySelector('.fixed-preview')?.getAttribute('data-page-count')); if (n) onPages(n); };
  read();
  const observer = new MutationObserver(read);
  observer.observe(el, { attributes: true, subtree: true, attributeFilter: ['data-page-count'] });
  return () => observer.disconnect();
 }, [id, resume, onPages]);
 if (isFree(id)) return <div className="lab-free" ref={freeRef}><PaginatedResumePreview resume={{ ...resume, template: id }} /></div>;
 if (!renderable(id)) return <div className="lab-planned">Planned — not built in Phase 1.</div>;
 return <Paginated paper={resume.paper} direction={resume.direction} deps={[id, resume]} onPages={onPages}><PremiumResume id={id as PremiumId} resume={resume} /></Paginated>;
}

function Badge({ meta }: { meta: TemplateMeta }) {
 if (meta.tier === 'free') return <span className="lab-badge lab-badge-free">FREE</span>;
 return <span className={`lab-badge lab-badge-premium${meta.status === 'planned' ? ' is-planned' : ''}`}>{meta.status === 'live' ? 'PREMIUM' : meta.status === 'prototype' ? 'PREMIUM PROTOTYPE' : 'PREMIUM · PLANNED'}</span>;
}

function Frame({ id, resume, width, label }: { id: LibraryId; resume: Resume; width: Width; label?: string }) {
 const [pages, setPages] = useState(0);
 const meta = templateMeta(id)!;
 return <figure className={`lab-frame lab-frame-${width}`} data-template={id} data-pages={pages || undefined}>
  <figcaption><span><strong>{meta.name}</strong>{label && <em> {label}</em>}</span><Badge meta={meta} />{renderable(id) && <span className="lab-pagecount">{pages ? `${pages} page${pages > 1 ? 's' : ''}` : '…'}</span>}</figcaption>
  <div className="lab-sheet"><Document id={id} resume={resume} onPages={setPages} /></div>
 </figure>;
}

function Spec({ meta }: { meta: TemplateMeta }) {
 const labels = discoveryLabels(meta, { now: new Date() });
 return <aside className="lab-spec" aria-label={`${meta.name} specification`}>
  <header><h2>{meta.name}</h2><Badge meta={meta} /></header>
  <p className="lab-spec-family">{meta.family} · {meta.density} density · labels now: {labels.join(', ')}</p>
  <dl>
   <dt>Use case</dt><dd>{meta.useCase}</dd>
   <dt>Structure</dt><dd>{meta.structure}</dd>
   <dt>Typography</dt><dd>{meta.typography}</dd>
   <dt>Section order</dt><dd>{meta.sectionOrder}</dd>
   {meta.tier === 'premium' && <><dt>Different from the Free seven</dt><dd>{meta.distinctFrom}</dd></>}
   <dt>Why choose it</dt><dd>{meta.whyChoose}</dd>
   <dt>Factual characteristics</dt><dd>{meta.facts.join(' · ')}</dd>
  </dl>
 </aside>;
}

function PrintView({ id, resume }: { id: LibraryId; resume: Resume }) {
 // PDF check mode: the document only, laid out by the browser's print engine.
 return <>
  <style>{`@page{size:${resume.paper};margin:16mm}html,body{background:#fff!important;margin:0}.pt-paper{font-size:10pt}`}</style>
  <div className="lab-print">{isFree(id) ? <p>Free templates are exported by production (server/export/render.ts).</p> : <PremiumResume id={id as PremiumId} resume={resume} />}</div>
 </>;
}

function App() {
 const initial = useMemo(readParams, []);
 const [t, setT] = useState<LibraryId>(initial.t);
 const [b, setB] = useState<LibraryId>(initial.b);
 const [f, setF] = useState(initial.f);
 const [paper, setPaper] = useState(initial.paper);
 const [view, setView] = useState<View>(initial.view);
 const [width, setWidth] = useState<Width>(initial.w);
 const [guides, setGuides] = useState(false);
 const [custom, setCustom] = useState<Resume | null>(null);
 const [importText, setImportText] = useState('');
 const [importError, setImportError] = useState('');
 const fixture = fixtures.find(x => x.id === f) ?? fixtures[0];
 const resume = useMemo(() => {
  const source = custom ?? fixture.resume();
  return paper === 'fixture' ? source : { ...source, paper };
 }, [custom, fixture, paper]);
 useEffect(() => {
  const p = new URLSearchParams({ t, b, f, paper, view, w: width });
  history.replaceState(null, '', `?${p}`);
 }, [t, b, f, paper, view, width]);
 const choose = useCallback((id: LibraryId) => { setT(id); if (view === 'grid') setView('single'); }, [view]);
 if (initial.print) return <PrintView id={initial.t} resume={resume} />;
 const groups: { title: string; items: TemplateMeta[] }[] = [
  { title: 'Free · live', items: library.filter(m => m.tier === 'free') },
  { title: 'Premium · live', items: library.filter(m => m.tier === 'premium' && m.status === 'live') },
  { title: 'Premium · prototypes', items: library.filter(m => m.tier === 'premium' && m.status === 'prototype') },
  { title: 'Premium · planned (spec only)', items: library.filter(m => m.tier === 'premium' && m.status === 'planned') },
 ].filter(g => g.items.length);
 const tryImport = () => {
  try {
   const parsed = JSON.parse(importText);
   const candidate = migrate(parsed && typeof parsed === 'object' && 'resume' in parsed ? (parsed as { resume: unknown }).resume : parsed);
   if (!isResume(candidate)) throw new Error('That JSON is not a valid ResumeStride resume.');
   setCustom(candidate); setImportError('');
  } catch (error) { setImportError(error instanceof Error ? error.message : 'Could not read JSON.'); }
 };
 const meta = templateMeta(t)!;
 const renderableIds = library.filter(m => renderable(m.id)).map(m => m.id);
 return <div className={`lab${guides ? ' lab-guides' : ''}`}>
  <header className="lab-bar">
   <div className="lab-title"><strong>Template Lab</strong><span>local · not production · no purchase flow</span></div>
   <label>Content<select value={custom ? '__custom' : f} onChange={e => { if (e.target.value !== '__custom') { setCustom(null); setF(e.target.value); } }}>
    {fixtures.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}{custom && <option value="__custom">Imported resume</option>}
   </select></label>
   <label>Paper<select value={paper} onChange={e => setPaper(e.target.value as typeof paper)}><option value="fixture">As resume</option><option value="A4">A4</option><option value="Letter">Letter</option></select></label>
   <div className="lab-seg" role="group" aria-label="View">{(['single', 'compare', 'grid'] as View[]).map(v => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{v === 'grid' ? 'All templates' : v[0].toUpperCase() + v.slice(1)}</button>)}</div>
   <div className="lab-seg" role="group" aria-label="Preview width">{(['desktop', 'mobile'] as Width[]).map(v => <button key={v} aria-pressed={width === v} onClick={() => setWidth(v)}>{v === 'desktop' ? 'Desktop' : 'Mobile (360px)'}</button>)}</div>
   <button className="lab-toggle" aria-pressed={guides} onClick={() => setGuides(g => !g)}>Margin guides</button>
  </header>
  <div className="lab-body">
   <nav className="lab-nav" aria-label="Templates">
    {groups.map(g => <div key={g.title}><h3>{g.title} <span>{g.items.length}</span></h3><ul>{g.items.map(m => <li key={m.id}><button aria-current={t === m.id || undefined} className={m.status === 'planned' ? 'is-planned' : undefined} onClick={() => choose(m.id)}><span>{m.name}</span><small>{m.family}</small></button></li>)}</ul></div>)}
    <details className="lab-import"><summary>Use my own resume JSON</summary>
     <p>Paste a resume object (Builder data model). It stays in this tab only.</p>
     <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={6} spellCheck={false} />
     <button onClick={tryImport}>Render it</button>{importError && <p role="alert" className="lab-error">{importError}</p>}
    </details>
   </nav>
   <main className="lab-main">
    <p className="lab-note">{custom ? 'Imported resume' : `${fixture.label} — ${fixture.note}`}</p>
    {view === 'grid'
     ? <div className="lab-grid">{renderableIds.map(id => <div key={id} className="lab-grid-item"><Frame id={id} resume={resume} width="mobile" /><button onClick={() => choose(id)}>Open {templateMeta(id)!.name}</button></div>)}</div>
     : <div className={`lab-stage lab-stage-${view}`}>
      <Frame id={t} resume={resume} width={width} label={view === 'compare' ? 'A' : undefined} />
      {view === 'compare' && <div className="lab-compare">
       <label>Compare with<select value={b} onChange={e => setB(e.target.value as LibraryId)}>{renderableIds.map(id => <option key={id} value={id}>{templateMeta(id)!.name} — {templateMeta(id)!.tier === 'free' ? 'Free' : 'Premium prototype'}</option>)}</select></label>
       <Frame id={b} resume={resume} width={width} label="B" />
      </div>}
      {view === 'single' && <Spec meta={meta} />}
     </div>}
   </main>
  </div>
 </div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
