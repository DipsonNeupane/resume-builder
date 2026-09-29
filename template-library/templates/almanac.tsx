/* @jsxRuntime automatic */
// Almanac — compact/high-density. Date rail, run-in lines, short entries two-up.
import type { DocEntry, ResumeDoc } from '../document';
import { Bullets, ContactList, MetaLines, Paper, Text } from './parts';

function Line({ e }: { e: DocEntry }) {
 return <p className="al-line">
  {e.title && <strong className="al-title">{e.title}</strong>}
  {e.organization && <>{e.title && <span className="al-comma">, </span>}<span className="al-org"><Text value={e.organization} /></span></>}
  {e.location && <span className="al-loc"> · <Text value={e.location} /></span>}
 </p>;
}

export function Almanac({ doc }: { doc: ResumeDoc }) {
 return <Paper id="almanac" doc={doc}>
  <header className="al-header">
   <div className="al-identity"><h1>{doc.name}</h1>{doc.headline && <p className="al-headline">{doc.headline}</p>}</div>
   <ContactList contacts={doc.contacts} className="al-contacts" />
  </header>
  {doc.summary && <section className="al-section al-summary"><h2>{doc.summary.heading}</h2>
   {doc.summary.bullets.length ? <Bullets items={doc.summary.bullets} /> : doc.summary.paragraphs.map((p, i) => <p key={i}><Text value={p} /></p>)}
  </section>}
  {doc.skills && <section className="al-section al-skills"><h2>{doc.skills.heading}</h2>
   <p>{doc.skills.groups.map((g, i) => <span key={i} className="al-skill-group">{g.label && <strong>{g.label}: </strong>}{g.items.join(', ')}{i < doc.skills!.groups.length - 1 && <span className="al-divider"> / </span>}</span>)}</p>
  </section>}
  {doc.sections.map(section => {
   const twoUp = section.entries.length > 1 && section.entries.every(e => e.short);
   return <section key={section.id} className="al-section"><h2>{section.title}</h2>
    {twoUp
     ? <div className="al-two-up">{section.entries.map(e => <div className="al-cell" key={e.id}><Line e={e} />{e.dates && <p className="al-cell-dates">{e.dates}</p>}</div>)}</div>
     : section.entries.map(e => <div className="al-entry" key={e.id}>
      <p className="al-when">{e.dates}</p>
      <div className="al-body"><Line e={e} /><Bullets items={e.bullets} /><MetaLines meta={e.meta} /></div>
     </div>)}
   </section>;
  })}
 </Paper>;
}
