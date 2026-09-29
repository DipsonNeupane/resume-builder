// Fictional resumes in the Builder's exact data model. Every fixture passes
// isResume() and validateAll(), so it is also exportable through production.
import { example, type Resume, type Section } from '../src/model';

let n = 0;
const id = (prefix: string) => `${prefix}-${++n}`;
const e = (title: string, organization: string, location: string, dates: string, description = '') => ({ id: id('e'), title, organization, location, dates, description });
const s = (title: string, entries: ReturnType<typeof e>[], kind?: Section['kind']): Section => ({ id: id('s'), title, entries, ...(kind ? { kind } : {}) });
const base = (): Omit<Resume, 'name' | 'headline' | 'email' | 'phone' | 'location' | 'website' | 'summary' | 'skills' | 'sections'> => ({
 version: 1, profileHeading: 'Profile', skillsHeading: 'Skills', template: 'modern', paper: 'A4', accent: '#1f4e5f', direction: 'ltr', language: 'en', noExperience: false,
});

const executive: Resume = { ...base(), accent: '#233a5e',
 name: 'Jordan Ellison-Park', headline: 'Chief Operating Officer', email: 'jordan.ellisonpark@example.com', phone: '+1 (415) 555-0142', location: 'San Francisco, CA', website: 'linkedin.com/in/jordan-ellison-park-example',
 profileHeading: 'Leadership profile',
 summary: '• Scaled operations from 180 to 1,400 people across four regions while holding contribution margin above 31%\n• Led two acquisitions and their integration, consolidating nine warehouse sites into four\n• Built the company’s first S&OP process, cutting forecast error from 38% to 14% in eighteen months\n• Chair of the operating committee; board reporting on risk, supply and capital allocation',
 skillsHeading: 'Areas of expertise',
 skills: 'Operating model design, M&A integration, Supply chain strategy, P&L ownership, S&OP, Capital allocation, Board reporting, Labour relations, Lean transformation',
 sections: [
  s('Experience', [
   e('Chief Operating Officer', 'Northwind Provisions', 'San Francisco, CA', '2021 — Present', 'Scope: 4 regions · 9 sites · 1,400 people · $640M budget\nOwn the operating budget spanning fulfilment, procurement, customer operations and facilities; eight direct reports.\nIntegrated the Harbor Foods acquisition in 11 months, retaining 94% of key accounts and closing five redundant sites.\nIntroduced quarterly operating reviews tied to board metrics, adopted as the company-wide planning cadence.\nNegotiated a three-year carrier agreement that reduced outbound freight cost per order by 17%.'),
   e('SVP, Supply Chain', 'Northwind Provisions', 'Oakland, CA', '2018 — 2021', 'Led planning, sourcing and distribution for 22,000 SKUs across 140 suppliers.\nLaunched the S&OP process and demand-sensing model; inventory turns improved from 7.1 to 10.4.\nBuilt a supplier-risk programme that kept fill rate above 96% through 2020 disruptions.'),
   e('Director, Distribution', 'Northwind Provisions', 'Reno, NV', '2016 — 2018', 'Opened two regional distribution centres on schedule and 6% under capital budget.\nCut mispicks by 58% with slotting redesign and targeted training.'),
   e('Operations Manager', 'Coastal Freight Partners', 'Long Beach, CA', '2011 — 2016', 'Ran cross-dock operations handling 3,000 inbound containers per month.\nIntroduced yard-management tooling that reduced dwell time from 41 to 26 hours.\nDeveloped eleven supervisors, six of whom moved into site leadership roles.'),
   e('Management Associate', 'Halden Logistics', 'Chicago, IL', '2008 — 2011', 'Rotations in transport planning, finance and customer operations.'),
  ], 'experience'),
  s('Board & advisory', [
   e('Independent Director, Audit Committee', 'Fresh Routes Cooperative', 'Sacramento, CA', '2022 — Present'),
   e('Advisor, Operations', 'Parcelwise (Series B logistics software)', 'Remote', '2020 — Present'),
  ]),
  s('Education', [
   e('MBA, Operations & Strategy', 'Kellogg School of Management, Northwestern University', 'Evanston, IL', '2014'),
   e('BS, Industrial Engineering', 'University of Michigan', 'Ann Arbor, MI', '2008'),
  ]),
  s('Certifications', [e('APICS Certified Supply Chain Professional (CSCP)', 'ASCM', '', '2017'), e('Lean Six Sigma Black Belt', 'ASQ', '', '2013')]),
 ] };

