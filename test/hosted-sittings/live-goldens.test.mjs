// The Electron goldens stand as recorded (inactive, fixture 23c8b77691d0) only while no live sitting reads them as an
// expected value (test/native-goldens/live-guard.mjs, PROVENANCE.md): checked here, not argued.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LIVE_SITTING_ENV, refuseLiveRecording} from '../native-goldens/live-guard.mjs';
import {execStep} from '../../scripts/hosted-sittings/run.mjs';
import {SITTINGS, sittingContext, sittingPlan} from '../../scripts/hosted-sittings/plan.mjs';

test('a live sitting refuses the Electron recording; other scenes and non-live processes read as before', () => {
  assert.throws(() => refuseLiveRecording('electron', {[LIVE_SITTING_ENV]: '1'}), /live sitting read the electron golden/);
  for (const scene of ['textedit', 'finder', 'chrome']) assert.doesNotThrow(() => refuseLiveRecording(scene, {[LIVE_SITTING_ENV]: '1'}));
  assert.doesNotThrow(() => refuseLiveRecording('electron', {}));
});

test("the goldens' readers refuse it in a live sitting's process", async () => {
  const before = process.env[LIVE_SITTING_ENV];
  process.env[LIVE_SITTING_ENV] = '1';
  try {
    const {read} = await import('../native-goldens/goldens.mjs');
    const {fromSource} = await import('../native-goldens/source.mjs');
    assert.throws(() => read('electron', 'vendor.txt'), /live sitting read the electron golden/);
    assert.throws(() => fromSource('electron', 'vendor.txt'), /live sitting read the electron golden/);
    assert.ok(read('textedit', 'vendor.txt').length > 0);
  } finally {
    if (before === undefined) delete process.env[LIVE_SITTING_ENV]; else process.env[LIVE_SITTING_ENV] = before;
  }
});

test('every step a sitting runs is a live sitting process: execStep sets the marker, a step cannot unset it by omission', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua-live-goldens-'));
  try {
    const logPath = join(dir, 'step.log');
    const step = {argv: [process.execPath, '-e', `process.stdout.write(String(process.env.${LIVE_SITTING_ENV}))`]};
    const result = await execStep(step, {logPath, env: {PATH: process.env.PATH}, echo: {write() {}}});
    assert.equal(result.exit, 0);
    assert.equal(readFileSync(logPath, 'utf8'), '1');
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test("no sitting's plan names a golden as an argument (pilot and full, before and on the flip)", () => {
  const env = {GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1', RUNNER_TEMP: '/tmp'};
  for (const sitting of SITTINGS) for (const pilot of [false, true]) for (const flipped of [false, true]) {
    const ctx = sittingContext(sitting, {env, record: '/tmp/record.json', commit: '0'.repeat(40), out: '/tmp/out', pilot, flipped});
    for (const step of sittingPlan(sitting, ctx).steps) {
      const args = [...(step.argv ?? []), ...Object.values(step.env ?? {})].map(String);
      assert.ok(!args.some(a => a.includes('native-goldens')), `${sitting} ${step.id}: ${args.join(' ')}`);
    }
  }
});
