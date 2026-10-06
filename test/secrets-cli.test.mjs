// `cua secrets`: argument handling in the real CLI (always refused before any helper is located or run), and routing
// to the helper with test doubles in place of the helper process.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync, chmodSync} from 'node:fs';
import {join} from 'node:path';
import {runSecrets} from '../src/secrets/commands.mjs';
import {REPO, scratch} from './fixtures/runtime-fixture.mjs';

const CLI = join(REPO, 'bin', 'cua.mjs');
// The macOS secrets backend these routes drive through test doubles, on any host.
const DARWIN = {platform: 'darwin', arch: 'arm64'};

test('anything but a single valid label is refused as usage, never echoing what was passed', () => {
  const s = scratch();
  try {
    const cases = [
      [], ['get', 'k'], ['export'], ['show', 'k'], ['read', 'k'],
      ['set'], ['set', 'k', 'hunter2-argv'], ['set', '--value', 'hunter2-flag'], ['set', 'k', '--value=hunter2-eq'],
      ['set', 'bad hunter2 label'], ['set', '-hunter2'], ['remove'], ['remove', 'a', 'b'], ['remove', 'k', '--force'], ['list', 'extra'],
      ['set', 'k', '--hunter2-secret'], ['set', '--hunter2'], ['set', '-xhunter2', 'k'], ['set', 'k', '--hunter2', 'v'],
      ['remove', 'k', '--hunter2-flag'], ['remove', '--yes=hunter2', 'k'], ['list', '--hunter2'], ['list', '--json=hunter2'],
    ];
    for (const args of cases) {
      const r = spawnSync(process.execPath, [CLI, 'secrets', ...args], {env: {...process.env, CUA_HOME: s.dir}, encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe']});
      assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
      assert.match(r.stderr, /usage: cua/);
      assert.doesNotMatch(r.stdout + r.stderr, /hunter2/, args.join(' '));
    }
  } finally { s.cleanup(); }
});

function doubles({built = true, captured = {code: 0, stdout: '{"labels":["a","b"]}\n', stderr: ''}, interactiveCode = 0} = {}) {
  const calls = [];
  const printed = [];
  return {
    calls, printed,
    deps: {
      helper: {path: '/built/cua-keychain', built},
      interactive: async (path, args) => { calls.push({kind: 'interactive', path, args}); return interactiveCode; },
      captured: async (path, args) => { calls.push({kind: 'captured', path, args}); return captured; },
      print: value => printed.push(value),
      note: () => {},
    },
  };
}

test('set and remove hand the terminal to the helper with only the label (and --yes)', async () => {
  const d = doubles();
  assert.equal(await runSecrets({host: DARWIN, command: 'set', label: 'work-password'}, d.deps), 0);
  assert.equal(await runSecrets({host: DARWIN, command: 'remove', label: 'work-password'}, d.deps), 0);
  assert.equal(await runSecrets({host: DARWIN, command: 'remove', label: 'work-password', yes: true}, d.deps), 0);
  assert.deepEqual(d.calls, [
    {kind: 'interactive', path: '/built/cua-keychain', args: ['set', 'work-password']},
    {kind: 'interactive', path: '/built/cua-keychain', args: ['remove', 'work-password']},
    {kind: 'interactive', path: '/built/cua-keychain', args: ['remove', 'work-password', '--yes']},
  ]);
  const failing = doubles({interactiveCode: 1});
  assert.equal(await runSecrets({host: DARWIN, command: 'set', label: 'k'}, failing.deps), 1);
});

test('list prints labels, or JSON with --json', async () => {
  const d = doubles();
  assert.equal(await runSecrets({host: DARWIN, command: 'list'}, d.deps), 0);
  assert.deepEqual(d.printed, ['a\nb']);
  const j = doubles();
  assert.equal(await runSecrets({host: DARWIN, command: 'list', json: true}, j.deps), 0);
  assert.deepEqual(j.printed, [{ok: true, labels: ['a', 'b']}]);
  assert.deepEqual(j.calls, [{kind: 'captured', path: '/built/cua-keychain', args: ['list']}]);
});

test('a failed listing becomes a classified error carrying the helper\'s code; malformed output is a helper failure', async () => {
  const locked = doubles({captured: {code: 1, stdout: '', stderr: 'cua-keychain: the Keychain is locked [locked]\n'}});
  await assert.rejects(runSecrets({host: DARWIN, command: 'list'}, locked.deps), {code: 'locked', message: 'the Keychain is locked'});
  const garbled = doubles({captured: {code: 0, stdout: 'not json', stderr: ''}});
  await assert.rejects(runSecrets({host: DARWIN, command: 'list'}, garbled.deps), {code: 'helper_failed'});
});

test('without a built helper every route fails with build guidance and nothing runs', async () => {
  for (const request of [{host: DARWIN, command: 'set', label: 'k'}, {host: DARWIN, command: 'list'}, {host: DARWIN, command: 'remove', label: 'k'}]) {
    const d = doubles({built: false});
    await assert.rejects(runSecrets(request, d.deps), error => error.code === 'helper_not_built' && /npm run build:helper/.test(error.hint));
    assert.deepEqual(d.calls, []);
  }
});

// The real CLI routes to the Keychain helper only on macOS (elsewhere it refuses: test/linux-secrets.test.mjs).
test('the CLI runs the helper installed in $CUA_HOME/bin, so a copy of cua without its own build finds it', {skip: process.platform !== 'darwin' && 'the Keychain helper route is macOS only'}, () => {
  const s = scratch();
  try {
    mkdirSync(join(s.dir, 'bin'));
    const helper = join(s.dir, 'bin', 'cua-keychain');
    writeFileSync(helper, '#!/bin/sh\n[ "$1" = list ] && echo \'{"labels":["from-cua-home"]}\'\n');
    chmodSync(helper, 0o755);
    const r = spawnSync(process.execPath, [CLI, 'secrets', 'list', '--json'], {env: {...process.env, CUA_HOME: s.dir}, encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe']});
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), {ok: true, labels: ['from-cua-home']});
  } finally { s.cleanup(); }
});
