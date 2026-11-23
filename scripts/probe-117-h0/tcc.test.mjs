// The TCC writer's guard (ruling 1137): off a GitHub-hosted runner, or without the owner's Decision Log entry, every
// writer refuses with exit 3 before any access to a store: the store is a spy that must never be called. Nothing here
// touches a real TCC database, replayd's store or their directories.
//   node --test scripts/probe-117-h0/tcc.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {grantRows, revokeRows, restartTccd} from './tcc.mjs';

const ENTRY = '2026-11-23, the owner: TCC rows may be written by kits on GitHub-hosted runners only';
class Refused extends Error {}
function seams({env, platform = 'darwin', spec = ENTRY}) {
  const calls = [];
  const spy = name => (...args) => { calls.push(name); throw new Error(`store ${name} reached: ${args[0]}`); };
  const store = {exists: spy('exists'), csreq: spy('csreq'), sql: spy('sql'), restart: spy('restart')};
  const exits = [];
  const deps = {env, platform, store, readSpec: () => spec, stderr: {write() {}}, exit: code => { exits.push(code); throw new Refused(String(code)); }};
  return {deps, calls, exits};
}
const writers = {
  grantRows: deps => grantRows({client: 'h0.test', bundle: '/nonexistent/h0.app', services: ['accessibility']}, deps),
  revokeRows: deps => revokeRows({client: 'h0.test', services: ['accessibility']}, deps),
  restartTccd: deps => restartTccd(deps),
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
// The control: with the guard satisfied, the writer does reach the store (here the spy), so the zero above is the guard's.
test('with the runner and the entry, the writer reaches the store', () => {
  const {deps, calls, exits} = seams({env: {RUNNER_ENVIRONMENT: 'github-hosted'}});
  assert.throws(() => writers.grantRows(deps), /store exists reached/);
  assert.deepEqual(exits, []);
  assert.deepEqual(calls, ['exists']);
});
