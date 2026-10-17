// cua's seatbelt port (src/sandbox/seatbelt.mjs) against the golden fixtures the original's own crates rendered
// (test/fixtures/sandbox/seatbelt, #115 M0): byte for byte, in the numeric TIOCSTI form, with cua's recorded deviations
// and nothing else. Each fixture replays on an in-memory macOS-shaped filesystem (./vfs.mjs) on every OS, and on a Mac
// again on the real filesystem, as the generator ran it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SandboxStateError} from '../../src/runtime/sandbox.mjs';
import {SEATBELT_EXEC, seatbeltCommand} from '../../src/sandbox/seatbelt.mjs';
import {sandboxedEnv} from '../../src/sandbox/env.mjs';
import {assertFixtureRoot, materialize, placehold, substitute} from '../../scripts/sandbox-golden/fixtures.mjs';
import {virtualFs} from './vfs.mjs';

const DIR = fileURLToPath(new URL('../fixtures/sandbox/seatbelt/', import.meta.url));
const FIXTURES = readdirSync(DIR).filter(name => name.endsWith('.json')).sort().map(name => JSON.parse(readFileSync(join(DIR, name), 'utf8')));
const EUID = 501;
const VIRTUAL_ROOT = '/private/var/folders/zz/T/sgfixture';
const RUN = '@ROOT@/cuahome/run/7062c419-3288-4b60-970f-a808ecfcf291';

// cua's deviation for a re-exposed path inside a denied directory (src/sandbox/seatbelt.mjs header): the metadata of the
// denied directories above it that no readable root covers, so that path resolution reaches it. Per fixture, in order.
const REEXPOSED_ANCESTORS = {
  'scoped-kernel': ['@ROOT@/cuahome', '@ROOT@/cuahome/run'],
  'default-kernel': ['@ROOT@/cuahome', '@ROOT@/cuahome/run'],
  'symlinked-read-root': ['@ROOT@/cuahome', '@ROOT@/cuahome/run'],
  'home-nesting': ['@ROOT@/cuahome', '@ROOT@/cuahome/run'],
};
// The original's refusal for a relative TMPDIR is cua's deviation too: it would resolve the root against the launcher's
// own working directory, which the scoped preflight cannot see (src/runtime/sandbox.mjs tmpdirRoot), so cua refuses.
const REFUSED = {'tmpdir-relative': /TMPDIR relative\/tmp is not an absolute path/};

// The fixture's expected argv with cua's deviations applied.
function expected(fixture) {
  const args = [...fixture.output.argsNumeric];
  const ancestors = REEXPOSED_ANCESTORS[fixture.name] ?? [];
  if (ancestors.length) {
    args[1] += `\n(allow file-read-metadata ${ancestors.map((_, i) => `(literal (param "REEXPOSED_ANCESTOR_${i}"))`).join(' ')})`;
    args.splice(args.indexOf('--'), 0, ...ancestors.map((path, i) => `-DREEXPOSED_ANCESTOR_${i}=${path}`));
  }
  return args;
}

function replay(fixture, {root, fs}) {
  const input = substitute(fixture.input, {root});
  const tmpdir = fixture.tmpdir === null ? undefined : substitute(fixture.tmpdir, {root});
  const metadataGrants = (REEXPOSED_ANCESTORS[fixture.name] ?? []).map(path => substitute(path, {root}));
  return () => seatbeltCommand({profile: input.profile, cwd: input.cwd, command: input.command, tmpdir, fs, euid: EUID, metadataGrants});
}

function check(fixture, run, {root}) {
  if (REFUSED[fixture.name]) return assert.throws(run, error => error instanceof SandboxStateError && REFUSED[fixture.name].test(error.message));
  if (fixture.output.error) {
    const first = substitute(fixture.output.error, {root}).split('\n')[0];
    return assert.throws(run, error => error instanceof SandboxStateError && error.message === first, fixture.name);
  }
  const {file, args} = run();
  assert.equal(file, SEATBELT_EXEC);
  const got = placehold(args, {root, euid: EUID});
  const want = expected(fixture);
  assert.equal(got[1], want[1], `${fixture.name}: the profile`);
  assert.deepEqual(got, want, `${fixture.name}: the argv`);
}

