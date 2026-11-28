// Ruling 1248 A(1): the proof run, a filtered split with no base. Its cells are judged pairwise on its own filtered
// runs alone, never combined over a base: the manifest, the coverage and the missing proof cover exactly its cells, so
// the matrix's other cells never read as missing, and the report's heading says it is a proof run. Judged here on
// 46052931439's committed run jobs (filtered reruns of sitting C), whose filter holds three of #587's seven cells.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from '../../scripts/native-matrix.mjs';
import {judge, readResults} from '../../scripts/native-matrix/summary.mjs';

const JOBS = ['1-1', '2-1', '3-1'].map(n => `docs/evidence/2026-11-27-m5-sitting-c-split/jobs/m5-sitting-c-run-${n}/sitting`);
const PROOF = ['textedit/concurrent.sheet@electron', 'openPanel/background/getAXState.panel@finder', 'openPanel/background/click.cancel@finder'];
const KEYS = ['concurrent textedit/concurrent.sheet@electron', 'method openPanel/background/getAXState.panel@finder', 'method openPanel/background/click.cancel@finder'];

test('the proof form judges its cells alone on the filtered runs, and its heading says it is a proof run with no base', async () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'proof-run-'));
  try {
    const logs = [], out = join(dir, 'comparison.md');
    const code = await main(['compare', ...JOBS, '--proof', PROOF.join(','), '--out', out], {log: line => logs.push(line)});
    const text = fs.readFileSync(out, 'utf8');
    assert.match(text, /^# Native matrix summary \(proof run: 3 cells, no base\)$/m);
    assert.match(text, /^Proof runs \(filtered, judged alone, ruling 1248\): 3 vendor, 3 cua/m);
    // The two openPanel cells equal on every run; the sheet variant's samples all invalid in those records.
    const missing = logs.filter(l => l.startsWith('  missing: ')).map(l => l.slice('  missing: '.length));
    assert.deepEqual(missing, ['concurrent use: textedit/concurrent.sheet@electron has no valid cua sample', '1 cell(s) do not qualify: fewer than 3 complete run pairs (NO VERDICT by cell)'], logs.join('\n'));
    assert.deepEqual(logs.filter(l => l.startsWith('  blocking: ')), []);
    // A departure declared for a cell outside the proof is none of its business: no owner line asks to remove it.
    assert.deepEqual(logs.filter(l => l.startsWith('  owner: ')), []);
    assert.equal(logs.find(l => l.startsWith('VERDICT: ')), 'VERDICT: NO VERDICT');
    assert.equal(code, 4);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('the proof judgment: its cells and nothing else, no other cell, finding element or other record counted', () => {
  const {results, problems} = readResults(JOBS.map(d => join(process.cwd(), d)));
  const j = judge(results, problems, {proof: PROOF});
  assert.deepEqual(j.cells.map(c => `${c.section} ${c.id}`).sort(), [...KEYS].sort());
  assert.deepEqual(j.cells.filter(c => c.section === 'method').map(c => [c.id, c.verdict, c.qualifies]).sort(),
    [['openPanel/background/click.cancel@finder', 'equal', true], ['openPanel/background/getAXState.panel@finder', 'equal', true]]);
  assert.deepEqual(j.proof, {cells: 3});
  assert.deepEqual([j.runs, j.others], [{vendor: 3, cua: 3}, []]);
  assert.ok(!j.missing.some(m => /manifest missing|finding elements|full matrix run/.test(m)), j.missing.join('\n'));
  assert.equal(j.findingVerdict, 'not in the proof');
  assert.deepEqual(j.options, [], 'the owner options are other cells\' runs');
  // The save-sheet and speed-extra records the jobs also hold are listed, never counted.
  assert.ok(j.narrowed.some(n => n.cell === 'intervention-save-sheet') && j.narrowed.some(n => n.cell === 'speed-extra'), JSON.stringify(j.narrowed));
  // A proof cell the runs' filter does not hold: its rows absent from each run's manifest, missing proof by name.
  const wider = judge(results, problems, {proof: [...PROOF, 'finder/frontmost/typeText.typeSelect']});
  assert.ok(wider.missing.some(m => /row\(s\) of the manifest missing \(method finder\/frontmost\/typeText\.typeSelect#\d\)/.test(m)), wider.missing.join('\n'));
  // Without the proof form the same records hold no full run: nothing of them is judged.
  assert.equal(judge(results, problems).runs.cua, 0);
});
