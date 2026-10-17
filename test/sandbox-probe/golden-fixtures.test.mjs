// The golden generator's driver (scripts/sandbox-golden, #115 M0): fixture inputs carry path placeholders that are
// substituted for a fresh scratch root before the original's generator runs, and its output is mapped back to the same
// placeholders, so a fixture is byte-stable on any Mac. The case matrix is the spec's (Plan of Work, M0).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lstatSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {assertFixtureRoot, materialize, placehold, substitute} from '../../scripts/sandbox-golden/fixtures.mjs';
import {CASES} from '../../scripts/sandbox-golden/cases.mjs';

const ROOT = '/private/var/folders/ab/cd123/T/sgAbC123';

test('substitute fills @ROOT@ and the /var alias spelling at every depth', () => {
  const value = substitute({cwd: '@ROOT@/run', list: ['@VAR_ROOT@/tmp', 7, null], nested: {p: '@ROOT@'}}, {root: ROOT});
  assert.deepEqual(value, {cwd: `${ROOT}/run`, list: ['/var/folders/ab/cd123/T/sgAbC123/tmp', 7, null], nested: {p: ROOT}});
});

test('substitute refuses the /var alias for a root that is not under /private/var', () => {
  assert.throws(() => substitute('@VAR_ROOT@/x', {root: '/private/tmp/sgAbC123'}), /VAR_ROOT/);
  assert.equal(substitute('@ROOT@/x', {root: '/private/tmp/sgAbC123'}), '/private/tmp/sgAbC123/x');
});

test('placehold maps the root, its alias spelling and the daemon directory euid back to placeholders', () => {
  const output = {
    argsNumeric: ['-p', `(regex #"^${ROOT}/run/\\.git(/.*)?$")\n(deny file-read* (literal "/private/tmp/codex-daemon-501"))`, `-DWRITABLE_ROOT_0=${ROOT}/run`, '--', '/bin/true'],
    env: {TMPDIR: '/var/folders/ab/cd123/T/sgAbC123/tmp', HOME: `${ROOT}/home`, UID_LIKE: '501'},
  };
  assert.deepEqual(placehold(output, {root: ROOT, euid: 501}), {
    argsNumeric: ['-p', '(regex #"^@ROOT@/run/\\.git(/.*)?$")\n(deny file-read* (literal "/private/tmp/codex-daemon-@EUID@"))', '-DWRITABLE_ROOT_0=@ROOT@/run', '--', '/bin/true'],
    env: {TMPDIR: '@VAR_ROOT@/tmp', HOME: '@ROOT@/home', UID_LIKE: '501'},
  });
});

test('placehold is the inverse of substitute on fixture inputs', () => {
  const input = {cwd: '@ROOT@/cuahome/run/S', env: {TMPDIR: '@VAR_ROOT@/cuahome/run/S/tmp'}};
  assert.deepEqual(placehold(substitute(input, {root: ROOT}), {root: ROOT, euid: 501}), input);
});

test('a fixture root must be absolute, real-path shaped and free of regex metacharacters', () => {
  assert.doesNotThrow(() => assertFixtureRoot(ROOT));
  assert.throws(() => assertFixtureRoot('relative/sg'), /absolute/);
  for (const bad of ['/private/tmp/sg-1', '/private/tmp/sg.1', '/private/tmp/sg~1', '/private/tmp/sg 1'])
    assert.throws(() => assertFixtureRoot(bad), /metacharacter|character/, bad);
});

test('materialize creates the setup: directories, files and symlinks, targets substituted', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'sg')));
  try {
    materialize([{dir: 'a/b'}, {file: 'a/b/f.txt', content: 'x'}, {symlink: 'link', target: '@ROOT@/a/b'}, {symlink: 'rel', target: 'a'}], {root});
    assert.ok(lstatSync(join(root, 'a/b')).isDirectory());
    assert.equal(readFileSync(join(root, 'a/b/f.txt'), 'utf8'), 'x');
    assert.equal(readlinkSync(join(root, 'link')), join(root, 'a/b'));
    assert.equal(readlinkSync(join(root, 'rel')), 'a');
    assert.throws(() => materialize([{dir: '../escape'}], {root}), /inside/);
  } finally { rmSync(root, {recursive: true, force: true}); }
});

test('the case matrix covers the spec\'s fixtures, each case named once', () => {
  const names = CASES.map(c => c.name);
  assert.equal(new Set(names).size, names.length);
  for (const required of ['scoped-worker', 'scoped-kernel', 'default-worker', 'default-kernel', 'carve-outs-present', 'carve-outs-gitdir-pointer',
    'tmpdir-unset', 'tmpdir-relative', 'tmpdir-var-alias', 'symlinked-write-root', 'symlinked-read-root', 'vendor-script-dir-in-tmpdir',
    'deny-one', 'deny-several', 'deny-missing-target', 'home-nesting'])
    assert.ok(names.includes(required), required);
  for (const c of CASES) {
    assert.match(c.input.cwd, /^@ROOT@\//, c.name);
    assert.ok(c.tmpdir === null || typeof c.tmpdir === 'string', c.name);
    assert.equal(c.input.env.TMPDIR, c.tmpdir ?? undefined, `${c.name}: the child's TMPDIR is the generator's`);
    assert.equal(c.input.profile.type, 'managed', c.name);
  }
});

test('case entries are in cua\'s TOML key order: absolute paths by bytes, then :root, :tmpdir, :workspace_roots', () => {
  // A real root is absolute ('/' sorts before ':'); the placeholder stands for it.
  const key = e => e.path.type === 'path' ? e.path.path.replace('@ROOT@', '/root') : `:${e.path.value.kind === 'project_roots' ? 'workspace_roots' : e.path.value.kind}`;
  for (const c of CASES) {
    const keys = c.input.profile.file_system.entries.map(key);
    const sorted = [...keys].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    assert.deepEqual(keys, sorted, c.name);
  }
  const kernel = CASES.find(c => c.name === 'scoped-kernel').input.profile.file_system.entries;
  assert.ok(kernel.some(e => e.access === 'none' && e.path.path === '@ROOT@/cuahome'));
  assert.ok(kernel.some(e => e.access === 'read' && e.path.path === '@ROOT@/cuahome/runtimes'));
});

test('the committed fixtures are the case matrix\'s, input for input, each with an output or the original\'s refusal', () => {
  const dir = new URL('../fixtures/sandbox/seatbelt/', import.meta.url);
  const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  assert.deepEqual(files, CASES.map(c => `${c.name}.json`).sort());
  for (const spec of CASES) {
    const fixture = JSON.parse(readFileSync(new URL(`${spec.name}.json`, dir), 'utf8'));
    assert.deepEqual({setup: fixture.setup, tmpdir: fixture.tmpdir, input: fixture.input}, {setup: spec.setup, tmpdir: spec.tmpdir, input: spec.input}, spec.name);
    assert.equal(fixture.upstream.commit, 'ff6aec96948b70d94983af2641a6b67c94faeff5');
    assert.ok(fixture.output.error || (fixture.output.argsNumeric[0] === '-p' && fixture.output.argsSymbolic.at(-1) === spec.input.command.at(-1)), spec.name);
  }
});
