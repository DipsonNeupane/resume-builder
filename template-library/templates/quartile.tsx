/* @jsxRuntime automatic */
// Quartile — data and analytics. Figures in the user's own bullets set in semibold
// tabular numerals; tools as a ruled matrix; experience first.
import { orderSections, type DocEntry, type ResumeDoc } from '../document';
import { ContactList, MetaValue, Paper, Text, join } from './parts';

function Entry({ e }: { e: DocEntry }) {
 return <div className="qt-entry">
  <div className="qt-head"><h3>{e.title}</h3>{e.dates && <span className="qt-dates">{e.dates}</span>}</div>
  {(e.organization || e.location) && <p className="qt-org"><Text value={join(e.organization, e.location)} /></p>}
  {e.bullets.length > 0 && <ul className="pt-bullets">{e.bullets.map((b, i) => <li key={i}><Text value={b} figures /></li>)}</ul>}
  {e.meta.length > 0 && <p className="qt-meta">{e.meta.map((m, i) => <span key={i}><span className="qt-meta-label">{m.label}</span> <MetaValue meta={m} /></span>)}</p>}
 </div>;
}

export function Quartile({ doc }: { doc: ResumeDoc }) {
 const sections = orderSections(doc.sections, ['experience', 'projects', 'publications', 'education', 'certifications', 'awards']);
 return <Paper id="quartile" doc={doc}>
  <header className="qt-header">
   <h1>{doc.name}</h1>{doc.headline && <p className="qt-headline">{doc.headline}</p>}
   <ContactList contacts={doc.contacts} className="qt-contacts" />
  </header>
  {doc.summary && <section className="qt-section"><h2>{doc.summary.heading}</h2>
   {doc.summary.bullets.length ? <ul className="pt-bullets">{doc.summary.bullets.map((b, i) => <li key={i}><Text value={b} figures /></li>)}</ul> : doc.summary.paragraphs.map((p, i) => <p key={i}><Text value={p} figures /></p>)}
  </section>}
  {doc.skills && <section className="qt-section"><h2>{doc.skills.heading}</h2>
   <table className="qt-tools"><tbody>{doc.skills.groups.map((g, i) => <tr key={i}>{g.label ? <th scope="row">{g.label}</th> : <td className="qt-nolabel" />}<td>{g.items.map((item, j) => <span key={j} className="qt-tool">{item}{j < g.items.length - 1 && ', '}</span>)}</td></tr>)}</tbody></table>
  </section>}
  {sections.map(section => <section key={section.id} className={`qt-section qt-role-${section.role}`}><h2>{section.title}</h2>{section.entries.map(e => <Entry key={e.id} e={e} />)}</section>)}
 </Paper>;
}
