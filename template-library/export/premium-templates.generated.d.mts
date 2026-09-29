import type { JSX } from 'react';
import type { Resume } from '../../src/model';
import type { PremiumId } from '../registry';

export function PremiumResume(props: { id: PremiumId; resume: Resume }): JSX.Element;
