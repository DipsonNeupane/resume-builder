export type PublicTool = {
  id: 'job-requirement-extractor' | 'resume-job-match' | 'resume-bullet-checker';
  path: `/tools/${string}/`;
  eyebrow: string;
  title: string;
  seoTitle: string;
  description: string;
  deck: string;
  inputTitle: string;
  inputNote: string;
  submitLabel: string;
  resultTitle: string;
  cta: { label: string; href: string; destination: string; note: string };
  content: Array<{ title: string; html: string }>;
};

export const toolsPath = '/tools/';

export const publicTools: PublicTool[] = [
  {
    id: 'job-requirement-extractor',
    path: '/tools/job-requirement-extractor/',
    eyebrow: 'Free job-description tool',
    title: 'Job requirement extractor',
    seoTitle: 'Free job requirement extractor | ResumeStride',
    description: 'Extract required, preferred and other signals from a job description with source text you can verify. Free, private and no signup required.',
    deck: 'Turn a long posting into a traceable requirements list—without inventing qualifications or assigning a fake score.',
    inputTitle: 'Paste the job description',
    inputNote: 'Include the responsibilities and qualifications sections when possible. Maximum 20,000 characters.',
    submitLabel: 'Extract requirements',
    resultTitle: 'Requirements found in the posting',
    cta: { label: 'Compare these requirements with your resume', href: '/tools/resume-job-match/', destination: 'resume_job_match', note: 'Use the free evidence check, or save a role in ResumeStride for the fuller Match workflow.' },
    content: [
      { title: 'What the extractor does', html: '<p>It separates language the employer marks as required from preferred qualifications and other useful signals, including responsibilities, tools, seniority, education and work-arrangement constraints. Every item includes its source wording so you can check the classification yourself.</p>' },
      { title: 'What it does not do', html: '<p>It does not decide whether you should apply, predict hiring outcomes or turn a posting into an ATS score. If the job description is ambiguous, the result stays in “other signals” instead of silently promoting it to a hard requirement.</p>' },
      { title: 'How to use the result', html: '<p>Review required items first, then decide what your resume clearly demonstrates, what has adjacent evidence and what remains unknown. Preferred items can matter, but they should not automatically be treated as application blockers.</p>' },
      { title: 'Limits worth knowing', html: '<p>Job postings are written inconsistently. Headings, punctuation and employer language affect extraction, and a posting may omit criteria used later in hiring. Treat this as a careful reading aid, not an authoritative interpretation of the employer’s process.</p>' },
    ],
  },
  {
    id: 'resume-job-match',
    path: '/tools/resume-job-match/',
    eyebrow: 'Free evidence comparison',
    title: 'Resume vs. job evidence check',
    seoTitle: 'Compare your resume to a job description free | ResumeStride',
    description: 'Compare resume evidence with job requirements—clearly demonstrated, worth reviewing or not demonstrated. No ATS score, signup or upload.',
    deck: 'See what your resume actually demonstrates beside the employer’s own words. No hiring prediction. No invented qualifications.',
    inputTitle: 'Add the two source documents',
    inputNote: 'Paste plain text. The free check reviews up to 12 extracted requirements and stays intentionally shallower than full ResumeStride Match.',
    submitLabel: 'Check the evidence',
    resultTitle: 'Requirement-to-evidence review',
    cta: { label: 'Continue with full ResumeStride Match', href: '/?jobs=1', destination: 'full_match', note: 'Save the role, keep your master resume and review the fuller account-based Match workflow.' },
    content: [
      { title: 'What this comparison does', html: '<p>It extracts a limited set of requirements from the posting and looks for supporting wording in the resume. Each result keeps the job source and, where found, a resume excerpt together so you can review the connection.</p>' },
      { title: 'How to read the labels', html: '<ul><li><strong>Clearly demonstrated:</strong> the resume contains direct, substantial wording related to the requirement.</li><li><strong>Worth reviewing:</strong> related wording exists, but the evidence may be incomplete or indirect.</li><li><strong>Not demonstrated:</strong> this limited check did not find support. That is an unknown—not proof you lack the qualification.</li></ul>' },
      { title: 'What it does not do', html: '<p>This is not an ATS score, candidate score, hiring probability or interview forecast. It does not infer experience that is absent from the text, and it does not label silence as a confirmed incompatibility.</p>' },
      { title: 'Why the free check is limited', html: '<p>Language overlap can surface useful review points, but it cannot understand every equivalent skill, career transition or contextual achievement. Full ResumeStride Match works with a saved resume and job, preserves clarifications and supports a deeper job-specific workflow.</p>' },
    ],
  },
  {
    id: 'resume-bullet-checker',
    path: '/tools/resume-bullet-checker/',
    eyebrow: 'Free resume writing tool',
    title: 'Resume bullet quality checker',
    seoTitle: 'Free resume bullet point checker | ResumeStride',
    description: 'Check one resume bullet for action, specificity, context, evidence, readability and filler—without an ATS score or invented metrics.',
    deck: 'Review one bullet at a time. Get transparent, actionable feedback that never adds facts you did not provide.',
    inputTitle: 'Paste one resume bullet',
    inputNote: 'Use the bullet as it appears now. Maximum 600 characters.',
    submitLabel: 'Review this bullet',
    resultTitle: 'Bullet quality review',
    cta: { label: 'Build or edit my resume', href: '/?builder=1', destination: 'builder', note: 'Apply the stronger structure in your master resume and keep every claim grounded in your experience.' },
    content: [
      { title: 'What the checker reviews', html: '<p>The review looks for a clear action, a specific subject, useful scope or context, an evidence-based result, readable length and vague filler. Each dimension is explained separately instead of being hidden inside one arbitrary score.</p>' },
      { title: 'What a strong bullet needs', html: '<p>A useful bullet usually tells a reader what you did, what the work involved and why it mattered. Not every line needs a number. A verifiable qualitative result is better than manufactured precision.</p>' },
      { title: 'What it will never invent', html: '<p>The checker does not add percentages, responsibilities, tools, team sizes or outcomes. When the source lacks evidence, it asks what you can truthfully add. Any “stronger structure” uses only wording already present in your bullet.</p>' },
      { title: 'Limits worth knowing', html: '<p>A single bullet cannot show the context of the whole resume or the needs of a particular job. Review repeated wording, tense and balance across the full document before deciding a bullet is finished.</p>' },
    ],
  },
];

export const publicToolById = new Map(publicTools.map(tool => [tool.id, tool]));
