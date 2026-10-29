import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';

type Props = { onBuild: () => void; onFindJobs: () => void; onOrganize: () => void };

export function PatinaHero({ onBuild, onFindJobs, onOrganize }: Props) {
 const [entered, setEntered] = useState(false);

 useEffect(() => {
  const timer = window.setTimeout(() => setEntered(true), 60);
  return () => window.clearTimeout(timer);
 }, []);

 return <section className={`pt-hero pt-hero-approved ${entered ? 'is-in' : ''}`}>
  <div className="pt-hero-copy">
   <p className="pt-hero-kicker"><span className="pt-dot" aria-hidden="true"/>Job search, organized</p>
   <h1 className="pt-hero-title"><span>Find jobs you like.</span> <span><em>Apply with confidence.</em></span> <span>Know what happens next.</span></h1>
   <p className="hero-deck">Save roles you find here or anywhere else, see what each one asks for against your own resume, and keep every application, date and next step in one place.</p>
   <div className="hero-actions">
    <a className="button large" href="/workspace/preferences" onClick={event => { event.preventDefault(); onFindJobs(); }}>Find my jobs<ArrowRight size={18} aria-hidden="true"/></a>
    <a className="button large outline" href="/workspace/applications" onClick={event => { event.preventDefault(); onOrganize(); }}>Organize my applications<ArrowRight size={18} aria-hidden="true"/></a>
   </div>
   <p className="pt-hero-free">Free account. No resume or quiz needed to track applications. <button className="text-button" onClick={onBuild}>Or build a resume</button></p>
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
      <small>From your resume</small>
      <q>Support customers across email, phone, and live chat…</q>
      <span className="pt-story-status"><i aria-hidden="true"/>Shown in your resume</span>
     </div>
    </li>
    <li className="pt-story-step pt-story-decision">
     <span className="pt-story-number" aria-hidden="true">03</span>
     <div>
      <small>Your decision</small>
      <strong>I’d like to apply.</strong>
      <span>You decide what happens next—not a score.</span>
     </div>
    </li>
   </ol>

  </figure>
 </section>;
}
