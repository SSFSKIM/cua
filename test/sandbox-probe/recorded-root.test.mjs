import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {captureRoot} from '../../scripts/sandbox-probe/recorded-root.mjs';

const capture = root => ({input: {env: {HOME: `${root}/userhome`}, cwd: `${root}/home/run/session`, cli: `${root}/home/runtimes/release/CodexCLI.app/Contents/MacOS/codex`}});

test('the hosted replay derives its root from capture provenance, not the running account or a hardcoded home', () => {
  for (const root of ['/Users/fixture/cua-115', '/tmp/recorded fixture']) assert.equal(captureRoot(capture(root)), root);
  for (const mode of ['scoped', 'default']) {
    const recorded = JSON.parse(readFileSync(new URL(`../../docs/evidence/2026-10-17-own-sandbox/m0/argv-capture/capture-signed-${mode}.json`, import.meta.url)));
    assert.equal(captureRoot(recorded), dirname(recorded.input.env.HOME));
  }
});

test('inconsistent or absent provenance fails closed without quoting recorded values', () => {
  for (const record of [{}, capture('relative'), capture(''),
    {...capture('/tmp/source'), input: {...capture('/tmp/source').input, cwd: '/elsewhere/home/run/s'}},
    {...capture('/tmp/source'), input: {...capture('/tmp/source').input, cli: '/tmp/source-other/home/runtimes/codex'}},
    capture('/tmp/source/../other')]) {
    assert.throws(() => captureRoot(record), {message: 'capture has no consistent scratch-root provenance'});
  }
});
