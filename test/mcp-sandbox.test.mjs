// node_repl's per-call sandbox state (issues #20, #36): CUA_SHIM_SANDBOX picks it, the server attaches it to every call
// it makes to the runtime (js, js_reset and the private turn_ended), and a caller's own sandbox entry never reaches the
// runtime, whichever mode is set. Under the scoped default no write root may cover a trusted code path or CODEX_HOME,
// or lie inside one: cua refuses that launch, saying why (node_repl itself refuses a kernel over writable trusted code).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, realpathSync, symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {shortScratch} from './fixtures/runtime-fixture.mjs';
import {harness, initialized, structured} from './fixtures/mcp-harness.mjs';
import {settingsFrom} from '../src/mcp/server.mjs';
import {SANDBOX_META_KEY, assertSandboxFits, protectedPaths, sandboxConflicts, scopedWriteRoots, tmpdirRoot, sandboxModeFrom, sandboxState, withSandbox} from '../src/runtime/sandbox.mjs';

const CWD = '/Users/someone/Library/Application Support/cua/run/sess';
const DISABLED = {permissionProfile: {type: 'disabled'}, sandboxCwd: pathToFileURL(CWD).href};
// The profile spike #33 measured: reads everywhere, writes to the run directory (project_roots, resolved against
// sandboxCwd) and $TMPDIR only, no network. Never slash_tmp: it would put any checkout or runtime under /tmp in reach.
const special = kind => ({type: 'special', value: {kind}});
const SCOPED = {
  permissionProfile: {type: 'managed', file_system: {type: 'restricted', entries: [
    {path: special('root'), access: 'read'},
    {path: special('project_roots'), access: 'write'},
    {path: special('tmpdir'), access: 'write'},
  ]}, network: 'restricted'},
  sandboxCwd: pathToFileURL(CWD).href,
};

test('CUA_SHIM_SANDBOX defaults to scoped, accepts disabled and default and rejects anything else as an invalid setting', () => {
  assert.equal(SANDBOX_META_KEY, 'codex/sandbox-state-meta');
  assert.equal(settingsFrom({}).sandbox, 'scoped');
  assert.equal(sandboxModeFrom({}), 'scoped');
  for (const mode of ['scoped', 'disabled', 'default']) assert.equal(settingsFrom({CUA_SHIM_SANDBOX: mode}).sandbox, mode);
  for (const value of ['', 'Scoped', 'off', 'managed', 'disabled,default'])
    assert.throws(() => settingsFrom({CUA_SHIM_SANDBOX: value}), {code: 'invalid_setting', message: /CUA_SHIM_SANDBOX must be scoped, disabled or default/});
});

