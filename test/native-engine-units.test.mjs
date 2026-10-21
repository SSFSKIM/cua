// cua's native engine, its Swift unit suite (native/engine/Tests/EngineTests): the walk, the lineage's tokens and
// carry-over, token resolution and its re-fetch, the width rule, the settle loop on a fake clock, the screenshot's size
// rule, the byte estimate, enablement's rules and the engine's settings. They run in-process on fake element handles
// (application handles for unused pids; nothing is sent to any process), so no permission is involved.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {PACKAGE, UNIT_SCRATCH, engineSkip} from './helpers/engine-wire.mjs';

test('the engine\'s Swift unit suite passes', {skip: engineSkip, timeout: 900_000}, () => {
  const result = spawnSync('swift', ['test', '--package-path', PACKAGE, '--scratch-path', UNIT_SCRATCH],
    {encoding: 'utf8', timeout: 900_000});
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 0, output.split('\n').filter(line => /error|failed/i.test(line)).join('\n') || output.slice(-4000));
  assert.match(output, /Executed \d+ tests?, with 0 failures/);
});
