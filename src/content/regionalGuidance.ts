export type RegionalSource = { label: string; url: string; checkedAt: `${number}-${number}-${number}` };
export type RegionalGuidance = {
  id: string;
  place: string;
  documentTerm: string;
  verifiedGuidance: string[];
  unresolved: string[];
  sources: RegionalSource[];
};

const checkedAt = '2026-09-30' as const;
export const regionalNextReviewAt = '2026-12-29' as const;

// These are bounded summaries of named public-service guidance, not national
// hiring rules. A vacancy, employer, regulator and applicant's actual location
// always take precedence. ResumeStride never selects a convention from an IP.
export const regionalGuidance: RegionalGuidance[] = [
  {
    id: 'canada', place: 'Canada', documentTerm: 'Resume in the cited Job Bank guidance',
    verifiedGuidance: ['Canada Job Bank says a photo is not the norm.', 'It advises excluding age, marital status, religious/political views and a Social Insurance Number.', 'It recommends clear contact information and says a resume is generally no more than two pages.'],
    unresolved: ['Province, occupation and employer requirements still need separate verification.', 'The source does not establish one required paper size, date format or phone format for every Canadian application.'],
    sources: [{ label: 'Canada Job Bank — How to write a good resume', url: 'https://www.jobbank.gc.ca/findajob/resources/write-good-resume', checkedAt }],
  },
  {
    id: 'england', place: 'England', documentTerm: 'CV in the cited National Careers Service guidance',
    verifiedGuidance: ['The National Careers Service uses “CV” and recommends name, phone, email and a professional profile link where useful.', 'It says not to include age, date of birth, marital status or nationality.', 'It advises tailoring the CV to the job advert.'],
    unresolved: ['Guidance is from an England service and is not asserted as a universal UK rule.', 'The page does not establish a universal photo, paper-size, date or phone-format rule.'],
    sources: [{ label: 'National Careers Service (England) — CV sections', url: 'https://nationalcareers.service.gov.uk/careers-advice/cv-sections', checkedAt }],
  },
  {
    id: 'new-zealand', place: 'New Zealand', documentTerm: 'CV in the cited Careers guidance',
    verifiedGuidance: ['The public guidance uses “CV.”', 'It advises leaving out photos or images and personal details including date of birth, marital status and religion.', 'It recommends making both PDF and Word versions available.'],
    unresolved: ['Occupation, employer and visa processes may request additional evidence.', 'The source does not establish one paper-size, date or phone-format rule for every application.'],
    sources: [{ label: 'New Zealand Careers — How to write a CV', url: 'https://knowyourskills.careers.govt.nz/job-hunting/cvs-and-cover-letters/how-to-write-a-cv/', checkedAt }],
  },
  {
    id: 'australia', place: 'Australia', documentTerm: 'Resume in the cited Workforce Australia guidance',
    verifiedGuidance: ['Workforce Australia uses “resume” and treats it as one part of an application that may also include a cover letter, profile, screening questions or selection criteria.', 'It advises following the job ad and tailoring each application.', 'It distinguishes a Workforce Australia profile from a resume.'],
    unresolved: ['The cited page does not establish a country-wide photo, personal-details, paper-size or length convention.', 'Regulated occupations require their own Australian authority or regulator source.'],
    sources: [{ label: 'Workforce Australia — Tips for successful job applications', url: 'https://www.workforceaustralia.gov.au/individuals/coaching/job-applications/job-application-tips', checkedAt }],
  },
  {
    id: 'europass', place: 'European Union / Europass', documentTerm: 'CV in the Europass service',
    verifiedGuidance: ['Europass provides a CV builder in 31 languages and advises tailoring the CV to the vacancy.', 'Europass profile guidance says not to include sensitive information such as health, beliefs or other information irrelevant to career and learning.', 'A Europass CV is an available format, not proof of one shared hiring convention across Europe.'],
    unresolved: ['Photo, personal-detail, date, address and page-size expectations differ by country, sector and employer.', 'The linked Europass builder currently presents a professional photo as part of its guidance; applicants should verify whether that is appropriate for the destination rather than generalizing it across Europe.'],
    sources: [{ label: 'Europass — Create your Europass CV', url: 'https://europass.europa.eu/en/create-europass-cv', checkedAt }, { label: 'Europass — Information to include in a profile', url: 'https://europass.europa.eu/en/what-type-information-should-i-include-my-europass-profile', checkedAt }, { label: 'Europass — Protection of personal data', url: 'https://europass.europa.eu/en/about-europass/protection-your-personal-data', checkedAt }],
  },
];

export const formatBoundaries = [
  { title: 'A4 and Letter', body: 'ResumeStride can render both. No source above establishes a universal country rule, so follow the employer or portal and inspect pagination in the selected size.' },
  { title: 'Dates, addresses and phone numbers', body: 'Keep the applicant’s intended meaning and use a format the recipient can understand. Include an international calling code for cross-border use when appropriate; no automatic locale rewrite is performed.' },
  { title: 'Writing direction', body: 'ResumeStride supports left-to-right and right-to-left document direction. Direction follows the language and content—not a guessed country or IP address—and still requires human review.' },
  { title: 'Credentials', body: 'Use the credential’s official name, awarding body and jurisdiction. Do not translate it into an “equivalent” qualification unless an authoritative evaluator or regulator has done so.' },
  { title: 'Privacy', body: 'Minimize personal information. Never add identity numbers, banking data or protected characteristics just because an unsourced example contains them.' },
] as const;
