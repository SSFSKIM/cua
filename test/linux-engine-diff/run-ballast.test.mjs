import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { GATE_BALLAST } from '../../scripts/linux-engine-diff/dnd.mjs';
import { openGateBallast } from '../../scripts/linux-engine-diff/run.mjs';
import { HARNESS, harnessModules } from './source-scan.mjs';

const verdict = ['--vendor', '/v', '--newest', '/n', '--cua', '/c', '--scene', 'device-chrome-dnd', '--ops', 'all', '--out', 'o'];

test("a verdict run takes the gate's ballast (`--ballast gate`), and nothing else as a ballast", () => {
  assert.equal(parseArgs([...verdict, '--ballast', 'gate']).ballast, 'gate');
  assert.equal(parseArgs(verdict).ballast, undefined);
  assert.throws(() => parseArgs([...verdict, '--ballast', 'more']), /--ballast takes gate/);
  // the cold drag-and-drop run's other flags stay its own
  assert.throws(() => parseArgs([...verdict, '--cover-ms', '5']), /--dnd-cold/);
  assert.throws(() => parseArgs(['--experiment', 'dnd', '--cua', '/c', '--vendor', '/v', '--out', 'o', '--ballast', 'gate']), /--dnd-cold/);
});

test("the gate's ballast opens dnd.mjs's GATE_BALLAST, each scene's windows as the run opens them, text scenes with their field", async () => {
  const opened = [];
  const windows = await openGateBallast({ open: async (scene, role, options) => (opened.push([scene, role, options.text]), { scene, role }) });
  const expected = Object.entries(GATE_BALLAST).flatMap(([scene, n]) => Array.from({ length: n }, (_, k) => [scene, `ballast${k}`, ['chrome-textarea', 'chrome-address-bar'].includes(scene)]));
  assert.deepEqual(opened, expected);
  assert.equal(windows.length, 18);
});

test("the verdict run opens the ballast before its first scene, and only with the flag", () => {
  const run = harnessModules().find((m) => m.file === 'run.mjs').text;
  const body = run.slice(run.indexOf('async function diffRun'));
  const ballast = body.indexOf('openGateBallast(');
  const firstScene = body.indexOf('for (const scene of args.scenes');
  assert.ok(ballast > 0 && firstScene > 0 && ballast < firstScene, 'the ballast is opened before the scenes');
  assert.match(body.slice(ballast - 80, ballast), /args\.ballast === 'gate'/);
  assert.ok(readFileSync(join(HARNESS, 'run.mjs'), 'utf8').includes('export async function openGateBallast'));
});
