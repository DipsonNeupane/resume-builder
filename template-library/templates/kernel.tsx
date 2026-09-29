/* @jsxRuntime automatic */
// Kernel — senior engineering, specification-style. Numbered sections, a right-hand
// date column, a skills matrix and per-role stack attribution.
import { orderSections, type DocEntry, type ResumeDoc } from '../document';
import { Bullets, ContactList, MetaValue, Paper, Text } from './parts';

function Entry({ e }: { e: DocEntry }) {
 const stack = e.meta.filter(m => m.key === 'stack' || m.key === 'methods');
 const other = e.meta.filter(m => m.key !== 'stack' && m.key !== 'methods');
 return <div className="kn-entry">
  <div className="kn-main">
   <h3>{e.title}</h3>
   {(e.organization || e.location) && <p className="kn-org">{e.organization && <Text value={e.organization} />}{e.organization && e.location && <span className="kn-sep"> / </span>}{e.location && <span className="kn-loc"><Text value={e.location} /></span>}</p>}
   {stack.length > 0 && <p className="kn-stack">{stack.flatMap(m => m.value.split(/\s*,\s*/)).filter(Boolean).map((item, i) => <code key={i}>{item}</code>)}</p>}
   <Bullets items={e.bullets} />
   {other.length > 0 && <p className="kn-meta">{other.map((m, i) => <span key={i}><span className="kn-meta-label">{m.label}</span> <MetaValue meta={m} /></span>)}</p>}
  </div>
  <p className="kn-when">{e.dates}</p>
 </div>;
}

export function Kernel({ doc }: { doc: ResumeDoc }) {
 const sections = orderSections(doc.sections, ['experience', 'projects', 'education', 'certifications', 'publications', 'awards']);
 const groups = doc.skills?.groups ?? [];
 return <Paper id="kernel" doc={doc}>
  <header className="kn-header">
   <div><h1>{doc.name}</h1>{doc.headline && <p className="kn-headline">{doc.headline}</p>}</div>
   <ContactList contacts={doc.contacts} className="kn-contacts" />
  </header>
  {doc.summary && <section className="kn-section"><h2>{doc.summary.heading}</h2>
   {doc.summary.bullets.length ? <Bullets items={doc.summary.bullets} /> : doc.summary.paragraphs.map((p, i) => <p key={i} className="kn-summary"><Text value={p} /></p>)}
  </section>}
  {doc.skills && <section className="kn-section"><h2>{doc.skills.heading}</h2>
   {groups.some(g => g.label)
    ? <dl className="kn-matrix">{groups.map((g, i) => <div key={i}>{g.label && <dt>{g.label}</dt>}<dd>{g.items.join(', ')}</dd></div>)}</dl>
    : <ul className="kn-matrix-list">{groups.flatMap(g => g.items).map((item, i) => <li key={i}>{item}</li>)}</ul>}
  </section>}
  {sections.map(section => <section key={section.id} className={`kn-section kn-role-${section.role}`}><h2>{section.title}</h2>{section.entries.map(e => <Entry key={e.id} e={e} />)}</section>)}
 </Paper>;
}
