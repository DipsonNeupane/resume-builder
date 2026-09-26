import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Resume } from '../model';
import { ResumePreview } from './resumeMarkup';

export { ResumePreview };

/** Show the export markup inside distinct, consecutive paper viewports. */
export function PaginatedResumePreview({ resume }: { resume: Resume }) {
 const firstPageRef = useRef<HTMLDivElement>(null);
 const [layout, setLayout] = useState({ pages: 1, pageHeight: 0, margin: 0, innerWidth: 0, innerHeight: 0, stride: 0 });
 useLayoutEffect(() => {
  const firstPage = firstPageRef.current;
  if (!firstPage) return;
  const update = () => {
   const width = firstPage.clientWidth;
   if (!width) return;
   const pageHeight = width * (resume.paper === 'A4' ? 297 / 210 : 11 / 8.5);
   const margin = width * (resume.paper === 'A4' ? 16 / 210 : 16 / 215.9);
   const innerWidth = width - margin * 2;
   const innerHeight = pageHeight - margin * 2;
   const stride = innerWidth + margin * 2;
   // Apply the measurement variables before reading scrollWidth. Waiting for a later
   // animation frame briefly painted every long resume as one page and made callers
   // race the pagination pass immediately after opening Preview.
   const preview = firstPage.parentElement;
   preview?.style.setProperty('--preview-margin', `${margin}px`);
   preview?.style.setProperty('--preview-inner-width', `${innerWidth}px`);
   preview?.style.setProperty('--preview-inner-height', `${innerHeight}px`);
   preview?.style.setProperty('--preview-column-gap', `${margin * 2}px`);
   const flowWidth = firstPage.querySelector<HTMLElement>('.resume-paper')?.scrollWidth ?? innerWidth;
   const pages = Math.max(1, Math.ceil((flowWidth + 1) / stride));
   setLayout(old => old.pages === pages && old.pageHeight === pageHeight && old.margin === margin
    && old.innerWidth === innerWidth && old.innerHeight === innerHeight && old.stride === stride
    ? old : { pages, pageHeight, margin, innerWidth, innerHeight, stride });
  };
  update();
  const observer = new ResizeObserver(update);
  observer.observe(firstPage);
  const paper = firstPage.querySelector<HTMLElement>('.resume-paper');
  if (paper) observer.observe(paper);
  let cancelled = false;
  const updateAfterFontsLoad = () => { if (!cancelled) update(); };
  document.fonts?.addEventListener('loadingdone', updateAfterFontsLoad);
  void document.fonts?.ready.then(updateAfterFontsLoad);
  return () => {
   cancelled = true;
   observer.disconnect();
   document.fonts?.removeEventListener('loadingdone', updateAfterFontsLoad);
  };
 }, [resume]);
 const variables = {
  '--preview-margin': `${layout.margin}px`,
  '--preview-inner-width': `${layout.innerWidth}px`,
  '--preview-inner-height': `${layout.innerHeight}px`,
  '--preview-column-gap': `${layout.margin * 2}px`,
 } as CSSProperties;
 return <div className={`paginated-preview paper-${resume.paper}`} data-page-count={layout.pages} style={variables}>
  {Array.from({ length: layout.pages }, (_, index) => <div ref={index === 0 ? firstPageRef : undefined} className="resume-page" role="group" key={index} aria-label={`Page ${index + 1} of ${layout.pages}`}>
   <div className="resume-page-content" aria-hidden={index > 0 || undefined}>
    <div className="resume-flow" style={{ transform: `translateX(${resume.direction === 'rtl' ? index * layout.stride : -index * layout.stride}px)` }}>
     <ResumePreview resume={resume}/>
    </div>
   </div>
  </div>)}
 </div>;
}
