export type SearchHub = {
  path: '/occupations/' | '/regions/' | '/compare/';
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
    seoTitle: 'Occupation research for evidence-first resumes | APWICO',
    description: 'Use occupation research to understand work and identify evidence—not to copy generic duties or assume one country’s requirements apply worldwide.',
    eyebrow: 'Occupation research, carefully bounded',
    deck: 'A job title is a starting point. The actual posting, local requirements and your real evidence still control the application.',
    sections: [
      { id: 'method', title: 'Use occupation data as a question set', html: `<p>Occupation sources can show common tasks, knowledge and work context. Use them to ask what you have actually done and what the vacancy means. Do not paste generic duties into a resume, treat a statistical profile as one employer’s requirements, or turn an occupation label into proof of qualification.</p>` },
      { id: 'worldwide', title: 'Start worldwide; verify locally', html: `<p>The International Labour Organization’s <a href="https://isco.ilo.org/">ISCO-08</a> organizes jobs by their tasks and duties for international reporting. National systems add local detail. APWICO can use that shared frame to avoid a technology-only view, but any licence, education, wage or outlook fact must remain attached to its jurisdiction and source date.</p>` },
      { id: 'research-set', title: 'The first research set is broad—not a private-demand ranking', html: `<p>Production query, saved-job category and Search Console occupation data are unavailable. The initial portfolio therefore uses current official external evidence and deliberately samples nine evidence shapes: technical, healthcare, operations, education, service, skilled trades, research, creative and leadership. It does not claim to rank APWICO user demand.</p><ul><li><a href="/occupations/software-developer/">Software developer</a></li><li><a href="/occupations/registered-nurse/">Registered nurse</a></li><li><a href="/occupations/project-management-specialist/">Project management specialist</a></li><li><a href="/occupations/primary-school-teacher/">Primary school teacher</a></li><li><a href="/occupations/customer-service-representative/">Customer service representative</a></li><li><a href="/occupations/electrician/">Electrician</a></li><li><a href="/occupations/social-science-research-assistant/">Social science research assistant</a></li><li><a href="/occupations/graphic-designer/">Graphic designer</a></li><li><a href="/occupations/general-operations-manager/">General and operations manager</a></li></ul>` },
      { id: 'evidence', title: 'What a useful occupation page must add', html: `<ul class="checklist"><li>A dated, jurisdiction-labelled source record</li><li>Central tasks translated into questions, not copied resume claims</li><li>Examples of direct, adjacent and not-demonstrated evidence</li><li>Regulated or employer-specific requirements kept distinct</li><li>A route into the real job-description evidence check</li><li>Named editorial evidence review and next-review date</li></ul>` },
      { id: 'publication', title: 'Why this portfolio stays small', html: `<aside class="callout warning"><strong>Reviewed depth before scale</strong><p>Nine initial pages are published because each has a current official source, occupation-specific examples and an explicit jurisdiction boundary. More titles stay withheld until evidence and review support useful pages; this is not a program for hundreds of generated title variants.</p></aside>` },
    ],
    cta: { label: 'Check the job in front of me', href: '/tools/job-requirement-extractor/', note: 'A live posting is stronger evidence than a generic occupation profile.' },
  },
  {
    path: '/regions/',
    title: 'Initial sourced resume and CV regional guidance',
    seoTitle: 'Resume and CV regional guidance | APWICO',
    description: 'Compare carefully sourced resume and CV terminology, personal-information guidance and format boundaries without guessing conventions from an IP address.',
    eyebrow: 'Verify the destination, not the visitor’s IP',
    deck: 'A country is not one hiring market. Start with the vacancy, employer and regulator, then use official public guidance as a bounded cross-check.',
    sections: [
      { id: 'method', title: 'Use a source hierarchy', html: `<ol><li>The vacancy and application portal</li><li>The employer’s official instructions</li><li>The relevant regulator for licensed work</li><li>A current public employment or careers service</li><li>General advice only when stronger sources are silent</li></ol>` },
      { id: 'coverage', title: 'What the initial guide covers—and does not', html: `<p>The reviewed set covers named public guidance from Canada, England, New Zealand, Australia and Europass. It records what each source actually says and lists unresolved fields instead of converting them into worldwide rules.</p><p><strong>Not yet covered:</strong> dedicated guidance for the United States, Latin America, Africa, Asia or the Middle East. Those regions require their own current official sources and local review before expansion.</p>` },
      { id: 'formats', title: 'Format and identity boundaries', html: `<ul class="checklist"><li>A4 and Letter are both supported; the employer or portal controls the choice.</li><li>Dates, addresses and phone numbers are not silently rewritten.</li><li>Document direction follows language and content, not location detection.</li><li>Credential names remain attached to their awarding body and jurisdiction.</li><li>Sensitive personal data is excluded unless legitimately required.</li></ul>` },
      { id: 'details', title: 'Read the sourced regional matrix', html: `<p>The detailed matrix below shows terminology, photo/personal-information guidance, privacy boundaries and explicit unknowns with direct links and checked dates.</p>` },
      { id: 'limits', title: 'What this page does not decide', html: `<p>It does not provide immigration, employment or privacy law advice; declare universal photo, page-size or address rules; or infer a user’s destination from their network location. Local human review remains appropriate for high-stakes applications.</p>` },
    ],
    cta: { label: 'Compare the job’s actual requirements', href: '/tools/resume-job-match/', note: 'Local convention never replaces the vacancy’s source wording.' },
  },
  {
    path: '/compare/',
    title: 'How to compare resume and job-search tools',
    seoTitle: 'Compare resume and job-search tools factually | APWICO',
    description: 'Compare resume and job-search tools using dated product facts: free output, billing, privacy, evidence method, version safety and user control.',
    eyebrow: 'Comparison without scorecards or sales tricks',
    deck: 'The useful question is not “which logo wins?” It is whether a tool fits the work, privacy and payment boundary you need.',
    sections: [
      { id: 'checklist', title: 'Compare the decision-relevant facts', html: `<div class="evidence-grid"><div><strong>Output</strong><span>What can you create, download and keep?</span></div><div><strong>Payment</strong><span>What is free, one-time or recurring?</span></div><div><strong>Evidence</strong><span>Can you inspect why the tool made a suggestion?</span></div><div><strong>Control</strong><span>Who decides and what happens to the original?</span></div><div><strong>Privacy</strong><span>Where is career content processed and retained?</span></div><div><strong>Scope</strong><span>Which languages, regions and occupations are actually supported?</span></div></div>` },
      { id: 'verify', title: 'Verify every competitor fact at its source', html: `<p>Pricing, free-plan limits and features change. A responsible comparison records the official URL, displayed locale and currency, the date checked and a next-review date. Pricing facts expire after 30 days; other product facts after 90 days. Generation and the recurring quality gate fail after the deadline so stale claims cannot enter a later build unnoticed.</p>` },
      { id: 'resume-stride', title: 'APWICO’s current comparison facts', html: `<p>APWICO’s <a href="/pricing/">pricing page</a> lists Free, one Premium design and Pro together with current renewal and cancellation terms. Its <a href="/trust/">trust page</a> records the evidence, master-resume, export, privacy and customer-proof boundaries. Preview remains separate from purchase.</p>` },
      { id: 'unknowns', title: 'Leave unknowns unknown', html: `<p>A public marketing page cannot prove a competitor’s private data flow, model behavior, customer outcome or unpublished roadmap. If the official source is silent or contradictory, the comparison must say “not established” and link the reader to the vendor—not infer an answer from interface screenshots or third-party reviews.</p>` },
      { id: 'publication', title: 'Named comparisons that passed the evidence gate', html: `<ul class="checklist"><li><a href="/compare/teal/">Teal</a></li><li><a href="/compare/huntr/">Huntr</a></li><li><a href="/compare/jobscan/">Jobscan</a></li><li><a href="/compare/resume-io/">Resume.io</a></li><li><a href="/compare/enhancv/">Enhancv</a></li></ul><p>Every page records official sources, locale/currency where established, 30-day pricing freshness when a pricing claim is made, 90-day feature freshness, relevant strengths and unresolved facts. Jobscan pricing remains explicitly not established. No page declares a winner, and APWICO facts use the same dated standard.</p>` },
    ],
    cta: { label: 'Review APWICO’s verified boundaries', href: '/trust/', note: 'Start with product facts that can be checked today.' },
  },
];

export const searchHubByPath = new Map(searchHubs.map(hub => [hub.path, hub]));
