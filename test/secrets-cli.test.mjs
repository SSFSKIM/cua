// `cua secrets`: argument handling in the real CLI (refused before the store is touched), the routes with test doubles
// for the store and the terminal, and the real CLI on a temporary $HOME (through a pty where a terminal is needed).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runSecrets} from '../src/secrets/commands.mjs';
import {projectSlug} from '../src/secrets/store.mjs';
import {REPO, scratch} from './fixtures/runtime-fixture.mjs';

const CLI = join(REPO, 'bin', 'cua.mjs');

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
      const r = spawnSync(process.execPath, [CLI, 'secrets', ...args], {env: {...process.env, CUA_HOME: s.dir, HOME: s.dir}, encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe']});
      assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
      assert.match(r.stderr, /usage: cua/);
      assert.doesNotMatch(r.stdout + r.stderr, /hunter2/, args.join(' '));
    }
  } finally { s.cleanup(); }
});

const VALUE = 'hunter2-typed-value';
const TTY = {input: {isTTY: true, setRawMode() {}}, output: {write() {}}};

// Both tiers as doubles: the global one holds `keys`, the project's (/work/repo) `projectKeys`. Each call records its tier.
function doubles({lines = [VALUE, VALUE], keys = ['A', 'B'], projectKeys = [], terminal = TTY} = {}) {
  const calls = [];
  const printed = [];
  const notes = [];
  const queue = [...lines];
  const tier = (name, dir, stored) => ({
    dir,
    write: async (key, value) => { calls.push(['write', key, value, name]); return `${dir}/${key}`; },
    remove: async key => { calls.push(['remove', key, name]); return `${dir}/${key}`; },
    list: async () => { calls.push(['list', name]); return stored; },
  });
  return {
    calls, printed, notes,
    deps: {
      stores: {
        root: '/work/repo',
        project: tier('project', '/home/u/.config/claude-secrets/projects/-work-repo', projectKeys),
        global: tier('global', '/home/u/.config/claude-secrets', keys),
      },
      terminal,
      readLine: async ({prompt}) => { calls.push(['prompt', prompt]); return queue.shift() ?? null; },
      print: value => printed.push(value),
      note: line => notes.push(line),
    },
  };
}

test('set reads the value twice at the terminal and writes it under the key; nothing it prints carries the value', async () => {
  const d = doubles();
  assert.equal(await runSecrets({command: 'set', label: 'WORK_PASSWORD'}, d.deps), 0);
  assert.deepEqual(d.calls.filter(c => c[0] === 'write'), [['write', 'WORK_PASSWORD', VALUE, 'global']]);
  assert.match(d.notes.join('\n'), /stored WORK_PASSWORD in .*claude-secrets\/WORK_PASSWORD \(mode 0600\)/);
  assert.doesNotMatch(JSON.stringify([d.notes, d.printed, d.calls.filter(c => c[0] === 'prompt')]), /hunter2/);
});

test('set stores nothing on a mismatch, an empty entry, a cancel, or without a terminal', async () => {
  const mismatch = doubles({lines: [VALUE, 'other']});
  await assert.rejects(runSecrets({command: 'set', label: 'K'}, mismatch.deps), error => error.code === 'secret_mismatch' && !/hunter2/.test(error.message));
  const empty = doubles({lines: ['']});
  await assert.rejects(runSecrets({command: 'set', label: 'K'}, empty.deps), {code: 'empty_secret'});
  const cancelled = doubles({lines: [null]});
  assert.equal(await runSecrets({command: 'set', label: 'K'}, cancelled.deps), 130);
  const cancelledSecond = doubles({lines: [VALUE, null]});
  assert.equal(await runSecrets({command: 'set', label: 'K'}, cancelledSecond.deps), 130);
  const piped = doubles({terminal: {input: {isTTY: false}, output: {write() {}}}});
  await assert.rejects(runSecrets({command: 'set', label: 'K'}, piped.deps), error => error.code === 'no_terminal' && /\/secret KEY/.test(error.hint));
  for (const d of [mismatch, empty, cancelled, cancelledSecond, piped]) assert.deepEqual(d.calls.filter(c => c[0] === 'write'), []);
});

