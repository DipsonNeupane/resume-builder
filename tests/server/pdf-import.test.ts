import test from 'node:test';
import assert from 'node:assert/strict';
import { isResume } from '../../src/model.ts';
import { pdfImportError, resumeFromPdfText } from '../../src/services/pdfImport.ts';

test('text extracted from a PDF maps conservatively into a valid Resume', () => {
 const resume = resumeFromPdfText([
  { text: 'Jordan Rivera', fontSize: 20 },
  { text: 'Operations Coordinator', fontSize: 13 },
  { text: 'jordan@example.com  +1 555 010 2000  Toronto, Canada', fontSize: 10 },
  { text: 'SUMMARY', fontSize: 14 },
  { text: 'Coordinates accessible community programs.', fontSize: 10 },
  { text: 'EXPERIENCE', fontSize: 14 },
  { text: 'Program Coordinator — Example Cooperative', fontSize: 11 },
  { text: 'Organized weekly volunteer schedules.', fontSize: 10 },
  { text: 'SKILLS', fontSize: 14 },
  { text: 'Scheduling, facilitation, English, French', fontSize: 10 },
 ]);
 assert.ok(isResume(resume));
 assert.equal(resume.name, 'Jordan Rivera');
 assert.equal(resume.headline, 'Operations Coordinator');
 assert.equal(resume.email, 'jordan@example.com');
 assert.equal(resume.summary, 'Coordinates accessible community programs.');
 assert.equal(resume.skills, 'Scheduling, facilitation, English, French');
 assert.equal(resume.sections[0].entries[0].title, 'Program Coordinator');
 assert.equal(resume.sections[0].entries[0].organization, 'Example Cooperative');
 assert.equal(resume.sections[0].entries[0].description, 'Organized weekly volunteer schedules.');
});

test('ambiguous PDF section text is retained without inventing structured facts', () => {
 const resume = resumeFromPdfText([
  { text: 'Sam Lee' },
  { text: 'Designer' },
  { text: 'PROJECTS' },
  { text: 'A community wayfinding project completed with local residents.' },
 ]);
 assert.equal(resume.sections[0].entries[0].title, '');
 assert.equal(resume.sections[0].entries[0].organization, '');
 assert.equal(resume.sections[0].entries[0].dates, '');
 assert.equal(resume.sections[0].entries[0].description, 'A community wayfinding project completed with local residents.');
});

test('PDF work history keeps multiple company/date and role/date entries separate', () => {
 const resume = resumeFromPdfText([
  { text: 'Jordan Rivera', fontSize: 20 },
  { text: 'Engineer', fontSize: 13 },
  { text: 'jordan@example.com', fontSize: 10 },
  { text: 'EXPERIENCE', fontSize: 14 },
  { text: 'Example Corporation, Toronto  January 2022 - Present', fontSize: 11 },
  { text: 'Program Coordinator', fontSize: 11 },
  { text: 'Coordinated weekly schedules.', fontSize: 10 },
  { text: 'Software Engineer  January 2020 - December 2021', fontSize: 11 },
  { text: 'Example Bank, Chicago, IL', fontSize: 11 },
  { text: 'Built internal tools.', fontSize: 10 },
 ]);
 assert.deepEqual(resume.sections[0].entries.map(item => [item.title,item.organization,item.dates]), [
  ['Program Coordinator','Example Corporation','January 2022 - Present'],
  ['Software Engineer','Example Bank','January 2020 - December 2021'],
 ]);
 assert.deepEqual(resume.sections[0].entries.map(item => item.location), ['Toronto','Chicago, IL']);
});

test('a PDF with no selectable text is rejected as scanned or image-only', () => {
 assert.throws(() => resumeFromPdfText([]), /scanned or image-only/i);
});

test('encrypted and malformed PDF failures have distinct truthful messages', () => {
 const encrypted = new Error('No password given');
 encrypted.name = 'PasswordException';
 assert.match(pdfImportError(encrypted).message, /encrypted or password-protected/i);
 assert.match(pdfImportError(new Error('bad xref')).message, /damaged or not be a valid PDF/i);
});