const engineer: Resume = { ...base(), accent: '#0f5f4e',
 name: 'Priya Raman', headline: 'Senior Software Engineer — Platform & Developer Tooling', email: 'priya.raman@example.dev', phone: '+44 20 7946 0321', location: 'London, UK', website: 'github.com/priya-raman-example',
 summary: 'Platform engineer with eight years building internal developer platforms, build systems and observability for teams of 40–400 engineers. I prefer small, well-instrumented systems and writing the migration guide before the migration.',
 skills: 'Languages: TypeScript, Go, Python, SQL, Bash\nInfrastructure: Kubernetes, Terraform, AWS (EKS, Lambda, RDS), GitHub Actions, Bazel\nObservability: OpenTelemetry, Prometheus, Grafana, Honeycomb\nPractices: Incident command, RFC process, Mentoring',
 sections: [
  s('Experience', [
   e('Senior Software Engineer, Platform', 'Lumen Health', 'London, UK', 'Mar 2022 — Present', 'Designed a self-service environment system on Kubernetes; preview environments dropped from 2 days to 9 minutes for 38 teams.\nLed migration of 210 services from Jenkins to GitHub Actions with a written playbook and zero missed releases.\nCut CI spend by 41% through remote caching and test sharding.\nStack: Go, Kubernetes, Terraform, GitHub Actions'),
   e('Software Engineer II', 'Brightwire', 'Manchester, UK', 'Jun 2019 — Feb 2022', 'Built the tracing pipeline (OpenTelemetry → Honeycomb) adopted by all product teams.\nOwned on-call tooling; median time-to-acknowledge fell from 14 to 4 minutes.\nStack: TypeScript, Node.js, OpenTelemetry, AWS Lambda'),
   e('Software Engineer', 'Carta Systems', 'Leeds, UK', 'Sep 2016 — May 2019', 'Maintained billing services processing £30M/year.\nWrote the reconciliation job that caught a recurring double-charge edge case.'),
  ], 'experience'),
  s('Projects', [
   e('tracekit', 'Open source · maintainer', '', '2021 — Present', 'Lightweight OpenTelemetry helpers for Node.js; 2.3k GitHub stars, 40 contributors.\nStack: TypeScript, OpenTelemetry\nLink: https://github.com/example/tracekit'),
   e('Flaky-test quarantine bot', 'Internal tool, later open-sourced', '', '2023', 'Detects flaky tests from CI history and opens quarantine PRs automatically; used by 12 teams.\nStack: Go, GitHub API\nLink: github.com/example/quarantine-bot'),
  ]),
  s('Education', [e('BSc Computer Science, First Class', 'University of Leeds', 'Leeds, UK', '2013 — 2016')]),
  s('Certifications', [e('Certified Kubernetes Administrator (CKA)', 'CNCF', '', '2021')]),
 ] };