test('remove asks at the terminal unless --yes', async () => {
  const yes = doubles();
  assert.equal(await runSecrets({command: 'remove', label: 'K', yes: true}, yes.deps), 0);
  assert.deepEqual(yes.calls, [['remove', 'K', 'global']]);
  const confirmed = doubles({lines: ['y']});
  assert.equal(await runSecrets({command: 'remove', label: 'K'}, confirmed.deps), 0);
  assert.deepEqual(confirmed.calls.map(c => c[0]), ['prompt', 'remove']);
  const declined = doubles({lines: ['n']});
  assert.equal(await runSecrets({command: 'remove', label: 'K'}, declined.deps), 1);
  assert.deepEqual(declined.calls.map(c => c[0]), ['prompt']);
  const piped = doubles({terminal: {input: {isTTY: false}, output: {write() {}}}});
  await assert.rejects(runSecrets({command: 'remove', label: 'K'}, piped.deps), {code: 'no_terminal'});
});

test('list prints both tiers, each key marked, or JSON with --json', async () => {
  const d = doubles({projectKeys: ['B', 'C']});
  assert.equal(await runSecrets({command: 'list'}, d.deps), 0);
  assert.deepEqual(d.printed, ['A (global)\nB (project)\nB (global, shadowed by the project\'s)\nC (project)']);
  const j = doubles({projectKeys: ['B', 'C']});
  assert.equal(await runSecrets({command: 'list', json: true}, j.deps), 0);
  assert.deepEqual(j.printed, [{ok: true, project: '/work/repo', labels: ['A', 'B', 'C'], scopes: {project: ['B', 'C'], global: ['A', 'B']}}]);
  const none = doubles({keys: []});
  assert.equal(await runSecrets({command: 'list'}, none.deps), 0);
  assert.match(none.notes.join(), /no secrets are stored in \/home\/u\/\.config\/claude-secrets\/projects\/-work-repo or \/home\/u\/\.config\/claude-secrets$/);
});

test('--project and --global pick one tier for list, set and remove', async () => {
  const d = doubles({projectKeys: ['P']});
  assert.equal(await runSecrets({command: 'list', scope: 'project'}, d.deps), 0);
  assert.equal(await runSecrets({command: 'list', scope: 'global', json: true}, d.deps), 0);
  assert.deepEqual(d.printed, ['P', {ok: true, labels: ['A', 'B']}]);
  const p = doubles();
  assert.equal(await runSecrets({command: 'list', scope: 'project', json: true}, p.deps), 0);
  assert.deepEqual(p.printed, [{ok: true, project: '/work/repo', labels: []}]);

  const set = doubles();
  assert.equal(await runSecrets({command: 'set', label: 'K', scope: 'project'}, set.deps), 0);
  assert.deepEqual(set.calls.filter(c => c[0] === 'write'), [['write', 'K', VALUE, 'project']]);
  assert.match(set.notes.join(), /stored K in \/home\/u\/\.config\/claude-secrets\/projects\/-work-repo\/K/);
  const removed = doubles();
  assert.equal(await runSecrets({command: 'remove', label: 'K', yes: true, scope: 'project'}, removed.deps), 0);
  assert.deepEqual(removed.calls, [['remove', 'K', 'project']]);
});

test('a device credential is never put in or taken from a project\'s tier', async () => {
  for (const command of ['set', 'remove']) {
    const d = doubles();
    await assert.rejects(runSecrets({command, label: 'CUA_DEVICE_x', yes: true, scope: 'project'}, d.deps), {code: 'secret_reserved'});
    assert.deepEqual(d.calls, []);
  }
  const d = doubles();
  assert.equal(await runSecrets({command: 'set', label: 'CUA_DEVICE_x'}, d.deps), 0);
  assert.deepEqual(d.calls.filter(c => c[0] === 'write'), [['write', 'CUA_DEVICE_x', VALUE, 'global']]);
});

