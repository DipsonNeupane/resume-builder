import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

function focusableControls(dialog: HTMLDialogElement) {
 return Array.from(dialog.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,summary,[tabindex]'))
  .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[inert]') && node.getClientRects().length > 0 && getComputedStyle(node).visibility === 'visible');
}

/** Native modal isolation keeps the rest of the document out of the focus and
 * accessibility trees. Mount only while open so dismissal and navigation agree. */
export function Modal({ className, labelledBy, describedBy, fallbackFocus, onClose, children }: {
 className: string;
 labelledBy: string;
 describedBy?: string;
 fallbackFocus?: RefObject<HTMLElement | null>;
 onClose: () => void;
 children: ReactNode;
}) {
 const ref = useRef<HTMLDialogElement>(null);
 useEffect(() => {
  const dialog = ref.current!;
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overflow = document.body.style.overflow;
  dialog.showModal();
  // Native dialog autofocus differs across engines; choose the first available
  // control explicitly, including on React StrictMode's second effect setup.
  (focusableControls(dialog)[0] ?? dialog).focus({ preventScroll: true });
  document.body.style.overflow = 'hidden';
  return () => {
   dialog.close();
   document.body.style.overflow = overflow;
   const target = opener?.isConnected && opener !== document.body && !opener.matches(':disabled') && opener.getClientRects().length
    ? opener : fallbackFocus?.current;
   if (target?.isConnected) target.focus({ preventScroll: true });
  };
 }, [fallbackFocus]);
 return <dialog ref={ref} className={`modal-backdrop ${className}-backdrop`} aria-labelledby={labelledBy} aria-describedby={describedBy}
  onCancel={event => { event.preventDefault(); onClose(); }}
  onClick={event => { if (event.target === event.currentTarget) onClose(); }}
  onKeyDown={event => {
   if (event.key !== 'Tab') return;
   const controls = focusableControls(event.currentTarget);
   const first = controls[0], last = controls.at(-1);
   if (!first || !last) { event.preventDefault(); event.currentTarget.focus(); return; }
   if (first && last && ((!event.shiftKey && document.activeElement === last) || (event.shiftKey && document.activeElement === first))) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
   }
  }}>
  <section className={className}>{children}</section>
 </dialog>;
}
