/* @jsxRuntime automatic */
// Premium renderer registry. Adding a template: write <id>.tsx + <id>.css, add it here
// and to premium.css, and set its status in ../registry.ts. The lab and PDF path read both.
import type { Resume } from '../../src/model';
import { toDocument, type ResumeDoc } from '../document';
import type { PremiumId } from '../registry';
import { Almanac } from './almanac';
import { Atelier } from './atelier';
import { Bench } from './bench';
import { Cadence } from './cadence';
import { Charter } from './charter';
import { Crossover } from './crossover';
import { Kernel } from './kernel';
import { Mandate } from './mandate';
import { Plainsong } from './plainsong';
import { Primer } from './primer';
import { Pyramid } from './pyramid';
import { Quartile } from './quartile';
import { Roster } from './roster';
import { Rounds } from './rounds';
import { Waypoint } from './waypoint';

import { Boardroom } from './boardroom';
import { Casebook } from './casebook';
import { Meridian } from './meridian';
import { Scholar } from './scholar';
import { Stackline } from './stackline';

export const premiumRenderers: Partial<Record<PremiumId, (props: { doc: ResumeDoc }) => React.JSX.Element>> = {
 boardroom: Boardroom, mandate: Mandate, stackline: Stackline, kernel: Kernel, casebook: Casebook, atelier: Atelier,
 scholar: Scholar, bench: Bench, charter: Charter, plainsong: Plainsong, rounds: Rounds, meridian: Meridian,
 crossover: Crossover, almanac: Almanac, roster: Roster, primer: Primer, pyramid: Pyramid, quartile: Quartile,
 waypoint: Waypoint, cadence: Cadence,
};

export function PremiumResume({ id, resume }: { id: PremiumId; resume: Resume }) {
 const Renderer = premiumRenderers[id];
 if (!Renderer) throw new Error(`Premium template "${id}" has no renderer yet`);
 return <Renderer doc={toDocument(resume)} />;
}