test('every golden fixture: the port renders the original\'s argv byte for byte, with cua\'s deviations only', () => {
  assert.equal(FIXTURES.length, 20);
  for (const fixture of FIXTURES) {
    const fs = virtualFs({root: VIRTUAL_ROOT, setup: fixture.setup, fill: value => substitute(value, {root: VIRTUAL_ROOT})});
    check(fixture, replay(fixture, {root: VIRTUAL_ROOT, fs}), {root: VIRTUAL_ROOT});
  }
});

test('on a Mac, every golden fixture replays on the real filesystem too', {skip: process.platform !== 'darwin' && 'the fixtures assume macOS\'s /tmp and /var aliases'}, () => {
  for (const fixture of FIXTURES) {
    const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'sg')));
    try {
      assertFixtureRoot(root);
      materialize(fixture.setup, {root});
      check(fixture, replay(fixture, {root, fs: undefined}), {root});
    } finally { rmSync(root, {recursive: true, force: true}); }
  }
});

test('the child\'s environment: the original\'s strip list (any case) and CODEX_GUARDIAN_DECISIONS_API_KEY go, CODEX_SANDBOX and the network flag come', () => {
  for (const fixture of FIXTURES.filter(f => !f.output.error)) {
    const network = fixture.input.profile.network;
    const want = {...fixture.output.env};
    delete want.CODEX_GUARDIAN_DECISIONS_API_KEY;
    assert.deepEqual(sandboxedEnv(fixture.input.env, {platform: 'darwin', network}), want, fixture.name);
  }
});

test('inputs outside cua\'s set are refused, never rendered', () => {
  const fs = virtualFs({root: VIRTUAL_ROOT, setup: [{dir: 'run'}]});
  const cwd = `${VIRTUAL_ROOT}/run`;
  const render = (entries, {network = 'restricted', type = 'managed', fsType = 'restricted'} = {}) =>
    () => seatbeltCommand({profile: {type, network, file_system: {type: fsType, entries}}, cwd, command: ['/bin/true'], tmpdir: undefined, fs, euid: EUID});
  const special = (kind, extra = {}) => ({type: 'special', value: {kind, ...extra}});
  const refused = (thunk, pattern) => assert.throws(thunk, error => error instanceof SandboxStateError && pattern.test(error.message));
  refused(render([{path: special('root'), access: 'write'}]), /:root .* read/);
  refused(render([{path: special('root'), access: 'none'}]), /:root .* read/);
  refused(render([{path: special('project_roots', {subpath: 'x'}), access: 'write'}]), /subpath/);
  refused(render([{path: special('unknown'), access: 'read'}]), /unsupported/);
  refused(render([{path: {type: 'glob_pattern', pattern: '/x/**'}, access: 'none'}]), /unsupported/);
  refused(render([{path: {type: 'path', path: 'relative'}, access: 'read'}]), /absolute/);
  refused(render([{path: special('root'), access: 'execute'}]), /access/);
  refused(render([], {network: 'proxy'}), /network/);
  refused(render([], {type: 'disabled'}), /managed/);
  refused(render([], {fsType: 'unrestricted'}), /restricted/);
});

test('the run directory spelled through a symlinked component is refused, as the original refuses it', () => {
  const fs = virtualFs({root: VIRTUAL_ROOT, setup: [{dir: 'run/s'}, {symlink: 'link', target: 'run'}]});
  const profile = {type: 'managed', network: 'restricted', file_system: {type: 'restricted', entries: [{path: {type: 'special', value: {kind: 'project_roots'}}, access: 'write'}]}};
  assert.throws(() => seatbeltCommand({profile, cwd: `${VIRTUAL_ROOT}/link/s`, command: ['/bin/true'], fs, euid: EUID}),
    new SandboxStateError(`writable root ${VIRTUAL_ROOT}/link/s contains symlink component ${VIRTUAL_ROOT}/link; symlinked writable roots are not supported.`));
});

