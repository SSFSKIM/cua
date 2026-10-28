// Regression tests for the M0 branch review's harness defects: the terminal recorder's shell command, unknown or
// empty operation plans, effect targets of every engine's window, and terminal text decoding.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { readText, terminalLaunch } from '../../scripts/linux-engine-diff/families.mjs';
import { matrixOutcome } from '../../scripts/linux-engine-diff/matrix-judge.mjs';
import { planOps } from '../../scripts/linux-engine-diff/run.mjs';

test('the terminal recorder takes its file as an argument, so a run label never reaches the shell as code', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-review-'));
  try {
    const label = 'cua171-diff-$(touch PWNED1)-`touch PWNED2`-"q\'';
    const spec = terminalLaunch({ dir, label }, []);
    const at = spec.args.indexOf('-c');
    const [script, name, path] = spec.args.slice(at + 1);
    assert.equal(path, spec.record);
    assert.equal(name, 'sh');
    assert.ok(!script.includes(label) && !script.includes(dir), 'the script names neither the label nor the path');
    // the recorder itself, without the terminal: it appends what it reads to "$1" and runs nothing from the label
    execFileSync('sh', ['-c', script, name, path], { cwd: dir, input: 'abc', stdio: ['pipe', 'ignore', 'ignore'] });
    assert.equal(readFileSync(spec.record, 'utf8'), 'abc');
    assert.ok(!existsSync(join(dir, 'PWNED1')) && !existsSync(join(dir, 'PWNED2')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unknown operation, a scene with nothing planned and an empty plan are refused', () => {
  assert.deepEqual(planOps(['gedit'], ['tree', 'press_key']), [{ scene: 'gedit', op: 'tree' }, { scene: 'gedit', op: 'press_key' }]);
  assert.throws(() => planOps(['gedit'], ['press_keys']), /unknown operation press_keys/);
  assert.throws(() => planOps(['gedit'], ['tree', 'scroll']), /unknown operation scroll/);
  assert.throws(() => planOps(['over-budget'], ['press_key']), /over-budget has none of the operations/);
  assert.throws(() => planOps(['gedit', 'over-budget'], ['press_key']), /over-budget has none of the operations/);
  assert.throws(() => planOps([], ['tree']), /nothing to run/);
  assert.deepEqual(planOps([], ['list_windows']), [{ scene: 'desktop', op: 'list_windows' }]);
  assert.ok(planOps(['gedit', 'over-budget'], 'all').length > 0);
});

const id = (family, kindOf, targets) => ({ kind: 'matrix-identity', family, kindOf, targets: targets.cua, targets_by_engine: targets });
const sample = (family, engine, op, effect, ok = true, extra = {}) => ({ kind: 'matrix-sample', family, engine, op, ok, effect, ...extra });

test('every engine\'s window must have its effect targets, and a page needs its button too', () => {
  const all = { field: true, button: true, document: false };
  const noField = { field: false, button: true, document: false };
  const ok = id('gedit', 'editor', { pinned: all, newest: all, cua: all, 'cua:none': all });
  assert.deepEqual(matrixOutcome([ok], ['gedit']), { complete: true, failed: [] });
  const vendorMissing = id('gedit', 'editor', { pinned: noField, newest: all, cua: all, 'cua:none': all });
  assert.deepEqual(matrixOutcome([vendorMissing], ['gedit']), { complete: false, failed: ['gedit: the pinned window\'s field was not found'] });
  const noButton = id('firefox', 'page', { pinned: { field: true, button: false }, newest: all, cua: all, 'cua:none': all });
  assert.deepEqual(matrixOutcome([noButton], ['firefox']), { complete: false, failed: ['firefox: the pinned window\'s button was not found'] });
});

test('an effect that could not be read where it should have been is not a fully judged run', () => {
  const all = { field: true, button: true, document: true };
  const targets = { pinned: all, newest: all, cua: all, 'cua:none': all };
  const unread = [id('gedit', 'editor', targets), sample('gedit', 'pinned', 'key', null), sample('gedit', 'cua', 'key', true)];
  assert.deepEqual(matrixOutcome(unread, ['gedit']), { complete: false, failed: ['gedit: 1 effect could not be read (pinned key)'] });
  // a request the engine refused was not read back, by design; a type_text is read back whatever the answer
  assert.deepEqual(matrixOutcome([id('gedit', 'editor', targets), sample('gedit', 'pinned', 'key', null, false)], ['gedit']).complete, true);
  assert.deepEqual(matrixOutcome([id('gedit', 'editor', targets), sample('gedit', 'pinned', 'type_text', null, false)], ['gedit']).complete, false);
  // the pixel reader cannot see a click or typed text: those are unknown by design, its keys are not
  const pixels = id('writer-gen', 'pixels', { pinned: {}, newest: {}, cua: {}, 'cua:none': {} });
  assert.equal(matrixOutcome([pixels, sample('writer-gen', 'cua', 'click', null), sample('writer-gen', 'newest', 'type_text', null)], ['writer-gen']).complete, true);
  assert.equal(matrixOutcome([pixels, sample('writer-gen', 'cua', 'key', null, true, { oracle: 'pixels' })], ['writer-gen']).complete, false);
  // the committed rows, which predate kindOf: a family whose samples were read as pixels is the pixel reader
  const old = { kind: 'matrix-identity', family: 'writer-gen', targets: { document: false } };
  assert.equal(matrixOutcome([old, sample('writer-gen', 'cua', 'click', null, true, { oracle: 'pixels' }), sample('writer-gen', 'pinned', 'type_text', null, false)], ['writer-gen']).complete, true);
});

test('terminal input reads as UTF-8 for typed text and byte for byte for mouse reports', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-review-'));
  try {
    const record = join(dir, 'input');
    const marker = 'cua171 Ωé🙂 newest0';
    writeFileSync(record, Buffer.concat([Buffer.from(marker, 'utf8'), Buffer.from([0x1b, 0x5b, 0x4d, 0x20, 0xa1, 0xb0])]));
    const scene = { kindOf: 'terminal', record };
    assert.ok((await readText(null, null, scene, { utf8: true })).includes(marker));
    const bytes = await readText(null, null, scene);
    assert.ok(!bytes.includes(marker));
    assert.ok(bytes.endsWith('\x1b[M \xa1\xb0'), 'a mouse report keeps its coordinate bytes');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
