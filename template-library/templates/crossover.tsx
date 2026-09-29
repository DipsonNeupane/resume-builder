/* @jsxRuntime automatic */
// Crossover — career changers and generalists. Key strengths up front, and under each
// role the stated skills that literally appear in that role's text.
import { orderSections, skillsInEntry, type DocEntry, type ResumeDoc, type SkillGroup } from '../document';
import { Bullets, ContactList, MetaLines, Paper, Text, join } from './parts';

function Entry({ e, skills, label }: { e: DocEntry; skills?: SkillGroup[]; label: string }) {
 const used = skillsInEntry(e, skills);
 return <div className="cx-entry">
  <div className="cx-head"><h3>{e.title}</h3>{e.dates && <span className="cx-dates">{e.dates}</span>}</div>
  {(e.organization || e.location) && <p className="cx-org"><Text value={join(e.organization, e.location)} /></p>}
  <Bullets items={e.bullets} /><MetaLines meta={e.meta} />
  {used.length > 0 && <p className="cx-used"><span className="cx-used-label">{label}</span> {used.join(' · ')}</p>}
 </div>;
}

export function Crossover({ doc }: { doc: ResumeDoc }) {
 const sections = orderSections(doc.sections, ['experience', 'projects', 'volunteering', 'education', 'certifications']);
 const groups = doc.skills?.groups;
 return <Paper id="crossover" doc={doc}>
  <header className="cx-header">
   <h1>{doc.name}</h1>
   {doc.headline && <p className="cx-headline">{doc.headline}</p>}
   <ContactList contacts={doc.contacts} className="cx-contacts" />
  </header>
  {doc.summary && <section className="cx-section cx-summary"><h2>{doc.summary.heading}</h2>
   {doc.summary.bullets.length ? <Bullets items={doc.summary.bullets} /> : doc.summary.paragraphs.map((p, i) => <p key={i}><Text value={p} /></p>)}
  </section>}
  {doc.skills && <section className="cx-section cx-strengths"><h2>{doc.skills.heading}</h2>
   {doc.skills.groups.some(g => g.label)
    ? <div className="cx-grid">{doc.skills.groups.map((g, i) => <div key={i} className="cx-cell">{g.label && <h3>{g.label}</h3>}<p>{g.items.join(', ')}</p></div>)}</div>
    : <ul className="cx-grid cx-grid-items">{doc.skills.groups.flatMap(g => g.items).map((item, i) => <li key={i}>{item}</li>)}</ul>}
  </section>}
  {sections.map(section => <section key={section.id} className="cx-section"><h2>{section.title}</h2>
   {section.entries.map(e => <Entry key={e.id} e={e} skills={section.role === 'experience' || section.role === 'projects' || section.role === 'volunteering' ? groups : undefined} label={doc.skills?.heading ?? ''} />)}
  </section>)}
 </Paper>;
}
