// accept-native's --engine (#117 M3.4): the engine every native item pins is validated before any item runs, so an
// unknown engine, or --engine where no engine is driven, is a usage error (exit 2) that starts nothing.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {REPO} from './fixtures/runtime-fixture.mjs';

const ACCEPT = join(REPO, 'scripts', 'accept-native.mjs');
function acceptNative(t, args, env = {}) {
  const home = mkdtempSync(join(tmpdir(), 'cua-accept-cli-'));
  t.after(() => rmSync(home, {recursive: true, force: true}));
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'CUA_NATIVE_ENGINE' && !key.startsWith('CUA_SHIM_')));
  return spawnSync(process.execPath, [ACCEPT, '--items', '9', ...args], {encoding: 'utf8', env: {...clean, CUA_HOME: home, ...env}, timeout: 30_000});
}

test('partial item selections refuse before any suite, fixture or report runs', t => {
  const run = acceptNative(t, ['--items', '7,8']);
  assert.equal(run.status, 2, run.stderr);
  assert.match(run.stderr, /requires item\(s\) 1/);
  assert.equal(run.stdout, '');
});

test('item 14 without opt-in reports BLOCKED without touching the engine', t => {
  const run = acceptNative(t, ['--items', '14']);
  assert.equal(run.status, 3, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.deepEqual(report.summary, {'14': 'BLOCKED'});
  assert.match(report.items[0].checks[0].detail, /owner-run/);
});

test('fresh-onboarding cannot be requested then silently omitted from a selection', t => {
  const run = acceptNative(t, ['--fresh-onboarding']);
  assert.equal(run.status, 2, run.stderr);
  assert.match(run.stderr, /requires item 14/);
});

test('an incomplete owner window blocks the unattended items instead of running them', t => {
  const run = acceptNative(t, ['--items', '1,14', '--fresh-onboarding'], {CUA_SHIM_SURFACES: 'browser'});
  assert.equal(run.status, 3, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.deepEqual(report.summary, {'1': 'BLOCKED', '14': 'BLOCKED'});
  assert.match(report.items.find(i => i.id === 1).checks[0].detail, /owner window/);
});

test('an unknown --engine is a usage error before any item runs', t => {
  const run = acceptNative(t, ['--engine', 'sky']);
  assert.equal(run.status, 2, run.stderr);
  assert.match(run.stderr, /accept-native: --engine/);
  assert.doesNotMatch(run.stderr, /\b9\. /, 'no item ran');
  assert.equal(run.stdout, '');
});

test('--engine where no engine is driven (the computer surface off) is a usage error', t => {
  const run = acceptNative(t, ['--engine', 'vendor'], {CUA_SHIM_SURFACES: 'browser'});
  assert.equal(run.status, 2, run.stderr);
  assert.match(run.stderr, /--engine applies only to the computer surface on macOS/);
});

test('an unknown CUA_NATIVE_ENGINE is refused the same way on macOS, where it would pin the engine', {skip: process.platform !== 'darwin' && 'macOS only: no engine is driven elsewhere'}, t => {
  const run = acceptNative(t, [], {CUA_NATIVE_ENGINE: 'sky'});
  assert.equal(run.status, 2, run.stderr);
  assert.match(run.stderr, /CUA_NATIVE_ENGINE must be vendor or cua/);
});

test('owner budget help is available without a scratch home or engine work', t => {
  const run = acceptNative(t, ['--help'], {CUA_HOME: ''});
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /--owner-window-minutes/);
  assert.match(run.stdout, /25/);
  assert.match(run.stdout, /1.*120/);
  assert.match(run.stdout, /5.minute/);
  assert.match(run.stdout, /in.flight.*cleanup/);
});

test('owner budget accepts bounded whole minutes and reaches the inert onboarding admission report', t => {
  for (const value of ['1', '25', '120']) {
    const run = acceptNative(t, ['--items', '14', '--fresh-onboarding', '--owner-window-minutes', value], {CUA_SHIM_SURFACES: 'browser'});
    assert.equal(run.status, 3, run.stderr);
    const report = JSON.parse(run.stdout);
    assert.equal(report.options.ownerWindowMinutes, Number(value));
    assert.equal(report.items[0].evidence.ownerBudget.minutes, Number(value));
    assert.equal(report.summary['14'], 'BLOCKED');
  }
});

test('invalid or inapplicable owner budget fails before engine work or report generation', t => {
  for (const value of ['0', '121', '2.5', 'NaN', 'Infinity', '1e1', '01', '', '-1']) {
    const run = acceptNative(t, ['--items', '14', '--fresh-onboarding', `--owner-window-minutes=${value}`]);
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /owner-window-minutes/);
    assert.equal(run.stdout, '');
  }
  for (const args of [['--owner-window-minutes'], ['--owner-window-minutes', '25']]) {
    const run = acceptNative(t, args);
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /owner-window-minutes/);
    assert.equal(run.stdout, '');
  }
});
