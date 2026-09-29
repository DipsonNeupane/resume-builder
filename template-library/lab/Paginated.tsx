// Premium preview pagination at true print geometry.
//
// Pages are laid out at their real physical size (A4/Letter, 16mm margins, 10pt
// type — the same numbers the PDF renderer uses) and only *scaled* for display
// with a transform, which never affects layout. Line breaks and page breaks are
// therefore computed from the same geometry as the PDF, instead of from a
// viewport-relative font size that rounds differently at every preview width.
//
// It also removes the Phase 1 freeze: the column flow always has fixed, non-zero
// dimensions from the first frame, so Chrome can never be asked to fragment grid
// content into a 0×0 column (which made it generate columns indefinitely).
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

const mm = 96 / 25.4;
export const paperGeometry = {
 A4: { width: 210 * mm, height: 297 * mm, margin: 16 * mm },
 Letter: { width: 215.9 * mm, height: 279.4 * mm, margin: 16 * mm },
} as const;

export function Paginated({ paper, direction, deps, onPages, children }: { paper: 'A4' | 'Letter'; direction: 'ltr' | 'rtl'; deps: unknown[]; onPages?: (pages: number) => void; children: ReactNode }) {
 const rootRef = useRef<HTMLDivElement>(null);
 const [pages, setPages] = useState(1);
 const [scale, setScale] = useState(0);
 const g = paperGeometry[paper];
 const innerWidth = g.width - 2 * g.margin, innerHeight = g.height - 2 * g.margin, stride = g.width;
 useLayoutEffect(() => {
  const root = rootRef.current;
  if (!root) return;
  const measure = () => {
   const width = root.clientWidth;
   if (width) setScale(width / g.width);
   const flow = root.querySelector<HTMLElement>('.lab-page .pt-paper');
   if (!flow) return;
   setPages(Math.max(1, Math.ceil((flow.scrollWidth + 1) / stride)));
  };
  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(root);
  const flow = root.querySelector<HTMLElement>('.lab-page .pt-paper');
  if (flow) observer.observe(flow);
  let cancelled = false;
  const refresh = () => { if (!cancelled) measure(); };
  document.fonts?.addEventListener('loadingdone', refresh);
  void document.fonts?.ready.then(refresh);
  return () => { cancelled = true; observer.disconnect(); document.fonts?.removeEventListener('loadingdone', refresh); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [paper, stride, ...deps]);
 useLayoutEffect(() => { onPages?.(pages); }, [pages, onPages]);
 const variables = {
  '--page-w': `${g.width}px`, '--page-h': `${g.height}px`, '--page-margin': `${g.margin}px`,
  '--inner-w': `${innerWidth}px`, '--inner-h': `${innerHeight}px`, '--column-gap': `${2 * g.margin}px`, '--scale': scale || 0.0001,
 } as CSSProperties;
 return <div ref={rootRef} className={`lab-pages lab-paper-${paper}${scale ? ' is-measured' : ''}`} data-page-count={pages} style={variables}>
  {Array.from({ length: pages }, (_, index) => <div className="lab-page-frame" key={index} role="group" aria-label={`Page ${index + 1} of ${pages}`}>
   <div className="lab-page">
    <div className="lab-page-content" aria-hidden={index > 0 || undefined}>
     <div className="lab-flow" style={{ transform: `translateX(${direction === 'rtl' ? index * stride : -index * stride}px)` }}>{children}</div>
    </div>
   </div>
   <span className="lab-page-number" aria-hidden="true">{index + 1} / {pages}</span>
  </div>)}
 </div>;
}
