// Task 103, ruling 834's proof part 1: with the switch off (every counted run), engine.mjs at the head starts every
// engine with the argv today's engine.mjs gives it, and hands its runner the same parsed stream, byte for byte.
// Both Engine classes drive the same deterministic stand-in engine through the same requests; the head runs with
// the run's record on (recordEngines, as the harness's entry point makes it), the opt-in off.
//
//   node byte-identity.mjs <base harness dir> <head harness dir> <scratch dir>

import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const here = import.meta.dirname;
const baseDir = join(here, 'base/scripts/linux-engine-diff');
const headDir = resolve(process.env.HEAD_HARNESS);
const scratch = join(here, 'scratch');
mkdirSync(scratch, { recursive: true });

// the stand-in: argv logged; a log line on stderr per request; under --stats an untied line before request 2's
// answer, an unparsable line for request 3, and each request's line with drop_settles after its answer
const FAKE = `#!${process.execPath}
const { appendFileSync } = require('node:fs');
const { createInterface } = require('node:readline');
const args = process.argv.slice(2);
appendFileSync(process.env.ARGV_LOG, JSON.stringify(args) + '\\n');
const stats = args.includes('--stats');
createInterface({ input: process.stdin }).on('line', (line) => {
  const { id, command } = JSON.parse(line);
  process.stderr.write('log: request ' + id + '\\n');
  if (stats && id === 2) process.stderr.write(JSON.stringify({ stats: { id: null, focus_out: [{ window: 7 }] } }) + '\\n');
  process.stdout.write(JSON.stringify({ id, ok: id !== 4, ...(id === 4 ? { error: 'refused' } : { output: { command, id } }) }) + '\\n');
  if (stats) process.stderr.write(id === 3 ? '{"stats": {"id": 3, "tree": \\n' : JSON.stringify({ stats: { id, command, drop_settles: { entered: 0, second_rest: 0, skipped: 0, unsettled: 0 } } }) + '\\n');
});
`;
const bin = join(scratch, 'stand-in.cjs');
writeFileSync(bin, FAKE);
chmodSync(bin, 0o700);

const LANES = [
  { label: 'cua', args: [] },
  { label: 'cua:0ms', args: ['--drag-step-ms', '0', '--drag-press-dwell-ms', '0', '--drag-release-dwell-ms', '0'] },
  { label: 'cua', args: [], stats: true },
  { label: 'pinned', args: [] },
];

async function drive(dir, side, { record }) {
  const { Engine, recordEngines } = await import(join(dir, 'engine.mjs'));
  process.env.ARGV_LOG = join(scratch, `${side}.argv.jsonl`);
  writeFileSync(process.env.ARGV_LOG, '');
  const finish = record ? recordEngines({ out: join(scratch, `${side}-out`), run: 'proof', vendors: [], optIn: false }) : () => {};
  const stream = [];
  for (const lane of LANES) {
    const engine = new Engine({ label: lane.label, bin, args: lane.args, stats: lane.stats ?? false }).start();
    for (const command of ['drag', 'get_window_state', 'drag_handle', 'click']) {
      const { ms, sinceSpawnMs, ...answer } = await engine.request(command, {});
      stream.push({ lane: lane.label, ...answer });
    }
    const { ms, ...piped } = await engine.pipeline([{ command: 'press_key', input: {} }, { command: 'press_key', input: {} }]);
    stream.push({ lane: lane.label, piped });
    await engine.close();
    stream.push({ lane: lane.label, stderrTail: engine.stderrTail });
  }
  finish();
  return { argv: readFileSync(process.env.ARGV_LOG, 'utf8'), stream: `${JSON.stringify(stream)}\n` };
}

const sha = (text) => createHash('sha256').update(text).digest('hex');
const base = await drive(baseDir, 'base', { record: false });
const head = await drive(headDir, 'head', { record: true });
for (const [name, text] of Object.entries({ 'base.argv': base.argv, 'head.argv': head.argv, 'base.stream': base.stream, 'head.stream': head.stream })) {
  writeFileSync(join(scratch, name), text);
}
console.log(`argv:   base ${sha(base.argv)}  head ${sha(head.argv)}  ${base.argv === head.argv ? 'IDENTICAL' : 'DIFFERENT'}`);
console.log(`stream: base ${sha(base.stream)}  head ${sha(head.stream)}  ${base.stream === head.stream ? 'IDENTICAL' : 'DIFFERENT'}`);
console.log('argv per engine (head):');
process.stdout.write(head.argv);
process.exit(base.argv === head.argv && base.stream === head.stream ? 0 : 1);
