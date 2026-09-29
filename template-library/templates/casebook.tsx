/* @jsxRuntime automatic */
// Casebook — portfolio-forward. Selected work as numbered case-study cards, then the chronology.
import { orderSections, type DocEntry, type DocSection, type ResumeDoc } from '../document';
import { Bullets, ContactList, MetaLines, Paper, SkillList, Text, join } from './parts';

function Card({ e, index }: { e: DocEntry; index: number }) {
 const links = e.meta.filter(m => m.key === 'link' && m.href);
 const rest = e.meta.filter(m => !(m.key === 'link' && m.href));
 return <div className="cb-card">
  <span className="cb-index">{String(index + 1).padStart(2, '0')}</span>
  <h3>{e.title}</h3>
  {(e.organization || e.location || e.dates) && <p className="cb-for"><Text value={join(e.organization, e.location, e.dates)} /></p>}
  <Bullets items={e.bullets} className="cb-notes" />
  <MetaLines meta={rest} />
  {links.map((m, i) => <p key={i} className="cb-link"><a href={m.href}>{m.value.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')}</a></p>)}
 </div>;
}

function Row({ e }: { e: DocEntry }) {
 return <div className="cb-row">
  <div className="cb-row-head"><h3>{e.title}</h3>{e.dates && <span className="cb-dates">{e.dates}</span>}</div>
  {(e.organization || e.location) && <p className="cb-org"><Text value={join(e.organization, e.location)} /></p>}
  <Bullets items={e.bullets} /><MetaLines meta={e.meta} />
 </div>;
}

function Section({ section }: { section: DocSection }) {
 const cards = section.role === 'projects';
 return <section className={`cb-section cb-role-${section.role}`}>
  <h2>{section.title}</h2>
  {cards ? <div className={`cb-cards${section.entries.length === 1 ? ' cb-cards-single' : ''}`}>{section.entries.map((e, i) => <Card key={e.id} e={e} index={i} />)}</div>
   : section.entries.map(e => <Row key={e.id} e={e} />)}
 </section>;
}

export function Casebook({ doc }: { doc: ResumeDoc }) {
 const sections = orderSections(doc.sections, ['projects', 'experience']);
 // Capabilities follow the chronology: after the last projects/experience section.
 const lastCore = sections.reduce((at, s, i) => (s.role === 'projects' || s.role === 'experience' ? i : at), -1);
 const skills = doc.skills && <section key="skills" className="cb-section cb-capabilities"><h2>{doc.skills.heading}</h2>
  {doc.skills.groups.some(g => g.label) ? <SkillList groups={doc.skills.groups} /> : <ul className="cb-capability-list">{doc.skills.groups.flatMap(g => g.items).map((item, i) => <li key={i}>{item}</li>)}</ul>}
 </section>;
 const body = sections.map(section => <Section key={section.id} section={section} />);
 if (skills) body.splice(lastCore + 1, 0, skills);
 return <Paper id="casebook" doc={doc}>
  <header className="cb-header">
   <h1>{doc.name}</h1>
   {doc.headline && <p className="cb-headline">{doc.headline}</p>}
   <ContactList contacts={[...doc.contacts.filter(c => c.kind === 'website'), ...doc.contacts.filter(c => c.kind !== 'website')]} className="cb-contacts" />
  </header>
  {doc.summary && <section className="cb-section cb-statement"><h2>{doc.summary.heading}</h2>
   {doc.summary.bullets.length ? <Bullets items={doc.summary.bullets} /> : doc.summary.paragraphs.map((p, i) => <p key={i}><Text value={p} /></p>)}
  </section>}
  {body}
 </Paper>;
}
