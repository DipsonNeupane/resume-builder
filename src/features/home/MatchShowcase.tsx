import { Bookmark, MapPin, Search } from 'lucide-react';

// A still image of the Jobs and Match workspace, built from the fictional sample
// resume. Every evidence scrap quotes that resume verbatim. Match is shown as
// requirement-level evidence, never as a score or a hiring probability, so the
// landing leads with evidence counts rather than summary labels. Decorative: the
// section copy beside it carries the meaning for assistive technology.

type State = 'shown' | 'review' | 'missing';
const jobs: { title: string; org: string; place: string; cells: State[]; saved?: boolean }[] = [
 { title: 'Customer Support Team Lead', org: 'Example Homewares', place: 'Manchester', cells: ['shown', 'shown', 'shown', 'review', 'missing'], saved: true },
 { title: 'Customer Success Associate', org: 'Example Software', place: 'Remote', cells: ['shown', 'shown', 'review', 'missing'] },
 { title: 'Service Desk Coordinator', org: 'Example Council', place: 'Leeds', cells: ['shown', 'review', 'missing', 'missing'] },
];
const count = (cells: State[]) => {
 const shown = cells.filter(c => c === 'shown').length, review = cells.filter(c => c === 'review').length, missing = cells.filter(c => c === 'missing').length;
 return `${shown} shown · ${review} to review · ${missing} not shown`;
};
const rows: { state: State; label: string; ask: string; quote?: string; source?: string; meaning: string }[] = [
 { state: 'shown', label: 'Clearly demonstrated', ask: 'Support across email, phone and chat', quote: 'Support customers across email, phone, and live chat with clear, empathetic communication.', source: 'Example Company · 2022 — Present', meaning: 'Your own words cover it.' },
 { state: 'shown', label: 'Clearly demonstrated', ask: 'Improve everyday support processes', quote: 'Partner with the operations team to simplify common support processes.', source: 'Example Company · 2022 — Present', meaning: 'Directly supported.' },
 { state: 'shown', label: 'Clearly demonstrated', ask: 'Coach new team members', quote: 'Help new team members develop product knowledge and confidence.', source: 'Example Company · 2022 — Present', meaning: 'Directly supported.' },
 { state: 'review', label: 'Worth reviewing', ask: 'Zendesk administration', quote: 'Customer support, Team collaboration, Problem solving, CRM systems', source: 'Skills', meaning: 'CRM systems are listed; Zendesk itself isn’t named.' },
 { state: 'missing', label: 'Not demonstrated', ask: 'Workforce scheduling', meaning: 'Your resume doesn’t show it yet. You may still have it.' },
];
const choices = [
 { title: 'Tailor a version for this role', detail: 'A separate version for this job. Your original stays put.', chosen: true },
 { title: 'Check Zendesk first', detail: 'Confirm what you have, then look again.' },
 { title: 'Keep looking', detail: 'Save the effort for a role that fits better.' },
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
    <span className="pt-board-place"><MapPin size={13}/>{job.place}</span>
    <span className="pt-board-cells">{job.cells.map((cell, n) => <i key={n} data-state={cell}/>)}</span>
    <span className="pt-board-count">{count(job.cells)}</span>
   </li>)}</ul>
   <div className="pt-board-detail">
    <p className="pt-board-kicker">Example Homewares · Manchester</p>
    <p className="pt-board-heading"><strong>Customer Support Team Lead</strong></p>
    <div className="pt-board-cols"><span>The role asks</span><span>Your resume shows</span><span>What it means</span></div>
    {rows.map((row, i) => <div className={`pt-board-row${i === 1 || i === 2 ? ' is-extra' : ''}`} data-state={row.state} key={row.ask}>
     <span className="pt-board-ask">{row.ask}</span>
     <span className="pt-board-proof">
      {row.quote ? <span className="pt-scrap"><q>{row.quote}</q><small>{row.source}</small></span> : <span className="pt-board-empty">Nothing yet</span>}
     </span>
     <span className="pt-board-meaning"><b><span className="pt-state" data-state={row.state}/>{row.label}</b>{row.meaning}</span>
    </div>)}
    <div className="pt-board-decide">
     <p>Your call<small>An example of what you might decide</small></p>
     <ul>{choices.map(choice => <li key={choice.title} className={choice.chosen ? 'is-chosen' : undefined}><strong>{choice.title}</strong><small>{choice.detail}</small></li>)}</ul>
    </div>
   </div>
  </div>
 </div>;
}
