/* @jsxRuntime automatic */
// Meridian — modern professional. Section labels hang in a start-side rail.
import type { DocEntry, ResumeDoc } from '../document';
import { Bullets, ContactList, MetaLines, Paper, SkillList, Text, join } from './parts';

function Entry({ e }: { e: DocEntry }) {
 return <div className="me-entry">
  <div className="me-head"><h3>{e.title}</h3>{e.dates && <span className="me-dates">{e.dates}</span>}</div>
  {(e.organization || e.location) && <p className="me-org"><Text value={join(e.organization, e.location)} /></p>}
  <Bullets items={e.bullets} /><MetaLines meta={e.meta} />
 </div>;
}

export function Meridian({ doc }: { doc: ResumeDoc }) {
 return <Paper id="meridian" doc={doc}>
  <header className="me-header">
   <div className="me-identity"><h1>{doc.name}</h1>{doc.headline && <p className="me-headline">{doc.headline}</p>}</div>
   <ContactList contacts={doc.contacts} className="me-contacts" />
  </header>
  {doc.summary && <section className="me-section me-summary"><h2>{doc.summary.heading}</h2>
   {doc.summary.bullets.length ? <Bullets items={doc.summary.bullets} /> : doc.summary.paragraphs.map((p, i) => <p key={i}><Text value={p} /></p>)}
  </section>}
  {doc.skills && <section className="me-section me-skills"><h2>{doc.skills.heading}</h2><SkillList groups={doc.skills.groups} /></section>}
  {doc.sections.map(section => <section key={section.id} className="me-section"><h2>{section.title}</h2>{section.entries.map(e => <Entry key={e.id} e={e} />)}</section>)}
 </Paper>;
}
