// The key-route tap app's own venue check (ruling 1198; scripts/native-matrix/key-route-tap.swift), natively: compiled
// here and run off a GitHub-hosted runner with a well-formed admission, it refuses (exit 3) before it reads, removes or
// creates any file or installs a tap. Only the refusal runs here: on this Mac nothing past it ever does.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {TAP_SCRIPT} from '../../scripts/native-matrix/key-route-device.mjs';

const swiftc = '/usr/bin/swiftc';
test('off a GitHub-hosted runner the tap refuses before it touches its admission, creates its log or installs a tap', {skip: process.platform !== 'darwin' || !existsSync(swiftc)}, () => {
  const dir = mkdtempSync(join(tmpdir(), 'key-route-tap-'));
  try {
    const bin = join(dir, 'key-route-tap');
    execFileSync(swiftc, ['-O', TAP_SCRIPT, '-o', bin], {stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000});
    const admission = join(dir, 'tap.admission'), log = join(dir, 'tap.jsonl'), text = JSON.stringify({nonce: 'n0nce', at: Date.now()});
    writeFileSync(admission, text);
    const {RUNNER_ENVIRONMENT: _, ...env} = process.env;
    const run = spawnSync(bin, ['--admission', admission, '--nonce', 'n0nce', '--out', log, '--stop', join(dir, 'tap.stop'), '--max-seconds', '5', '--pid', 'textedit:1'],
      {env: {...env, RUNNER_ENVIRONMENT: 'self-hosted'}, encoding: 'utf8', timeout: 30_000});
    assert.equal(run.status, 3, run.stderr);
    assert.match(run.stderr, /key-route-tap: refused: it runs only on a GitHub-hosted runner/);
    assert.equal(readFileSync(admission, 'utf8'), text, 'the admission is left as it was');
    assert.equal(existsSync(log), false, 'no log made');
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
