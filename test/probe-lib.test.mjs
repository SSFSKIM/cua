import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runtimePaths, probeEnv, descendants, classifyProcesses, socketHolders, sanitize, nativeSocketStep, procTable, outsideAnchorGroup, survivors} from '../scripts/probe/lib.mjs';

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
  // No observed process is no evidence of relocation.
  assert.equal(classifyProcesses([], {relocatedRoot: paths.root}).allExecutablesRelocated, false);
});

test('socket holders are read from lsof field output', () => {
  const out = ['p34706', 'cSkyComputerUseService', 'f8', 'n/Users/someone/Library/x/computeruse.sock', 'p123', 'cother', 'f3'].join('\n');
  assert.deepEqual(socketHolders(out), [{pid: 34706, command: 'SkyComputerUseService'}, {pid: 123, command: 'other'}]);
});

test('sanitize replaces the scratch home and user home with placeholders, deeply', () => {
  const out = sanitize({a: `${CUA_HOME}/runtimes/x`, b: [`${HOME_DIR}/Library/y`, 3], c: {d: `see ${CUA_HOME}`}}, {cuaHome: CUA_HOME, userHome: HOME_DIR});
  assert.deepEqual(out, {a: '$CUA_HOME/runtimes/x', b: ['~/Library/y', 3], c: {d: 'see $CUA_HOME'}});
});

// Phase F: on Linux the computer-use helper is the runtime's own child over stdio, so the native-socket holder step
// reads skip; the process tree is read from /proc (ps's comm is truncated there); the deb's desktop runtime is flagged.
test('the native-socket holder step applies on macOS only and reads skip on Linux', () => {
  assert.equal(nativeSocketStep('darwin'), null);
  assert.deepEqual(nativeSocketStep('linux'), {status: 'skip', reason: 'linux: the computer-use helper (sky_linux) is a child process of the runtime over stdio, not a native socket holder'});
});

test('a Linux process table pairs each pid and parent with its /proc executable; an unreadable one stays, marked', () => {
  const exe = {10: '/usr/bin/node', 11: '/home/u/.local/share/cua/runtimes/r/cua_node/bin/node', 12: '/home/u/a dir/node_repl', 14: '/usr/lib/chatgpt/resources/cua_node/bin/node_repl'};
  const fails = {13: 'EACCES', 15: 'ENOENT'};
  const readExe = pid => { if (fails[pid]) throw Object.assign(new Error(fails[pid]), {code: fails[pid]}); return exe[pid]; };
  const text = procTable('   10     1\n   11    10\n   12    11\n   13    11\n   14    13\n   15    11\n', readExe);
  assert.equal(text, ['10 1 /usr/bin/node', '11 10 /home/u/.local/share/cua/runtimes/r/cua_node/bin/node', '12 11 /home/u/a dir/node_repl',
    '13 11 <unreadable EACCES>', '14 13 /usr/lib/chatgpt/resources/cua_node/bin/node_repl'].join('\n'), 'a gone process (ENOENT) is dropped');
  const tree = descendants(text, 11);
  assert.deepEqual(tree.map(p => p.pid), [11, 12, 13, 14], 'the subtree below an unreadable process is kept');
  const verdict = classifyProcesses(tree, {relocatedRoot: '/home/u/.local/share/cua/runtimes/r'});
  assert.equal(verdict.allExecutablesRelocated, false, 'an unreadable process never passes as relocated');
  assert.deepEqual(verdict.desktopRuntimePaths.map(p => p.pid), [14]);
});

test('the Linux desktop app\'s runtime under /usr/lib/chatgpt is an installed-desktop path', () => {
  const tree = [{pid: 1, ppid: 0, executable: '/usr/lib/chatgpt/resources/cua_node/bin/node_repl'}];
  assert.equal(classifyProcesses(tree, {relocatedRoot: '/home/u/.local/share/cua/runtimes/r'}).desktopRuntimePaths.length, 1);
});

// The pinned codex sandboxes each runtime child with the system bubblewrap on Linux (measured on Ubuntu 24.04 arm64):
// node_repl -> codex sandbox -> codex-linux-sandbox -> /usr/bin/bwrap --new-session -> codex-linux-sandbox -> node.
const ROOT = '/home/u/.local/share/cua/runtimes/r';
const SANDBOXED = [
  {pid: 20, ppid: 10, executable: `${ROOT}/cua_node/bin/node`},
  {pid: 21, ppid: 20, executable: `${ROOT}/cua_node/bin/node_repl`},
  {pid: 22, ppid: 21, executable: `${ROOT}/codex`},
  {pid: 23, ppid: 22, executable: `${ROOT}/codex`},
  {pid: 24, ppid: 23, executable: '/usr/bin/bwrap'},
  {pid: 25, ppid: 24, executable: `${ROOT}/codex`},
  {pid: 26, ppid: 25, executable: `${ROOT}/cua_node/bin/node`},
];

test('the system sandbox launcher is the one non-relocated executable a runtime tree may hold, and only when named', () => {
  assert.equal(classifyProcesses(SANDBOXED, {relocatedRoot: ROOT}).allExecutablesRelocated, false, 'not named: bwrap fails the check');
  assert.equal(classifyProcesses(SANDBOXED, {relocatedRoot: ROOT, systemSandbox: ['/usr/bin/bwrap']}).allExecutablesRelocated, true);
  const stranger = [...SANDBOXED, {pid: 27, ppid: 26, executable: '/usr/bin/python3'}];
  assert.equal(classifyProcesses(stranger, {relocatedRoot: ROOT, systemSandbox: ['/usr/bin/bwrap']}).allExecutablesRelocated, false, 'anything else still fails');
  assert.equal(classifyProcesses([{pid: 24, ppid: 1, executable: '/usr/bin/bwrap'}], {relocatedRoot: ROOT, systemSandbox: ['/usr/bin/bwrap']}).allExecutablesRelocated, false,
    'a tree of nothing but the launcher is no runtime');
});

test('only a system sandbox launcher and what runs below it may leave the anchor\'s process group', () => {
  const groups = {20: 9, 21: 9, 22: 9, 23: 9, 24: 24, 25: 25, 26: 25};
  const pgidOf = pid => groups[pid];
  assert.deepEqual(outsideAnchorGroup(SANDBOXED, {anchorPid: 9, pgidOf, systemSandbox: ['/usr/bin/bwrap']}), []);
  assert.deepEqual(outsideAnchorGroup(SANDBOXED, {anchorPid: 9, pgidOf}).map(p => p.pid), [24, 25, 26], 'without a named launcher every escape counts');
  const escaped = {...groups, 22: 22};
  assert.deepEqual(outsideAnchorGroup(SANDBOXED, {anchorPid: 9, pgidOf: pid => escaped[pid], systemSandbox: ['/usr/bin/bwrap']}).map(p => p.pid), [22],
    'a relocated process above the launcher may not leave the group');
});

test('survivors are the observed runtime processes still alive after the connection closed', () => {
  const alive = new Set([25, 26]);
  const isAlive = pid => alive.has(pid);
  assert.deepEqual(survivors(SANDBOXED, isAlive).map(p => p.pid), [25, 26]);
  assert.deepEqual(survivors(SANDBOXED, () => false), []);
});
