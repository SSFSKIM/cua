// A `:0` step's sitting (#171 M5, T4's second round): the printed command's outer launcher (sitting.mjs) makes the end
// check and the all-clear wherever the step ends (review finding 3), and draws the unclean-end rule by who can see it
// (ruling 730, part (b)). Anything the person can see or feel on :0 (a window of the run's left, a held key or button, a
// grab a leftover process could still hold, the pointer not put back, a change to a window the harness did not open, a
// reach into the person's session) fails the sitting's all-clear and writes hold-sittings with the reason, which every
// :0 launch then refuses on; only the controller or the design session removes it. The run's own side is unclean only.
// Headless: the sitting's records and :0's reads are the test's own; nothing reaches a display.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { judgeSitting, runSitting } from '../../scripts/linux-engine-gate/sitting.mjs';
import { launchCommand, parseGateArgs } from '../../scripts/linux-engine-gate/gate.mjs';
import { stepNamed } from '../../scripts/linux-engine-gate/steps.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'cua171-sitting-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const fresh = (name) => {
  const dir = join(scratch, `${name}-${n++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

/** A sitting's records as run71.sh and wrap71.py leave them after a clean step. */
function sittingDir(over = {}) {
  const dir = fresh('V3');
  const o = { wrap: { flags: [], decoy_connections: [], leftovers: [] }, pointer: 'pointer at start 142 130\npointer restored to 142 130, reads 142 130 \n', end: { kind: 'end', valid: true, pass: true, failed: [], desktop: {} }, ...over };
  if (o.wrap) writeFileSync(join(dir, 'wrap-summary.json'), JSON.stringify(o.wrap));
  if (o.pointer) writeFileSync(join(dir, 'pointer.txt'), o.pointer);
  if (o.end) {
    mkdirSync(join(dir, 'run'), { recursive: true });
    writeFileSync(join(dir, 'run', 'results.jsonl'), `${JSON.stringify({ run: 'r', kind: 'meta' })}\n${JSON.stringify(o.end)}\n`);
  }
  if (o.ownerChanged) writeFileSync(join(dir, 'owner-changed'), 'x\n');
  return dir;
}
const quiet = { keysDown: () => [], buttonsDown: () => [], windowsLeft: () => 0 };
const silent = { write() {} };

test("a clean sitting is all-clear; the run's own leftovers make it unclean, never not clear", () => {
  assert.deepEqual(judgeSitting(sittingDir(), quiet), { clear: true, person: [], run: [] });
  const own = judgeSitting(sittingDir({ end: { kind: 'end', valid: true, pass: true, failed: [], desktop: { unclean: ['its Chrome left 1 process running'] } } }), quiet);
  assert.deepEqual(own, { clear: true, person: [], run: ['its Chrome left 1 process running'] });
});

test('each thing the person can see or feel fails the all-clear, by the guard that sees it', () => {
  const cases = [
    ['a window of the run left on :0 (the read after the sitting)', sittingDir(), { ...quiet, windowsLeft: () => 2 }, /2 windows of the run's are still on :0/],
    ['a held key (the keymap read after the sitting)', sittingDir(), { ...quiet, keysDown: () => [50] }, /keys still held on :0: 50/],
    ['a held button', sittingDir(), { ...quiet, buttonsDown: () => [1] }, /buttons still held on :0: 1/],
    ['a grab a leftover process could still hold (wrap71\'s leftovers)', sittingDir({ wrap: { flags: [], decoy_connections: [], leftovers: [{ pid: 9, comm: 'cua-engine', argv: [] }] } }), quiet, /processes of the run still alive after it, which can hold a grab or a window on :0: 9 cua-engine/],
    ['the pointer not put back', sittingDir({ pointer: 'pointer at start 142 130\npointer restored to 142 130, reads 300 40 \n' }), quiet, /the pointer was not put back: it reads 300 40, not 142 130/],
    ['the pointer restore unrecorded', sittingDir({ pointer: 'pointer at start 142 130\n' }), quiet, /the pointer's restore was not recorded/],
    ['a request changing a window the harness did not open (the audit)', sittingDir({ end: { kind: 'end', valid: true, pass: false, failed: ['a window the harness did not open was changed: the harness: 0x00a00003 ConfigureWindow (raised)'], desktop: {} } }), quiet, /a window the harness did not open was changed: the harness: 0x00a00003/],
    ['the owner\'s side changed (owner-watch)', sittingDir({ ownerChanged: true }), quiet, /owner-watch saw the person's side change/],
    ['a reach into the person\'s session (wrap71\'s flags)', sittingDir({ wrap: { flags: [{ kind: 'forbidden-path' }], decoy_connections: [{ decoy: 'session' }], leftovers: [] } }), quiet, /wrap71 flagged 1 reach into the person's session and 1 decoy connection/],
    ['no guard record (fail closed)', sittingDir({ wrap: null }), quiet, /wrap71's summary is missing/],
    ['a read of :0 that failed (fail closed)', sittingDir(), { ...quiet, keysDown: () => { throw new Error('timeout'); } }, /the held keys could not be read: timeout/],
  ];
  for (const [what, dir, reads, pattern] of cases) {
    const v = judgeSitting(dir, reads);
    assert.equal(v.clear, false, what);
    assert.match(v.person.join('; '), pattern, what);
  }
});

test('the printed :0 command runs under the sitting launcher, which refuses while hold-sittings exists', () => {
  const a = parseGateArgs(['print', 'V3', '--pinned', '/runs/home', '--out', '/gate', '--pilot', '1'], { arch: 'x64', env: {} });
  const command = launchCommand(stepNamed('V3'), a, '/checkout');
  assert.match(command, /locked\.sh m5-gate \S+ \/checkout\/scripts\/linux-engine-gate\/sitting\.mjs --dir \/gate\/V3\.development-run\.pinned\.pilot --hold \S+\/hold-sittings --terminal end -- env WRAP=\S+\/wrap71\.py \S+\/run71\.sh \/gate\/V3\.development-run\.pinned\.pilot \/checkout /);
});

test("the sitting launcher keeps the child's exit, records the end check and the all-clear however the step ended, and holds :0 on what the person can see", async () => {
  const hold = join(fresh('hold'), 'hold-sittings');
  const root = fresh('tmp');
  const leftovers = { roots: [root], proc: fresh('proc') };
  // a step that ended unsuccessfully, killed past its cleanup, its scratch left and a key held
  const dir = sittingDir();
  const killed = await runSitting({ dir, hold, command: ['sh', '-c', `mkdir ${root}/cua171-run-Left01; kill -KILL $$`], reads: { ...quiet, keysDown: () => [37] }, leftovers, out: silent });
  assert.equal(killed, 137, "the child's own status, 128 + SIGKILL");
  const record = JSON.parse(readFileSync(join(dir, 'all-clear.json'), 'utf8'));
  assert.equal(record.clear, false);
  assert.equal(record.exit, 137);
  assert.deepEqual(record.person, ['keys still held on :0: 37']);
  assert.deepEqual(record.run, [`its scratch left behind: ${root}/cua171-run-Left01`]);
  assert.deepEqual(record.end_check.left_by_step.map((d) => d.dir), [`${root}/cua171-run-Left01`]);
  assert.match(readFileSync(hold, 'utf8'), /the :0 sitting .*V3.* is not all-clear: keys still held on :0: 37/);
  // every later :0 launch refuses while it is there, starting nothing
  const later = sittingDir();
  const marker = join(later, 'ran');
  assert.equal(await runSitting({ dir: later, hold, command: ['touch', marker], reads: quiet, leftovers, out: silent }), 5);
  assert.equal(existsSync(marker), false);
  // a clean sitting: exit 0 kept, all-clear, no hold written
  rmSync(`${root}/cua171-run-Left01`, { recursive: true });
  const hold2 = join(fresh('hold'), 'hold-sittings');
  const ok = sittingDir();
  assert.equal(await runSitting({ dir: ok, hold: hold2, command: ['true'], reads: quiet, leftovers, out: silent }), 0);
  assert.equal(JSON.parse(readFileSync(join(ok, 'all-clear.json'), 'utf8')).clear, true);
  assert.match(readFileSync(join(ok, 'all-clear.txt'), 'utf8'), /^all-clear: clear/);
  assert.equal(existsSync(hold2), false);
  // a failing step whose person's side is clean: its exit kept, all-clear, unclean only on its own side
  const failed = sittingDir();
  assert.equal(await runSitting({ dir: failed, hold: hold2, command: ['sh', '-c', 'exit 3'], reads: quiet, leftovers, out: silent }), 3);
  assert.equal(existsSync(hold2), false);
});