const academic: Resume = { ...base(), accent: '#5b2333', paper: 'Letter',
 name: 'Dr. Tomasz Wiśniewski-Adeyemi', headline: 'Postdoctoral Research Fellow, Computational Ecology', email: 't.wisniewski@example.edu', phone: '+1 617 555 0198', location: 'Cambridge, MA', website: 'https://example.edu/~twisniewski',
 profileHeading: 'Research interests',
 summary: 'Population dynamics under climate variability; Bayesian hierarchical models for sparse ecological data; reproducible research software for field ecologists.',
 skillsHeading: 'Methods & tools',
 skills: 'Statistics: Bayesian hierarchical models, Stan, state-space models, spatial statistics\nSoftware: R, Python, Julia, Git, Snakemake\nField: Mark–recapture design, acoustic monitoring\nLanguages: Polish (native), English (fluent), Yoruba (conversational)',
 sections: [
  s('Education', [
   e('PhD, Ecology and Evolutionary Biology', 'University of Toronto', 'Toronto, Canada', '2017 — 2022', 'Dissertation: “Detecting demographic change from sparse, noisy counts.”\nAdvisor: Prof. A. Kowalczyk'),
   e('MSc, Environmental Science', 'Jagiellonian University', 'Kraków, Poland', '2015 — 2017'),
  ]),
  s('Academic appointments', [
   e('Postdoctoral Research Fellow', 'Harvard Forest, Harvard University', 'Petersham, MA', '2022 — Present', 'Lead analyst for a 30-year small-mammal monitoring programme.\nSupervise two undergraduate research assistants.\nMethods: Bayesian state-space models, Stan, capture–recapture'),
  ], 'experience'),
  s('Publications', [
   e('Detecting demographic decline from sparse counts with state-space models', 'Methods in Ecology and Evolution', '14(3): 612–627', '2024', 'Wiśniewski-Adeyemi T., Chen L., Kowalczyk A.\nDOI: 10.1111/2041-210X.00000'),
   e('Acoustic occupancy of bats across an urban gradient', 'Ecological Applications', '33(6): e2871', '2023', 'Okafor R., Wiśniewski-Adeyemi T., Martin J.'),
   e('A reproducible workflow for long-term monitoring data', 'Ecology and Evolution', '12(9): e9281', '2022', 'Wiśniewski-Adeyemi T., Kowalczyk A.'),
  ]),
  s('Grants & awards', [
   e('NSF Postdoctoral Research Fellowship in Biology', 'National Science Foundation', '$216,000', '2022 — 2025'),
   e('Best Student Paper', 'Ecological Society of America', '', '2021'),
  ]),
  s('Teaching', [
   e('Teaching Assistant, Quantitative Methods in Ecology (EEB 430)', 'University of Toronto', '', '2018 — 2021', 'Led weekly labs for 60 students; redesigned R assignments around real monitoring data.'),
  ]),
  s('Invited talks', [
   e('Sparse data, honest uncertainty', 'ISEC International Statistical Ecology Conference', 'Swansea, UK', '2024'),
  ]),
 ] };

const designer: Resume = { ...base(), accent: '#b24a2a',
 name: 'Maya Okonkwo', headline: 'Senior Product Designer', email: 'hello@mayaokonkwo.example', phone: '+1 312 555 0117', location: 'Chicago, IL', website: 'mayaokonkwo.design/work',
 summary: 'I design calm software for complicated work — scheduling, payments and care coordination — and I measure it by the support tickets that never get filed.',
 skillsHeading: 'Capabilities',
 skills: 'Interaction design, Design systems, Prototyping (Figma, Framer), Usability research, Service blueprints, Accessibility (WCAG 2.2), Front-end (HTML/CSS)',
 sections: [
  s('Selected work', [
   e('Rebuilding shift swaps for 9,000 nurses', 'Lead designer · Carewell', '', '2024', 'Replaced a phone-tree process with an in-app swap market.\nOutcome: swap requests resolved in 3 hours instead of 2 days; support tickets down 62%.\nLink: mayaokonkwo.design/work/shift-swaps'),
   e('Payments design system', 'Design systems lead · Ledgerly', '', '2022', '48 components with accessibility annotations, adopted across 6 product teams.\nLink: https://mayaokonkwo.design/work/ledgerly-system'),
   e('Clinic intake, rethought', 'Product designer · Carewell', '', '2023', 'Cut average intake time from 11 to 4 minutes in a 3-clinic pilot.\nLink: mayaokonkwo.design/work/intake'),
  ]),
  s('Experience', [
   e('Senior Product Designer', 'Carewell', 'Chicago, IL', '2022 — Present', 'Lead designer for scheduling and workforce tools; partner with two PMs and eleven engineers.'),
   e('Product Designer', 'Ledgerly', 'Remote', '2019 — 2022', 'Designed invoicing and payouts flows; founded the design system team.'),
   e('Visual Designer', 'Northside Studio', 'Chicago, IL', '2017 — 2019'),
  ], 'experience'),
  s('Education', [e('BFA, Communication Design', 'School of the Art Institute of Chicago', 'Chicago, IL', '2017')]),
  s('Recognition', [e('Core77 Design Awards — Notable, Service Design', 'Core77', '', '2024')]),
 ] };

