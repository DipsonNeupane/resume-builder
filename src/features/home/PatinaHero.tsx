import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';

type Props = { onBuild: () => void };

export function PatinaHero({ onBuild }: Props) {
 const [entered, setEntered] = useState(false);

 useEffect(() => {
  const timer = window.setTimeout(() => setEntered(true), 60);
  return () => window.clearTimeout(timer);
 }, []);

 return <section className={`pt-hero pt-hero-approved ${entered ? 'is-in' : ''}`}>
  <div className="pt-hero-copy">
   <p className="pt-hero-kicker"><span className="pt-dot" aria-hidden="true"/>Evidence before effort</p>
   <h1 className="pt-hero-title"><span>Find the roles</span> <span><em>worth your effort.</em></span></h1>
   <p className="hero-deck">See what a job asks for, where your experience supports it, and what still needs clarification. Then you decide whether the role deserves your effort.</p>
   <div className="hero-actions">
    <a className="button large" href="/tools/resume-job-match/">Compare my resume with a job<ArrowRight size={18} aria-hidden="true"/></a>
    <button className="text-button" onClick={onBuild}>Build a resume free<ArrowRight size={15} aria-hidden="true"/></button>
   </div>
   <p className="pt-hero-free">Private, limited comparison. No signup required.</p>
  </div>

  <figure className="pt-story">
   <figcaption className="pt-story-heading">
    <span>Fictional example</span>
    <strong>Customer Support Team Lead</strong>
   </figcaption>
   <ol className="pt-story-flow">
    <li className="pt-story-step pt-story-requirement">
     <span className="pt-story-number" aria-hidden="true">01</span>
     <div>
      <small>Job requirement</small>
      <strong>Support customers across email, phone and live chat</strong>
     </div>
    </li>
    <li className="pt-story-step pt-story-evidence">
     <span className="pt-story-number" aria-hidden="true">02</span>
     <div>
      <small>Evidence from your experience</small>
      <q>Support customers across email, phone, and live chat…</q>
      <span className="pt-story-status"><i aria-hidden="true"/>Clearly demonstrated</span>
     </div>
    </li>
    <li className="pt-story-step pt-story-decision">
     <span className="pt-story-number" aria-hidden="true">03</span>
     <div>
      <small>Your decision</small>
      <strong>This role is worth my effort.</strong>
      <span>You decide what happens next—not a score.</span>
     </div>
    </li>
   </ol>
   <p className="pt-story-foot">Requirement <span aria-hidden="true">→</span> evidence <span aria-hidden="true">→</span> your decision</p>
  </figure>
 </section>;
}
