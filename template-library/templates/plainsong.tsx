/* @jsxRuntime automatic */
// Plainsong — the most print-literal template. Black text only; no rules, fills or
// accent. Hierarchy from weight, size and space alone. User section order.
import type { DocEntry, ResumeDoc } from '../document';
import { Bullets, ContactList, MetaLines, Paper, Text } from './parts';

function Entry({ e }: { e: DocEntry }) {
 return <div className="ps-entry">
  <p className="ps-line"><strong>{e.title}</strong>{e.organization && <>{e.title && ', '}<Text value={e.organization} /></>}{e.location && <span className="ps-loc">, <Text value={e.location} /></span>}{e.dates && <span className="ps-dates"> {e.dates}</span>}</p>
  <Bullets items={e.bullets} className="ps-list" /><MetaLines meta={e.meta} />
 </div>;
}

export function Plainsong({ doc }: { doc: ResumeDoc }) {
 return <Paper id="plainsong" doc={doc}>
  <header className="ps-header">
   <h1>{doc.name}</h1>
   {doc.headline && <p className="ps-headline">{doc.headline}</p>}
   <ContactList contacts={doc.contacts} className="ps-contacts" />
  </header>
  {doc.summary && <section className="ps-section"><h2>{doc.summary.heading}</h2>
   {doc.summary.bullets.length ? <Bullets items={doc.summary.bullets} className="ps-list" /> : doc.summary.paragraphs.map((p, i) => <p key={i}><Text value={p} /></p>)}
  </section>}
  {doc.sections.map(section => <section key={section.id} className="ps-section"><h2>{section.title}</h2>{section.entries.map(e => <Entry key={e.id} e={e} />)}</section>)}
  {doc.skills && <section className="ps-section"><h2>{doc.skills.heading}</h2>{doc.skills.groups.map((g, i) => <p key={i}>{g.label && <strong>{g.label}: </strong>}{g.items.join(', ')}</p>)}</section>}
 </Paper>;
}
