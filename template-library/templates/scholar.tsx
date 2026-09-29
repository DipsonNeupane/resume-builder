/* @jsxRuntime automatic */
// Scholar — research/academic CV. Research-first order, year rail, numbered citations.
import { orderSections, type DocEntry, type DocSection, type ResumeDoc } from '../document';
import { Bullets, ContactList, MetaLines, Paper, SkillList, Text } from './parts';

const citationRoles = new Set(['publications', 'presentations']);

function Citation({ e }: { e: DocEntry }) {
 const tail = [e.location, e.dates].filter(Boolean);
 return <li className="sc-cite">
  <p>
   {e.title && <span className="sc-cite-title">“{e.title}.”</span>}
   {e.organization && <> <cite><Text value={e.organization} /></cite>{tail.length ? ',' : '.'}</>}
   {tail.length > 0 && <> {tail.map((t, i) => <span key={i}><Text value={t} />{i < tail.length - 1 ? ', ' : '.'}</span>)}</>}
  </p>
  {e.bullets.map((line, i) => <p key={i} className="sc-cite-note"><Text value={line} /></p>)}
  <MetaLines meta={e.meta} className="sc-cite-meta" />
 </li>;
}

function Entry({ e }: { e: DocEntry }) {
 return <div className="sc-entry">
  <p className="sc-when">{e.dates}</p>
  <div className="sc-body">
   <p className="sc-line">{e.title && <strong>{e.title}</strong>}{e.title && e.organization && ', '}{e.organization && <em><Text value={e.organization} /></em>}{e.location && <span className="sc-loc">, <Text value={e.location} /></span>}</p>
   <Bullets items={e.bullets} className="sc-notes" /><MetaLines meta={e.meta} />
  </div>
 </div>;
}

function Section({ section }: { section: DocSection }) {
 return <section className={`sc-section sc-role-${section.role}`}>
  <h2>{section.title}</h2>
  {citationRoles.has(section.role)
   ? <ol className="sc-cites">{section.entries.map(e => <Citation key={e.id} e={e} />)}</ol>
   : section.entries.map(e => <Entry key={e.id} e={e} />)}
 </section>;
}

export function Scholar({ doc }: { doc: ResumeDoc }) {
 const sections = orderSections(doc.sections, ['education', 'experience', 'publications', 'awards', 'teaching', 'presentations', 'projects', 'leadership', 'volunteering', 'certifications']);
 return <Paper id="scholar" doc={doc}>
  <header className="sc-header">
   <h1>{doc.name}</h1>
   {doc.headline && <p className="sc-headline">{doc.headline}</p>}
   <ContactList contacts={doc.contacts} className="sc-contacts" />
  </header>
  {doc.summary && <section className="sc-section"><h2>{doc.summary.heading}</h2>
   {doc.summary.bullets.length ? <Bullets items={doc.summary.bullets} className="sc-notes" /> : doc.summary.paragraphs.map((p, i) => <p key={i} className="sc-summary"><Text value={p} /></p>)}
  </section>}
  {sections.map(section => <Section key={section.id} section={section} />)}
  {doc.skills && <section className="sc-section"><h2>{doc.skills.heading}</h2><SkillList groups={doc.skills.groups} /></section>}
 </Paper>;
}
