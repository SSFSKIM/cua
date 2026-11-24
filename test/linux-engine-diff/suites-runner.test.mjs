// The facade suites' one runner (scripts/linux-engine-gate/suites.sh; #171 M5, T1 and its fix wave): its parts run here
// with the harness commands they call faked (suites-fake-node.mjs, first on PATH as `node`), so what the runner itself
// decides is seen: which engine the cua lanes are given, the pinned checks, R1's own verdict on the cua lane (#171 M6b),
// and a parity part whose final cleanup failed failing. Display-free.

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

/**
 * One part of the runner, its harness commands faked: `{status, stderr, calls, out}`. `counted`: a counted part (LABEL
 * counted), on a git of the test's own that answers a clean tree, so the checkout's own state does not decide it.
 */
function part(name, { engine = 'installed', engineBin, env = {}, counted = false } = {}) {
  const dir = join(scratch, `run-${n++}`);
  const bin = join(dir, 'bin');
  spawnSync('mkdir', ['-p', bin, join(dir, 'out'), join(dir, 'logs')]);
  const fakeLog = join(dir, 'calls.log');
  writeFileSync(fakeLog, '');
  if (counted) {
    writeFileSync(join(bin, 'git'), '#!/bin/sh\ncase "$1" in rev-parse) echo 0123456789abcdef0123456789abcdef01234567 ;; esac\n');
    chmodSync(join(bin, 'git'), 0o755);
    env = { LABEL: 'counted', ...env };
  }
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

// #171 M6b (its pre-flight §1.3, finding 11): R1 is the cua lane alone. No vendor lane runs and nothing is diffed; the
// part's verdict is the lane's own (parity-verdict.mjs), and the cleanup runs whatever it said
const cleanups = (r) => r.calls.filter((c) => /cleanup-prepared/.test(c)).length;

test('R1: the cua lane alone, no vendor lane and no diff; a clean lane with a clean cleanup passes, its verdict kept', () => {
  const clean = part('inner-parity');
  assert.equal(clean.status, 0, clean.stderr);
  const runs = clean.calls.filter((c) => /repl-parity\.mjs run /.test(c));
  assert.equal(runs.length, 1, runs.join('\n'));
  assert.match(runs[0], /--suite native --host cua --engine cua --out /);
  assert.ok(!clean.calls.some((c) => /--engine vendor| diff /.test(c)), clean.calls.join('\n'));
  const verdict = JSON.parse(readFileSync(join(clean.out, 'parity', 'verdict.json'), 'utf8'));
  assert.deepEqual([verdict.pass, verdict.cases, verdict.covered, verdict.problems], [true, 34, 34, []]);
  assert.deepEqual(verdict.text, { 'native/app/typetext': true, 'native/app/paste': true });
});

test('R1 negative control: a failed cua lane with a successful cleanup is red, and the cleanup still ran', () => {
  const failed = part('inner-parity', { env: { FAKE_RUN: '1' } });
  assert.equal(failed.status, 1, 'the lane exited 1: the part fails, though its cleanup passed');
  assert.equal(cleanups(failed), 2, 'the cleanup before and the final one');
  assert.match(JSON.parse(readFileSync(join(failed.out, 'parity', 'verdict.json'), 'utf8')).problems.join('; '), /the run exited 1/);
});

test("R1 is red for 33 cases, a text case that is not positive, another engine under the worker or one no home installed; the cleanup runs each time", () => {
  for (const [change, pattern] of [['short', /33 cases/], ['text', /native\/app\/typetext: not positive/], ['vendor', /sky_linux_x64 \(vendor\) answered/], ['elsewhere', /not a cua home's installed engine/], ['incomplete', /not complete/]]) {
    const r = part('inner-parity', { env: { FAKE_LANE: change } });
    assert.equal(r.status, 1, change);
    assert.equal(cleanups(r), 2, `${change}: the final cleanup ran`);
    assert.match(JSON.parse(readFileSync(join(r.out, 'parity', 'verdict.json'), 'utf8')).problems.join('; '), pattern, change);
  }
});

test('R1: a clean lane whose final cleanup fails is red; a red verdict keeps its own status over a failed cleanup', () => {
  const failed = part('inner-parity', { env: { FAKE_CLEANUP: '0,3' } });
  assert.equal(failed.status, 3, 'the final cleanup failed: the part fails');
  const both = part('inner-parity', { env: { FAKE_RUN: '1', FAKE_CLEANUP: '0,3' } });
  assert.equal(both.status, 1, "the verdict's failure is the part's");
});

// #171 M6a: a Linux home serves only once this cua's install has run in it, so the preparation may start from a home the
// run names (PARITY_HOME, prepare --home) in place of the account's default one; without it, nothing names a home.
test('the parity preparation starts from PARITY_HOME when it is set, and names no home otherwise', () => {
  const named = part('inner-parity', { env: { PARITY_HOME: '/run/source home' } });
  assert.equal(named.status, 0, named.stderr);
  assert.ok(named.calls.some((c) => /^scripts\/repl-parity\.mjs prepare --device cua-171 --commit \S+ --native-only --home \/run\/source home$/.test(c)), named.calls.join('\n'));
  const unnamed = part('inner-parity');
  assert.ok(unnamed.calls.some((c) => /^scripts\/repl-parity\.mjs prepare --device cua-171 --commit \S+ --native-only$/.test(c)), unnamed.calls.join('\n'));
});

test('on the installed engine the parity lanes are named no engine and the prepared home is checked; on a candidate, the candidate is named', () => {
  const installed = part('inner-parity');
  assert.ok(installed.calls.some((c) => /gate\.mjs check --pinned \/fake\/prepared-home$/.test(c)), installed.calls.join('\n'));
  const cua = installed.calls.find((c) => /run .*--engine cua/.test(c));
  assert.doesNotMatch(cua, /--engine-bin/);
  const candidate = part('inner-parity', { engine: 'candidate', engineBin: '/c/cua-engine' });
  assert.match(candidate.calls.find((c) => /run .*--engine cua/.test(c)), /--engine cua --engine-bin \/c\/cua-engine --out/);
  assert.ok(!candidate.calls.some((c) => /gate\.mjs check/.test(c)), 'a candidate is checked by gate.mjs, not here');
  // the verdict holds the lane to the candidate it named
  assert.equal(candidate.status, 0, candidate.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(candidate.out, 'parity', 'verdict.json'), 'utf8')).engines, ['/c/cua-engine']);
});

// review finding 1: the pinned rule binds every home the suites make on both pinned modes, acceptance and a development
// run on the pinned release (PINNED_RULE=enforce, gate.mjs suiteEnv), whatever the label; a refusal stops the part
// before any session starts in that home
test("on the pinned rule a refusal in the suites' own homes stops the part before its session, a pilot's as an acceptance's", () => {
  for (const counted of [false, true]) {
    const parity = part('inner-parity', { env: { FAKE_CHECK: '2', PINNED_RULE: 'enforce' }, counted });
    assert.equal(parity.status, 1, `parity, counted ${counted}`);
    assert.ok(parity.calls.some((c) => /gate\.mjs check --pinned \/fake\/prepared-home$/.test(c)));
    assert.ok(!parity.calls.some((c) => /repl-parity\.mjs run /.test(c)), 'no lane started in the refused home');
    for (const name of ['inner-accept', 'inner-device']) {
      const fixture = part(name, { env: { FAKE_CHECK: '2', PINNED_RULE: 'enforce' }, counted });
      assert.equal(fixture.status, 1, `${name}, counted ${counted}`);
      assert.ok(fixture.calls.some((c) => /gate\.mjs check --pinned \S+\/home\/cua$/.test(c)), fixture.calls.join('\n'));
      assert.ok(!fixture.calls.some((c) => /watch\.mjs|linux-native|linux-device-mode/.test(c)), 'no fixture started in the refused home');
    }
  }
  // a development run that takes the engine unchecked (gate.mjs --pinned --dev: no PINNED_RULE) logs the refusal, runs on
  const unchecked = part('inner-parity', { env: { FAKE_CHECK: '2' } });
  assert.equal(unchecked.status, 0);
  assert.ok(unchecked.calls.some((c) => /repl-parity\.mjs run /.test(c)));
});

test('the baseline part is gone with R2 (#171 M6b): the runner refuses it as an unknown part', () => {
  for (const name of ['baseline', 'inner-baseline']) {
    const r = part(name);
    assert.equal(r.status, 2, name);
    assert.match(r.stderr, new RegExp(`unknown part ${name}`));
    assert.deepEqual(r.calls, [], 'nothing ran');
  }
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
  assert.equal(part('inner-accept', { env: { SELECTION: 'vendor' } }).status, 2);
  assert.equal(part('inner-fallback').status, 2, "the fallback part is the default selection's");
});

test('the fallback part shapes and probes its five homes, each with nothing selecting an engine; one failed probe fails the part', () => {
  const r = part('inner-fallback', { env: { SELECTION: 'default' } });
  assert.equal(r.status, 0, r.stderr);
  for (const kind of ['none', 'previous', 'released', 'older', 'unrecorded']) {
    const shaped = r.calls.indexOf(`scripts/linux-engine-gate/fallback-home.mjs ${kind}`);
    assert.ok(shaped > 0, `${kind} shaped: ${r.calls.join('\n')}`);
    assert.equal(r.calls[shaped - 1], 'bin/cua.mjs install', 'after its own install');
    const probe = r.calls.indexOf(`scripts/accept/linux-fallback.mjs --home ${kind}`);
    assert.ok(probe > shaped, kind);
    assert.equal(r.calls[probe + 1], 'ENV CUA_NATIVE_ENGINE unset');
  }
  assert.equal(r.calls.filter((c) => c === 'bin/cua.mjs install').length, 5, 'a fresh home each');
  assert.ok(!r.calls.some((c) => /gate\.mjs check/.test(c)), 'a fallback home holds no pinned engine by design');
  const failed = part('inner-fallback', { env: { SELECTION: 'default', FAKE_PROBE: '0,1,0,0,0' } });
  assert.equal(failed.status, 1);
  assert.equal(failed.calls.filter((c) => /linux-fallback\.mjs/.test(c)).length, 5, 'every home is probed');
});
