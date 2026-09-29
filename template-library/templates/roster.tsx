/* @jsxRuntime automatic */
// Roster — many short engagements. Table-like rows (organization · role · dates) with
// one outcome line; longer roles keep full detail beneath their row.
import type { DocEntry, ResumeDoc } from '../document';
import { Bullets, ContactList, MetaLines, Paper, Text } from './parts';

function Row({ e }: { e: DocEntry }) {
 const oneLine = e.bullets.length <= 1 && !e.meta.length;
 return <div className={`ro-row${oneLine ? ' ro-row-short' : ''}`}>
  <p className="ro-org">{e.organization ? <Text value={e.organization} /> : <Text value={e.location} />}</p>
  <p className="ro-role">{e.title}{e.organization && e.location && <span className="ro-loc"> · <Text value={e.location} /></span>}</p>
  <p className="ro-dates">{e.dates}</p>
  {oneLine ? e.bullets.map((b, i) => <p key={i} className="ro-outcome"><Text value={b} /></p>) : <div className="ro-detail"><Bullets items={e.bullets} /><MetaLines meta={e.meta} /></div>}
 </div>;
}

export function Roster({ doc }: { doc: ResumeDoc }) {
 return <Paper id="roster" doc={doc}>
  <header className="ro-header">
   <h1>{doc.name}</h1>{doc.headline && <p className="ro-headline">{doc.headline}</p>}
   <ContactList contacts={doc.contacts} className="ro-contacts" />
  </header>
  {doc.summary && <section className="ro-section"><h2>{doc.summary.heading}</h2>
   {doc.summary.bullets.length ? <Bullets items={doc.summary.bullets} /> : doc.summary.paragraphs.map((p, i) => <p key={i}><Text value={p} /></p>)}
  </section>}
  {doc.skills && <section className="ro-section ro-skills"><h2>{doc.skills.heading}</h2>
   <p>{doc.skills.groups.map((g, i) => <span key={i}>{g.label && <strong>{g.label}: </strong>}{g.items.join(', ')}{i < doc.skills!.groups.length - 1 ? '; ' : ''}</span>)}</p>
  </section>}
  {doc.sections.map(section => <section key={section.id} className="ro-section"><h2>{section.title}</h2><div className="ro-table">{section.entries.map(e => <Row key={e.id} e={e} />)}</div></section>)}
 </Paper>;
}
