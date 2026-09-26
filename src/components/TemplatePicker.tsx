import { Check, LayoutTemplate, X } from 'lucide-react';
import { useState } from 'react';
import { templates, type Resume, type TemplateId } from '../model';
import { Modal } from './Modal';
import { ResumePreview } from './ResumePreview';

export function TemplatePicker({ resume, onSelect }: { resume: Resume; onSelect: (template: TemplateId) => void }) {
 const [open, setOpen] = useState(false);
 const current = templates.find(template => template.id === resume.template)!;
 return <>
  <button className="preview-template-trigger" type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
   <LayoutTemplate size={15} aria-hidden="true" />Templates <strong>{current.label}</strong>
  </button>
  {open && <Modal className="template-picker" labelledBy="template-picker-title" describedBy="template-picker-description" onClose={() => setOpen(false)}>
   <header className="template-picker-heading">
    <div><p className="section-label">Seven templates · Free</p><h2 id="template-picker-title">Choose your layout</h2><p id="template-picker-description">Every preview uses your current resume. Choosing a layout changes presentation only—your words and details stay unchanged.</p></div>
    <button className="icon-button" type="button" aria-label="Close templates" onClick={() => setOpen(false)}><X size={20} aria-hidden="true" /></button>
   </header>
   <ul className="template-picker-grid" aria-label="Resume templates">
    {templates.map(template => {
     const selected = resume.template === template.id;
     return <li key={template.id}>
      <button className="template-picker-option" type="button" aria-pressed={selected} onClick={() => { if (!selected) onSelect(template.id); setOpen(false); }}>
       <span className="template-option-preview" aria-hidden="true"><ResumePreview resume={{ ...resume, template: template.id }} /></span>
       <span className="template-option-copy"><span><strong>{template.label}</strong>{selected && <span className="template-current"><Check size={13} aria-hidden="true" />Current</span>}</span><small>{template.tagline}</small></span>
      </button>
     </li>;
    })}
   </ul>
  </Modal>}
 </>;
}
