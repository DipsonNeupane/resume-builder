import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Upload } from 'lucide-react';
import { ResumePreview } from '../../components/ResumePreview';
import { Silk } from '../../components/Silk';
import type { Resume } from '../../model';

// Every evidence quote below is taken verbatim from the fictional sample resume, so
// the illustration never shows the product inventing experience. The states are the
// evidence states Match Analysis uses; nothing here is a score or a prediction.
type State = 'shown' | 'review' | 'missing';
const openings = [
 { title: 'Customer Support Team Lead', org: 'Example Homewares', cells: ['shown', 'shown', 'review', 'missing'] as State[] },
 { title: 'Customer Success Associate', org: 'Example Software', cells: ['shown', 'review', 'missing', 'missing'] as State[] },
 { title: 'Service Desk Coordinator', org: 'Example Council', cells: ['shown', 'missing', 'missing', 'missing'] as State[] },
 { title: 'Operations Assistant', org: 'Example Logistics', cells: ['review', 'missing', 'missing', 'missing'] as State[] },
];
const evidence: { ask: string; state: State; label: string; quote?: string; note?: string }[] = [
 { ask: 'Support across email, phone and chat', state: 'shown', label: 'Clearly demonstrated', quote: 'Support customers across email, phone, and live chat…' },
 { ask: 'Coach new team members', state: 'shown', label: 'Clearly demonstrated', quote: 'Help new team members develop product knowledge…' },
 { ask: 'Zendesk administration', state: 'review', label: 'Worth reviewing', note: 'CRM systems are listed. Zendesk isn’t named.' },
 { ask: 'Workforce scheduling', state: 'missing', label: 'Not demonstrated', note: 'Your resume doesn’t show it yet. You may still have it.' },
];
const choices = [
 { title: 'Tailor a version', detail: 'It looks worth the effort', chosen: true },
 { title: 'Check Zendesk first', detail: 'Add context, then look again' },
 { title: 'Keep looking', detail: 'Spend tonight elsewhere' },
];
const role = openings[0].title;

// How far each layer drifts with the pointer and with scroll.
const DEPTH = { openings: 0.35, source: 0.5, evidence: 0.8, decision: 1.15 } as const;
type Layer = keyof typeof DEPTH;

type Props = { sample: Resume; onBuild: () => void; onUpload: () => void; onJobs: () => void };

