/* @jsxRuntime automatic */
// Stackline — technical/projects. Stack matrix and shipped work are the first read.
import { orderSections, type DocEntry, type Meta, type ResumeDoc } from '../document';
import { Bullets, ContactList, MetaValue, Paper, SkillList, Text } from './parts';

function MetaRow({ meta }: { meta: Meta[] }) {
 if (!meta.length) return null;
 return <p className="sl-meta">{meta.map((m, i) => <span key={i} className={`sl-meta-item sl-${m.key}`}><span className="sl-meta-label">{m.label}</span> <MetaValue meta={m} /></span>)}</p>;
}

function Entry({ e }: { e: DocEntry }) {
 return <div className="sl-entry">
  <div className="sl-head">
   <h3>{e.title}{e.title && e.organization && <span className="sl-at"> — </span>}{e.organization && <span className="sl-org"><Text value={e.organization} /></span>}</h3>
   {e.dates && <span className="sl-dates">{e.dates}</span>}
  </div>
  {e.location && <p className="sl-location"><Text value={e.location} /></p>}
  <MetaRow meta={e.meta} />
  <Bullets items={e.bullets} />
 </div>;
}

export function Stackline({ doc }: { doc: ResumeDoc }) {
 const sections = orderSections(doc.sections, ['projects', 'experience', 'education', 'certifications', 'publications', 'awards']);
 return <Paper id="stackline" doc={doc}>
  <header className="sl-header">
   <h1>{doc.name}</h1>
   {doc.headline && <p className="sl-headline">{doc.headline}</p>}
   <ContactList contacts={doc.contacts} className="sl-contacts" />
  </header>
  {doc.summary && <section className="sl-section"><h2>{doc.summary.heading}</h2>
   {doc.summary.bullets.length ? <Bullets items={doc.summary.bullets} /> : doc.summary.paragraphs.map((p, i) => <p key={i} className="sl-summary"><Text value={p} /></p>)}
  </section>}
  {doc.skills && <section className="sl-section sl-stack"><h2>{doc.skills.heading}</h2><SkillList groups={doc.skills.groups} /></section>}
  {sections.map(section => <section key={section.id} className={`sl-section sl-role-${section.role}`}>
   <h2>{section.title}</h2>
   {section.entries.map(e => <Entry key={e.id} e={e} />)}
  </section>)}
 </Paper>;
}
