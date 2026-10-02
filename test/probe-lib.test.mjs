import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runtimePaths, probeEnv, descendants, classifyProcesses, socketHolders, sanitize} from '../scripts/probe/lib.mjs';

const HOME_DIR = '/Users/someone';
const CUA_HOME = '/tmp/cua-probe.abc';
const RELEASE = '26.928.40906-darwin-arm64';
const paths = runtimePaths({home: CUA_HOME, release: RELEASE});

test('runtime paths all live under the release directory of the given home', () => {
  const root = `${CUA_HOME}/runtimes/${RELEASE}`;
  assert.equal(paths.root, root);
  for (const key of ['node', 'nodeRepl', 'cuaRepl', 'moduleDir', 'codexCli', 'skyServiceApp', 'skyVendorService'])
    assert.ok(paths[key].startsWith(root + '/'), `${key} escapes the release tree: ${paths[key]}`);
  assert.equal(paths.codexHome, `${CUA_HOME}/state/codex`);
});

test('probe env carries only allowlisted ambient variables plus relocated launch settings', () => {
  const ambient = {
    HOME: HOME_DIR, USER: 'someone', LOGNAME: 'someone', TMPDIR: '/var/tmp/x/', LANG: 'en_US.UTF-8',
    PATH: '/opt/homebrew/bin:/usr/bin', CODEX_HOME: `${HOME_DIR}/.codex`,
    NODE_REPL_TRUSTED_SERVICES: '{"sky":"/evil.mjs"}', NODE_REPL_NODE_MODULE_DIRS: '/Applications/ChatGPT.app/x',
    SKY_CUA_SERVICE_NATIVE_PIPE_PATH: '/tmp/other.sock', BROWSER_USE_AVAILABLE_BACKENDS: 'chrome',
    NODE_OPTIONS: '--require /evil.js', CUA_SHIM_CODEX_HOME: '/tmp/x', SECRET_TOKEN: 'nope',
  };
  const env = probeEnv({ambient, paths, wrapperPath: '/repo/scripts/probe/sky-wrapper-fixture.mjs', trustedCodeDirs: ['/repo/scripts/probe']});
  assert.equal(env.HOME, HOME_DIR);
  assert.equal(env.LANG, 'en_US.UTF-8');
  assert.equal(env.PATH, '/usr/bin:/bin:/usr/sbin:/sbin');
  for (const leaked of ['NODE_OPTIONS', 'CUA_SHIM_CODEX_HOME', 'SECRET_TOKEN', 'SKY_CUA_SERVICE_NATIVE_PIPE_PATH', 'BROWSER_USE_AVAILABLE_BACKENDS'])
    assert.equal(env[leaked], undefined, `${leaked} leaked into the child env`);
  assert.equal(env.CODEX_HOME, paths.codexHome);
  assert.equal(env.CUA_REPL_NODE_REPL_PATH, paths.nodeRepl);
  assert.equal(env.NODE_REPL_NODE_PATH, paths.node);
  assert.equal(env.NODE_REPL_NODE_MODULE_DIRS, paths.moduleDir);
  assert.equal(env.CODEX_CLI_PATH, paths.codexCli);
  assert.equal(env.SKY_CUA_SERVICE_PATH, paths.skyServiceApp);
  assert.equal(env.CUA_REPL_ENABLED_SURFACES, 'computer');
  assert.deepEqual(JSON.parse(env.NODE_REPL_TRUSTED_SERVICES), {sky: '/repo/scripts/probe/sky-wrapper-fixture.mjs'});
  assert.equal(env.CUA_SKY_VENDOR_SERVICE, paths.skyVendorService);
  assert.deepEqual(env.NODE_REPL_TRUSTED_CODE_PATHS.split(':'), [paths.codexHome, paths.moduleDir, '/repo/scripts/probe']);
  assert.equal(env.NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS, undefined);
});

test('probe env grants a sandbox socket allowance only when asked', () => {
  const env = probeEnv({ambient: {HOME: HOME_DIR}, paths, wrapperPath: '/w.mjs', trustedCodeDirs: ['/'], allowUnixSockets: ['/tmp/a.sock']});
  assert.equal(env.NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS, '/tmp/a.sock');
});

const PS = [
  '    1     0 /sbin/launchd',
  '  500     1 /Applications/ChatGPT.app/Contents/MacOS/ChatGPT',
  '  501   500 /Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl',
  '  900   800 /usr/local/bin/node',
  ` 1000   900 ${paths.node}`,
  ` 1001  1000 ${paths.nodeRepl}`,
  ` 1002  1001 ${paths.codexCli}`,
  ` 1003  1002 ${paths.node}`,
  ` 1005  1000 ${paths.skyServiceApp}/Contents/MacOS/SkyComputerUseService`,
].join('\n');

test('descendants follow the parent chain from the probe child only, keeping executable paths with spaces', () => {
  const tree = descendants(PS, 1000);
  assert.deepEqual(tree.map(p => p.pid), [1000, 1001, 1005, 1002, 1003]);
  assert.equal(tree[1].ppid, 1000);
  assert.equal(tree[1].executable, paths.nodeRepl);
  assert.equal(tree[2].executable, `${paths.skyServiceApp}/Contents/MacOS/SkyComputerUseService`);
});

test('process classification flags any installed-desktop runtime path in the owned tree', () => {
  const clean = classifyProcesses(descendants(PS, 1000), {relocatedRoot: paths.root});
  assert.equal(clean.desktopRuntimePaths.length, 0);
  assert.equal(clean.allExecutablesRelocated, true);
  const dirty = PS + `\n 1004  1001 /Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node`;
  const flagged = classifyProcesses(descendants(dirty, 1000), {relocatedRoot: paths.root});
  assert.deepEqual(flagged.desktopRuntimePaths.map(p => p.pid), [1004]);
  assert.equal(flagged.allExecutablesRelocated, false);
});

test('socket holders are read from lsof field output', () => {
  const out = ['p34706', 'cSkyComputerUseService', 'f8', 'n/Users/someone/Library/x/computeruse.sock', 'p123', 'cother', 'f3'].join('\n');
  assert.deepEqual(socketHolders(out), [{pid: 34706, command: 'SkyComputerUseService'}, {pid: 123, command: 'other'}]);
});

test('sanitize replaces the scratch home and user home with placeholders, deeply', () => {
  const out = sanitize({a: `${CUA_HOME}/runtimes/x`, b: [`${HOME_DIR}/Library/y`, 3], c: {d: `see ${CUA_HOME}`}}, {cuaHome: CUA_HOME, userHome: HOME_DIR});
  assert.deepEqual(out, {a: '$CUA_HOME/runtimes/x', b: ['~/Library/y', 3], c: {d: 'see $CUA_HOME'}});
});