export function PatinaHero({ sample, onBuild, onUpload, onJobs }: Props) {
 const stack = useRef<HTMLDivElement>(null);
 const layers = useRef<Partial<Record<Layer, HTMLDivElement | null>>>({});
 const scraps = useRef<(HTMLElement | null)[]>([]);
 const [threads, setThreads] = useState<string[]>([]);
 const [entered, setEntered] = useState(false);
 const [narrow] = useState(() => window.matchMedia('(max-width: 900px)').matches);
 // On the landing, documents print in ink so copper and mint remain the only colour.
 const master: Resume = { ...sample, accent: '#2c2f35' };

 useEffect(() => {
  const timer = window.setTimeout(() => setEntered(true), 60);
  return () => window.clearTimeout(timer);
 }, []);

 // Pointer parallax, scroll drift and the evidence threads from the master resume to
 // each quote. Nothing here runs under reduced motion except a static measurement of
 // where the threads belong.
 useEffect(() => {
  const root = stack.current;
  if (!root) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let tx = 0, ty = 0, x = 0, y = 0, raf = 0, last = '', visible = true;

  const measure = () => {
   const box = root.getBoundingClientRect();
   const card = layers.current.evidence?.querySelector('.pt-evidence')?.getBoundingClientRect();
   const bullets = layers.current.source?.querySelectorAll('.resume-paper li');
   const next: string[] = [];
   if (card && bullets && bullets.length >= 3) {
    evidence.forEach((row, i) => {
     const scrap = scraps.current[i];
     if (!scrap || row.state !== 'shown') return;
     // The sample's first bullet is channels; its third is coaching.
     const line = bullets[i === 0 ? 0 : 2].getBoundingClientRect();
     const a = scrap.getBoundingClientRect();
     if (!a.width || !line.width) return;
     // Run level out of the card first so a thread never crosses a state label.
     const x1 = a.right - box.left - 2, y1 = a.top + a.height / 2 - box.top;
     const xe = card.right - box.left + 4;
     const x2 = line.left - box.left - 6, y2 = line.top + line.height / 2 - box.top;
     const k = Math.max(24, Math.abs(x2 - xe) * 0.6);
     next.push(`M${x1.toFixed(1)} ${y1.toFixed(1)} L${xe.toFixed(1)} ${y1.toFixed(1)} C${(xe + k).toFixed(1)} ${y1.toFixed(1)} ${(x2 - k).toFixed(1)} ${y2.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`);
    });
   }
   const key = next.join('|');
   if (key !== last) { last = key; setThreads(next); }
  };
  const frame = () => {
   raf = 0;
   x += (tx - x) * 0.07;
   y += (ty - y) * 0.07;
   // Scroll drift is atmosphere, not information: none under reduced motion.
   const s = reduced || narrow ? 0 : Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.9)));
   // Read layout before writing transforms so each frame avoids a forced
   // read-after-write layout flush.
   measure();
   for (const [name, depth] of Object.entries(DEPTH) as [Layer, number][]) {
    const node = layers.current[name];
    if (!node) continue;
    node.style.setProperty('--px', `${(x * depth * 12).toFixed(2)}px`);
    node.style.setProperty('--py', `${(y * depth * 8 - s * depth * 70).toFixed(2)}px`);
   }
   if (Math.abs(tx - x) > 0.001 || Math.abs(ty - y) > 0.001) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf && visible) raf = requestAnimationFrame(frame); };
  const onMove = (event: PointerEvent) => {
   if (reduced || event.pointerType !== 'mouse') return;
   tx = (event.clientX / window.innerWidth) * 2 - 1;
   ty = (event.clientY / window.innerHeight) * 2 - 1;
   kick();
  };
  const io = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? true; kick(); });
  io.observe(root);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('scroll', kick, { passive: true });
  const resize = new ResizeObserver(kick);
  resize.observe(root);
  // The cards settle in over about a second; keep the threads attached meanwhile.
  const settle = window.setInterval(measure, 80);
  const stop = window.setTimeout(() => window.clearInterval(settle), 2600);
  kick();
  return () => {
   cancelAnimationFrame(raf);
   io.disconnect(); resize.disconnect();
   window.removeEventListener('pointermove', onMove);
   window.removeEventListener('scroll', kick);
   window.clearInterval(settle); window.clearTimeout(stop);
  };
 }, [narrow]);

 return <section className={`pt-hero ${entered ? 'is-in' : ''}`}>
  <Silk className="pt-hero-silk" offset={narrow ? 0.42 : 0}/>
  <div className="pt-hero-copy">
   <p className="pt-hero-kicker"><span className="pt-dot" aria-hidden="true"/>Your job search, with less guesswork</p>
   <h1 className="pt-hero-title"><span>Stop searching</span> <span>everywhere.</span> <span><em>Start with jobs that</em></span> <span><em>fit your experience.</em></span></h1>
   <p className="hero-deck">ResumeStride helps you find relevant opportunities, see what your experience actually supports, and tailor your resume for the roles you choose.</p>
   <p className="pt-hero-proof">Opportunities sourced across <strong>190+ job portals</strong> and employer career sites.</p>
   <div className="hero-actions"><button className="button large" onClick={onJobs}>Find relevant jobs<ArrowRight size={18} aria-hidden="true"/></button><button className="text-button" onClick={onUpload}><Upload size={16} aria-hidden="true"/>Upload a resume</button></div>
   <p className="pt-hero-free">Just need a resume? <button className="text-button" onClick={onBuild}>Build one free<ArrowRight size={15} aria-hidden="true"/></button><span>7 layouts, PDF or Word. No card needed.</span></p>
  </div>
  <figure className="pt-stage">
   <figcaption className="visually-hidden">An illustration using a fictional sample resume:
    <ol>
     <li>Four openings are saved. {role} is selected.</li>
     <li>Two of its requirements are clearly demonstrated, each by a quoted line from the resume.</li>
     <li>Zendesk administration is worth reviewing: CRM systems are listed, but Zendesk isn’t named.</li>
     <li>Workforce scheduling is not demonstrated: the resume doesn’t show it yet, which is not a verdict on the person.</li>
     <li>An example of the decision that follows, which belongs to the person: here they choose to tailor a separate version for this job; they might instead check a requirement first or keep looking.</li>
    </ol>
   </figcaption>
   <div className="pt-stack" ref={stack} aria-hidden="true">
    <div className="pt-layer pt-layer-openings" ref={node => { layers.current.openings = node; }}>
     <span className="pt-tag"><i>01</i>Four openings</span>
     <ul className="pt-openings">{openings.map((job, i) => <li key={job.title} className={i === 0 ? 'is-sel' : undefined}>
      <span className="pt-openings-org">{job.org}</span>
      <strong>{job.title}</strong>
      <span className="pt-cells">{job.cells.map((cell, n) => <i key={n} data-state={cell}/>)}</span>
     </li>)}</ul>
     <p className="pt-openings-more">+3 more saved</p>
    </div>
    <div className="pt-layer pt-layer-source" ref={node => { layers.current.source = node; }}>
     <span className="pt-tag">Source · your resume</span>
     <div className="pt-sheet"><ResumePreview resume={master}/></div>
    </div>
    <div className="pt-layer pt-layer-evidence" ref={node => { layers.current.evidence = node; }}>
     <span className="pt-tag pt-tag-copper"><i>02</i>What your experience supports</span>
     <div className="pt-evidence">
      <p className="pt-evidence-meta"><span>Example Homewares</span><span>Manchester</span></p>
      <strong className="pt-evidence-role">{role}</strong>
      <ol>{evidence.map((row, i) => <li key={row.ask} data-state={row.state}>
       <span className="pt-evidence-ask">{row.ask}</span>
       <span className="pt-evidence-state"><span className="pt-state" data-state={row.state}/>{row.label}</span>
       {row.quote && <q className="pt-mini-scrap" ref={node => { scraps.current[i] = node; }}>{row.quote}</q>}
       {row.note && <span className="pt-evidence-note">{row.note}</span>}
      </li>)}</ol>
     </div>
    </div>
    <div className="pt-layer pt-layer-decision" ref={node => { layers.current.decision = node; }}>
     <span className="pt-tag"><i>03</i>Your call</span>
     <div className="pt-decision">
      <p className="pt-decision-head">For example, you might decide to…</p>
      <ul>{choices.map(choice => <li key={choice.title} className={choice.chosen ? 'is-chosen' : undefined}><strong>{choice.title}</strong><small>{choice.detail}</small></li>)}</ul>
      <p className="pt-decision-foot">Evidence before effort. The call is yours.</p>
     </div>
    </div>
    <svg className="pt-threads">{threads.map((d, i) => <path key={i} d={d} pathLength={1} style={{ animationDelay: `${1.5 + i * 0.14}s` }}/>)}</svg>
   </div>
  </figure>
 </section>;
}
