/* @jsxRuntime automatic */
// Pyramid — consulting and business. Organization-first rows, answer-first bullets
// (bold lead-in before a colon or dash), and a run-in closing block for skills.
import { orderSections, type DocEntry, type ResumeDoc } from '../document';
import { Bullets, ContactList, LeadLine, MetaLines, Paper, Text } from './parts';

function Entry({ e }: { e: DocEntry }) {
 const first = e.organization || e.title;
 const second = e.organization ? e.title : '';
 return <div className="py-entry">
  <div className="py-row"><h3><Text value={first} /></h3>{e.location && <span className="py-loc"><Text value={e.location} /></span>}</div>
  {(second || e.dates) && <div className="py-row py-row-sub"><p className="py-title">{second}</p>{e.dates && <span className="py-dates">{e.dates}</span>}</div>}
  <Bullets items={e.bullets} render={line => <LeadLine value={line} />} /><MetaLines meta={e.meta} />
 </div>;
}

export function Pyramid({ doc }: { doc: ResumeDoc }) {
 const sections = orderSections(doc.sections, ['education', 'experience', 'leadership', 'projects', 'volunteering', 'awards', 'certifications']);
 return <Paper id="pyramid" doc={doc}>
  <header className="py-header">
   <h1>{doc.name}</h1>
   {doc.headline && <p className="py-headline">{doc.headline}</p>}
   <ContactList contacts={doc.contacts} className="py-contacts" />
  </header>
  {doc.summary && <section className="py-section"><h2>{doc.summary.heading}</h2>
   {doc.summary.bullets.length ? <Bullets items={doc.summary.bullets} render={line => <LeadLine value={line} />} /> : doc.summary.paragraphs.map((p, i) => <p key={i}><Text value={p} /></p>)}
  </section>}
  {sections.map(section => <section key={section.id} className="py-section"><h2>{section.title}</h2>{section.entries.map(e => <Entry key={e.id} e={e} />)}</section>)}
  {doc.skills && <section className="py-section py-additional"><h2>{doc.skills.heading}</h2>
   {doc.skills.groups.map((g, i) => <p key={i}>{g.label && <strong>{g.label}: </strong>}{g.items.join('; ')}</p>)}
  </section>}
 </Paper>;
}
