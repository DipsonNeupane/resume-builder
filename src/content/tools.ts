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
    eyebrow: '',
    title: 'Job requirement extractor',
    seoTitle: 'Free job requirement extractor | APWICO',
    description: 'Find what the employer requires, what they prefer, and anything that needs a closer look.',
    deck: 'Turn a job description into a requirements list with source text you can check.',
    inputTitle: 'Paste the job description',
    inputNote: 'Include the responsibilities and qualifications sections when possible. Maximum 20,000 characters.',
    submitLabel: 'Extract requirements',
    resultTitle: 'Requirements found in the posting',
    cta: { label: 'Compare these requirements with your resume', href: '/tools/resume-job-match/', destination: 'resume_job_match', note: 'Compare your resume for free, or save the job to review it later.' },
    content: [
      { title: 'What the extractor does', html: '<p>It separates required, preferred, and other details. Each item includes the employer’s source wording so you can check it.</p>' },
      { title: 'What it does not do', html: '<p>It does not decide whether you should apply or predict hiring outcomes. Ambiguous wording stays under “Other details.”</p>' },
      { title: 'How to use the result', html: '<p>Review required items first, then decide what your resume clearly demonstrates, what is worth reviewing and what remains not demonstrated. Preferred items can matter, but they should not automatically be treated as application blockers.</p>' },
      { title: 'Limits', html: '<p>Extraction can miss or misclassify unclear wording, and a posting may omit criteria used later. Check every result against the source.</p>' },
    ],
  },
  {
    id: 'resume-job-match',
    path: '/tools/resume-job-match/',
    eyebrow: '',
    title: 'Compare your resume with a job',
    seoTitle: 'Compare your resume to a job description free | APWICO',
    description: 'Compare job requirements with evidence from your resume.',
    deck: 'Compare each job requirement with evidence from your resume.',
    inputTitle: 'Paste your resume and job description',
    inputNote: 'Paste plain text to review up to 12 requirements. Sign in for a saved, more detailed Match.',
    submitLabel: 'Compare my resume',
    resultTitle: 'How your resume compares',
    cta: { label: 'Continue with full APWICO Match', href: '/start/job', destination: 'full_match', note: 'Keep the job context while you import or build your master resume, then review the fuller account-based Match workflow.' },
    content: [
      { title: 'What this comparison does', html: '<p>It compares up to 12 job requirements with supporting wording in your resume and shows both sources together.</p>' },
      { title: 'How to read the labels', html: '<ul><li><strong>Shown in your resume:</strong> the resume contains direct, substantial wording related to the requirement.</li><li><strong>Possibly relevant—check this:</strong> related wording exists, but the evidence may be incomplete or indirect.</li><li><strong>Not found in your resume:</strong> this limited check did not find support. That is an unknown—not proof you lack the qualification.</li></ul>' },
      { title: 'What it does not do', html: '<p>This is not an ATS score, candidate score, hiring probability or interview forecast. It does not infer experience that is absent from the text, and it does not label silence as a confirmed incompatibility.</p>' },
      { title: 'Why the free check is limited', html: '<p>The free check may miss equivalent skills or context. Saved Match keeps your resume, job, and clarifications together for a more detailed review.</p>' },
    ],
  },
  {
    id: 'resume-bullet-checker',
    path: '/tools/resume-bullet-checker/',
    eyebrow: '',
    title: 'Resume bullet quality checker',
    seoTitle: 'Free resume bullet point checker | APWICO',
    description: 'Check one resume bullet for action, specificity, context, evidence, readability, and filler.',
    deck: 'Check one resume bullet for clarity, context, and evidence—without adding new facts.',
    inputTitle: 'Paste one resume bullet',
    inputNote: 'Use the bullet as it appears now. Maximum 600 characters.',
    submitLabel: 'Review this bullet',
    resultTitle: 'Bullet quality review',
    cta: { label: 'Build or edit my resume', href: '/start/build', destination: 'builder', note: 'Edit the bullet in your resume and keep every claim accurate.' },
    content: [
      { title: 'What the checker reviews', html: '<p>The checker reviews action, specificity, context, results, readability, and filler. It explains each item instead of giving one score.</p>' },
      { title: 'What a strong bullet needs', html: '<p>A useful bullet usually tells a reader what you did, what the work involved and why it mattered. Not every line needs a number. A verifiable qualitative result is better than manufactured precision.</p>' },
      { title: 'What it will never invent', html: '<p>The checker does not add percentages, responsibilities, tools, team sizes or outcomes. When the source lacks evidence, it asks what you can truthfully add. Any “stronger structure” uses only wording already present in your bullet.</p>' },
      { title: 'Limits', html: '<p>A single bullet cannot show the context of the whole resume or the needs of a particular job. Review repeated wording, tense and balance across the full document before deciding a bullet is finished.</p>' },
    ],
  },
];

export const publicToolById = new Map(publicTools.map(tool => [tool.id, tool]));
