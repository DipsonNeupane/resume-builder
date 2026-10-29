import test from 'node:test'
import assert from 'node:assert/strict'
import { CsvError, applicationsToCsv, csvCell, guessMapping, mapRows, parseCsv } from '../../src/lib/applicationCsv.ts'
import { parseApplicationInput, type ApplicationRecord } from '../../src/lib/applications.ts'

test('parses quoted cells, doubled quotes, CRLF and a BOM', () => {
  const rows = parseCsv('﻿Company,Role,Notes\r\n"Example, Inc.",Analyst,"Said ""great"" chat"\r\nBeta,Designer,"line one\nline two"\n')
  assert.deepEqual(rows, [['Company', 'Role', 'Notes'], ['Example, Inc.', 'Analyst', 'Said "great" chat'], ['Beta', 'Designer', 'line one\nline two']])
})

test('rejects unbounded or malformed files', () => {
  assert.throws(() => parseCsv('a,"b'), CsvError)
  assert.throws(() => parseCsv(['h', ...Array.from({ length: 201 }, () => 'x')].join('\n')), /at most 200/)
  assert.throws(() => parseCsv('x'.repeat(1_000_001)), /1 MB/)
})

test('maps common spreadsheet headers and keeps no-response separate from rejected', () => {
  const rows = parseCsv('Company,Job Title,Status,Date Applied,Follow-up date\nAcme,Analyst,No response,2026-09-01,\nBeta,Designer,Rejected,2026-09-03,\nGamma,Writer,Interview,,2026-11-02T15:00:00Z\nDelta,Nurse,Phone screen?,,')
  const mapping = guessMapping(rows[0])
  assert.deepEqual(mapping, { company: 0, title: 1, stage: 2, appliedOn: 3, nextActionDue: 4 })
  const mapped = mapRows(rows, mapping)
  assert.deepEqual(mapped.map(item => [item.stage, item.closedReason]), [['closed', 'no_response'], ['closed', 'rejected'], ['interviewing', undefined], ['phone screen?', undefined]])
  assert.equal(mapped[2].nextAction, 'Follow up')
  assert.equal(parseApplicationInput(mapped[0]).closedReason, 'no_response')
  assert.throws(() => parseApplicationInput(mapped[3]), /Choose a stage/, 'unknown stage words become a row error, not a guess')
})

test('export escapes formula injection and contains only plain user data', () => {
  for (const value of ['=HYPERLINK("x")', '+1', '-2', '@SUM(A1)', '\tx', '\rx']) assert.ok(csvCell(value).replace(/^"/, '').startsWith("'"), value)
  assert.equal(csvCell('Plain, text'), '"Plain, text"')
  const application: ApplicationRecord = { savedJobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', stage: 'closed', closedReason: 'no_response', priorStage: 'applied', appliedOn: '2026-09-01',
    nextAction: '', nextActionDue: null, notes: '=cmd|calc', contactName: '', contactDetails: '', origin: 'import', revision: 2,
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', events: [], documents: [] }
  const csv = applicationsToCsv([{ company: '@Acme', title: 'Analyst', sourceUrl: null, location: '', application }])
  assert.match(csv, /'@Acme/)
  assert.match(csv, /'=cmd\|calc/)
  assert.match(csv, /No response/)
  assert.doesNotMatch(csv, /aaaaaaaa-aaaa/, 'internal identifiers are not exported')
  const reparsed = parseCsv(csv)
  assert.equal(reparsed[1][0], "'@Acme")
})
