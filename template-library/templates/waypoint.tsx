/* @jsxRuntime automatic */
// Waypoint — operations. Experience as a continuous timeline with a node per role;
// dates and location share the lead line; "Scope:" lines are pulled forward.
import { orderSections, type DocEntry, type ResumeDoc } from '../document';
import { Bullets, ContactList, MetaLines, MetaValue, Paper, SkillList, Text, join } from './parts';

function Stop({ e }: { e: DocEntry }) {
 const scope = e.meta.filter(m => m.key === 'scope');
 const rest = e.meta.filter(m => m.key !== 'scope');
 return <div className="wp-stop">
  {(e.dates || e.location) && <p className="wp-when">{e.dates}{e.dates && e.location && <span className="wp-sep"> · </span>}{e.location && <Text value={e.location} />}</p>}
  <h3>{e.title}{e.organization && <span className="wp-org">, <Text value={e.organization} /></span>}</h3>
  {scope.map((m, i) => <p key={i} className="wp-scope"><span className="wp-label">{m.label}</span> <MetaValue meta={m} /></p>)}
  <Bullets items={e.bullets} /><MetaLines meta={rest} />
 </div>;
}

function Entry({ e }: { e: DocEntry }) {
 return <div className="wp-entry">
  <div className="wp-head"><h3>{e.title}</h3>{e.dates && <span className="wp-dates">{e.dates}</span>}</div>
  {(e.organization || e.location) && <p className="wp-org-line"><Text value={join(e.organization, e.location)} /></p>}
  <Bullets items={e.bullets} /><MetaLines meta={e.meta} />
 </div>;
}

export function Waypoint({ doc }: { doc: ResumeDoc }) {
 const sections = orderSections(doc.sections, ['experience', 'leadership', 'certifications', 'education', 'projects']);
 return <Paper id="waypoint" doc={doc}>
  <header className="wp-header">
   <h1>{doc.name}</h1>{doc.headline && <p className="wp-headline">{doc.headline}</p>}
   <ContactList contacts={doc.contacts} className="wp-contacts" />
  </header>
  {doc.summary && <section className="wp-section"><h2>{doc.summary.heading}</h2>
   {doc.summary.bullets.length ? <Bullets items={doc.summary.bullets} /> : doc.summary.paragraphs.map((p, i) => <p key={i}><Text value={p} /></p>)}
  </section>}
  {sections.map(section => <section key={section.id} className={`wp-section wp-role-${section.role}`}><h2>{section.title}</h2>
   {section.role === 'experience' ? <div className="wp-timeline">{section.entries.map(e => <Stop key={e.id} e={e} />)}</div> : section.entries.map(e => <Entry key={e.id} e={e} />)}
  </section>)}
  {doc.skills && <section className="wp-section"><h2>{doc.skills.heading}</h2><SkillList groups={doc.skills.groups} /></section>}
 </Paper>;
}
