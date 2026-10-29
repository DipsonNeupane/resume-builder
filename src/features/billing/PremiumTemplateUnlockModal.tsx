import { Lock } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { templates, type PremiumTemplateId } from '../../model';
import type { TemplateAccess } from '../../hooks/useTemplateAccess';
import { commercialPolicy } from '../../content/commercial';

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
  <p id="premium-unlock-description">Preview {template.label} with your content before paying. Pro includes all 27 templates, full Match Analysis, advanced job search, and AI-assisted tailoring for US$14.99/month.</p>
  <dl className="premium-choice-summary" aria-label="Access choices"><div><dt>Free</dt><dd>Keep previewing or choose any of 7 Free designs.</dd></div><div><dt>Pro</dt><dd>Use all 27 templates plus Pro job-search and tailoring features.</dd></div></dl>
  {access?.isPro ? <p>This template is already included with Pro.</p> : <button className="button" onClick={()=>{onClose();onViewPro();}}>{ownerId ? 'Review Pro' : 'View Pro and sign in'}</button>}
  <p className="field-hint">New paid subscriptions are available only in the United States. {commercialPolicy.renewal} {commercialPolicy.cancellation}</p>
  <a href="/pricing/">Compare Free and Pro</a>
  <button className="text-button" onClick={onClose}>Keep previewing — no purchase</button>
 </Modal>;
}
