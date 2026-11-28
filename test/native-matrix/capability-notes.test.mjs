// The flip report's known capability differences that no matrix cell exercises (the coordinator's #597, ruling 1247):
// report text only, kept beside departures.json and never in it, so nothing reads it as a declaration. The report
// renders it under "What changes for a user"; the judge never reads it, so no verdict, list or rejudge comparison moves.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {readCapabilityNotes} from '../../scripts/native-matrix/capability-notes.mjs';
import {readDepartures} from '../../scripts/native-matrix/departures.mjs';
import {judge, renderSummary} from '../../scripts/native-matrix/summary.mjs';

test('#597 is a report-only capability note: rendered under What changes for a user, never a departure', () => {
  const notes = readCapabilityNotes();
  assert.deepEqual(notes.map(n => [n.ticket, n.priority, n.status, n.ruling]), [['#597', 'P3', 'deferred', '1247']]);
  assert.ok(!readDepartures().some(d => JSON.stringify(d).includes('#597')), 'never in the declarations');
  const text = renderSummary(judge([], [])).split('\n');
  const section = text.slice(text.indexOf('## What changes for a user'));
  const line = section.find(l => l.includes('#597'));
  assert.equal(line, '- type_text with no focused element: cua answers typeUnconfirmed (noFocusedElement) where the vendor answers ok: cua does not vouch for typing it cannot place (#597, P3, deferred; ruling 1247). No matrix cell exercises it: report text, never judged.');
  assert.ok(section.indexOf(line) < section.findIndex((l, i) => i > 0 && l.startsWith('## ')), 'inside the section');
});

test('the note reaches no verdict: the judge never reads it, and the judgment is the same without it', () => {
  const j = judge([], []);
  assert.doesNotMatch(JSON.stringify(j), /597/);
  assert.equal(j.verdict, 'NO VERDICT');
  const without = renderSummary(j, {notes: []}), with_ = renderSummary(j);
  const block = /Known capability differences no matrix cell exercises \(report text, never judged\):\n\n- [^\n]*#597[^\n]*\n\n/;
  assert.match(with_, block);
  assert.equal(with_.replace(block, ''), without, 'the note\'s lines are the only difference');
  assert.ok(fs.readFileSync(new URL('../../scripts/native-matrix/summary.mjs', import.meta.url), 'utf8').split('export function judge(')[1].split('\nexport function ')[0].indexOf('readCapabilityNotes') < 0, 'judge() reads no note');
});
