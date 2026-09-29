/* @jsxRuntime automatic */
// Boardroom — executive. Employer-first hierarchy, grouped progression, expertise up front.
import { groupByOrganization, orderSections, type DocEntry, type DocSection, type ResumeDoc } from '../document';
import { Bullets, ContactList, MetaLines, Paper, SkillList, Text, join } from './parts';

function Experience({ section }: { section: DocSection }) {
 return <section className="br-section br-experience">
  <h2 className="br-label">{section.title}</h2>
  {groupByOrganization(section.entries).map((group, g) => {
   const sharedLocation = group.entries.every(e => e.location === group.entries[0].location);
   return <div className="br-employer" key={g}>
    {group.organization && <div className="br-employer-head"><h3>{group.organization}</h3>{sharedLocation && group.location && <span>{group.location}</span>}</div>}
    {group.entries.map(e => <div className="br-role" key={e.id}>
     <div className="br-role-head"><h4>{e.title}</h4>{e.dates && <span className="br-dates">{e.dates}</span>}</div>
     {(!sharedLocation || !group.organization) && e.location && <p className="br-where">{e.location}</p>}
     <Bullets items={e.bullets} /><MetaLines meta={e.meta} />
    </div>)}
   </div>;
  })}
 </section>;
}

function Entry({ e }: { e: DocEntry }) {
 return <div className="br-entry">
  <div className="br-role-head"><h3>{e.title}</h3>{e.dates && <span className="br-dates">{e.dates}</span>}</div>
  {(e.organization || e.location) && <p className="br-where">{join(e.organization, e.location)}</p>}
  <Bullets items={e.bullets} /><MetaLines meta={e.meta} />
 </div>;
}

export function Boardroom({ doc }: { doc: ResumeDoc }) {
 const sections = orderSections(doc.sections, ['experience', 'leadership', 'education', 'certifications', 'awards']);
 const labelled = doc.skills?.groups.some(g => g.label);
 return <Paper id="boardroom" doc={doc}>
  <header className="br-header">
   <div className="br-identity"><h1>{doc.name}</h1>{doc.headline && <p className="br-headline">{doc.headline}</p>}</div>
   <ContactList contacts={doc.contacts} className="br-contacts" />
  </header>
  {doc.summary && <section className="br-section br-summary">
   <h2 className="br-label">{doc.summary.heading}</h2>
   {doc.summary.bullets.length
    ? <ol className="br-highlights">{doc.summary.bullets.map((line, i) => <li key={i}><Text value={line} /></li>)}</ol>
    : doc.summary.paragraphs.map((p, i) => <p key={i} className="br-lede"><Text value={p} /></p>)}
  </section>}
  {doc.skills && <section className="br-section br-expertise">
   <h2 className="br-label">{doc.skills.heading}</h2>
   {labelled ? <SkillList groups={doc.skills.groups} /> : <ul className="br-expertise-grid">{doc.skills.groups.flatMap(g => g.items).map((item, i) => <li key={i}>{item}</li>)}</ul>}
  </section>}
  {sections.map(section => section.role === 'experience'
   ? <Experience key={section.id} section={section} />
   : <section key={section.id} className="br-section"><h2 className="br-label">{section.title}</h2>{section.entries.map(e => <Entry key={e.id} e={e} />)}</section>)}
 </Paper>;
}
