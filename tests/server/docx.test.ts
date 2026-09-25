import test from 'node:test'
import assert from 'node:assert/strict'
import { createZip, readZip, zipBombLimitBytes } from '../../src/services/zip.ts'
import { resumeFromDocxImport, docxToResume } from '../../src/services/docx.ts'
import { renderDocx } from '../../server/export/docx.ts'
import { example, isResume } from '../../src/model.ts'

test('createZip/readZip round-trips arbitrary entries (STORE method)', async () => {
 const encoder = new TextEncoder()
 const blob = createZip([
  { name: 'a.txt', data: encoder.encode('hello world') },
  { name: 'dir/b.xml', data: encoder.encode('<x>y</x>') },
 ])
 const buffer = await blob.arrayBuffer()
 const files = await readZip(buffer)
 assert.equal(new TextDecoder().decode(files.get('a.txt')), 'hello world')
 assert.equal(new TextDecoder().decode(files.get('dir/b.xml')), '<x>y</x>')
})

test('readZip rejects a file with no valid end-of-central-directory record', async () => {
 const bogus = new TextEncoder().encode('not a zip file at all').buffer
 await assert.rejects(() => readZip(bogus), /not a valid Word document/)
})

test('readZip rejects a central directory pointing past the end of the buffer', async () => {
 const encoder = new TextEncoder()
 const blob = createZip([{ name: 'a.txt', data: encoder.encode('hi') }])
 const bytes = new Uint8Array(await blob.arrayBuffer())
 const truncated = bytes.slice(0, bytes.length - 5)
 await assert.rejects(() => readZip(truncated.buffer))
})

test('server renderDocx produces a real OOXML package readable by readZip', async () => {
 const resume = example()
 const bytes = await renderDocx(resume)
 const files = await readZip(bytes.buffer as ArrayBuffer)
 assert.ok(files.has('[Content_Types].xml'))
 assert.ok(files.has('_rels/.rels'))
 const documentXml = new TextDecoder().decode(files.get('word/document.xml'))
 assert.ok(documentXml.includes(resume.name))
 assert.ok(documentXml.includes(resume.headline))
 assert.ok(documentXml.includes(resume.email))
})

test('a resume exported to docx round-trips back into an equivalent, schema-valid Resume', async () => {
 const resume = example()
 const bytes = await renderDocx(resume)
 const files = await readZip(bytes.buffer as ArrayBuffer)
 const xml = new TextDecoder().decode(files.get('word/document.xml'))
 const restored = resumeFromDocxImport(xml)
 assert.ok(isResume(restored))
 assert.equal(restored.name, resume.name)
 assert.equal(restored.headline, resume.headline)
 assert.equal(restored.email, resume.email)
 assert.equal(restored.summary, resume.summary)
 assert.equal(restored.sections.length, resume.sections.length)
 assert.equal(restored.sections[0].title, resume.sections[0].title)
 assert.equal(restored.sections[0].entries[0].title, resume.sections[0].entries[0].title)
 assert.equal(restored.sections[0].entries[0].organization, resume.sections[0].entries[0].organization)
})

test('a Word document with no recognizable resume content is rejected', () => {
 assert.throws(() => resumeFromDocxImport('<w:document xmlns:w="x"><w:body></w:body></w:document>'), /No resume content/)
})

test('docxToResume tolerates a plain paragraph-only document (no bold/size formatting) by treating everything as name/headline/body', () => {
 const xml = `<w:document xmlns:w="x"><w:body>
  <w:p><w:r><w:t>Jordan Rivera</w:t></w:r></w:p>
  <w:p><w:r><w:t>jordan@example.com</w:t></w:r></w:p>
 </w:body></w:document>`
 const { resume } = docxToResume(xml)
 assert.equal(resume.name, 'Jordan Rivera')
 assert.equal(resume.email, 'jordan@example.com')
})

test('Word paragraph properties do not leak into fields and section punctuation is recognized', () => {
 const xml = `<w:document xmlns:w="x"><w:body>
  <w:p><w:pPr><w:tabs><w:tab w:val="center" w:pos="7348"/></w:tabs></w:pPr><w:r><w:t>Jordan Rivera</w:t><w:br/><w:t>jordan@example.com</w:t></w:r></w:p>
  <w:p><w:r><w:t>+1 555 010 0200</w:t></w:r></w:p>
  <w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>SUMMARY:</w:t></w:r></w:p>
  <w:p><w:r><w:t>Full-stack engineer.</w:t></w:r></w:p>
  <w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>TECHNICAL SKILLS:</w:t></w:r></w:p>
  <w:p><w:r><w:t>Java, Spring, AWS</w:t></w:r></w:p>
 </w:body></w:document>`
 const restored = resumeFromDocxImport(xml)
 assert.equal(restored.name, 'Jordan Rivera')
 assert.equal(restored.email, 'jordan@example.com')
 assert.equal(restored.phone, '+1 555 010 0200')
 assert.equal(restored.location, '')
 assert.equal(restored.summary, 'Full-stack engineer.')
 assert.equal(restored.skills, 'Java, Spring, AWS')
 assert.doesNotMatch(JSON.stringify(restored), /w:tab|w:pPr|w:t/i)
})

test('Word import preserves summary bullets, skill table rows, and multiple experience entries', () => {
 const xml = `<w:document xmlns:w="x"><w:body>
  <w:p><w:r><w:t>Jordan Rivera</w:t></w:r></w:p>
  <w:p><w:r><w:t>jordan@example.com</w:t></w:r></w:p>
  <w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>SUMMARY</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>Builds reliable services.</w:t></w:r></w:p>
  <w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>TECHNICAL SKILLS</w:t></w:r></w:p>
  <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Languages</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Java, SQL</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
  <w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>PROFESSIONAL EXPERIENCE</w:t></w:r></w:p>
  <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Example Corporation, Toronto</w:t></w:r><w:r><w:t>  January 2022 - Present</w:t></w:r></w:p>
  <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Program Coordinator</w:t></w:r></w:p>
  <w:p><w:r><w:t>Coordinated weekly schedules. ● Improved handoffs.</w:t></w:r></w:p>
  <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Software Engineer  January 2020 - December 2021</w:t></w:r></w:p>
  <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Example Bank, Chicago, IL</w:t></w:r></w:p>
  <w:p><w:r><w:t>Built internal tools.</w:t></w:r></w:p>
 </w:body></w:document>`
 const restored = resumeFromDocxImport(xml)
 assert.equal(restored.summary, '• Builds reliable services.')
 assert.equal(restored.skills, 'Languages: Java, SQL')
 assert.equal(restored.sections[0].entries.length, 2)
 assert.deepEqual(restored.sections[0].entries.map(item => [item.title,item.organization,item.dates]), [
  ['Program Coordinator','Example Corporation','January 2022 - Present'],
  ['Software Engineer','Example Bank','January 2020 - December 2021'],
 ])
 assert.deepEqual(restored.sections[0].entries.map(item => item.location), ['Toronto','Chicago, IL'])
 assert.equal(restored.sections[0].entries[0].description, 'Coordinated weekly schedules.\nImproved handoffs.')
})

test('zipBombLimitBytes caps decompressed content instead of allowing unbounded expansion', () => {
 assert.ok(zipBombLimitBytes > 0 && zipBombLimitBytes < 100_000_000)
})
