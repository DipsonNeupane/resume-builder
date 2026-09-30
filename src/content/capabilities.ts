export type Capability = {
  slug: 'resume-builder' | 'job-match' | 'job-specific-resumes' | 'resume-exports';
  title: string;
  seoTitle: string;
  description: string;
  eyebrow: string;
  promise: string;
  facts: Array<{ title: string; body: string }>;
  boundaries: string[];
  action: { href: string; label: string; note: string };
};

export const capabilitiesPath = '/features/';

export const capabilities: Capability[] = [
  {
    slug: 'resume-builder',
    title: 'Master resume builder',
    seoTitle: 'Master resume builder with safe job-specific versions | ResumeStride',
    description: 'Build or import a master resume, keep it intact, and use separate job-specific versions when a role deserves tailoring.',
    eyebrow: 'One reliable source',
    promise: 'Keep the fullest truthful record of your experience in one master resume. Tailoring starts from a separate copy instead of rewriting that source.',
    facts: [
      { title: 'Import or start fresh', body: 'Start with a Word document, a text-based PDF or a blank resume. Imports are parsed locally in the browser and must be reviewed before the resume becomes usable.' },
      { title: 'Flexible experience', body: 'Sections can describe employment, education, projects, volunteering, certifications, research and other relevant experience across occupations and countries.' },
      { title: 'Separate versions', body: 'A job-specific resume is a separate version linked to one saved job. Editing it does not silently change the master resume.' },
    ],
    boundaries: [
      'Imported PDF structure is best-effort; scanned, encrypted or unreadable PDFs are rejected instead of guessed.',
      'Browser drafts are local unless the product explicitly shows that cloud saving is enabled.',
      'ResumeStride does not invent experience, credentials, tools or results.',
    ],
    action: { href: '/start/build', label: 'Build or import my resume', note: 'No card is required to start. Review imported content before using it.' },
  },
  {
    slug: 'job-match',
    title: 'Requirement-level Match',
    seoTitle: 'Job Match based on requirement-level resume evidence | ResumeStride',
    description: 'Compare each job requirement with resume evidence, preserve the employer’s source wording, and make your own decision about the role.',
    eyebrow: 'Evidence before effort',
    promise: 'Read the role as a set of requirements, then review what your resume demonstrates beside the employer’s own wording.',
    facts: [
      { title: 'Source wording stays visible', body: 'Match keeps each extracted requirement connected to the wording in the job description so you can review the interpretation.' },
      { title: 'Evidence stays connected', body: 'Direct evidence, adjacent evidence worth reviewing and not-demonstrated items are shown at requirement level instead of collapsed into one score.' },
      { title: 'The decision stays yours', body: 'You decide whether a role is worth pursuing. Match does not issue an apply verdict, hiring prediction or dominant ATS percentage.' },
    ],
    boundaries: [
      '“Not demonstrated” means the reviewed resume did not show evidence; it does not mean you lack the qualification.',
      'Job descriptions can be incomplete or ambiguous, so extracted requirements require review.',
      'The public evidence check is intentionally limited; saved Match analyses provide the fuller workflow.',
    ],
    action: { href: '/tools/resume-job-match/', label: 'Try the private evidence check', note: 'The public check runs in the browser without signup and does not place pasted content in URLs or analytics.' },
  },
  {
    slug: 'job-specific-resumes',
    title: 'Job-specific resume versions',
    seoTitle: 'Tailor a separate resume version for a specific job | ResumeStride',
    description: 'Create a separate resume version for a saved job, review grounded suggestions, and keep the master resume unchanged.',
    eyebrow: 'Tailor without overwriting',
    promise: 'Focus a resume on one role while preserving the master as the stable source of truth.',
    facts: [
      { title: 'One version, one saved job', body: 'A job-specific resume is created explicitly from an eligible saved job and records which master revision it came from.' },
      { title: 'Review every suggestion', body: 'Grounded suggestions can be accepted or rejected individually. Rejected suggestions do not change the document.' },
      { title: 'Master changes stay non-destructive', body: 'When the master changes, ResumeStride offers a keep-or-reset choice instead of silently merging or overwriting the job-specific version.' },
    ],
    boundaries: [
      'Suggestions must be supported by the resume; they cannot add unprovided experience or outcomes.',
      'Starting and using a persistent job-specific resume requires the applicable account access shown in the product.',
      'ResumeStride does not submit the application or infer that you applied.',
    ],
    action: { href: '/start/job', label: 'Start with a job', note: 'Paste or review the role first, then bring in the master resume without losing the job context.' },
  },
  {
    slug: 'resume-exports',
    title: 'PDF and editable Word exports',
    seoTitle: 'Resume PDF and editable Word export policy | ResumeStride',
    description: 'Understand what ResumeStride PDF and Word exports preserve, the account boundary, and the documented download allowance.',
    eyebrow: 'Concrete format policy',
    promise: 'Choose the format for the work it needs to do: a PDF that preserves the selected design or an editable Word document that prioritizes content.',
    facts: [
      { title: 'PDF preserves the design', body: 'Server-generated PDF uses the selected ResumeStride template, content direction and A4 or Letter page size.' },
      { title: 'Word stays editable', body: 'The Word export is a clean editable document. It preserves content rather than promising visual parity with the PDF template.' },
      { title: 'The current document is exported', body: 'Export controls apply to the resume currently being edited—master or job-specific—without silently changing the other document.' },
    ],
    boundaries: [
      'Sign-in and explicit upload consent are required before resume content is sent for document generation.',
      'Free accounts share three successful PDF or Word downloads per fixed 30-day period from signup.',
      'Paid downloads are subject to the documented reasonable-human-use policy; access and recurring terms are shown before checkout.',
    ],
    action: { href: '/pricing/', label: 'Review export and access terms', note: 'Previewing a template is separate from purchase. Pricing shows renewal and cancellation terms beside paid actions.' },
  },
];

export const capabilityBySlug = new Map(capabilities.map(capability => [capability.slug, capability]));
