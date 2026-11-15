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
  writeFileSync(join(bin, 'node'), `#!/bin/bash\ncase "$1" in\n  scripts/repl-parity.mjs|scripts/native-baseline.mjs|*/gate.mjs|bin/cua.mjs|*watch.mjs|scripts/linux-engine-gate/fallback-home.mjs|scripts/accept/linux-fallback.mjs) exec "${process.execPath}" "${FAKE}" "$@" ;;\n  *) exec "${process.execPath}" "$@" ;;\nesac\n`);
  writeFileSync(join(bin, 'pgrep'), '#!/bin/sh\nexit 1\n');
  chmodSync(join(bin, 'node'), 0o755);
  chmodSync(join(bin, 'pgrep'), 0o755);
  const { CUA_LINUX_ENGINE_BIN: _drop, CUA_NATIVE_ENGINE: _unset, ...base } = process.env;
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

// #171 M5 (T10): the fixtures' selection. Explicit names cua's engine as M4 ran them; default names none and passes the
// fixture --selection default, on the installed engine only; the fallback part probes its three homes that way.
test('the accept and device parts: explicit names CUA_NATIVE_ENGINE=cua; default names none and runs the fixture with --selection default', () => {
  for (const name of ['inner-accept', 'inner-device']) {
    const explicit = part(name);
    assert.equal(explicit.status, 0, explicit.stderr);
    const fixture = explicit.calls.findIndex((c) => /\/watch\.mjs /.test(c));
    assert.doesNotMatch(explicit.calls[fixture], /--selection/);
    assert.equal(explicit.calls[fixture + 1], 'ENV CUA_NATIVE_ENGINE=cua');
    const byDefault = part(name, { env: { SELECTION: 'default' } });
    assert.equal(byDefault.status, 0, byDefault.stderr);
    const run = byDefault.calls.findIndex((c) => /\/watch\.mjs /.test(c));
    assert.match(byDefault.calls[run], / -- node scripts\/accept\/linux-(native|device-mode)\.mjs --selection default$/);
    assert.equal(byDefault.calls[run + 1], 'ENV CUA_NATIVE_ENGINE unset');
    assert.ok(byDefault.calls.some((c) => /gate\.mjs check --pinned /.test(c)), 'the home is still checked by the pinned rule');
  }
});

test("the default selection refuses a candidate, an ambient CUA_NATIVE_ENGINE and the parts that name their lanes' engines; SELECTION is explicit or default", () => {
  assert.equal(part('inner-accept', { engine: 'candidate', engineBin: '/c/cua-engine', env: { SELECTION: 'default' } }).status, 2);
  assert.equal(part('inner-accept', { env: { SELECTION: 'default', CUA_NATIVE_ENGINE: 'cua' } }).status, 2);
  assert.equal(part('inner-accept', { env: { SELECTION: 'default', CUA_NATIVE_ENGINE: '' } }).status, 2, 'even empty');
  assert.equal(part('inner-parity', { env: { SELECTION: 'default' } }).status, 2);
  assert.equal(part('inner-baseline', { env: { SELECTION: 'default' } }).status, 2);
  assert.equal(part('inner-accept', { env: { SELECTION: 'vendor' } }).status, 2);
  assert.equal(part('inner-fallback').status, 2, "the fallback part is the default selection's");
});

test('the fallback part shapes and probes its three homes, each with nothing selecting an engine; one failed probe fails the part', () => {
  const r = part('inner-fallback', { env: { SELECTION: 'default' } });
  assert.equal(r.status, 0, r.stderr);
  for (const kind of ['none', 'older', 'unrecorded']) {
    const shaped = r.calls.indexOf(`scripts/linux-engine-gate/fallback-home.mjs ${kind}`);
    assert.ok(shaped > 0, `${kind} shaped: ${r.calls.join('\n')}`);
    assert.equal(r.calls[shaped - 1], 'bin/cua.mjs install', 'after its own install');
    const probe = r.calls.indexOf(`scripts/accept/linux-fallback.mjs --home ${kind}`);
    assert.ok(probe > shaped, kind);
    assert.equal(r.calls[probe + 1], 'ENV CUA_NATIVE_ENGINE unset');
  }
  assert.equal(r.calls.filter((c) => c === 'bin/cua.mjs install').length, 3, 'a fresh home each');
  assert.ok(!r.calls.some((c) => /gate\.mjs check/.test(c)), 'a fallback home holds no pinned engine by design');
  const failed = part('inner-fallback', { env: { SELECTION: 'default', FAKE_PROBE: '0,1,0' } });
  assert.equal(failed.status, 1);
  assert.equal(failed.calls.filter((c) => /linux-fallback\.mjs/.test(c)).length, 3, 'every home is probed');
});
