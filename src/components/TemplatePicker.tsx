import { Check, LayoutTemplate, Lock, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { isPremiumTemplate, templates, type PremiumTemplateId, type Resume, type TemplateId } from '../model';
import type { TemplateAccessState } from '../hooks/useTemplateAccess';
import { Modal } from './Modal';
import { ResumePreview } from './ResumePreview';
import { trackProductEvent } from '../services/analytics';

type Props = {
 resume: Resume;
 accessState: TemplateAccessState;
 onSelect: (template: TemplateId) => void;
 onUnlock: (template: PremiumTemplateId) => void;
 onViewPro: () => void;
};

function isNew(releasedAt: string | null): boolean {
 if (!releasedAt) return false;
 const age = (Date.now() - Date.parse(releasedAt)) / 86_400_000;
 return Number.isFinite(age) && age >= 0 && age <= 45;
}

export function TemplatePicker({ resume, accessState, onSelect, onUnlock, onViewPro }: Props) {
 const [open, setOpen] = useState(false);
 const current = templates.find(template => template.id === resume.template)!;
 const access = accessState.access;
 const entitled = useMemo(() => new Set(access?.activeTemplates ?? []), [access]);

 function choose(template: TemplateId) {
  const locked = isPremiumTemplate(template) && accessState.status === 'ready' && !access?.isPro && !entitled.has(template);
  if (template !== resume.template) { trackProductEvent('template_selected', { surface: 'builder', template }); onSelect(template); }
  if (locked) trackProductEvent('upgrade_prompt_viewed', { surface: 'builder', user_state: 'authenticated' });
  setOpen(false);
 }

 return <>
  <button className="preview-template-trigger" type="button" aria-haspopup="dialog" onClick={()=>setOpen(true)}><LayoutTemplate size={15} aria-hidden="true" />Templates <strong>{current.label}</strong></button>
  {open && <Modal className="template-picker" labelledBy="template-picker-title" describedBy="template-picker-description" onClose={()=>setOpen(false)}>
   <header className="template-picker-heading"><div><p className="section-label">7 Free · 20 Premium · Preview any design before unlocking</p><h2 id="template-picker-title">Choose your layout</h2><p id="template-picker-description">Every full preview uses your current resume. Locked Premium designs are preview-only: selecting one does not grant download or use entitlement. PDF preserves an unlocked design; DOCX is a clean, editable content document.</p></div><button className="icon-button" type="button" aria-label="Close templates" onClick={()=>setOpen(false)}><X size={20} aria-hidden="true" /></button></header>
   {accessState.status === 'unavailable' && <p className="notice" role="status">We couldn’t check your template access. You can still preview every design; refresh before subscribing or downloading.</p>}
   <ul className="template-picker-grid" aria-label="Resume templates">{templates.map(template => {
    const selected = resume.template === template.id;
    const premium = isPremiumTemplate(template.id);
    const active = premium && entitled.has(template.id);
    const locked = premium && accessState.status === 'ready' && !access?.isPro && !active;
    const subscription = premium ? access?.subscriptions.find(item => item.kind === 'template' && item.templateId === template.id && item.currentPeriodEnd) : undefined;
    const accessLabel = !premium ? 'Free / Included' : access?.isPro ? 'Included with Pro' : active ? 'Premium · Active' : accessState.status === 'ready' ? 'Premium · $1.99/month' : 'Premium · Checking access';
    const throughDate = subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
    const through = throughDate && Number.isFinite(throughDate.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(throughDate) : null;
    return <li key={template.id} className="template-picker-card">
     <button className="template-picker-option" type="button" aria-pressed={selected} onClick={()=>choose(template.id)}>
      <span className="template-option-preview" aria-hidden="true" inert><ResumePreview resume={{ ...resume, template: template.id }} /></span>
      <span className="template-option-copy"><span><strong>{template.label}</strong>{selected && <span className="template-current"><Check size={13} aria-hidden="true" />Previewing</span>}</span><span className="template-access-label">{locked && <Lock size={12} aria-hidden="true" />}{accessLabel}</span>{isNew(template.releasedAt) && <span className="template-discovery-label">NEW</span>}<small>{template.tagline}{locked ? ' · Full preview available' : ''}{active && through ? ` · Access through ${through}` : ''}</small></span>
     </button>
     {locked && <div className="template-option-actions"><button className="button" type="button" onClick={()=>{setOpen(false);onUnlock(template.id as PremiumTemplateId);}}>Unlock for $1.99/month</button><button className="text-button" type="button" onClick={()=>{setOpen(false);onViewPro();}}>Get Pro — all Premium templates</button></div>}
    </li>;
   })}</ul>
  </Modal>}
 </>;
}
