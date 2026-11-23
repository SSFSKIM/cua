// The TCC writer's guard (ruling 1137): off a GitHub-hosted runner, or without the owner's Decision Log entry, every
// writer refuses with exit 3 before any access to a store: the store is a spy that must never be called. Nothing here
// touches a real TCC database, replayd's store or their directories.
//   node --test scripts/probe-117-h0/tcc.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {grantRows, preRecordReplayd, readReplayd, revokeRows, restartTccd} from './tcc.mjs';

const O0 = '2026-11-23, the owner: TCC rows may be written by kits on GitHub-hosted runners only';
const O0A = '(O0a; extends O0)';
const ENTRY = `${O0}\n${O0A}`;
class Refused extends Error {}
function seams({env, platform = 'darwin', spec = ENTRY}) {
  const calls = [];
  const spy = name => (...args) => { calls.push(name); throw new Error(`store ${name} reached: ${args[0]}`); };
  const store = {exists: spy('exists'), csreq: spy('csreq'), sql: spy('sql'), restart: spy('restart'),
    replaydRead: spy('replaydRead'), replaydWrite: spy('replaydWrite'), replaydRestart: spy('replaydRestart')};
  const exits = [];
  const deps = {env, platform, store, readSpec: () => spec, stderr: {write() {}}, exit: code => { exits.push(code); throw new Refused(String(code)); }};
  return {deps, calls, exits};
}
const writers = {
  grantRows: deps => grantRows({client: 'h0.test', bundle: '/nonexistent/h0.app', services: ['accessibility']}, deps),
  revokeRows: deps => revokeRows({client: 'h0.test', services: ['accessibility']}, deps),
  restartTccd: deps => restartTccd(deps),
  preRecordReplayd: deps => preRecordReplayd({keys: ['/nonexistent/h0.app/Contents/MacOS/h0', 'h0.test']}, deps),
  readReplayd: deps => readReplayd(deps),
};
const cases = {
  'RUNNER_ENVIRONMENT unset': {env: {}},
  'RUNNER_ENVIRONMENT self-hosted': {env: {RUNNER_ENVIRONMENT: 'self-hosted'}},
  'not macOS': {env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'linux'},
  'the Decision Log entry missing': {env: {RUNNER_ENVIRONMENT: 'github-hosted'}, spec: '## Decision Log\n(no such entry)\n'},
};
for (const [name, c] of Object.entries(cases)) {
  for (const [writer, call] of Object.entries(writers)) {
    test(`${writer} refuses before any store access: ${name}`, () => {
      const {deps, calls, exits} = seams(c);
      assert.throws(() => call(deps), Refused);
      assert.deepEqual(exits, [3]);
      assert.deepEqual(calls, []);
    });
  }
}
// O0 alone (no O0a) still allows TCC rows but not replayd's store.
for (const writer of ['preRecordReplayd', 'readReplayd']) {
  test(`${writer} refuses before any store access: O0 recorded, O0a missing`, () => {
    const {deps, calls, exits} = seams({env: {RUNNER_ENVIRONMENT: 'github-hosted'}, spec: O0});
    assert.throws(() => writers[writer](deps), Refused);
    assert.deepEqual(exits, [3]);
    assert.deepEqual(calls, []);
  });
}
test('with O0 alone, the TCC writer reaches the store', () => {
  const {deps, calls, exits} = seams({env: {RUNNER_ENVIRONMENT: 'github-hosted'}, spec: O0});
  assert.throws(() => writers.grantRows(deps), /store exists reached/);
  assert.deepEqual(exits, []);
  assert.deepEqual(calls, ['exists']);
});
test('with the runner, O0 and O0a, the replayd writer reaches the store', () => {
  const {deps, calls, exits} = seams({env: {RUNNER_ENVIRONMENT: 'github-hosted'}});
  assert.throws(() => writers.preRecordReplayd(deps), /store replaydRead reached/);
  assert.deepEqual(exits, []);
  assert.deepEqual(calls, ['replaydRead']);
});
// The control: with the guard satisfied, the writer does reach the store (here the spy), so the zero above is the guard's.
test('with the runner and the entry, the writer reaches the store', () => {
  const {deps, calls, exits} = seams({env: {RUNNER_ENVIRONMENT: 'github-hosted'}});
  assert.throws(() => writers.grantRows(deps), /store exists reached/);
  assert.deepEqual(exits, []);
  assert.deepEqual(calls, ['exists']);
});
