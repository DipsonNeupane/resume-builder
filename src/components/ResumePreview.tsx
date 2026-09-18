import type { CSSProperties } from 'react';
import type { Resume } from '../model';
export function ResumePreview({ resume }: { resume: Resume }) {
 return <article className={`resume-paper ${resume.template}`} dir={resume.direction} lang={resume.language} style={{'--resume-accent':resume.accent} as CSSProperties} aria-label="Resume preview">
  <header className="resume-header"><h1>{resume.name || 'Your name'}</h1>{resume.headline && <p className="resume-headline">{resume.headline}</p>}<div className="resume-contact">{[resume.email,resume.phone,resume.location,resume.website].filter(Boolean).map((value,i)=><span key={i}>{value}</span>)}</div></header>
  {resume.summary && <section><h2>{resume.profileHeading || 'Profile'}</h2><p>{resume.summary}</p></section>}
  {resume.sections.filter(section=>section.entries.some(item=>item.title || item.organization || item.description)).map(section=><section key={section.id}><h2>{section.title}</h2>{section.entries.map(item=><div className="resume-entry" key={item.id}><div className="entry-heading"><h3>{item.title}</h3><span>{item.dates}</span></div><div className="entry-company">{[item.organization,item.location].filter(Boolean).join(' · ')}</div>{item.description && <ul>{item.description.split('\n').filter(Boolean).map((line,i)=><li key={i}>{line.replace(/^[•\-]\s*/, '')}</li>)}</ul>}</div>)}</section>)}
  {resume.skills && <section><h2>{resume.skillsHeading || 'Skills & languages'}</h2><p>{resume.skills}</p></section>}
 </article>;
}
