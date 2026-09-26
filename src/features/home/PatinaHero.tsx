import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Upload } from 'lucide-react';
import { ResumePreview } from '../../components/ResumePreview';
import { Silk } from '../../components/Silk';
import type { Resume } from '../../model';

// Every requirement and the tailored summary below come from the fictional sample
// resume, so the illustration never shows the product inventing experience.
const requirements: { text: string; status: 'shown' | 'review'; label: string }[] = [
 { text: 'Support across email, phone and chat', status: 'shown', label: 'Demonstrated' },
 { text: 'Improve everyday support processes', status: 'shown', label: 'Demonstrated' },
 { text: 'Coach new team members', status: 'shown', label: 'Demonstrated' },
 { text: 'Zendesk administration', status: 'review', label: 'Worth reviewing' },
];
const tailoredSummary = 'Customer experience specialist who supports customers across email, phone and live chat, partners with operations to simplify support processes, and helps new team members build product knowledge and confidence.';
const role = 'Customer Support Team Lead';

// How far each document layer drifts with the pointer and with scroll.
const DEPTH = { master: 0.35, job: 0.7, tailored: 1.15 } as const;
type Layer = keyof typeof DEPTH;

type Props = { sample: Resume; onBuild: () => void; onUpload: () => void };

export function PatinaHero({ sample, onBuild, onUpload }: Props) {
 const stack = useRef<HTMLDivElement>(null);
 const layers = useRef<Partial<Record<Layer, HTMLDivElement | null>>>({});
 const chips = useRef<(HTMLLIElement | null)[]>([]);
 const [threads, setThreads] = useState<string[]>([]);
 const [entered, setEntered] = useState(false);
 const [narrow] = useState(() => window.matchMedia('(max-width: 900px)').matches);
 // On the landing, documents print in ink so copper and mint remain the only colour.
 const master: Resume = { ...sample, accent: '#2c2f35' };
 const tailored: Resume = { ...master, summary: tailoredSummary };

 useEffect(() => {
  const timer = window.setTimeout(() => setEntered(true), 60);
  return () => window.clearTimeout(timer);
 }, []);

 // Pointer parallax, scroll drift and the evidence threads. Nothing here runs under
 // reduced motion except a static measurement of where the threads belong.
 useEffect(() => {
  const root = stack.current;
  if (!root) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let tx = 0, ty = 0, x = 0, y = 0, raf = 0, last = '', visible = true;

  const measure = () => {
   const box = root.getBoundingClientRect();
   const target = layers.current.tailored?.querySelector('.resume-paper > section p');
   if (!target) return;
   const t = target.getBoundingClientRect();
   const next: string[] = [];
   requirements.forEach((req, i) => {
    const chip = chips.current[i];
    if (!chip || req.status !== 'shown') return;
    const a = chip.getBoundingClientRect();
    const x1 = a.right - box.left - 4, y1 = a.top + a.height / 2 - box.top;
    const x2 = t.left - box.left - 4, y2 = t.top + t.height * (0.2 + i * 0.28) - box.top;
    const k = Math.max(36, Math.abs(x2 - x1) * 0.55);
    next.push(`M${x1.toFixed(1)} ${y1.toFixed(1)} C${(x1 + k).toFixed(1)} ${y1.toFixed(1)} ${(x2 - k).toFixed(1)} ${y2.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`);
   });
   const key = next.join('|');
   if (key !== last) { last = key; setThreads(next); }
  };
  const frame = () => {
   raf = 0;
   x += (tx - x) * 0.07;
   y += (ty - y) * 0.07;
   // Scroll drift is atmosphere, not information: none under reduced motion.
   const s = reduced ? 0 : Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.9)));
   // Read layout before writing transforms so each frame avoids a forced
   // read-after-write layout flush.
   measure();
   for (const [name, depth] of Object.entries(DEPTH) as [Layer, number][]) {
    const node = layers.current[name];
    if (!node) continue;
    node.style.setProperty('--px', `${(x * depth * 14).toFixed(2)}px`);
    node.style.setProperty('--py', `${(y * depth * 10 - s * depth * 80).toFixed(2)}px`);
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
  // The documents settle in over about a second; keep the threads attached meanwhile.
  const settle = window.setInterval(measure, 80);
  const stop = window.setTimeout(() => window.clearInterval(settle), 2400);
  kick();
  return () => {
   cancelAnimationFrame(raf);
   io.disconnect(); resize.disconnect();
   window.removeEventListener('pointermove', onMove);
   window.removeEventListener('scroll', kick);
   window.clearInterval(settle); window.clearTimeout(stop);
  };
 }, []);

 return <section className={`pt-hero ${entered ? 'is-in' : ''}`}>
  <Silk className="pt-hero-silk" offset={narrow ? 0.42 : 0}/>
  <div className="pt-hero-copy">
   <p className="pt-hero-kicker"><span className="pt-dot" aria-hidden="true"/>Your experience. Your next move.</p>
   <h1 className="pt-hero-title"><span>One career.</span> <span>More than</span> <span><em>one version.</em></span></h1>
   <p className="hero-deck">You shouldn’t have to start over for every application. Build your master resume once, find roles worth your time, see the evidence for each fit, and shape a separate version for the one you want.</p>
   <div className="hero-actions"><button className="button large" onClick={onBuild}>Build my resume<ArrowRight size={18} aria-hidden="true"/></button><button className="text-button" onClick={onUpload}><Upload size={16} aria-hidden="true"/>Upload a resume</button></div>
   <p className="hero-footnote">All seven templates free. No card needed to begin.</p>
  </div>
  <figure className="pt-stage">
   <figcaption className="visually-hidden">An illustration using a fictional sample resume:
    <ol>
     <li>Your master resume holds all of your experience.</li>
     <li>An opportunity arrives: {role}.</li>
     <li>A strong match: three requirements are demonstrated by the resume and one is worth reviewing.</li>
     <li>A separate tailored version is created for the role. Only the summary changes; the master resume stays unchanged.</li>
    </ol>
   </figcaption>
   <div className="pt-stack" ref={stack} aria-hidden="true">
    <div className="pt-layer pt-layer-master" ref={node => { layers.current.master = node; }}>
     <span className="pt-tag"><i>01</i>Master resume</span>
     <div className="pt-sheet"><ResumePreview resume={master}/></div>
    </div>
    <div className="pt-layer pt-layer-job" ref={node => { layers.current.job = node; }}>
     <span className="pt-tag"><i>02</i>Opportunity</span>
     <div className="pt-jobcard">
      <p className="pt-jobcard-meta"><span>Example Homewares</span><span>Manchester</span></p>
      <strong>{role}</strong>
      <p className="pt-jobcard-match"><span className="pt-state" data-state="shown"/>Strong match</p>
      <p className="pt-jobcard-label">The role asks for</p>
      <ul>{requirements.map((req, i) => <li key={req.text} data-state={req.status} ref={node => { chips.current[i] = node; }}><span className="pt-state" data-state={req.status}/>{req.text}</li>)}</ul>
     </div>
    </div>
    <div className="pt-layer pt-layer-tailored" ref={node => { layers.current.tailored = node; }}>
     <span className="pt-tag pt-tag-copper"><i>03</i>Tailored for {role}</span>
     <div className="pt-sheet pt-sheet-fold"><ResumePreview resume={tailored}/></div>
    </div>
    <svg className="pt-threads">{threads.map((d, i) => <path key={i} d={d} pathLength={1} style={{ animationDelay: `${1.3 + i * 0.12}s` }}/>)}</svg>
    <p className="pt-note"><b>Worth reviewing</b>Zendesk administration: your resume doesn’t show it yet.</p>
   </div>
  </figure>
  <p className="pt-hero-legend" aria-hidden="true"><span data-state="shown"><i/>Demonstrated</span><span data-state="review"><i/>Worth reviewing</span><span data-state="missing"><i/>Not demonstrated</span></p>
 </section>;
}
