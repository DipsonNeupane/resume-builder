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
    eyebrow: '',
    deck: 'A job title is a starting point. The actual posting, local requirements and your real evidence still control the application.',
    sections: [
      { id: 'method', title: 'Use occupation data as a question set', html: `<p>Occupation sources show common tasks and work context. Use them to identify evidence from your experience, then verify everything against the actual job. Do not copy generic duties into your resume.</p>` },
      { id: 'worldwide', title: 'Check local requirements', html: `<p>The International Labour Organization’s <a href="https://isco.ilo.org/">ISCO-08</a> organizes jobs by their tasks and duties for international reporting. National systems add local detail. Any licence, education, wage, or outlook fact remains attached to its jurisdiction and source date.</p>` },
      { id: 'evidence', title: 'What each guide includes', html: `<ul class="checklist"><li>A dated, jurisdiction-labelled source record</li><li>Central tasks translated into questions, not copied resume claims</li><li>Examples of direct, adjacent and not-demonstrated evidence</li><li>Regulated or employer-specific requirements kept distinct</li><li>A route into the real job-description evidence check</li></ul>` },
    ],
    cta: { label: 'Check the job in front of me', href: '/tools/job-requirement-extractor/', note: 'A live posting is stronger evidence than a generic occupation profile.' },
  },
  {
    path: '/regions/',
    title: 'Initial sourced resume and CV regional guidance',
    seoTitle: 'Resume and CV regional guidance | APWICO',
    description: 'Compare carefully sourced resume and CV terminology, personal-information guidance and format boundaries without guessing conventions from an IP address.',
    eyebrow: 'Check the rules for the job’s location',
    deck: 'Start with the job posting, employer, and relevant regulator. Use official regional guidance as a cross-check.',
    sections: [
      { id: 'method', title: 'Use a source hierarchy', html: `<ol><li>The vacancy and application portal</li><li>The employer’s official instructions</li><li>The relevant regulator for licensed work</li><li>A current public employment or careers service</li><li>General advice only when stronger sources are silent</li></ol>` },
      { id: 'coverage', title: 'Current coverage', html: `<p>The reviewed set covers named public guidance from Canada, England, New Zealand, Australia and Europass. It records what each source actually says and lists unresolved fields instead of converting them into worldwide rules.</p><p><strong>Not yet covered:</strong> dedicated guidance for the United States, Latin America, Africa, Asia or the Middle East. Those regions require their own current official sources and local review before expansion.</p>` },
      { id: 'formats', title: 'Format and identity boundaries', html: `<ul class="checklist"><li>A4 and Letter are both supported; the employer or portal controls the choice.</li><li>Dates, addresses and phone numbers are not silently rewritten.</li><li>Document direction follows language and content, not location detection.</li><li>Credential names remain attached to their awarding body and jurisdiction.</li><li>Sensitive personal data is excluded unless legitimately required.</li></ul>` },
      { id: 'details', title: 'Regional guidance', html: '' },
      { id: 'limits', title: 'What this page does not decide', html: `<p>It does not provide immigration, employment or privacy law advice; declare universal photo, page-size or address rules; or infer a user’s destination from their network location. Local human review remains appropriate for high-stakes applications.</p>` },
    ],
    cta: { label: 'Compare the job’s actual requirements', href: '/tools/resume-job-match/', note: 'Local convention never replaces the vacancy’s source wording.' },
  },
  {
    path: '/compare/',
    title: 'How to compare resume and job-search tools',
    seoTitle: 'Compare resume and job-search tools factually | APWICO',
    description: 'Compare resume and job-search tools using dated product facts: free output, billing, privacy, evidence method, version safety and user control.',
    eyebrow: '',
    deck: 'Compare what each tool does, what it costs, how it handles your data, and how much control you keep.',
    sections: [
      { id: 'checklist', title: 'What to compare', html: `<div class="evidence-grid"><div><strong>Output</strong><span>What can you create, download and keep?</span></div><div><strong>Payment</strong><span>What is free, one-time or recurring?</span></div><div><strong>Evidence</strong><span>Can you inspect why the tool made a suggestion?</span></div><div><strong>Control</strong><span>Who decides and what happens to the original?</span></div><div><strong>Privacy</strong><span>Where is career content processed and retained?</span></div><div><strong>Scope</strong><span>Which languages, regions and occupations are actually supported?</span></div></div>` },
      { id: 'verify', title: 'Verify every competitor fact at its source', html: `<p>Pricing, free-plan limits, and features change. Check the official source and displayed review date before deciding.</p>` },
      { id: 'resume-stride', title: 'APWICO’s current comparison facts', html: `<p>APWICO’s <a href="/pricing/">pricing page</a> lists Free, one Premium design and Pro together with current renewal and cancellation terms. Its <a href="/trust/">trust page</a> explains the evidence, master-resume, export, privacy, and payment boundaries. Preview remains separate from purchase.</p>` },
      { id: 'unknowns', title: 'When a fact cannot be verified', html: `<p>If an official source is silent or contradictory, the comparison says “not established” and links to the vendor.</p>` },
      { id: 'publication', title: 'Compare APWICO with other tools', html: `<ul class="checklist"><li><a href="/compare/teal/">Teal</a></li><li><a href="/compare/huntr/">Huntr</a></li><li><a href="/compare/jobscan/">Jobscan</a></li><li><a href="/compare/resume-io/">Resume.io</a></li><li><a href="/compare/enhancv/">Enhancv</a></li></ul>` },
    ],
    cta: { label: 'Review APWICO’s verified boundaries', href: '/trust/', note: 'Start with product facts that can be checked today.' },
  },
];

export const searchHubByPath = new Map(searchHubs.map(hub => [hub.path, hub]));
