import { memo, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { PremiumResume } from '../../template-library/templates/index';
import { isPremiumTemplate, type Resume } from '../model';
import { ResumePreview as FreeResumePreview } from './resumeMarkup';

export const ResumePreview = memo(function ResumePreview({ resume }: { resume: Resume }) {
 return isPremiumTemplate(resume.template) ? <PremiumResume id={resume.template} resume={resume}/> : <FreeResumePreview resume={resume}/>;
});

const MM = 96 / 25.4;
const geometry = { A4: { width: 210 * MM, height: 297 * MM, margin: 16 * MM }, Letter: { width: 215.9 * MM, height: 279.4 * MM, margin: 16 * MM } } as const;

export function PaginatedResumePreview({ resume }: { resume: Resume }) {
 const rootRef = useRef<HTMLDivElement>(null);
 const [layout, setLayout] = useState({ pages: 1, scale: 0 });
 const g = geometry[resume.paper], innerWidth = g.width - 2 * g.margin, innerHeight = g.height - 2 * g.margin;
 useLayoutEffect(() => {
  const root = rootRef.current;if (!root) return;
  const measure = () => { const width=root.clientWidth,flow=root.querySelector<HTMLElement>('.fixed-preview-flow > *');if(!width||!flow)return;const next={pages:Math.max(1,Math.ceil((flow.scrollWidth+1)/g.width)),scale:width/g.width};setLayout(old=>old.pages===next.pages&&old.scale===next.scale?old:next); };
  measure();const observer=new ResizeObserver(measure);observer.observe(root);const flow=root.querySelector<HTMLElement>('.fixed-preview-flow > *');if(flow)observer.observe(flow);
  let cancelled=false;const afterFonts=()=>{if(!cancelled)measure();};document.fonts?.addEventListener('loadingdone',afterFonts);void document.fonts?.ready.then(afterFonts);
  return()=>{cancelled=true;observer.disconnect();document.fonts?.removeEventListener('loadingdone',afterFonts);};
 },[g.width,resume]);
 const variables={'--fixed-page-w':`${g.width}px`,'--fixed-page-h':`${g.height}px`,'--fixed-margin':`${g.margin}px`,'--fixed-inner-w':`${innerWidth}px`,'--fixed-inner-h':`${innerHeight}px`,'--fixed-gap':`${2*g.margin}px`,'--fixed-scale':layout.scale||0.0001} as CSSProperties;
 return <div ref={rootRef} className={`paginated-preview fixed-preview fixed-preview-${resume.paper}${layout.scale?' is-measured':''}`} data-page-count={layout.pages} style={variables}>
  {Array.from({length:layout.pages},(_,index)=><div className="fixed-preview-frame" role="group" aria-label={`Page ${index+1} of ${layout.pages}`} key={index}>
   <div className="resume-page fixed-preview-page"><div className="resume-page-content fixed-preview-clip" aria-hidden={index>0||undefined}><div className="fixed-preview-flow" style={{transform:`translateX(${resume.direction==='rtl'?index*g.width:-index*g.width}px)`}}><ResumePreview resume={resume}/></div></div></div>
  </div>)}
 </div>;
}
