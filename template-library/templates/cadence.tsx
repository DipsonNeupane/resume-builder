/* @jsxRuntime automatic */
// Cadence — product. Projects whose organization names an employer are nested under
// that role as shipped-work callouts; the rest stay in their own section.
import { namesEmployer, orderSections, type DocEntry, type ResumeDoc } from '../document';
import { Bullets, ContactList, MetaLines, MetaValue, Paper, SkillList, Text, join } from './parts';

function Shipped({ e }: { e: DocEntry }) {
 const outcome = e.meta.filter(m => m.key === 'outcome');
 const rest = e.meta.filter(m => m.key !== 'outcome');
 return <div className="cd-shipped">
  <div className="cd-head"><h4>{e.title}</h4>{e.dates && <span className="cd-dates">{e.dates}</span>}</div>
  {(e.organization || e.location) && <p className="cd-org"><Text value={join(e.organization, e.location)} /></p>}
  {outcome.map((m, i) => <p key={i} className="cd-outcome"><span className="cd-label">{m.label}</span> <MetaValue meta={m} /></p>)}
  <Bullets items={e.bullets} /><MetaLines meta={rest} />
 </div>;
}

function Role({ e, shipped, label }: { e: DocEntry; shipped: DocEntry[]; label?: string }) {
 return <div className="cd-role">
  <div className="cd-head"><h3>{e.title}</h3>{e.dates && <span className="cd-dates">{e.dates}</span>}</div>
  {(e.organization || e.location) && <p className="cd-org"><Text value={join(e.organization, e.location)} /></p>}
  <Bullets items={e.bullets} /><MetaLines meta={e.meta} />
  {shipped.length > 0 && <div className="cd-nested">{label && <p className="cd-nested-label">{label}</p>}{shipped.map(p => <Shipped key={p.id} e={p} />)}</div>}
 </div>;
}

export function Cadence({ doc }: { doc: ResumeDoc }) {
 const sections = orderSections(doc.sections, ['experience', 'projects', 'education', 'certifications', 'awards']);
 const roles = sections.filter(s => s.role === 'experience').flatMap(s => s.entries);
 const projects = sections.filter(s => s.role === 'projects').flatMap(s => s.entries);
 // Nested work keeps the user's own section title as its label, so no heading is lost.
 const projectTitle = new Map(sections.filter(s => s.role === 'projects').flatMap(s => s.entries.map(p => [p.id, s.title] as const)));
 // Each project nests under the first (most recent) role whose employer it names.
 const home = new Map<string, string>();
 for (const p of projects) { const role = roles.find(r => namesEmployer(p, r.organization)); if (role) home.set(p.id, role.id); }
 const nested = (roleId: string) => projects.filter(p => home.get(p.id) === roleId);
 return <Paper id="cadence" doc={doc}>
  <header className="cd-header">
   <h1>{doc.name}</h1>
   <div className="cd-sub">{doc.headline && <p className="cd-headline">{doc.headline}</p>}<ContactList contacts={doc.contacts} className="cd-contacts" /></div>
  </header>
  {doc.summary && <section className="cd-section"><h2>{doc.summary.heading}</h2>
   {doc.summary.bullets.length ? <Bullets items={doc.summary.bullets} /> : doc.summary.paragraphs.map((p, i) => <p key={i}><Text value={p} /></p>)}
  </section>}
  {sections.map(section => {
   if (section.role === 'projects') {
    const rest = section.entries.filter(p => !home.has(p.id));
    return rest.length ? <section key={section.id} className="cd-section cd-role-projects"><h2>{section.title}</h2>{rest.map(p => <Shipped key={p.id} e={p} />)}</section> : null;
   }
   return <section key={section.id} className={`cd-section cd-role-${section.role}`}><h2>{section.title}</h2>
    {section.role === 'experience' ? section.entries.map(e => { const shipped = nested(e.id); return <Role key={e.id} e={e} shipped={shipped} label={shipped[0] && projectTitle.get(shipped[0].id)} />; }) : section.entries.map(e => <Role key={e.id} e={e} shipped={[]} />)}
   </section>;
  })}
  {doc.skills && <section className="cd-section"><h2>{doc.skills.heading}</h2><SkillList groups={doc.skills.groups} /></section>}
 </Paper>;
}
