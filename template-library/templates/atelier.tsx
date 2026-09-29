/* @jsxRuntime automatic */
// Atelier — creative leadership. Asymmetric header, recognition first, client-led experience.
import { orderSections, type DocEntry, type ResumeDoc } from '../document';
import { Bullets, ContactList, MetaLines, Paper, Text } from './parts';

function ClientEntry({ e }: { e: DocEntry }) {
 return <div className="at-entry">
  <div className="at-head">
   <h3>{e.organization ? <Text value={e.organization} /> : e.title}</h3>
   {e.dates && <span className="at-dates">{e.dates}</span>}
  </div>
  {e.organization && e.title && <p className="at-role">{e.title}{e.location && <span className="at-loc"> — <Text value={e.location} /></span>}</p>}
  {!e.organization && e.location && <p className="at-role"><Text value={e.location} /></p>}
  <Bullets items={e.bullets} /><MetaLines meta={e.meta} />
 </div>;
}

function Credit({ e }: { e: DocEntry }) {
 return <li className="at-credit">
  <span className="at-credit-year">{e.dates}</span>
  <span className="at-credit-body"><strong>{e.title}</strong>{e.organization && <> · <Text value={e.organization} /></>}{e.location && <> · <Text value={e.location} /></>}
   {e.bullets.map((b, i) => <span key={i} className="at-credit-note"><Text value={b} /></span>)}<MetaLines meta={e.meta} /></span>
 </li>;
}

export function Atelier({ doc }: { doc: ResumeDoc }) {
 const sections = orderSections(doc.sections, ['awards', 'experience', 'projects', 'education']);
 return <Paper id="atelier" doc={doc}>
  <header className="at-header">
   <h1>{doc.name}</h1>
   <div className="at-aside">{doc.headline && <p className="at-headline">{doc.headline}</p>}<ContactList contacts={doc.contacts} className="at-contacts" /></div>
  </header>
  {doc.summary && <section className="at-section at-profile"><h2>{doc.summary.heading}</h2>
   {doc.summary.bullets.length ? <Bullets items={doc.summary.bullets} /> : doc.summary.paragraphs.map((p, i) => <p key={i}><Text value={p} /></p>)}
  </section>}
  {sections.map(section => <section key={section.id} className={`at-section at-role-${section.role}`}><h2>{section.title}</h2>
   {section.role === 'awards' || section.role === 'projects'
    ? <ul className="at-credits">{section.entries.map(e => <Credit key={e.id} e={e} />)}</ul>
    : section.entries.map(e => <ClientEntry key={e.id} e={e} />)}
  </section>)}
  {doc.skills && <section className="at-section at-skills"><h2>{doc.skills.heading}</h2>
   <p>{doc.skills.groups.map((g, i) => <span key={i}>{g.label && <strong>{g.label} </strong>}{g.items.join(' / ')}{i < doc.skills!.groups.length - 1 && <span className="at-divider"> · </span>}</span>)}</p>
  </section>}
 </Paper>;
}
