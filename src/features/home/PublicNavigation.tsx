import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { ArrowRight, Menu, UserRound } from 'lucide-react';
import { publicDestinations } from '../../routing/routes';

type Props = {
 authAvailable: boolean;
 signedIn: boolean;
 profileName: string;
 resumeReady: boolean;
 onHome: () => void;
 onContinue: () => void;
 onJobs: () => void;
 onAccount: () => void;
 onHomeSection: (sectionId: 'templates' | 'pricing') => void;
};

function plainPrimaryClick(event: MouseEvent<HTMLAnchorElement>): boolean {
 return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function PublicNavigation({ authAvailable, signedIn, profileName, resumeReady, onHome, onContinue, onJobs, onAccount, onHomeSection }: Props) {
 const [open, setOpen] = useState(false);
 const toggle = useRef<HTMLButtonElement>(null);

 useEffect(() => {
  if (!open) return;
  const close = (event: KeyboardEvent) => {
   if (event.key !== 'Escape') return;
   setOpen(false);
   toggle.current?.focus();
  };
  window.addEventListener('keydown', close);
  return () => window.removeEventListener('keydown', close);
 }, [open]);

 const routeClick = (event: MouseEvent<HTMLAnchorElement>, action: () => void) => {
  setOpen(false);
  if (!plainPrimaryClick(event)) return;
  event.preventDefault();
  action();
 };
 const sectionClick = (section: 'templates' | 'pricing') => (event: MouseEvent<HTMLAnchorElement>) => {
  setOpen(false);
  if (!plainPrimaryClick(event)) return;
  event.preventDefault();
  onHomeSection(section);
 };
 const continuing = signedIn && resumeReady;

 return <header className="site-header public-header">
  <button className="brand" onClick={() => { setOpen(false); onHome(); }} aria-label="ResumeStride home"><span className="brand-icon"><span className="stride-mark" aria-hidden="true"><i/><i/><i/></span></span>Resume<span className="brand-light">Stride</span></button>
  <button ref={toggle} className="icon-button mobile-menu" aria-label="Toggle navigation" aria-controls="main-navigation" aria-expanded={open} onClick={() => setOpen(current => !current)}><Menu aria-hidden="true"/></button>
  <nav id="main-navigation" aria-label="Main navigation" className={open ? 'nav public-nav open' : 'nav public-nav'}>
   <a href="/workspace/resume" onClick={event => routeClick(event, onContinue)}>Resume Builder</a>
   <a href="/start/job" onClick={event => routeClick(event, onJobs)}>Jobs &amp; Match</a>
   <a href={publicDestinations.tools}>Free Tools</a>
   <a href={publicDestinations.templates} onClick={sectionClick('templates')}>Templates</a>
   <a href={publicDestinations.resources}>Resources</a>
   <a href={publicDestinations.pricing} onClick={sectionClick('pricing')}>Pricing</a>
   {authAvailable && !signedIn && <button className="nav-account" onClick={() => { setOpen(false); onAccount(); }}>Sign in / Sign up</button>}
  </nav>
  <div className="site-header-actions">
   {signedIn && <button className="header-profile" onClick={() => { setOpen(false); onAccount(); }} aria-label={`Open profile for ${profileName}`}><UserRound size={16} aria-hidden="true"/>Hello, {profileName}</button>}
   <button className="button header-cta" onClick={() => { setOpen(false); onContinue(); }}>{continuing ? 'Continue my resume' : 'Build my resume'}<ArrowRight size={16} aria-hidden="true"/></button>
  </div>
 </header>;
}