// The real CLI runs in `home`, a directory outside any git repository, so the project is `home` itself.
const cli = (args, home, options = {}) => spawnSync(process.execPath, [CLI, 'secrets', ...args],
  {cwd: home, env: {...process.env, HOME: home, CUA_HOME: join(home, 'cua-home')}, encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'], ...options});

test('the real CLI lists $HOME/.config/claude-secrets and its project tier, and refuses set without a terminal', t => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'cua-cli-home-')));
  t.after(() => rmSync(home, {recursive: true, force: true}));
  const dir = join(home, '.config', 'claude-secrets');
  const projectDir = join(dir, 'projects', projectSlug(home));
  mkdirSync(projectDir, {recursive: true, mode: 0o700});
  writeFileSync(join(dir, 'FROM_MOD'), 'v', {mode: 0o600});
  writeFileSync(join(projectDir, 'FROM_MOD'), 'p', {mode: 0o600});
  writeFileSync(join(projectDir, 'PROJECT_ONLY'), 'p', {mode: 0o600});
  const listed = cli(['list', '--json'], home);
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout), {ok: true, project: home, labels: ['FROM_MOD', 'PROJECT_ONLY'], scopes: {project: ['FROM_MOD', 'PROJECT_ONLY'], global: ['FROM_MOD']}});
  assert.equal(cli(['list'], home).stdout, 'FROM_MOD (project)\nFROM_MOD (global, shadowed by the project\'s)\nPROJECT_ONLY (project)\n');
  assert.deepEqual(JSON.parse(cli(['list', '-g', '--json'], home).stdout), {ok: true, labels: ['FROM_MOD']});
  assert.equal(cli(['list', '--project', '--global'], home).status, 2);
  const set = cli(['set', 'NEW_KEY', '--project'], home);
  assert.equal(set.status, 1);
  assert.match(set.stderr, /no_terminal|not one/);
  const removed = cli(['remove', 'FROM_MOD', '--yes'], home);
  assert.equal(removed.status, 0, removed.stderr);
  const removedProject = cli(['remove', 'PROJECT_ONLY', '--project', '--yes'], home);
  assert.equal(removedProject.status, 0, removedProject.stderr);
  const missing = cli(['remove', 'PROJECT_ONLY', '--project', '--yes'], home);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /no secret named "PROJECT_ONLY"/);
  assert.deepEqual(JSON.parse(cli(['list', '--json'], home).stdout), {ok: true, project: home, labels: ['FROM_MOD'], scopes: {project: ['FROM_MOD'], global: []}});
});

// A real pty (script(1), BSD syntax on macOS): the value typed is stored exactly and never echoed back.
test('the real CLI stores a value typed at a pty, 0600, without echoing it', {skip: process.platform !== 'darwin' && 'BSD script(1) syntax'}, t => {
  const home = mkdtempSync(join(tmpdir(), 'cua-cli-home-'));
  t.after(() => rmSync(home, {recursive: true, force: true}));
  const typed = spawnSync('/bin/sh', ['-c', `(sleep 1; printf '%s\\r' "$V"; sleep 0.5; printf '%s\\r' "$V"; sleep 1) | script -q /dev/null "$NODE" "$CLI" secrets set PTY_KEY`],
    {env: {...process.env, HOME: home, CUA_HOME: join(home, 'cua-home'), V: VALUE, NODE: process.execPath, CLI}, encoding: 'utf8', timeout: 20_000});
  assert.equal(typed.status, 0, typed.stdout + typed.stderr);
  assert.doesNotMatch(typed.stdout + typed.stderr, /hunter2/, 'nothing echoed');
  const path = join(home, '.config', 'claude-secrets', 'PTY_KEY');
  assert.equal(readFileSync(path, 'utf8'), VALUE);
  assert.equal(statSync(path).mode & 0o777, 0o600);
});