test('scoped is the managed restricted profile of spike #33 with the session directory as an absolute file URI', () => {
  const state = sandboxState('scoped', CWD);
  assert.deepEqual(state, SCOPED);
  assert.equal(JSON.stringify(state).includes('slash_tmp'), false);
  assert.match(state.sandboxCwd, /^file:\/\/\/Users\/someone\/Library\/Application%20Support\//);
});

test('disabled is the disabled permission profile with the session directory as an absolute file URI; default is none', () => {
  assert.deepEqual(sandboxState('disabled', CWD), DISABLED);
  assert.match(DISABLED.sandboxCwd, /^file:\/\/\/Users\/someone\/Library\/Application%20Support\//);
  assert.equal(sandboxState('default', CWD), null);
});

test('sandboxConflicts names a protected path inside a write root, or a write root inside one, by real path', t => {
  const s = shortScratch();
  t.after(s.cleanup);
  const base = realpathSync(s.dir);
  for (const dir of ['tmp/home/runtimes/modules', 'tmp/home/state/codex', 'checkout/src/services', 'checkout/src/secrets', 'home2/run', 'tmp2']) mkdirSync(join(base, dir), {recursive: true});
  symlinkSync(join(base, 'tmp'), join(base, 'tmp-link'));
  const guarded = protectedPaths({trustedCodePaths: [join(base, 'tmp/home/runtimes/modules'), join(base, 'checkout/src/services'), join(base, 'checkout/src/secrets')], codexHome: join(base, 'tmp/home/state/codex')});
  assert.deepEqual(guarded.map(p => p.label), ['the trusted code path', 'the trusted code path', 'the trusted code path', 'the runtime\'s configuration and approvals']);
  // $TMPDIR given through a symlink still covers the runtime's modules and its CODEX_HOME below its real path.
  const tmp = {label: '$TMPDIR', path: join(base, 'tmp')};
  assert.deepEqual(sandboxConflicts({protectedPaths: guarded, writeRoots: [{label: 'the run directory', path: join(base, 'home2/run/sess')}, {label: '$TMPDIR', path: join(base, 'tmp-link')}]}), [
    {root: tmp, protected: {label: 'the trusted code path', path: join(base, 'tmp/home/runtimes/modules')}, inside: 'protected'},
    {root: tmp, protected: {label: 'the runtime\'s configuration and approvals', path: join(base, 'tmp/home/state/codex')}, inside: 'protected'},
  ]);
  // A run directory inside a trusted path: cells could create modules there.
  assert.deepEqual(sandboxConflicts({protectedPaths: guarded, writeRoots: [{label: 'the run directory', path: join(base, 'checkout/src/services/run/sess')}]}),
    [{root: {label: 'the run directory', path: join(base, 'checkout/src/services/run/sess')}, protected: {label: 'the trusted code path', path: join(base, 'checkout/src/services')}, inside: 'root'}]);
  // Siblings and shared prefixes are not overlaps.
  assert.deepEqual(sandboxConflicts({protectedPaths: protectedPaths({trustedCodePaths: [join(base, 'tmp2x'), join(base, 'checkout/src/services')]}), writeRoots: [{label: '$TMPDIR', path: join(base, 'tmp2')}, {label: 'the run directory', path: join(base, 'checkout/src/servicesX')}]}), []);
});

test('sandboxConflicts sees through a case variant on a case-insensitive volume and a dangling symlink to a protected path', t => {
  const s = shortScratch();
  t.after(s.cleanup);
  const base = realpathSync.native(s.dir);
  mkdirSync(join(base, 'home/state'), {recursive: true});
  const codexHome = join(base, 'home/state/codex');
  // TMPDIR names the not-yet-created CODEX_HOME through a symlink: serve creates the directory right after the check.
  symlinkSync(codexHome, join(base, 'tmp-alias'));
  assert.deepEqual(sandboxConflicts({protectedPaths: protectedPaths({trustedCodePaths: [], codexHome}), writeRoots: [{label: '$TMPDIR', path: join(base, 'tmp-alias')}]}),
    [{root: {label: '$TMPDIR', path: codexHome}, protected: {label: 'the runtime\'s configuration and approvals', path: codexHome}, inside: 'protected'}]);
  // A relative link target resolves against the link's own directory.
  symlinkSync('home/state/codex', join(base, 'tmp-relative'));
  assert.equal(sandboxConflicts({protectedPaths: protectedPaths({trustedCodePaths: [], codexHome}), writeRoots: [{label: '$TMPDIR', path: join(base, 'tmp-relative')}]}).length, 1);
  const upper = join(base, 'HOME');
  if (existsSync(upper)) {
    const conflicts = sandboxConflicts({protectedPaths: protectedPaths({trustedCodePaths: [join(base, 'home/state')]}), writeRoots: [{label: '$TMPDIR', path: upper}]});
    assert.deepEqual(conflicts.map(c => [c.root.path, c.inside]), [[join(base, 'home'), 'protected']], 'a case variant resolves to the on-disk spelling');
  }
});

test('the tmpdir write root exists only for a non-empty absolute TMPDIR, as in Codex\'s resolution', () => {
  assert.equal(tmpdirRoot('/var/folders/x/T/'), '/var/folders/x/T/');
  for (const value of [undefined, '', '.', 'tmp', './T']) assert.equal(tmpdirRoot(value), null, String(value));
  assert.deepEqual(scopedWriteRoots({cwd: '/h/run/s', tmpdir: '.'}), [{label: 'the run directory', path: '/h/run/s'}]);
  assert.deepEqual(scopedWriteRoots({cwd: '/h/run/s', tmpdir: '/T'}).map(r => r.label), ['the run directory', '$TMPDIR']);
});

test('assertSandboxFits refuses a scoped launch whose $TMPDIR covers a protected path, naming both and the remedy; other modes pass', t => {
  const s = shortScratch();
  t.after(s.cleanup);
  const base = realpathSync(s.dir);
  mkdirSync(join(base, 'T/cua/runtimes/r/modules'), {recursive: true});
  mkdirSync(join(base, 'T/cua/state/codex'), {recursive: true});
  mkdirSync(join(base, 'T/cua/run'), {recursive: true});
  const launch = {cwd: join(base, 'T/cua/run/sess'), env: {TMPDIR: join(base, 'T') + '/', NODE_REPL_TRUSTED_CODE_PATHS: join(base, 'T/cua/runtimes/r/modules'), CODEX_HOME: join(base, 'T/cua/state/codex')}};
  assert.throws(() => assertSandboxFits('scoped', launch), error => {
    assert.equal(error.code, 'sandbox_conflict');
    assert.match(error.message, /^CUA_SHIM_SANDBOX=scoped lets JavaScript cells write/);
    assert.ok(error.message.includes(`write $TMPDIR (${join(base, 'T')}), which contains the trusted code path ${join(base, 'T/cua/runtimes/r/modules')}, the runtime's configuration and approvals ${join(base, 'T/cua/state/codex')}. `), error.message);
    assert.match(error.message, /node_repl refuses to start a kernel over writable trusted code/);
    assert.match(error.hint, /outside \$TMPDIR/);
    assert.match(error.hint, /CUA_SHIM_SANDBOX=disabled/);
    return true;
  });
  assert.doesNotThrow(() => assertSandboxFits('disabled', launch));
  assert.doesNotThrow(() => assertSandboxFits('default', launch));
  assert.doesNotThrow(() => assertSandboxFits('scoped', {...launch, env: {...launch.env, TMPDIR: join(base, 'elsewhere')}}));
  const {TMPDIR: _unset, ...noTmpdir} = launch.env;
  assert.doesNotThrow(() => assertSandboxFits('scoped', {...launch, env: noTmpdir}), 'no TMPDIR, no tmpdir write root');
});

test('withSandbox replaces a caller\'s sandbox entry with the server\'s, or drops it when the server sends none', () => {
  const client = {progressToken: 'p', [SANDBOX_META_KEY]: {permissionProfile: {type: 'managed'}}};
  assert.deepEqual(withSandbox(client, DISABLED), {progressToken: 'p', [SANDBOX_META_KEY]: DISABLED});
  assert.deepEqual(withSandbox(client, null), {progressToken: 'p'});
  assert.deepEqual(withSandbox(undefined, null), {});
});

async function oneTask(h, {meta} = {}) {
  await initialized(h);
  const js = h.client.call('js', {code: 'a'}, {meta});
  const upJs = await h.upstream.nextCall('js');
  h.upstream.text(upJs, 'a');
  await js.response;
  const reset = h.client.call('js_reset', {}, {meta});
  const upReset = await h.upstream.nextCall('js_reset');
  h.upstream.text(upReset, 'reset');
  await reset.response;
  const end = h.client.call('end_task');
  const upEnded = await h.upstream.nextCall('turn_ended');
  h.upstream.reply(upEnded, {content: [], isError: false});
  assert.equal(structured(await end.response).status, 'ended');
  return [upJs, upReset, upEnded].map(m => m.params._meta);
}

test('with a sandbox state, js, js_reset and turn_ended all carry it beside the turn metadata', async () => {
  for (const state of [SCOPED, DISABLED]) {
    const metas = await oneTask(harness({server: {sandboxState: state}}));
    for (const meta of metas) {
      assert.deepEqual(meta[SANDBOX_META_KEY], state);
      assert.equal(meta['x-codex-turn-metadata'].session_id, 'session-under-test');
    }
  }
});

test('without a sandbox state (CUA_SHIM_SANDBOX=default) no call carries the field', async () => {
  const metas = await oneTask(harness({server: {sandboxState: null}}));
  for (const meta of metas) assert.equal(SANDBOX_META_KEY in meta, false);
});

test('a client\'s own sandbox entry is overridden by the server\'s, and dropped when the server sends none; other client _meta is kept', async () => {
  const meta = {progressToken: 'p1', [SANDBOX_META_KEY]: {permissionProfile: {type: 'managed'}, sandboxCwd: 'file:///'}};
  const [js, reset] = await oneTask(harness({server: {sandboxState: SCOPED}}), {meta});
  for (const m of [js, reset]) {
    assert.deepEqual(m[SANDBOX_META_KEY], SCOPED);
    assert.equal(m.progressToken, 'p1');
  }
  const [jsNone, resetNone] = await oneTask(harness({server: {sandboxState: null}}), {meta});
  for (const m of [jsNone, resetNone]) {
    assert.equal(SANDBOX_META_KEY in m, false);
    assert.equal(m.progressToken, 'p1');
  }
});
