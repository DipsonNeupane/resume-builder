/* @jsxRuntime automatic */
// Mandate — executive portfolio careers. Overview first (one line per role), board and
// advisory appointments next, then the full evidence.
import { orderSections, type DocEntry, type DocSection, type ResumeDoc } from '../document';
import { Bullets, ContactList, MetaLines, Paper, SkillList, Text } from './parts';

function Detail({ e }: { e: DocEntry }) {
 return <div className="md-entry">
  <div className="md-head"><h3>{e.title}{e.organization && <span className="md-org"> <Text value={e.organization} /></span>}</h3>{e.dates && <span className="md-dates">{e.dates}</span>}</div>
  {e.location && <p className="md-where"><Text value={e.location} /></p>}
  <Bullets items={e.bullets} /><MetaLines meta={e.meta} />
 </div>;
}

function Overview({ entries }: { entries: DocEntry[] }) {
 return <table className="md-overview" aria-label="Career overview">
  <tbody>{entries.map(e => <tr key={e.id}><td className="md-ov-dates">{e.dates}</td><td className="md-ov-role">{e.title}</td><td className="md-ov-org"><Text value={e.organization} /></td></tr>)}</tbody>
 </table>;
}

function Appointments({ section }: { section: DocSection }) {
 return <section className="md-section md-appointments"><h2>{section.title}</h2>
  <ul>{section.entries.map(e => <li key={e.id}>
   <div className="md-appt"><span className="md-appt-role">{e.title}</span>{e.organization && <span className="md-appt-org"><Text value={e.organization} /></span>}{e.dates && <span className="md-appt-dates">{e.dates}</span>}</div>
   {e.location && <p className="md-where"><Text value={e.location} /></p>}
   <Bullets items={e.bullets} /><MetaLines meta={e.meta} />
  </li>)}</ul>
 </section>;
}

export function Mandate({ doc }: { doc: ResumeDoc }) {
 const sections = orderSections(doc.sections, ['leadership', 'experience', 'education', 'certifications', 'awards']);
 const roles = doc.sections.filter(s => s.role === 'experience').flatMap(s => s.entries);
 return <Paper id="mandate" doc={doc}>
  <header className="md-header">
   <h1>{doc.name}</h1>
   <div className="md-masthead">{doc.headline && <p className="md-headline">{doc.headline}</p>}<ContactList contacts={doc.contacts} className="md-contacts" /></div>
  </header>
  {doc.summary && <section className="md-section md-summary"><h2>{doc.summary.heading}</h2>
   {doc.summary.bullets.length ? <Bullets items={doc.summary.bullets} /> : doc.summary.paragraphs.map((p, i) => <p key={i}><Text value={p} /></p>)}
  </section>}
  {roles.length > 1 && <Overview entries={roles} />}
  {sections.map(section => section.role === 'leadership'
   ? <Appointments key={section.id} section={section} />
   : <section key={section.id} className={`md-section md-role-${section.role}`}><h2>{section.title}</h2>{section.entries.map(e => <Detail key={e.id} e={e} />)}</section>)}
  {doc.skills && <section className="md-section"><h2>{doc.skills.heading}</h2><SkillList groups={doc.skills.groups} /></section>}
 </Paper>;
}
