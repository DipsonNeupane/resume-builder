export type OccupationSource = {
  label: string;
  url: string;
  jurisdiction: string;
  checkedAt: `${number}-${number}-${number}`;
  version?: string;
};

export type OccupationPage = {
  slug: string;
  category: 'technical' | 'healthcare' | 'operations' | 'education' | 'service' | 'skilled-trades' | 'research' | 'creative' | 'leadership';
  title: string;
  description: string;
  selectionReason: string;
  workContext: string;
  structure: string[];
  flexibleSections: string[];
  skillsInContext: string[];
  requirementPatterns: string[];
  weakBullet: string;
  strongBullet: string;
  strongBulletWhy: string;
  evidenceExample: { requirement: string; direct: string; adjacent: string; unknown: string };
  template: { id: string; label: string; reason: string };
  regionalNote: string;
  sources: OccupationSource[];
};

const checkedAt = '2026-09-30' as const;
export const occupationNextReviewAt = '2026-12-29' as const;
const onet = (code: string, label: string): OccupationSource => ({ label, url: `https://www.onetonline.org/link/summary/${code}`, jurisdiction: 'United States', checkedAt, version: 'O*NET 31.0; occupation profile updated 2026' });

// Selection balances nine materially different evidence shapes. It uses current,
// official external occupation/demand sources because production query, saved-job
// category and Search Console occupation data are unavailable. It is therefore an
// initial editorial portfolio, not a ranking of APWICO user demand.
export const occupations: OccupationPage[] = [
  {
    slug: 'software-developer', category: 'technical', title: 'Software developer resume evidence guide',
    description: 'Translate a software developer job description into verifiable product, system, testing and collaboration evidence without turning technologies into an unsupported keyword list.',
    selectionReason: 'Represents technical work, while official US, England and Canadian sources make title and requirement differences visible.',
    workContext: 'Current O*NET material describes analysing user needs and designing, developing, testing and modifying software. That is a US occupation frame, not a checklist every developer vacancy uses.',
    structure: ['Lead with the product, system or user problem your evidence addresses.', 'Keep technologies beside the work where you used them.', 'Use selected projects when they carry stronger evidence than a job title.', 'Separate shipped work, testing, reliability and collaboration claims so each can be checked.'],
    flexibleSections: ['Selected products or projects', 'Technical methods and tools', 'Open-source or community work', 'Talks, publications or patents', 'Education and relevant credentials'],
    skillsInContext: ['Name a language or framework beside the feature, service or analysis it supported.', 'Describe testing through the behavior or risk it covered.', 'Connect collaboration to a concrete decision, handoff or shipped result.'],
    requirementPatterns: ['Design or develop software to user or business needs', 'Test, debug or maintain systems', 'Work across product, design, operations or customers', 'Use named technologies in a specific environment'],
    weakBullet: 'Responsible for developing applications using modern technologies.',
    strongBullet: 'Built and tested the account-recovery flow for a subscription service, pairing with support to remove two recurring failure paths before release.',
    strongBulletWhy: 'The example is fictional. It shows scope, action, collaboration and a bounded result without inventing a percentage.',
    evidenceExample: { requirement: 'Experience designing reliable customer-facing services', direct: 'A shipped service, your design responsibility and the reliability check are all documented.', adjacent: 'You improved reliability in an internal tool; the environment differs, but the method may deserve review.', unknown: 'The resume lists a language but no service, design responsibility or reliability evidence.' },
    template: { id: 'stackline', label: 'Stackline', reason: 'Its verified registry description puts projects and technical stack first. Preview it against the amount of project detail you actually have.' },
    regionalNote: '“Software developer” and “software engineer” are not globally interchangeable regulated titles. Follow the vacancy and local professional rules; the linked Canadian Job Bank page says this occupation is not regulated in Canada, which must not be generalized elsewhere.',
    sources: [onet('15-1252.00', 'O*NET — Software Developers'), { label: 'Canada Job Bank — Software Developer', url: 'https://www.jobbank.gc.ca/marketreport/summary-occupation/22548/ca', jurisdiction: 'Canada', checkedAt }, { label: 'National Careers Service (England) — Software Developer', url: 'https://nationalcareers.service.gov.uk/job-profiles/software-developer', jurisdiction: 'England', checkedAt }],
  },
  {
    slug: 'registered-nurse', category: 'healthcare', title: 'Registered nurse resume evidence guide',
    description: 'Organize registered-nurse evidence around clinical settings, patient care, coordination and verified credentials while keeping jurisdiction-specific registration rules explicit.',
    selectionReason: 'Represents regulated healthcare work and has current US and Australian evidence that makes jurisdiction-specific registration visible.',
    workContext: 'Official sources describe patient assessment, monitoring, care coordination, documentation and education. Scope and registration differ by jurisdiction, setting and employer.',
    structure: ['Put current, relevant registration or licence details in a clearly labelled credential section.', 'Name clinical settings and patient populations only when true.', 'Keep care, coordination, documentation and improvement evidence distinct.', 'Do not include patient-identifying information in any example.'],
    flexibleSections: ['Registration and licences', 'Clinical settings', 'Education and supervised placements', 'Quality improvement', 'Teaching or precepting', 'Languages used in care'],
    skillsInContext: ['Connect assessment skills to the setting and your actual responsibility.', 'Name clinical systems only where you used them.', 'Describe team coordination without overstating independent authority.'],
    requirementPatterns: ['Current registration or licence in the hiring jurisdiction', 'Assessment, monitoring and documented care', 'Communication with patients, families and multidisciplinary teams', 'Experience in a named clinical setting or population'],
    weakBullet: 'Provided excellent patient care and worked with the healthcare team.',
    strongBullet: 'Coordinated discharge teaching for adult medical patients, documenting follow-up needs and confirming the care plan with the multidisciplinary team.',
    strongBulletWhy: 'The fictional example identifies the setting, action and coordination boundary without claiming a clinical outcome that is not evidenced.',
    evidenceExample: { requirement: 'Current registration plus acute-care experience', direct: 'The credential, jurisdiction, dates and relevant acute-care setting are stated and current.', adjacent: 'Registration is current, but the documented setting is community care; assess what transfers and what the employer treats as essential.', unknown: 'The resume uses “registered nurse” but does not show the registration jurisdiction/status or care setting.' },
    template: { id: 'rounds', label: 'Rounds', reason: 'Its verified registry description places licensure and clinical setting first. Preview before choosing access.' },
    regionalNote: 'Registration is jurisdiction-specific. The Australian profile explicitly requires registration with the Nursing and Midwifery Board of Australia; it does not establish another country’s rule.',
    sources: [onet('29-1141.00', 'O*NET — Registered Nurses'), { label: 'Jobs and Skills Australia — Registered Nurses', url: 'https://www.jobsandskills.gov.au/data/occupation-and-industry-profiles/occupations/2544-registered-nurses', jurisdiction: 'Australia', checkedAt }],
  },
  {
    slug: 'project-management-specialist', category: 'operations', title: 'Project management specialist resume evidence guide',
    description: 'Show planning, coordination, stakeholder and delivery evidence for project work without treating one title, tool or certification as universally required.',
    selectionReason: 'Represents operations work across industries and exposes schedule, resource, stakeholder and delivery evidence that is often hidden behind broad titles.',
    workContext: 'O*NET describes coordinating schedules, timelines, procurement, staffing and budgets for a product or service. Actual authority and methods vary widely by project and industry.',
    structure: ['Name the project or service context before the method.', 'Separate planning, delivery, stakeholder and resource evidence.', 'Make your decision authority clear.', 'Use a selected-project section when one role contained several materially different initiatives.'],
    flexibleSections: ['Selected projects', 'Delivery methods and tools', 'Industry or domain knowledge', 'Credentials', 'Vendor or stakeholder work'],
    skillsInContext: ['Tie schedules to the work and dependencies you coordinated.', 'Describe budget or procurement involvement at your real level of authority.', 'Name project tools beside the reporting or delivery process they supported.'],
    requirementPatterns: ['Plan and monitor milestones or deliverables', 'Coordinate stakeholders, staff or suppliers', 'Identify risks, dependencies or resource needs', 'Report status, budget or quality information'],
    weakBullet: 'Managed multiple projects and stakeholders successfully.',
    strongBullet: 'Coordinated the launch plan for three training modules, tracking dependencies across content, legal review and platform teams and escalating two schedule risks.',
    strongBulletWhy: 'The fictional example shows scope and coordination without claiming sole ownership or an invented business result.',
    evidenceExample: { requirement: 'Budget and vendor-management experience', direct: 'Your resume states the budget scope, vendor responsibility and a verifiable delivery decision.', adjacent: 'You tracked project costs and coordinated suppliers but did not own vendor selection; that is relevant but not identical.', unknown: 'The resume says “budget management” without scope, authority or an example.' },
    template: { id: 'waypoint', label: 'Waypoint', reason: 'Its verified registry description uses a continuous operations timeline; preview it if chronology helps the reader follow delivery work.' },
    regionalNote: 'Project titles and certifications vary by employer and market. Do not present a certification as required unless the vacancy or a governing source says so.',
    sources: [onet('13-1082.00', 'O*NET — Project Management Specialists'), { label: 'National Careers Service (England) — Business Project Manager', url: 'https://nationalcareers.service.gov.uk/job-profiles/business-project-manager', jurisdiction: 'England', checkedAt }],
  },
  {
    slug: 'primary-school-teacher', category: 'education', title: 'Primary school teacher resume evidence guide',
    description: 'Connect teaching requirements with planning, instruction, assessment, adaptation and safeguarding evidence while keeping credentials and terminology local.',
    selectionReason: 'Represents education and demonstrates why local credential rules and title terminology must stay attached to the hiring jurisdiction.',
    workContext: 'Official occupation material describes planning lessons, teaching, assessing progress and adapting materials. Curriculum, age bands, safeguarding and qualification routes remain local.',
    structure: ['State the age range, setting and relevant credential truthfully.', 'Organize evidence around planning, instruction, assessment and adaptation.', 'Keep safeguarding or special-responsibility claims precise.', 'Use placements, tutoring or community teaching when they are the strongest verified evidence.'],
    flexibleSections: ['Teaching credentials', 'Classroom or placement experience', 'Curriculum areas', 'Inclusive practice', 'Professional development', 'Community or tutoring experience'],
    skillsInContext: ['Connect lesson planning to a real learner group and objective.', 'Describe assessment through the method and how it informed instruction.', 'Name educational technology only beside its actual teaching use.'],
    requirementPatterns: ['Recognized teaching qualification or route', 'Plan and deliver age-appropriate learning', 'Assess progress and adapt instruction', 'Work with families, colleagues and support services'],
    weakBullet: 'Taught lessons and helped students succeed.',
    strongBullet: 'Adapted a six-week fractions unit for a mixed-attainment class, using weekly checks to regroup practice and identify concepts needing reteaching.',
    strongBulletWhy: 'The fictional example makes the teaching method visible without inventing a score improvement.',
    evidenceExample: { requirement: 'Experience adapting instruction for different learning needs', direct: 'A real learner group, adaptation and assessment loop are documented.', adjacent: 'You adapted volunteer tutoring for individual learners; the setting differs but the evidence may transfer.', unknown: 'The resume lists “differentiation” with no example or learner context.' },
    template: { id: 'classic', label: 'Classic', reason: 'Its verified registry description uses traditional type and balanced spacing; preview it with your credential and classroom sections.' },
    regionalNote: '“Primary” and “elementary” refer to different local systems, and credential routes vary. Use the vacancy’s title and verify the local regulator or official careers service.',
    sources: [onet('25-2021.00', 'O*NET — Elementary School Teachers, Except Special Education'), { label: 'National Careers Service (England) — Primary School Teacher', url: 'https://nationalcareers.service.gov.uk/job-profiles/primary-school-teacher', jurisdiction: 'England', checkedAt }],
  },
  {
    slug: 'customer-service-representative', category: 'service', title: 'Customer service representative resume evidence guide',
    description: 'Turn customer-service work into evidence about channels, questions, records, resolution and escalation without inventing satisfaction scores.',
    selectionReason: 'Represents service work across sectors and creates a practical bridge for applicants whose evidence is obscured by generic “helped customers” bullets.',
    workContext: 'O*NET describes answering inquiries, keeping records and handling or escalating complaints. Products, channels and decision authority vary by employer.',
    structure: ['Name the service context and channels.', 'Distinguish inquiry handling, resolution, records and escalation.', 'Show volume or service levels only when you can verify them.', 'Keep product tools beside the service work they enabled.'],
    flexibleSections: ['Customer channels', 'Products or service areas', 'Systems and records', 'Training or quality work', 'Languages'],
    skillsInContext: ['Describe CRM use through the records or handoffs you maintained.', 'Show de-escalation through a bounded situation, not a personality label.', 'Connect product knowledge to the questions you could resolve.'],
    requirementPatterns: ['Respond through named channels', 'Maintain accurate customer or case records', 'Resolve within authority and escalate appropriately', 'Explain products, policies or next steps clearly'],
    weakBullet: 'Delivered excellent customer service in a fast-paced environment.',
    strongBullet: 'Handled billing and delivery questions across email and chat, documenting each case and escalating policy exceptions with a concise case history.',
    strongBulletWhy: 'The fictional example names channels, work and boundary without an unsupported quality or speed claim.',
    evidenceExample: { requirement: 'Experience resolving complex account issues', direct: 'A specific issue type, your resolution authority and documented outcome appear.', adjacent: 'You triaged complex issues and prepared escalations but did not make the final account change.', unknown: 'The resume says “problem solving” without a customer or issue example.' },
    template: { id: 'modern', label: 'Modern', reason: 'Its verified registry description provides a clean accent-led hierarchy. Preview it with your actual service and systems evidence.' },
    regionalNote: 'Titles such as adviser, associate, agent and representative can cover different work. Preserve the real title and use the vacancy’s wording only where your evidence matches.',
    sources: [onet('43-4051.00', 'O*NET — Customer Service Representatives'), { label: 'National Careers Service (England) — Customer Service Assistant', url: 'https://nationalcareers.service.gov.uk/job-profiles/customer-service-assistant', jurisdiction: 'England', checkedAt }],
  },
  {
    slug: 'electrician', category: 'skilled-trades', title: 'Electrician resume evidence guide',
    description: 'Present electrical installation, testing, maintenance and safety evidence while treating licences, codes and qualifications as jurisdiction-specific.',
    selectionReason: 'Represents skilled trades and makes the boundary between demonstrated work, regulated authorization and local codes unavoidable.',
    workContext: 'Official sources describe installing, maintaining and testing electrical systems and following relevant codes. Authorization, apprenticeship and scope differ by jurisdiction.',
    structure: ['Place verified licences, registrations or apprenticeship status where employers can find them.', 'Name the environment and systems you actually worked on.', 'Separate installation, testing, fault finding and maintenance evidence.', 'Describe safety and code compliance without claiming authorization you did not hold.'],
    flexibleSections: ['Licences and cards', 'Apprenticeship or training', 'Installation environments', 'Testing equipment', 'Safety training', 'Selected projects'],
    skillsInContext: ['Name test equipment beside the check you performed.', 'Connect drawings or specifications to the installation task.', 'State whether you performed, assisted, inspected or supervised the work.'],
    requirementPatterns: ['Current local licence, registration or apprenticeship status', 'Install or maintain named systems', 'Read drawings and follow applicable codes', 'Test, diagnose and document faults safely'],
    weakBullet: 'Completed electrical work safely and efficiently.',
    strongBullet: 'Installed and tested lighting circuits during a retail refit under licensed supervision, recording test results and resolving two drawing discrepancies before handover.',
    strongBulletWhy: 'The fictional example states supervision, environment, actions and handover evidence without overstating independent authorization.',
    evidenceExample: { requirement: 'Authorized commercial installation experience', direct: 'The resume shows the local authorization status and commercial installation scope.', adjacent: 'You completed commercial work under supervision; relevant evidence exists, but authorization must be checked.', unknown: 'The resume says “electrical installation” without jurisdiction, environment or responsibility.' },
    template: { id: 'charter', label: 'Charter', reason: 'Its verified registry description is credentials-first. Preview it when licences or apprenticeship status need early visibility.' },
    regionalNote: 'Never infer an electrician’s authorization from a title. The England careers profile and US O*NET page are starting points, not cross-border licensing advice.',
    sources: [onet('47-2111.00', 'O*NET — Electricians'), { label: 'National Careers Service (England) — Electrician', url: 'https://nationalcareers.service.gov.uk/job-profiles/electrician', jurisdiction: 'England', checkedAt }],
  },
  {
    slug: 'social-science-research-assistant', category: 'research', title: 'Social science research assistant resume evidence guide',
    description: 'Show research methods, data quality, analysis, documentation and ethics evidence without presenting coursework or tool names as completed research.',
    selectionReason: 'Represents research work and surfaces method, data quality, reporting and participant-protection evidence that generic resumes often flatten.',
    workContext: 'O*NET describes data management, statistical analysis, quality control, reports and participant-related procedures. Research domains and ethics obligations vary by study.',
    structure: ['Lead with the research question, study or dataset where disclosure is permitted.', 'Distinguish collection, cleaning, analysis and interpretation.', 'Keep methods and tools beside the work they supported.', 'State authorship, approval and participant-contact boundaries accurately.'],
    flexibleSections: ['Research projects', 'Methods', 'Datasets and tools', 'Publications and presentations', 'Ethics or participant training', 'Coursework when early-career'],
    skillsInContext: ['Name a statistical package beside the analysis you performed.', 'Describe data cleaning through checks or decisions, not “attention to detail.”', 'Make your contribution to a report or publication explicit.'],
    requirementPatterns: ['Collect, clean or manage research data', 'Apply qualitative or quantitative methods', 'Document procedures and quality checks', 'Prepare reports, tables or literature summaries'],
    weakBullet: 'Assisted with research and used statistical software.',
    strongBullet: 'Cleaned survey response data for a housing study, documented exclusion rules and produced reproducible summary tables for the project lead’s review.',
    strongBulletWhy: 'The fictional example identifies the study, method, documentation and review boundary without claiming authorship.',
    evidenceExample: { requirement: 'Experience with reproducible quantitative analysis', direct: 'The project, data, analysis steps and reproducible output are documented.', adjacent: 'A course project used the method on a smaller dataset; it may deserve review but is not professional study experience.', unknown: 'A software package is listed with no dataset, method or output.' },
    template: { id: 'scholar', label: 'Scholar', reason: 'Its verified registry description is research-first with numbered publications. Use only if that structure matches your real output.' },
    regionalNote: 'Ethics review, consent and data-protection duties depend on the study, institution and jurisdiction. Do not turn a general occupation source into legal guidance.',
    sources: [onet('19-4061.00', 'O*NET — Social Science Research Assistants'), { label: 'Canada Job Bank — Social Research Assistant (except University)', url: 'https://www.jobbank.gc.ca/marketreport/summary-occupation/27078/ca', jurisdiction: 'Canada', checkedAt }],
  },
  {
    slug: 'graphic-designer', category: 'creative', title: 'Graphic designer resume evidence guide',
    description: 'Connect graphic-design portfolio work to the brief, audience, constraints, production and collaboration evidence behind it.',
    selectionReason: 'Represents creative work where a portfolio shows output but the resume still needs to explain decisions, production context and contribution.',
    workContext: 'O*NET describes understanding client needs, creating layouts and preparing work for production. Medium, process and authorship vary by project.',
    structure: ['Link only to work you are allowed to show.', 'Use selected projects to explain the brief, your role and the delivered artifact.', 'Keep tools secondary to design and production evidence.', 'Distinguish independent work from team or agency contribution.'],
    flexibleSections: ['Selected work', 'Portfolio', 'Clients or sectors', 'Production methods', 'Recognition', 'Exhibitions or publications'],
    skillsInContext: ['Name a design tool beside the artifact and production stage.', 'Connect accessibility or brand-system claims to a concrete application.', 'State what you designed versus what you art-directed, adapted or produced.'],
    requirementPatterns: ['Interpret a brief or audience need', 'Develop layouts or visual systems', 'Prepare files for digital or print production', 'Present, revise and collaborate with clients or teams'],
    weakBullet: 'Created eye-catching designs for multiple clients.',
    strongBullet: 'Designed a modular event-signage system for a community venue, preparing print-ready files and a reuse guide after two stakeholder review rounds.',
    strongBulletWhy: 'The fictional example shows deliverables, production and review without claiming subjective superiority.',
    evidenceExample: { requirement: 'Experience maintaining a visual system across channels', direct: 'A real system, channels, your role and deliverables are shown.', adjacent: 'You adapted an existing system for one channel; useful, but not evidence that you created or governed it.', unknown: 'The portfolio link appears without project role or system context.' },
    template: { id: 'casebook', label: 'Casebook', reason: 'Its verified registry description presents selected work as editorial case studies. Preview it alongside—not instead of—your portfolio.' },
    regionalNote: 'Portfolio and resume expectations vary by employer and medium. Follow the brief and avoid assuming a decorative resume is preferred for every creative role.',
    sources: [onet('27-1024.00', 'O*NET — Graphic Designers'), { label: 'National Careers Service (England) — Graphic Designer', url: 'https://nationalcareers.service.gov.uk/job-profiles/graphic-designer', jurisdiction: 'England', checkedAt }],
  },
  {
    slug: 'general-operations-manager', category: 'leadership', title: 'General and operations manager resume evidence guide',
    description: 'Make leadership scope, operational decisions, resource stewardship and team outcomes visible without relying on seniority language alone.',
    selectionReason: 'Represents leadership across industries in US and Australian classifications; it also tests whether the evidence model can represent scope without inflating authority.',
    workContext: 'O*NET describes planning or directing operations, policy, resources and performance. The title spans very different organization sizes and industries.',
    structure: ['State the organization, function and scope needed to understand the role.', 'Separate operational, people, financial and strategic evidence.', 'Show decision authority and governance honestly.', 'Prefer bounded outcomes and operating changes over leadership adjectives.'],
    flexibleSections: ['Leadership scope', 'Selected transformations', 'Operations and governance', 'Board or stakeholder work', 'Industry credentials', 'Community leadership'],
    skillsInContext: ['Tie resource planning to an operating decision.', 'Describe people leadership through team scope and your actual responsibility.', 'Connect policy or process changes to the problem and observable effect.'],
    requirementPatterns: ['Direct a function or operating unit', 'Allocate people, budget or other resources', 'Set or implement policy and operating plans', 'Monitor performance and resolve cross-functional issues'],
    weakBullet: 'Strategic leader responsible for operations and high-performing teams.',
    strongBullet: 'Led scheduling and service operations for a five-site program, establishing a weekly capacity review and clarifying escalation ownership across site leads.',
    strongBulletWhy: 'The fictional example shows scope and an operating change without inventing revenue or performance gains.',
    evidenceExample: { requirement: 'Multi-site operations leadership with budget accountability', direct: 'Site scope, team or function authority and budget responsibility are all documented.', adjacent: 'You coordinated work across sites but did not hold the budget; that may transfer but should not be relabelled.', unknown: '“Operations leadership” appears without scale, authority or a decision example.' },
    template: { id: 'boardroom', label: 'Boardroom', reason: 'Its verified registry description groups progression for senior leadership. Preview it only if that hierarchy matches your history.' },
    regionalNote: 'The same title can mean different scope by employer, sector and country. Describe the operating reality instead of relying on title equivalence.',
    sources: [onet('11-1021.00', 'O*NET — General and Operations Managers'), { label: 'Jobs and Skills Australia — General Managers', url: 'https://www.jobsandskills.gov.au/data/occupation-and-industry-profiles/occupations/1112-general-managers', jurisdiction: 'Australia (legacy ANZSCO profile; transition warning applies)', checkedAt }],
  },
];

export const occupationBySlug = new Map(occupations.map(occupation => [occupation.slug, occupation]));
