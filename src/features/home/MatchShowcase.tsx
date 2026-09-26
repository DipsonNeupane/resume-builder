import { Bookmark, MapPin, Search } from 'lucide-react';

// A still image of the Jobs and Match workspace, built from the fictional sample
// resume. Every evidence scrap quotes that resume verbatim. Match is shown as
// labelled evidence, never as a score or a hiring probability. Decorative: the
// section copy beside it carries the meaning for assistive technology.

type State = 'shown' | 'review' | 'missing';
const jobs: { title: string; org: string; place: string; label: string; tone: 'strong' | 'good' | 'stretch'; cells: State[]; saved?: boolean }[] = [
 { title: 'Customer Support Team Lead', org: 'Example Homewares', place: 'Manchester', label: 'Strong match', tone: 'strong', cells: ['shown', 'shown', 'shown', 'review', 'missing'], saved: true },
 { title: 'Customer Success Associate', org: 'Example Software', place: 'Remote', label: 'Good match', tone: 'good', cells: ['shown', 'shown', 'review', 'missing'] },
 { title: 'Service Desk Coordinator', org: 'Example Council', place: 'Leeds', label: 'Stretch', tone: 'stretch', cells: ['shown', 'review', 'missing', 'missing'] },
];
const evidence: { state: State; label: string; rows: { ask: string; quote?: string; source?: string; note?: string }[] }[] = [
 { state: 'shown', label: 'Demonstrated', rows: [
  { ask: 'Support across email, phone and chat', quote: 'Support customers across email, phone, and live chat with clear, empathetic communication.', source: 'Example Company · 2022 — Present' },
  { ask: 'Improve everyday support processes', quote: 'Partner with the operations team to simplify common support processes.', source: 'Example Company · 2022 — Present' },
  { ask: 'Coach new team members', quote: 'Help new team members develop product knowledge and confidence.', source: 'Example Company · 2022 — Present' },
 ] },
 { state: 'review', label: 'Worth reviewing', rows: [{ ask: 'Zendesk administration', quote: 'Customer support, Team collaboration, Problem solving, CRM systems', source: 'Skills', note: 'CRM systems are listed; Zendesk itself isn’t named.' }] },
 { state: 'missing', label: 'Not demonstrated', rows: [{ ask: 'Workforce scheduling', note: 'Your resume doesn’t show it yet. You may still have it.' }] },
];

export function MatchShowcase() {
 return <div className="pt-board" aria-hidden="true">
  <div className="pt-board-bar">
   <span className="pt-board-title">Jobs <small>Saved and recommended</small></span>
   <span className="pt-board-search"><Search size={15}/>Customer support</span>
   <span className="pt-board-filters"><span className="is-on">Manchester + Remote</span><span>Full-time</span></span>
  </div>
  <div className="pt-board-body">
   <ul className="pt-board-jobs">{jobs.map((job, i) => <li key={job.title} className={i === 0 ? 'is-sel' : undefined}>
    <span className="pt-board-org"><span>{job.org}</span>{job.saved && <span className="pt-board-saved"><Bookmark size={12}/>Saved</span>}</span>
    <strong>{job.title}</strong>
    <span className="pt-board-place"><MapPin size={13}/>{job.place}<span className={`pt-board-label is-${job.tone}`}>{job.label}</span></span>
    <span className="pt-board-cells">{job.cells.map((cell, n) => <i key={n} data-state={cell}/>)}</span>
   </li>)}</ul>
   <div className="pt-board-detail">
    <p className="pt-board-kicker">Example Homewares · Manchester</p>
    <p className="pt-board-heading"><strong>Customer Support Team Lead</strong><span className="pt-board-cta">Tailor my resume for this job</span></p>
    {evidence.map(group => <div className="pt-board-group" data-state={group.state} key={group.state}>
     <p className="pt-board-group-label"><span className="pt-state" data-state={group.state}/>{group.label}<span>{group.rows.length}</span></p>
     {group.rows.map(row => <div className="pt-board-row" key={row.ask}>
      <span className="pt-board-ask">{row.ask}</span>
      <span className="pt-board-proof">
       {row.quote && <span className="pt-scrap"><q>{row.quote}</q><small>{row.source}</small></span>}
       {row.note && <span className="pt-board-note">{row.note}</span>}
      </span>
     </div>)}
    </div>)}
   </div>
  </div>
 </div>;
}
