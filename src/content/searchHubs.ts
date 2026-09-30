export type SearchHub = {
  path: '/occupations/' | '/compare/';
  title: string;
  seoTitle: string;
  description: string;
  eyebrow: string;
  deck: string;
  sections: Array<{ id: string; title: string; html: string }>;
  cta: { label: string; href: string; note: string };
};

export const searchHubs: SearchHub[] = [
  {
    path: '/occupations/',
    title: 'Occupation research for evidence-first resumes',
    seoTitle: 'Occupation research for evidence-first resumes | ResumeStride',
    description: 'Use occupation research to understand work and identify evidence—not to copy generic duties or assume one country’s requirements apply worldwide.',
    eyebrow: 'Occupation research, carefully bounded',
    deck: 'A job title is a starting point. The actual posting, local requirements and your real evidence still control the application.',
    sections: [
      { id: 'method', title: 'Use occupation data as a question set', html: `<p>Occupation sources can show common tasks, knowledge and work context. Use them to ask what you have actually done and what the vacancy means. Do not paste generic duties into a resume, treat a statistical profile as one employer’s requirements, or turn an occupation label into proof of qualification.</p>` },
      { id: 'worldwide', title: 'Start worldwide; verify locally', html: `<p>The International Labour Organization’s <a href="https://isco.ilo.org/">ISCO-08</a> organizes jobs by their tasks and duties for international reporting. National systems add local detail. ResumeStride can use that shared frame to avoid a technology-only view, but any licence, education, wage or outlook fact must remain attached to its jurisdiction and source date.</p>` },
      { id: 'research-set', title: 'The first research set is intentionally broad—not demand-ranked', html: `<p>Without production search or Search Console data, ResumeStride cannot claim these are its most requested occupations. The initial research queue samples different evidence shapes and work settings:</p><ul><li>General and operations managers</li><li>Registered nurses</li><li>Home health and personal care aides</li><li>Software developers</li><li>Data scientists</li><li>Information security analysts</li><li>Retail salespersons</li><li>Solar photovoltaic installers</li><li>Accountants and auditors</li></ul><p>US titles and task research begin with the current <a href="https://www.onetcenter.org/db_releases.html">O*NET database</a> and <a href="https://www.bls.gov/ooh/">BLS Occupational Outlook Handbook</a>. They do not establish worldwide demand.</p>` },
      { id: 'evidence', title: 'What a useful occupation page must add', html: `<ul class="checklist"><li>A dated, jurisdiction-labelled source record</li><li>Central tasks translated into questions, not copied resume claims</li><li>Examples of direct, adjacent and not-demonstrated evidence</li><li>Regulated or employer-specific requirements kept distinct</li><li>A route into the real job-description evidence check</li><li>Named reviewer and review date before indexing</li></ul>` },
      { id: 'publication', title: 'Why individual occupation pages are not published yet', html: `<aside class="callout warning"><strong>Quality gate, not an empty directory</strong><p>The public occupation hub is useful now, but individual occupation pages remain withheld until a qualified review, current local sources and actual audience demand support them. This prevents hundreds of thin pages from pretending to know every occupation or country.</p></aside>` },
    ],
    cta: { label: 'Check the job in front of me', href: '/tools/job-requirement-extractor/', note: 'A live posting is stronger evidence than a generic occupation profile.' },
  },
  {
    path: '/compare/',
    title: 'How to compare resume and job-search tools',
    seoTitle: 'Compare resume and job-search tools factually | ResumeStride',
    description: 'Compare resume and job-search tools using dated product facts: free output, billing, privacy, evidence method, version safety and user control.',
    eyebrow: 'Comparison without scorecards or sales tricks',
    deck: 'The useful question is not “which logo wins?” It is whether a tool fits the work, privacy and payment boundary you need.',
    sections: [
      { id: 'checklist', title: 'Compare the decision-relevant facts', html: `<div class="evidence-grid"><div><strong>Output</strong><span>What can you create, download and keep?</span></div><div><strong>Payment</strong><span>What is free, one-time or recurring?</span></div><div><strong>Evidence</strong><span>Can you inspect why the tool made a suggestion?</span></div><div><strong>Control</strong><span>Who decides and what happens to the original?</span></div><div><strong>Privacy</strong><span>Where is career content processed and retained?</span></div><div><strong>Scope</strong><span>Which languages, regions and occupations are actually supported?</span></div></div>` },
      { id: 'verify', title: 'Verify every competitor fact at its source', html: `<p>Pricing, free-plan limits and features change. A responsible comparison records the official URL, displayed locale and currency, the date checked and a next-review date. Pricing facts expire after 30 days; other product facts after 90 days. Stale facts are removed from publication instead of being silently repeated.</p>` },
      { id: 'resume-stride', title: 'ResumeStride’s current comparison facts', html: `<p>ResumeStride’s <a href="/pricing/">pricing page</a> lists Free, one Premium design and Pro together with current renewal and cancellation terms. Its <a href="/trust/">trust page</a> records the evidence, master-resume, export, privacy and customer-proof boundaries. Preview remains separate from purchase.</p>` },
      { id: 'unknowns', title: 'Leave unknowns unknown', html: `<p>A public marketing page cannot prove a competitor’s private data flow, model behavior, customer outcome or unpublished roadmap. If the official source is silent or contradictory, the comparison must say “not established” and link the reader to the vendor—not infer an answer from interface screenshots or third-party reviews.</p>` },
      { id: 'publication', title: 'Publication gate for named comparisons', html: `<ul class="checklist"><li>At least one current primary source for every material claim</li><li>Prices include currency, cadence and locale</li><li>Free, trial and paid access are not conflated</li><li>ResumeStride facts pass the same standard</li><li>No “best,” winner or outcome claim without an explicit method</li><li>Reviewer and next review date are visible</li></ul><p>No named competitor comparison is currently published because the evidence ledger is not complete enough for that standard.</p>` },
    ],
    cta: { label: 'Review ResumeStride’s verified boundaries', href: '/trust/', note: 'Start with product facts that can be checked today.' },
  },
];

export const searchHubByPath = new Map(searchHubs.map(hub => [hub.path, hub]));