const short: Resume = { ...base(),
 name: 'Sam Lee', headline: 'Barista', email: 'sam.lee@example.com', phone: '', location: '', website: '', summary: '', skills: '',
 sections: [s('Experience', [e('Barista', 'Corner Café', '', '2024 — Present')], 'experience'), s('Education', [])],
};

const longBullet = 'Coordinated a cross-functional programme spanning procurement, legal, finance, regional operations and three external implementation partners to replace a fifteen-year-old enterprise resource planning platform, including data migration of 4.2 million records, parallel running for two quarter-end closes, and training for 1,100 users in six languages without any unplanned downtime.';
const stress: Resume = { ...base(), accent: '#6b3fa0',
 name: 'Maximiliana Alexandra Oyelaran-Vanderbilt de la Cruz-Hernández', headline: 'Principal Programme Manager, Enterprise Transformation & Global Shared Services (EMEA, APAC and LATAM)',
 email: 'maximiliana.oyelaran-vanderbilt.delacruz@example-consulting-group.com', phone: '+351 21 555 0100 ext. 4471', location: 'Lisbon, Portugal · São Paulo, Brazil · Kraków, Poland',
 website: 'https://www.example-consulting-group.com/people/maximiliana-oyelaran-vanderbilt-de-la-cruz-hernandez/profile?section=overview',
 summary: 'Programme leader for multi-country finance and operations transformations. Comfortable in Portuguese, Spanish, English and Polish; works across Zürich, Łódź, 東京 and México City delivery centres.\nKnown for plain-language status reporting and calm recovery of troubled programmes.',
 skills: Array.from({ length: 42 }, (_, i) => ['SAP S/4HANA', 'Oracle Fusion', 'Workday', 'Programme governance', 'Vendor management', 'Change management', 'Stakeholder mapping', 'Process mining (Celonis)', 'Power BI', 'Risk registers', 'Benefits realisation', 'PRINCE2'][i % 12] + (i >= 12 ? ` ${Math.floor(i / 12) + 1}` : '')).join(', '),
 sections: [
  s('Professional experience', Array.from({ length: 8 }, (_, i) => e(
   i === 0 ? 'Principal Programme Manager, Global Finance Transformation and Shared Services Consolidation' : `Senior Programme Manager ${i + 1}`,
   i % 3 === 0 ? 'Example Consulting Group GmbH & Co. KG (Zürich / Łódź delivery centres)' : `Organisation ${i + 1}`,
   ['Zürich, Switzerland', 'Łódź, Poland', 'São Paulo, Brazil', '東京, Japan'][i % 4], `${2024 - i * 2} — ${i === 0 ? 'Present' : 2025 - i * 2}`,
   [longBullet, 'Reduced month-end close from 11 to 6 working days across 14 entities.', 'Reference: https://example.org/case-studies/a-very-long-path/that-keeps-going/and-going/without-any-natural-break-points-whatsoever-0123456789', 'Built a governance model with 23 workstreams and a single RAID log.'].slice(0, 2 + (i % 3)).join('\n'),
  )), 'experience'),
  s('Projects', [e('Shared-services location strategy', 'Board-sponsored', '', '2021', 'Stack: Celonis, Power BI\nLink: https://example.org/very/long/project/path/with/many/segments/to/test/wrapping'), e('Untitled internal accelerator', '', '', '', '')]),
  s('Education', [e('MSc Management, Information Systems and Innovation', 'Universidade Nova de Lisboa — Nova School of Business and Economics', 'Carcavelos, Portugal', '2009'), e('BA Economics', 'Universidad Nacional Autónoma de México', 'Ciudad de México', '2007')]),
  s('Certifications', [e('PRINCE2 Practitioner', 'AXELOS', '', '2015'), e('PMP', 'PMI', '', '2013'), e('SAFe Program Consultant', 'Scaled Agile', '', '2019'), e('Certified ScrumMaster', 'Scrum Alliance', '', '2012')]),
  s('Languages & interests', [e('Portuguese (native), Spanish (C2), English (C2), Polish (B2)', '', '', '')]),
  s('Empty custom section', [e('', '', '', '', '')]),
 ] };

