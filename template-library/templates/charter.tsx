/* @jsxRuntime automatic */
// Charter — finance and legal. Centred masthead, credentials register first, education
// before experience, ruled small-caps register headings. Monochrome.
import { orderSections, type DocEntry, type ResumeDoc } from '../document';
import { Bullets, ContactList, MetaLines, Paper, SkillList, Text } from './parts';

function Entry({ e }: { e: DocEntry }) {
 return <div className="ch-entry">
  <div className="ch-row"><h3>{e.organization ? <Text value={e.organization} /> : e.title}</h3>{e.location && <span className="ch-loc"><Text value={e.location} /></span>}</div>
  {(e.organization ? e.title : '') || e.dates ? <div className="ch-row ch-row-sub"><p className="ch-title">{e.organization ? e.title : ''}</p>{e.dates && <span className="ch-dates">{e.dates}</span>}</div> : null}
  <Bullets items={e.bullets} /><MetaLines meta={e.meta} />
 </div>;
}

export function Charter({ doc }: { doc: ResumeDoc }) {
 const sections = orderSections(doc.sections, ['certifications', 'education', 'experience', 'publications', 'leadership', 'awards']);
 return <Paper id="charter" doc={doc}>
  <header className="ch-header">
   <h1>{doc.name}</h1>
   {doc.headline && <p className="ch-headline">{doc.headline}</p>}
   <ContactList contacts={doc.contacts} className="ch-contacts" />
  </header>
  {doc.summary && <section className="ch-section"><h2>{doc.summary.heading}</h2>
   {doc.summary.bullets.length ? <Bullets items={doc.summary.bullets} /> : doc.summary.paragraphs.map((p, i) => <p key={i} className="ch-summary"><Text value={p} /></p>)}
  </section>}
  {sections.map(section => <section key={section.id} className={`ch-section ch-role-${section.role}`}><h2>{section.title}</h2>
   {section.role === 'certifications'
    ? <table className="ch-register"><tbody>{section.entries.map(e => <tr key={e.id}>
      <th scope="row">{e.title}</th><td><Text value={[e.organization, e.location].filter(Boolean).join(', ')} />{e.bullets.map((b, i) => <span key={i} className="ch-register-note"><Text value={b} /></span>)}<MetaLines meta={e.meta} /></td><td className="ch-dates">{e.dates}</td>
     </tr>)}</tbody></table>
    : section.entries.map(e => <Entry key={e.id} e={e} />)}
  </section>)}
  {doc.skills && <section className="ch-section"><h2>{doc.skills.heading}</h2><SkillList groups={doc.skills.groups} /></section>}
 </Paper>;
}
