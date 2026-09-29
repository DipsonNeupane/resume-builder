/* @jsxRuntime automatic */
// Primer — early career. Education first, projects and activities weighted like
// experience, generous rhythm for an honest single page.
import { orderSections, type DocEntry, type ResumeDoc } from '../document';
import { Bullets, ContactList, MetaLines, Paper, Text, join } from './parts';

function Entry({ e }: { e: DocEntry }) {
 return <div className="pr-entry">
  <div className="pr-head"><h3>{e.title}</h3>{e.dates && <span className="pr-dates">{e.dates}</span>}</div>
  {(e.organization || e.location) && <p className="pr-org"><Text value={join(e.organization, e.location)} /></p>}
  <Bullets items={e.bullets} /><MetaLines meta={e.meta} />
 </div>;
}

export function Primer({ doc }: { doc: ResumeDoc }) {
 const sections = orderSections(doc.sections, ['education', 'projects', 'experience', 'volunteering', 'leadership', 'awards', 'certifications']);
 return <Paper id="primer" doc={doc}>
  <header className="pr-header">
   <h1>{doc.name}</h1>
   {doc.headline && <p className="pr-headline">{doc.headline}</p>}
   <ContactList contacts={doc.contacts} className="pr-contacts" />
  </header>
  {doc.summary && <section className="pr-section pr-summary"><h2>{doc.summary.heading}</h2>
   {doc.summary.bullets.length ? <Bullets items={doc.summary.bullets} /> : doc.summary.paragraphs.map((p, i) => <p key={i}><Text value={p} /></p>)}
  </section>}
  {sections.map(section => <section key={section.id} className={`pr-section pr-role-${section.role}`}><h2>{section.title}</h2>{section.entries.map(e => <Entry key={e.id} e={e} />)}</section>)}
  {doc.skills && <section className="pr-section pr-skills"><h2>{doc.skills.heading}</h2>
   <ul className="pr-skill-list">{doc.skills.groups.flatMap(g => g.label ? [`${g.label}: ${g.items.join(', ')}`] : g.items).map((item, i) => <li key={i}>{item}</li>)}</ul>
  </section>}
 </Paper>;
}