const arabic: Resume = { ...base(), direction: 'rtl', language: 'ar', accent: '#135e4b',
 name: 'ليلى حداد', headline: 'مديرة تسويق رقمي', email: 'layla.haddad@example.com', phone: '+971 4 555 0134', location: 'دبي، الإمارات', website: 'linkedin.com/in/layla-haddad-example',
 profileHeading: 'نبذة', skillsHeading: 'المهارات',
 summary: 'خبرة عشر سنوات في التسويق الرقمي وإدارة الحملات عبر أسواق الخليج، مع تركيز على التحليل وقياس الأثر.',
 skills: 'تحسين محركات البحث، الإعلانات المدفوعة، Google Analytics، إدارة الفرق، العربية، الإنجليزية',
 sections: [
  s('الخبرة العملية', [e('مديرة تسويق رقمي', 'شركة المثال', 'دبي', '2020 — الآن', 'قادت فريقاً من ثمانية أشخاص لإدارة حملات في ست دول.\nرفعت معدل التحويل بنسبة 34% خلال عام واحد.'), e('أخصائية تسويق', 'وكالة النموذج', 'عمّان', '2016 — 2020', 'أدارت ميزانيات إعلانية شهرية لعملاء في قطاع التجزئة.')], 'experience'),
  s('التعليم', [e('بكالوريوس إدارة الأعمال', 'الجامعة الأردنية', 'عمّان', '2016')]),
 ] };

const clinical: Resume = { ...base(), accent: '#1d5c7a', paper: 'Letter',
 name: 'Ana Sofía Ramírez-Oduya', headline: 'Registered Nurse, BSN — Critical Care', email: 'ana.ramirez.rn@example.com', phone: '+1 (206) 555-0175', location: 'Seattle, WA', website: '',
 summary: 'ICU nurse with six years in adult critical care and rapid response. Precepts new graduates and leads the unit’s sepsis-bundle audit.',
 skillsHeading: 'Clinical skills',
 skills: 'Clinical: Ventilator management, CRRT, Arterial lines, Titratable drips, Sepsis protocols\nSystems: Epic, Pyxis, Alaris pumps\nLanguages: Spanish (fluent), English (native)',
 sections: [
  s('Licensure & certification', [
   e('Registered Nurse (RN)', 'Washington State Nursing Commission · License RN60123456', '', 'Exp. 2027-06'),
   e('CCRN — Adult Critical Care', 'AACN Certification Corporation', '', 'Exp. 2026-11'),
   e('ACLS / BLS', 'American Heart Association', '', 'Exp. 2026-03'),
  ]),
  s('Clinical experience', [
   e('Staff Nurse, Medical ICU', 'Harborview Medical Center', '28-bed Level I trauma ICU', '2021 — Present', 'Manage 1:1 and 1:2 assignments including CRRT, proning and post-arrest care.\nUnit preceptor for 9 new-graduate nurses; charge nurse on rotation.\nLed the sepsis-bundle audit that raised 3-hour bundle compliance from 71% to 89%.'),
   e('Staff Nurse, Progressive Care', 'Swedish Medical Center', 'Step-down unit, 32 beds', '2019 — 2021', 'Cared for telemetry and post-surgical patients; rapid response team member.'),
  ], 'experience'),
  s('Education', [e('BSN, Nursing', 'University of Washington School of Nursing', 'Seattle, WA', '2019', 'Clinical practicum: Surgical ICU, 240 hours.')]),
  s('Clinical training', [e('Critical Care Nurse Residency', 'Harborview Medical Center', '', '2021'), e('Trauma Nursing Core Course (TNCC)', 'Emergency Nurses Association', '', '2022')]),
  s('Professional memberships', [e('American Association of Critical-Care Nurses (AACN)', '', '', '2020 — Present')]),
 ] };