test('the daemon directory follows /tmp\'s real path and the effective uid', () => {
  const fs = virtualFs({root: VIRTUAL_ROOT, setup: [{dir: 'run'}]});
  const profile = {type: 'managed', network: 'restricted', file_system: {type: 'restricted', entries: [{path: {type: 'special', value: {kind: 'root'}}, access: 'read'}]}};
  const {args} = seatbeltCommand({profile, cwd: `${VIRTUAL_ROOT}/run`, command: ['/bin/true'], fs, euid: 777});
  assert.match(args[1], /\(deny file-read\* file-write\* \(literal "\/private\/tmp\/codex-daemon-777"\) \(subpath "\/private\/tmp\/codex-daemon-777"\)\)/);
  assert.deepEqual(args.slice(2), ['--', '/bin/true'], 'full read and no write root: no parameters at all');
});

test('a denied path whose ancestors a readable root covers needs no metadata grant', () => {
  const fs = virtualFs({root: VIRTUAL_ROOT, setup: [{dir: 'home/secret/inner'}, {dir: 'run'}]});
  const path = p => ({type: 'path', path: `${VIRTUAL_ROOT}/${p}`});
  const profile = {type: 'managed', network: 'restricted', file_system: {type: 'restricted', entries: [
    {path: path('home/secret'), access: 'none'}, {path: {type: 'special', value: {kind: 'root'}}, access: 'read'}]}};
  const {args} = seatbeltCommand({profile, cwd: `${VIRTUAL_ROOT}/run`, command: ['/bin/true'], fs, euid: EUID});
  assert.doesNotMatch(args[1], /file-read-metadata/);
  const nested = {...profile, file_system: {...profile.file_system, entries: [...profile.file_system.entries, {path: path('home/secret/inner'), access: 'read'}]}};
  assert.throws(() => seatbeltCommand({profile: nested, cwd: `${VIRTUAL_ROOT}/run`, command: ['/bin/true'], fs, euid: EUID}), SandboxStateError, 'not granted unless allowed');
  const {args: nestedArgs} = seatbeltCommand({profile: nested, cwd: `${VIRTUAL_ROOT}/run`, command: ['/bin/true'], fs, euid: EUID, metadataGrants: [`${VIRTUAL_ROOT}/home/secret`]});
  assert.match(nestedArgs[1], /\n\(allow file-read-metadata \(literal \(param "REEXPOSED_ANCESTOR_0"\)\)\)$/);
  assert.ok(nestedArgs.includes(`-DREEXPOSED_ANCESTOR_0=${VIRTUAL_ROOT}/home/secret`));
});

test('at equal specificity deny beats write and write beats read (the original\'s precedence)', () => {
  const fs = virtualFs({root: VIRTUAL_ROOT, setup: [{dir: 'run/s'}, {dir: 'other'}]});
  const path = p => ({type: 'path', path: `${VIRTUAL_ROOT}/${p}`});
  const render = entries => seatbeltCommand({profile: {type: 'managed', network: 'restricted', file_system: {type: 'restricted', entries: [
    {path: {type: 'special', value: {kind: 'root'}}, access: 'read'}, ...entries]}}, cwd: `${VIRTUAL_ROOT}/run/s`, command: ['/bin/true'], fs, euid: EUID}).args;
  const denied = render([{path: path('other'), access: 'write'}, {path: path('other'), access: 'none'}]);
  assert.ok(!denied.some(a => a.startsWith('-DWRITABLE_ROOT')), 'the denied path is no write root');
  assert.ok(denied.includes(`-DREADABLE_ROOT_0_EXCLUDED_0=${VIRTUAL_ROOT}/other`), 'and it is excluded from the readable root');
  const written = render([{path: path('other'), access: 'read'}, {path: path('other'), access: 'write'}]);
  assert.deepEqual(written.filter(a => a.startsWith('-D')), [`-DWRITABLE_ROOT_0=${VIRTUAL_ROOT}/other`], 'the write entry wins over the read one, with no carve-out of itself');
});
