// #187's judge replay (scripts/cursor-sitting/isolate-replay.mjs, the plan's section D): it runs over the second
// re-slot's records with every case as expected, the committed item-187-isolate-replay.md is what it writes now, every
// predicate comes out more than one way, and an outcome that differs from its expected one fails it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from '../../scripts/cursor-sitting.mjs';
import {realRecords, REPLAY_FILE, replayCases, replayMarkdown} from '../../scripts/cursor-sitting/isolate-replay.mjs';

const quietly = async run => { const write = process.stdout.write; let text = ''; process.stdout.write = chunk => { text += chunk; return true; }; try { return {code: await run(), text}; } finally { process.stdout.write = write; } };

test('the replay over 11-05\'s records: every case as expected, each predicate both ways, the committed file current', async t => {
  const real = realRecords();
  assert.deepEqual([real.reps.after.length, real.reps.before.length, real.composing.length], [3, 3, 9]);
  assert.match(real.builds.after, /^1f73143d1fb0/);
  assert.match(real.builds.before, /^dd7a09235885/);
  const sections = replayCases(real), all = sections.flatMap(s => s.cases);
  assert.deepEqual(all.filter(c => !c.match).map(c => c.name), []);
  for (const s of sections) assert.ok(new Set(s.cases.map(c => c.expected.split(' (')[0])).size >= 2, `${s.predicate} comes out more than one way`);
  const cell = sections.find(s => s.predicate.startsWith('the cell\'s verdict')).cases.map(c => c.expected.split(' (')[0]);
  for (const v of ['LANDS', 'DOES NOT LAND', 'INCONCLUSIVE']) assert.ok(cell.includes(v), v);
  const outcome = name => all.find(c => c.name === name).outcome;
  const outcomes = sections.find(s => s.predicate.startsWith('the cell repetition\'s outcome')).cases;
  assert.deepEqual(outcomes.filter(c => /^11-05 BEFORE/.test(c.name)).map(c => c.outcome), Array(3).fill('stage unknown'), 'dd7a\'s legacy -10005 is never a read timeout');
  assert.deepEqual(outcomes.filter(c => /^11-05 AFTER/.test(c.name)).map(c => c.outcome), Array(3).fill('AFTER-passing'));
  assert.match(outcome('ruling 3 at a low count: 11-05, two BEFORE deliveries'), /^DOES NOT LAND: BEFORE delivered in 2 counted/);
  assert.match(outcome('ruling 2 at a low count: 11-05, one AFTER read timeout'), /^DOES NOT LAND: 1 read-stage timeout/);
  assert.equal(readFileSync(REPLAY_FILE, 'utf8'), `${replayMarkdown(real).text.replace(/\n+$/, '')}\n`, 'the committed replay is what the kit writes now (cursor-sitting.mjs isolate-187 replay)');
  const dir = mkdtempSync(join(tmpdir(), 'cua-187r-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const ran = await quietly(() => main(['isolate-187', 'replay', '--to', join(dir, 'replay.md')]));
  assert.equal(ran.code, 0);
  assert.match(ran.text, new RegExp(`the replay: ${all.length} cases, ${all.length} as expected`));
});

test('an outcome that is not its expected one fails the replay', () => {
  const real = realRecords();
  // AFTER's first repetition as if its frontmost paste had not delivered: the case expecting AFTER-passing now differs.
  const bent = {...real, reps: {...real.reps, after: real.reps.after.map((r, k) => (k ? r : {...r, row: {...r.row, delivered: false}}))}};
  const {mismatches, text} = replayMarkdown(bent);
  assert.ok(mismatches.some(m => m.name === '11-05 AFTER rep 1'));
  assert.match(text, /\| 11-05 AFTER rep 1 \| none \| AFTER-passing \| missed \| \*\*NO\*\* \|/);
  assert.match(text, /\d+ as expected, \d+ NOT/);
});
