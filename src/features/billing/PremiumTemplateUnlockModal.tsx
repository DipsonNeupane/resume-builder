import { Lock } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { templates, type PremiumTemplateId } from '../../model';
import type { TemplateAccess } from '../../hooks/useTemplateAccess';
import { launchFacts } from '../../content/launchFacts';

type Props = {
 templateId: PremiumTemplateId;
 ownerId: string | null;
 access: TemplateAccess | null;
 onClose: () => void;
 onSignIn: () => void;
 onViewPro: () => void;
};

export function PremiumTemplateUnlockModal({ templateId, ownerId, access, onClose, onViewPro }: Props) {
 const template = templates.find(item => item.id === templateId)!;

 return <Modal className="premium-unlock-modal" labelledBy="premium-unlock-title" describedBy="premium-unlock-description" onClose={onClose}>
  <span className="price-tag"><Lock size={13} aria-hidden="true" /> PREMIUM</span>
  <h2 id="premium-unlock-title">Use {template.label} with Pro</h2>
  <p id="premium-unlock-description">Preview {template.label} first. Pro includes all 27 templates, full job matches, and job-specific resumes.</p>
  <dl className="premium-choice-summary" aria-label="Access choices"><div><dt>Free</dt><dd>7 templates</dd></div><div><dt>Pro</dt><dd>All 27 templates and advanced job tools</dd></div></dl>
  {access?.isPro ? <p>This template is already included with Pro.</p> : <button className="button" onClick={()=>{onClose();onViewPro();}}>{ownerId ? 'Review Pro' : 'View Pro and sign in'}</button>}
  <p className="field-hint">{launchFacts.proTrialDays} days free, then {launchFacts.proMonthlyPrice}/month. Cancel before trial ends. US only · <a href="/terms.html">Terms and refunds</a></p>
  <a href="/pricing/">Compare Free and Pro</a>
  <button className="text-button" onClick={onClose}>Keep previewing — no purchase</button>
 </Modal>;
}
