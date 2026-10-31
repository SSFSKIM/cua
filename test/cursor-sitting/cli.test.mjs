// The sitting's CLI over recorded evidence (scripts/cursor-sitting.mjs judge, verdict, summary), on a scratch directory.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from '../../scripts/cursor-sitting.mjs';

const scratch = t => { const dir = mkdtempSync(join(tmpdir(), 'cua-235-cli-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; };
const quietly = async run => { const write = process.stdout.write; process.stdout.write = () => true; try { return await run(); } finally { process.stdout.write = write; } };
const jsonl = rows => rows.map(r => JSON.stringify(r)).join('\n') + '\n';

// Item 12's rows as the runner records them: a first attempt that failed, then a full one.
function typingRows() {
  const rows = [{kind: 'start'}, {kind: 'cell', ok: false, sample: {side: 'on', i: 0}, error: 'not sent'}, {kind: 'start'}];
  for (let i = 0; i < 20; i++) for (const side of ['on', 'off'])
    rows.push({kind: 'cell', ok: true, sample: {side, i}, value: {type_text: 200 + (i % 4) + (side === 'on' ? 0.2 : 0), press_key: 90 + (i % 3)}});
  return rows;
}

test('judge reads the last attempt of each timing item and writes timing.md', async t => {
  const out = scratch(t);
  writeFileSync(join(out, 'item-12.jsonl'), jsonl(typingRows()));
  const code = await quietly(() => main(['judge', '--out', out]));
  const md = readFileSync(join(out, 'timing.md'), 'utf8');
  assert.match(md, /## Acceptance 12 \(typing\): PASS/);
  assert.match(md, /\| type_text \| 20 \/ 20 \|/);
  assert.doesNotMatch(md, /failed and are not in the samples/, 'the failed first attempt is not counted');
  assert.equal(code, 0);
});

test('a timing item that is missing a series fails the judgement', async t => {
  const out = scratch(t);
  writeFileSync(join(out, 'item-13.jsonl'), jsonl([{kind: 'start'}, ...Array.from({length: 20}, (_, i) => ({kind: 'cell', ok: true, route: '3', sample: {side: 'on', i, series: 'element click'}, value: {ms: 40}}))]));
  assert.equal(await quietly(() => main(['judge', '--out', out])), 1);
  assert.match(readFileSync(join(out, 'timing.md'), 'utf8'), /route 3 × 20/);
});

test('verdicts are appended and the summary lists each watch with its verdict, or none', async t => {
  const out = scratch(t);
  writeFileSync(join(out, 'item-3.jsonl'), jsonl([{kind: 'start'}, {kind: 'cell', ok: true, session: 'a', label: 'a click'},
    {kind: 'watch', id: 'fade', text: 'it fades'}, {kind: 'watch', id: 'thinking', text: 'it rocks'}, {kind: 'task', task: 'activate', result: {ok: false}}]));
  assert.equal(await main(['verdict', '3', 'fade', 'pass', 'about', '0.4', 's', '--out', out]), 0);
  await assert.rejects(main(['verdict', '3', 'fade', 'maybe', '--out', out]), /pass\|fail/);
  await quietly(() => main(['summary', '--out', out]));
  const md = readFileSync(join(out, 'summary.md'), 'utf8');
  assert.match(md, /watch `fade`: it fades — \*\*pass\*\* \(about 0.4 s\)/);
  assert.match(md, /watch `thinking`: it rocks — \*\*no verdict recorded\*\*/);
  assert.match(md, /1 task\(s\), 1 failed/);
});

test('save and restore take an explicit home only', async () => {
  await assert.rejects(main(['save', '--to', '/tmp/x']), /--home <absolute path> is required/);
  await assert.rejects(main(['restore', '--home', 'relative', '--from', '/a', '--aside', '/b']), /--home <absolute path> is required/);
});