const graduate: Resume = { ...base(), accent: '#7a3b12', noExperience: true,
 name: 'Kwame Mensah', headline: 'Economics Graduate — Seeking Analyst Roles', email: 'kwame.mensah@example.ac.uk', phone: '+44 7700 900456', location: 'Bristol, UK', website: 'kwamemensah.example.com',
 summary: 'Recent economics graduate who enjoys turning messy public data into clear, well-sourced briefings.',
 skills: 'Excel (pivot tables, lookups), R, Stata, SQL (basic), Presentation, French (B2)',
 sections: [
  s('Experience', [], 'experience'),
  s('Education', [e('BSc Economics, 2:1', 'University of Bristol', 'Bristol, UK', '2022 — 2025', 'Dissertation: “Bus fares and job access in the West of England” (72%).\nRelevant modules: Econometrics, Public Economics, Data Analysis in R.'), e('A levels: Mathematics (A*), Economics (A), Geography (A)', 'Hackney Community College', 'London, UK', '2020 — 2022')]),
  s('Projects', [e('Local housing affordability dashboard', 'Personal project', '', '2025', 'Combined ONS rent and earnings data for 38 local authorities.\nLink: kwamemensah.example.com/housing')]),
  s('Volunteering & activities', [e('Treasurer', 'Bristol Economics Society', '', '2023 — 2024', 'Managed a £4,200 budget and ran two speaker events with 150+ attendees.'), e('Maths tutor', 'Access Tutoring (charity)', '', '2022 — 2025')]),
 ] };

const productionExample = (): Resume => ({ ...example(), accent: '#20594a' });

export const fixtures: { id: string; label: string; note: string; resume: () => Resume }[] = [
 { id: 'executive', label: 'Executive · multi-page', note: 'Promotions at one employer, board roles, highlights summary', resume: () => executive },
 { id: 'engineer', label: 'Engineer · projects', note: 'Grouped skills, Stack:/Link: lines, projects section', resume: () => engineer },
 { id: 'academic', label: 'Academic CV · Letter', note: 'Publications, grants, teaching, talks; Letter paper', resume: () => academic },
 { id: 'designer', label: 'Designer · portfolio', note: 'Selected work with links, portfolio URL', resume: () => designer },
 { id: 'builder-example', label: 'Builder example', note: 'The Builder’s own example() resume, unchanged', resume: productionExample },
 { id: 'clinical', label: 'Clinical · Letter', note: 'Licensure section, clinical experience, grouped skills; Letter paper', resume: () => clinical },
 { id: 'graduate', label: 'Graduate · no experience', note: '“No experience yet” checked, education first, projects, activities', resume: () => graduate },
 { id: 'short', label: 'Short · sections omitted', note: 'No summary, skills, phone, website; empty Education', resume: () => short },
 { id: 'stress', label: 'Stress · long everything', note: 'Long name/titles/URLs, 42 skills, 8 roles, intl. characters, empty section', resume: () => stress },
 { id: 'rtl', label: 'Arabic · RTL', note: 'Right-to-left direction and Arabic script', resume: () => arabic },
];
