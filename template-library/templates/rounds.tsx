/* @jsxRuntime automatic */
// Rounds — clinical. Licensure & certification as a verification table near the top;
// clinical experience emphasises setting and unit.
import { orderSections, type DocEntry, type DocSection, type ResumeDoc } from '../document';
import { Bullets, ContactList, MetaLines, Paper, SkillList, Text } from './parts';

function Entry({ e }: { e: DocEntry }) {
 return <div className="rd-entry">
  <div className="rd-head"><h3>{e.title}</h3>{e.dates && <span className="rd-dates">{e.dates}</span>}</div>
  {(e.organization || e.location) && <p className="rd-setting">{e.organization && <span className="rd-org"><Text value={e.organization} /></span>}{e.organization && e.location && <span className="rd-sep"> · </span>}{e.location && <span className="rd-unit"><Text value={e.location} /></span>}</p>}
  <Bullets items={e.bullets} /><MetaLines meta={e.meta} />
 </div>;
}

function Credentials({ section }: { section: DocSection }) {
 return <section className="rd-section rd-credentials"><h2>{section.title}</h2>
  <table className="rd-table"><tbody>{section.entries.map(e => <tr key={e.id}>
   <th scope="row">{e.title}</th>
   <td><Text value={[e.organization, e.location].filter(Boolean).join(' · ')} />{e.bullets.map((b, i) => <span key={i} className="rd-note"><Text value={b} /></span>)}<MetaLines meta={e.meta} /></td>
   <td className="rd-dates">{e.dates}</td>
  </tr>)}</tbody></table>
 </section>;
}

export function Rounds({ doc }: { doc: ResumeDoc }) {
 const sections = orderSections(doc.sections, ['certifications', 'experience', 'education']);
 return <Paper id="rounds" doc={doc}>
  <header className="rd-header">
   <h1>{doc.name}</h1>
   {doc.headline && <p className="rd-headline">{doc.headline}</p>}
   <ContactList contacts={doc.contacts} className="rd-contacts" />
  </header>
  {doc.summary && <section className="rd-section rd-summary"><h2>{doc.summary.heading}</h2>
   {doc.summary.bullets.length ? <Bullets items={doc.summary.bullets} /> : doc.summary.paragraphs.map((p, i) => <p key={i}><Text value={p} /></p>)}
  </section>}
  {sections.map(section => section.role === 'certifications'
   ? <Credentials key={section.id} section={section} />
   : <section key={section.id} className={`rd-section rd-role-${section.role}`}><h2>{section.title}</h2>{section.entries.map(e => <Entry key={e.id} e={e} />)}</section>)}
  {doc.skills && <section className="rd-section rd-skills"><h2>{doc.skills.heading}</h2><SkillList groups={doc.skills.groups} /></section>}
 </Paper>;
}
