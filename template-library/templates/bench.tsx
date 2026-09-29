/* @jsxRuntime automatic */
// Bench — industry research. Methods matrix, experience with methods lines, selected
// publications and patents in citation form.
import { orderSections, type DocEntry, type ResumeDoc } from '../document';
import { Bullets, ContactList, MetaLines, MetaValue, Paper, Text, join } from './parts';

function Entry({ e }: { e: DocEntry }) {
 const methods = e.meta.filter(m => m.key === 'methods' || m.key === 'stack');
 const rest = e.meta.filter(m => m.key !== 'methods' && m.key !== 'stack');
 return <div className="bn-entry">
  <div className="bn-head"><h3>{e.title}</h3>{e.dates && <span className="bn-dates">{e.dates}</span>}</div>
  {(e.organization || e.location) && <p className="bn-org"><Text value={join(e.organization, e.location)} /></p>}
  <Bullets items={e.bullets} />
  {methods.map((m, i) => <p key={i} className="bn-methods"><span className="bn-label">{m.label}</span> <MetaValue meta={m} /></p>)}
  <MetaLines meta={rest} />
 </div>;
}

function Citation({ e }: { e: DocEntry }) {
 return <li className="bn-cite">
  <p>{e.title && <span className="bn-cite-title">{e.title}.</span>}{e.organization && <> <cite><Text value={e.organization} /></cite></>}{[e.location, e.dates].filter(Boolean).map((t, i) => <span key={i}>, <Text value={t} /></span>)}.</p>
  {e.bullets.map((b, i) => <p key={i} className="bn-cite-note"><Text value={b} /></p>)}
  <MetaLines meta={e.meta} />
 </li>;
}

export function Bench({ doc }: { doc: ResumeDoc }) {
 const sections = orderSections(doc.sections, ['experience', 'projects', 'publications', 'presentations', 'education', 'certifications', 'awards']);
 return <Paper id="bench" doc={doc}>
  <header className="bn-header">
   <h1>{doc.name}</h1>
   {doc.headline && <p className="bn-headline">{doc.headline}</p>}
   <ContactList contacts={doc.contacts} className="bn-contacts" />
  </header>
  {doc.summary && <section className="bn-section"><h2>{doc.summary.heading}</h2>
   {doc.summary.bullets.length ? <Bullets items={doc.summary.bullets} /> : doc.summary.paragraphs.map((p, i) => <p key={i}><Text value={p} /></p>)}
  </section>}
  {doc.skills && <section className="bn-section"><h2>{doc.skills.heading}</h2>
   <div className="bn-matrix">{doc.skills.groups.map((g, i) => <div key={i} className="bn-cell">{g.label && <h3>{g.label}</h3>}<p>{g.items.join(' · ')}</p></div>)}</div>
  </section>}
  {sections.map(section => <section key={section.id} className={`bn-section bn-role-${section.role}`}><h2>{section.title}</h2>
   {section.role === 'publications' || section.role === 'presentations'
    ? <ol className="bn-cites">{section.entries.map(e => <Citation key={e.id} e={e} />)}</ol>
    : section.entries.map(e => <Entry key={e.id} e={e} />)}
  </section>)}
 </Paper>;
}
