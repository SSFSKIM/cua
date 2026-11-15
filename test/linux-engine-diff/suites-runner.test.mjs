// The facade suites' one runner (scripts/linux-engine-gate/suites.sh; #171 M5, T1 and its fix wave): its parts run here
// with the harness commands they call faked (suites-fake-node.mjs, first on PATH as `node`), so what the runner itself
// decides is seen: which engine the cua lanes are given, the pinned checks, the baseline's one top-up, its unproved
// series kept in the record, and a parity part whose final cleanup failed failing. Display-free.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { SUITES_SCRIPT } from '../../scripts/linux-engine-gate/steps.mjs';

const SCRIPT = fileURLToPath(new URL(`../../${SUITES_SCRIPT}`, import.meta.url));
const FAKE = fileURLToPath(new URL('./suites-fake-node.mjs', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'cua171-suites-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;

/** One part of the runner, its harness commands faked: `{status, stderr, calls, out}`. */
function part(name, { engine = 'installed', engineBin, env = {} } = {}) {
  const dir = join(scratch, `run-${n++}`);
  const bin = join(dir, 'bin');
  spawnSync('mkdir', ['-p', bin, join(dir, 'out'), join(dir, 'logs')]);
  const fakeLog = join(dir, 'calls.log');
  writeFileSync(fakeLog, '');
  writeFileSync(join(bin, 'node'), `#!/bin/bash\ncase "$1" in\n  scripts/repl-parity.mjs|scripts/native-baseline.mjs|*/gate.mjs) exec "${process.execPath}" "${FAKE}" "$@" ;;\n  *) exec "${process.execPath}" "$@" ;;\nesac\n`);
  writeFileSync(join(bin, 'pgrep'), '#!/bin/sh\nexit 1\n');
  chmodSync(join(bin, 'node'), 0o755);
  chmodSync(join(bin, 'pgrep'), 0o755);
  const { CUA_LINUX_ENGINE_BIN: _drop, ...base } = process.env;
  const result = spawnSync('bash', [SCRIPT, name], {
    encoding: 'utf8',
    env: { ...base, PATH: `${bin}:${process.env.PATH}`, OUT: join(dir, 'out'), LOGS: join(dir, 'logs'), LABEL: 'pilot', DEVICE: 'cua-171', ENGINE: engine, ...(engineBin ? { ENGINE_BIN: engineBin } : {}), CUA_PARITY_DISPLAY: ':9', FAKE_LOG: fakeLog, ...env },
  });
  return { status: result.status, stderr: result.stderr, calls: readFileSync(fakeLog, 'utf8').split('\n').filter(Boolean), out: join(dir, 'out') };
}

test('a parity part whose lanes and diff pass but whose final cleanup fails, fails; a diff failure keeps its own status', () => {
  const clean = part('inner-parity');
  assert.equal(clean.status, 0, clean.stderr);
  const failed = part('inner-parity', { env: { FAKE_CLEANUP: '0,1' } });
  assert.equal(failed.status, 1, 'the final cleanup failed: the part fails');
  assert.ok(failed.calls.some((c) => / diff /.test(c)), 'the lanes and the diff ran');
  const both = part('inner-parity', { env: { FAKE_DIFF: '3', FAKE_CLEANUP: '0,1' } });
  assert.equal(both.status, 3, "the diff's failure is the part's");
});

test('on the installed engine the parity lanes are named no engine and the prepared home is checked; on a candidate, the candidate is named', () => {
  const installed = part('inner-parity');
  assert.ok(installed.calls.some((c) => /gate\.mjs check --pinned \/fake\/prepared-home$/.test(c)), installed.calls.join('\n'));
  const cua = installed.calls.find((c) => /run .*--engine cua/.test(c));
  assert.doesNotMatch(cua, /--engine-bin/);
  const candidate = part('inner-parity', { engine: 'candidate', engineBin: '/c/cua-engine' });
  assert.match(candidate.calls.find((c) => /run .*--engine cua/.test(c)), /--engine cua --engine-bin \/c\/cua-engine --out/);
  assert.ok(!candidate.calls.some((c) => /gate\.mjs check/.test(c)), 'a candidate is checked by gate.mjs, not here');
});

test("the baseline: one top-up when the comparison asks for it, the cua runs checked on the installed engine, the unproved series kept for the step's record", () => {
  const r = part('inner-baseline', { env: { FAKE_COMPARE: 'topup,unproved' } });
  assert.equal(r.status, 0, r.stderr);
  const cua = r.calls.filter((c) => /native-baseline\.mjs run .*--engine cua/.test(c));
  assert.equal(cua.length, 6, 'three cua runs in the sitting and three in its top-up');
  assert.ok(cua.every((c) => / --pinned-check /.test(c) && !/--engine-bin/.test(c)), cua.join('\n'));
  assert.ok(r.calls.some((c) => /compare --engines .*--top-up-baseline .*baseline-topup\/cv --top-up-candidate .*baseline-topup\/cc/.test(c)));
  assert.equal(readFileSync(join(r.out, 'baseline', 'unproved.txt'), 'utf8'), 'UNPROVED (a declared gap, not a pass; ruling 9): click [-1, 3] ms, bound 1 ms, 40 / 40 samples\n');
  // a candidate's cua runs name it and are not checked by the pinned rule; no top-up when the comparison passes
  const c = part('inner-baseline', { engine: 'candidate', engineBin: '/c/cua-engine' });
  assert.equal(c.status, 0, c.stderr);
  const named = c.calls.filter((l) => /native-baseline\.mjs run .*--engine cua/.test(l));
  assert.equal(named.length, 3);
  assert.ok(named.every((l) => /--engine-bin \/c\/cua-engine/.test(l) && !/--pinned-check/.test(l)));
  assert.equal(readFileSync(join(c.out, 'baseline', 'unproved.txt'), 'utf8'), '', 'none unproved');
});

test('the runner refuses an ambient override, an installed engine given an ENGINE_BIN, a candidate without one, and an unknown ENGINE', () => {
  assert.equal(part('inner-parity', { env: { CUA_LINUX_ENGINE_BIN: '/x/cua-engine' } }).status, 2);
  assert.equal(part('inner-parity', { engineBin: '/c/cua-engine' }).status, 2);
  assert.equal(part('inner-parity', { engine: 'candidate' }).status, 2);
  assert.equal(part('inner-parity', { engine: 'built' }).status, 2);
});
