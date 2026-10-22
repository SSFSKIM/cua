#!/usr/bin/env node
// #115's own-host confinement check (spec docs/doperpowers/specs/2026-10-17-own-sandbox-design.md, acceptance 1, 2, 3,
// 4 and 5 for cua's own host on macOS): a real connection (src/mcp/connection.mjs) on cua's own REPL host, browser
// surface only (no native helper, no GUI, no browser needed), on an installed runtime in `--home`, whose cells try
// every deny-list location, the runtime's module tree, writes inside and outside their session, a hard link and a clone
// of a denied file, and TCP and Unix-socket connects.
//
//   node scripts/accept/own-sandbox.mjs --home <installed CUA_HOME> [--host cua|vendor] [--modes scoped,default,disabled] [--node <Node 24+>] [--out <file>]
//
// The own host runs on the Node `cua install` placed in the home, or `--node` (as CUA_NODE).
//
// --host vendor (#115 M2, acceptance 2 to 5 on the macOS vendor host): the same checks on a vendor-host computer
// session (node_repl, its children launched by cua's compat executable), with no native call, so no helper starts and
// the scratch HOME is enough. The kernel is then Node itself under seatbelt, node_repl's child, and its os.tmpdir() is
// the session's own temp. Its script directory (node_repl's `.tmp*` with kernel.js, inside that temp) is readable but
// not writable. And across sessions (scoped): while a vendor-host session runs, a cell of a concurrent own-host
// session can neither write into nor read that session's script directory or run directory, and the victim's
// trusted-worker.js is byte for byte what node_repl wrote. Its sessions are pinned to the vendor engine
// (CUA_NATIVE_ENGINE=vendor, #117 M3), whatever accept-native's --engine says, and every vendor-host result must attest it
// (the helper's version, the runtime release): a mismatch fails the run.
//
// Everything secret is synthetic: the user HOME is a temporary directory this run makes and removes, holding a
// generated sentinel in its own secret store (and, through a symlinked project tier, in a directory outside it) and in
// its ~/.config/cua. In `--home` the run adds its own fresh subdirectories (state/, remote/ with a synthetic device
// enrolment, chrome/, and another session's run/ directory), each holding a sentinel, and removes them at the end;
// nothing else there is read or changed. A second connection starts with no store at all, and the store is created
// only after its kernel is running. The report holds labels, outcomes (error codes) and booleans; sentinel values never
// leave the cells: a cell reports whether it read the expected bytes, never the bytes.
//
// Per mode, the expectations: scoped and default, every deny-list location fails EPERM or EACCES and a package resolves
// and reads from the module tree; scoped writes the run directory and TMPDIR (the session's own, under
// $CUA_HOME/run/<id>), default writes nothing; disabled denies nothing. Under scoped and default a hard link and a clone
// of the store sentinel fail, and TCP and Unix connects fail. The kernel is Node itself, the supervisor's child, and no
// process named codex runs. Exit 0 when every expectation holds, 1 otherwise.
//
// On Linux (#115 M3, acceptance 1 to 5 for cua's own host there) the same connection runs its children under the
// pinned helper (codex-linux-sandbox, bubblewrap and seccomp), so: there is no clone to try (`cp -c` is macOS's), the
// kernel is Node under bubblewrap (an ancestor named bwrap, the pinned helper started it, no seatbelt marker), and under
// default the kernel works in its own directory outside run/ ($CUA_HOME/kernel/<id>, its TMPDIR that directory's tmp/:
// bubblewrap re-binds nothing read-only inside the denied run/), so another session's run directory is as absent to it
// as under scoped. Deny targets are created there, so a store root
// missing at launch is created 0700 and stays denied. And the four creation cases run for real (Decision Log, "deny
// targets are created on Linux only, and bounded there"): a missing fixed target created 0700 inside HOME, a dangling
// tier target created leaf-only, a tier whose parent is missing refused, and a fixed target whose missing parent lies
// outside HOME refused; each time the kernel can neither list nor read the target.
import {execFileSync} from 'node:child_process';
import {randomBytes, randomUUID} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync, existsSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {PassThrough} from 'node:stream';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {openConnection} from '../../src/mcp/connection.mjs';
import {homeLayout, realHome} from '../../src/runtime/layout.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {STORE_RELATIVE} from '../../src/secrets/store.mjs';
import {attestationProblem, isLifecycleRejection} from '../probe/lib.mjs';
import {expectedAttestation} from '../probe/pinned-engine.mjs';

const MODES = ['scoped', 'default', 'disabled'];
const DENIED = new Set(['EPERM', 'EACCES']);

// A cell's code in a block of its own: the vendor host's node_repl keeps a cell's top-level bindings for the next one
// (a second top-level `const fs` is then a redeclaration), cua's own host gives each cell a fresh scope; a block holds on
// both. Top-level await stays allowed inside it.
export const cellCode = code => `{\n${code}\n}`;
// A cell's JSON report among its texts: the last that parses as JSON (the bootstrap's first-call document, or a host's
// warning, may come before or after it). Throws when none does.
export function cellResult(texts) {
  for (const text of [...texts].reverse()) { try { return JSON.parse(text); } catch { /* not the report */ } }
  throw new Error(`the cell returned no JSON report (${texts.length} text(s): ${texts.map(t => t.slice(0, 120)).join(' | ')})`);
}

// One connection -> {js(code), close()}. `env` is the connection's environment; with `expected` (a vendor-host
// session's engine attestation) every result must carry it, else the cell throws.
async function connect({home, env, expected = null}) {
  const input = new PassThrough(), output = new PassThrough();
  const pending = new Map();
  createInterface({input: output}).on('line', line => { const msg = JSON.parse(line); pending.get(msg.id)?.(msg); });
  const connection = await openConnection({home, env, sessionId: randomUUID(), input, output, diagnostics: () => {}, chrome: {profiles: []}, listBackends: async () => ({backends: []})});
  let id = 0;
  const request = (method, params) => new Promise(done => { const n = ++id; pending.set(n, done); input.write(`${JSON.stringify({jsonrpc: '2.0', id: n, method, params})}\n`); });
  await request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'own-sandbox-acceptance', version: '0'}});
  const js = async code => {
    const result = (await request('tools/call', {name: 'js', arguments: {code: cellCode(code)}})).result;
    const problem = expected && !isLifecycleRejection(result) && attestationProblem(result._meta, expected);
    if (problem) throw new Error(`refused on the attestation: ${problem}`);
    const texts = (result.content ?? []).filter(c => c.type === 'text').map(c => c.text);
    if (result.isError) throw new Error(`cell failed: ${texts[0]?.slice(0, 2000)}`);
    return cellResult(texts);
  };
  return {js, close: async () => { input.end(); return connection.closed; }};
}

// The cell that tries everything: `targets` {label: {path, read: 'file' | 'dir', expect?}} and the rest.
export const probeCell = ({targets, moduleDir, packageName, sentinel, writeOutside, tcpPort, socketPath}) => `
const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path'), net = await import('node:net');
const {createRequire} = await import('node:module'), {execFileSync} = await import('node:child_process');
// A cell has no \`process\`: what it is (its pid, its environment, its working directory) is read through a child it runs
// on macOS, and from /proc/self on Linux, where the helper's seccomp refuses the socketpairs Node gives a child's piped
// stdio (and the pid would be bubblewrap's namespace's anyway).
const run = (file, args = []) => execFileSync(file, args, {encoding: 'utf8'}).trim();
const proc = fs.existsSync('/proc/self/environ');
const env = Object.fromEntries((proc ? fs.readFileSync('/proc/self/environ', 'utf8').split('\\0').filter(Boolean) : run('/usr/bin/env').split('\\n'))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const self = {pid: proc ? null : Number(run('/bin/sh', ['-c', 'echo $PPID'])), cwd: proc ? fs.readlinkSync('/proc/self/cwd') : run('/bin/pwd'), tmpdir: env.TMPDIR, sandbox: env.CODEX_SANDBOX ?? null,
  networkDisabled: env.CODEX_SANDBOX_NETWORK_DISABLED ?? null};
const code = fn => { try { const value = fn(); return {ok: true, value}; } catch (error) { return {ok: false, code: error.code ?? (error.status != null ? \`exit \${error.status}\` : 'error')}; } };
const targets = ${JSON.stringify(targets)};
const out = {reads: {}, writes: {}};
for (const [label, t] of Object.entries(targets))
  out.reads[label] = code(() => (t.read === 'dir' ? fs.readdirSync(t.path).length >= 0 : fs.readFileSync(t.path, 'utf8') === t.expect));
const required = code(() => { const resolved = createRequire(path.join(${JSON.stringify(moduleDir)}, 'x.js')).resolve(${JSON.stringify(`${packageName}/package.json`)}); return JSON.parse(fs.readFileSync(resolved, 'utf8')).name === ${JSON.stringify(packageName)}; });
out.moduleTree = required;
out.tmpdir = {value: os.tmpdir(), env: self.tmpdir, cwd: self.cwd};
out.writes.runDirectory = code(() => { fs.writeFileSync(path.join(self.cwd, 'own-sandbox-probe'), 'x'); return true; });
out.writes.tmpdir = code(() => { fs.writeFileSync(path.join(os.tmpdir(), 'own-sandbox-probe'), 'x'); return true; });
out.writes.outside = code(() => { fs.writeFileSync(${JSON.stringify(writeOutside)}, 'x'); return true; });
out.link = code(() => { fs.linkSync(${JSON.stringify(sentinel)}, path.join(os.tmpdir(), 'linked')); return fs.readFileSync(path.join(os.tmpdir(), 'linked'), 'utf8').length > 0; });
out.clone = code(() => { execFileSync('/bin/cp', ['-c', ${JSON.stringify(sentinel)}, path.join(os.tmpdir(), 'cloned')], {stdio: 'ignore'}); return true; });
const connect = options => new Promise(done => { const s = net.connect(options); s.once('connect', () => { s.destroy(); done({ok: true}); }); s.once('error', e => done({ok: false, code: e.code})); });
out.tcp = await connect({host: '127.0.0.1', port: ${tcpPort}});
out.unix = await connect({path: ${JSON.stringify(socketPath)}});
out.process = {pid: self.pid, sandbox: self.sandbox, networkDisabled: self.networkDisabled};
nodeRepl.write(JSON.stringify(out));
`;

export const scriptDirCell = () => `
const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
const tmp = os.tmpdir();
const dirs = fs.readdirSync(tmp).filter(n => n.startsWith('.tmp') && fs.existsSync(path.join(tmp, n, 'kernel.js')));
const code = fn => { try { fn(); return {ok: true}; } catch (error) { return {ok: false, code: error.code ?? 'error'}; } };
nodeRepl.write(JSON.stringify({count: dirs.length, read: dirs.length ? code(() => fs.readFileSync(path.join(tmp, dirs[0], 'kernel.js'))) : null,
  write: dirs.length ? code(() => fs.writeFileSync(path.join(tmp, dirs[0], 'trusted-worker.js'), 'tampered', {flag: 'a'})) : null,
  add: dirs.length ? code(() => fs.writeFileSync(path.join(tmp, dirs[0], 'planted.js'), 'x')) : null}));
`;
export const attackCell = ({scripts, run}) => `
const fs = await import('node:fs'), path = await import('node:path');
const code = fn => { try { fn(); return {ok: true}; } catch (error) { return {ok: false, code: error.code ?? 'error'}; } };
nodeRepl.write(JSON.stringify({
  writeScripts: code(() => fs.writeFileSync(path.join(${JSON.stringify(scripts)}, 'trusted-worker.js'), 'tampered', {flag: 'a'})),
  readScripts: code(() => fs.readFileSync(path.join(${JSON.stringify(scripts)}, 'trusted-worker.js'))),
  writeRun: code(() => fs.writeFileSync(path.join(${JSON.stringify(run)}, 'planted'), 'x')),
  listRun: code(() => fs.readdirSync(${JSON.stringify(run)}))}));
`;

const linux = process.platform === 'linux';
const commandOf = pid => { try { return execFileSync('ps', ['-ww', '-o', 'command=', '-p', String(pid)], {encoding: 'utf8'}).trim(); } catch { return null; } };
const descendants = pid => {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,comm='], {encoding: 'utf8'}).trim().split('\n').map(l => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map(m => [Number(m[1]), Number(m[2]), m[3].trim()]);
  const owned = new Set([pid]);
  for (let changed = true; changed;) { changed = false; for (const [p, pp] of rows) if (owned.has(pp) && !owned.has(p)) { owned.add(p); changed = true; } }
  return rows.filter(([p]) => p !== pid && owned.has(p));
};

// Linux's four deny-target creation cases, for real under bubblewrap (the header). Each runs its own connection with a
// scratch HOME (or tier) shaped for the case; the cell either reads and lists the target (both refused) or is refused
// before its kernel starts, with the classified sentence, and then nothing was created.
const CREATION_REFUSED = /^js sandbox unavailable: .* does not exist and (its parent directory is missing|a missing parent directory lies outside your HOME), so the kernel cannot be denied it; this confined launch is refused/;
async function creationCases({real, env, mode, scratch, check, sentinelIn}) {
  const readCell = path => `const fs = await import('node:fs'), path = await import('node:path'); const r = f => { try { f(); return {ok: true}; } catch (e) { return {ok: false, code: e.code}; } };
nodeRepl.write(JSON.stringify({list: r(() => fs.readdirSync(${JSON.stringify(path)})), read: r(() => fs.readFileSync(path.join(${JSON.stringify(path)}, 'SENTINEL'), 'utf8'))}));`;
  const refusedText = async connection => { try { await connection.js('nodeRepl.write(JSON.stringify(1))'); return null; } catch (error) { return error.message.replace(/^cell failed: /, ''); } };
  const mode700 = path => existsSync(path) && (statSync(path).mode & 0o777) === 0o700;
  // 1. A missing fixed target inside HOME, with a missing parent inside HOME: ~/.config/cua under a HOME without ~/.config.
  {
    const home = join(scratch, 'create-fixed'), target = join(home, '.config', 'cua');
    mkdirSync(home, {mode: 0o700});
    const connection = await connect({home: real, env: {...env(mode), HOME: home}});
    try {
      await connection.js('nodeRepl.write(JSON.stringify(1))');
      check('linux creation: a missing fixed target inside HOME is created 0700 (~/.config/cua, its parent too)', mode700(target) && existsSync(join(home, '.config')));
      sentinelIn(target);
      const out = await connection.js(readCell(target));
      check('linux creation: the kernel can neither list nor read the created fixed target', !out.list.ok && !out.read.ok && DENIED.has(out.list.code) && DENIED.has(out.read.code), `${out.list.code}/${out.read.code}`);
    } finally { await connection.close(); }
  }
  // 2. A dangling tier target whose parent exists: created as its leaf only.
  {
    const home = join(scratch, 'create-tier'), parent = join(scratch, 'tier-parent'), leaf = join(parent, 'leaf');
    mkdirSync(join(home, STORE_RELATIVE, 'projects'), {recursive: true, mode: 0o700});
    mkdirSync(parent, {mode: 0o755});
    symlinkSync(leaf, join(home, STORE_RELATIVE, 'projects', '-synthetic-dangling-project'));
    const connection = await connect({home: real, env: {...env(mode), HOME: home}});
    try {
      await connection.js('nodeRepl.write(JSON.stringify(1))');
      check('linux creation: a dangling tier target is created as its leaf only, 0700', mode700(leaf) && (statSync(parent).mode & 0o777) === 0o755);
      sentinelIn(leaf);
      const out = await connection.js(readCell(leaf));
      check('linux creation: the kernel can neither list nor read the created tier target', !out.list.ok && !out.read.ok && DENIED.has(out.list.code) && DENIED.has(out.read.code), `${out.list.code}/${out.read.code}`);
    } finally { await connection.close(); }
  }
  // 3. A tier whose target's parent is missing: refused, nothing created.
  {
    const home = join(scratch, 'refuse-tier'), parent = join(scratch, 'absent-tier-parent'), leaf = join(parent, 'leaf');
    mkdirSync(join(home, STORE_RELATIVE, 'projects'), {recursive: true, mode: 0o700});
    symlinkSync(leaf, join(home, STORE_RELATIVE, 'projects', '-synthetic-orphan-project'));
    const connection = await connect({home: real, env: {...env(mode), HOME: home}});
    let text;
    try { text = await refusedText(connection); } finally { await connection.close(); }
    check('linux creation: a tier whose parent is missing is refused with the classified sentence, naming no tier', CREATION_REFUSED.test(text ?? '') && /its parent directory is missing/.test(text) && !text.includes('orphan'), text?.slice(0, 300));
    check('linux creation: the refused tier\'s target and parent were not created (the kernel never ran, so it read nothing)', !existsSync(parent));
  }
  // 4. A fixed target whose missing parent lies outside HOME: HOME itself does not exist.
  {
    const home = join(scratch, 'absent-home');
    const connection = await connect({home: real, env: {...env(mode), HOME: home}});
    let text;
    try { text = await refusedText(connection); } finally { await connection.close(); }
    check('linux creation: a fixed target whose missing parent lies outside HOME is refused with the classified sentence', CREATION_REFUSED.test(text ?? '') && /a missing parent directory lies outside your HOME/.test(text), text?.slice(0, 300));
    check('linux creation: nothing was created for the refused fixed target (the kernel never ran, so it read nothing)', !existsSync(home));
  }
}

export async function ownSandboxAcceptance({home, host = 'cua', modes = MODES, node, log = () => {}}) {
  const vendor = host === 'vendor';
  const real = realHome(home);
  const layout = homeLayout(real);
  // Where the kernel works: its session's run directory, or on Linux under default its own directory outside run/.
  const ownDir = mode => (linux && mode === 'default' ? layout.kernel : layout.run);
  const runtime = resolveRuntime({home: real});
  const moduleDir = runtime.paths.moduleDir;
  const packageName = readdirSync(moduleDir).filter(name => !name.startsWith('.')).flatMap(name => (name.startsWith('@') ? readdirSync(join(moduleDir, name)).map(sub => `${name}/${sub}`) : [name]))
    .find(name => existsSync(join(moduleDir, name, 'package.json')));
  if (!packageName) throw new Error(`no package in the runtime's module tree ${moduleDir}`);
  const tag = `cua115-probe-${randomBytes(4).toString('hex')}`;
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'cua-own-sandbox-')));
  const user = join(scratch, 'user');
  const value = `synthetic-${randomBytes(8).toString('hex')}`;
  const homeDirs = ['state', 'remote', 'chrome'].map(dir => join(layout.home, dir, tag));
  const otherRun = join(layout.run, `${tag}-other-session`);
  const tcp = createServer(socket => socket.destroy());
  const socketPath = join(scratch, 's.sock');
  const unix = createServer(socket => socket.destroy());
  await new Promise(done => tcp.listen(0, '127.0.0.1', done));
  await new Promise(done => unix.listen(socketPath, done));
  const sentinelIn = dir => { mkdirSync(dir, {recursive: true, mode: 0o700}); writeFileSync(join(dir, 'SENTINEL'), value, {mode: 0o600}); return join(dir, 'SENTINEL'); };
  const report = {probe: 'own-sandbox', host, home: layout.home, packageName, modes: {}, checks: []};
  const check = (label, pass, detail) => { report.checks.push({label, pass: Boolean(pass), ...(detail === undefined ? {} : {detail})}); log(`${pass ? 'PASS' : 'FAIL'} ${label}`); };
  try {
    const store = join(user, STORE_RELATIVE);
    const sentinels = {
      store: sentinelIn(store),
      'store (symlinked tier target)': sentinelIn(join(scratch, 'elsewhere-tier')),
      '~/.config/cua': sentinelIn(join(user, '.config', 'cua')),
      '$CUA_HOME/state': sentinelIn(homeDirs[0]),
      '$CUA_HOME/remote (enrolled device)': (() => { mkdirSync(homeDirs[1], {recursive: true, mode: 0o700}); writeFileSync(join(homeDirs[1], 'device.json'), JSON.stringify({deviceId: 'synthetic', secret: value}), {mode: 0o600}); return join(homeDirs[1], 'device.json'); })(),
      '$CUA_HOME/chrome': sentinelIn(homeDirs[2]),
      'another session\'s run directory': sentinelIn(otherRun),
    };
    mkdirSync(join(store, 'projects'), {recursive: true});
    symlinkSync(join(scratch, 'elsewhere-tier'), join(store, 'projects', '-synthetic-linked-project'));
    const expectOf = label => (label === '$CUA_HOME/remote (enrolled device)' ? JSON.stringify({deviceId: 'synthetic', secret: value}) : value);
    const targets = Object.fromEntries(Object.entries(sentinels).flatMap(([label, path]) => [[label, {path, read: 'file', expect: expectOf(label)}], [`${label} (listing)`, {path: resolve(path, '..'), read: 'dir'}]]));
    const env = (mode, which = host) => ({PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: user, LANG: 'C.UTF-8', CUA_REPL_HOST: which, CUA_SHIM_SURFACES: which === 'vendor' ? 'computer' : 'browser',
      CUA_SHIM_SANDBOX: mode, CUA_RUNTIME_IDLE_MS: '0', ...(which === 'vendor' ? {CUA_NATIVE_ENGINE: 'vendor'} : {}), ...(node && which === 'cua' ? {CUA_NODE: node} : {})});
    // A vendor-host (computer) session attests the vendor engine; cua's own host here serves the browser surface only.
    const vendorEngine = vendor ? expectedAttestation({engine: 'vendor', runtime}) : null;
    const open = connectionEnv => connect({home: real, env: connectionEnv, expected: connectionEnv.CUA_REPL_HOST === 'vendor' ? vendorEngine : null});
    const cell = probeCell({targets, moduleDir, packageName, sentinel: sentinels.store, writeOutside: join(scratch, 'outside-write'), tcpPort: tcp.address().port, socketPath});
    for (const mode of modes) {
      const connection = await open(env(mode));
      let out, scripts = null;
      try {
        out = await connection.js(cell);
        if (vendor && mode !== 'disabled') scripts = await connection.js(scriptDirCell());
        out.descendants = descendants(process.pid).map(([pid, ppid, comm]) => ({pid, ppid, comm}));
        // On Linux the kernel runs in bubblewrap's PID namespace, so the pid it reports is not this host's: it is found
        // by its command line instead (Node's own, not the helper's that carries it after `--`), and Node names its main
        // thread MainThread there, so its executable is read from that command line.
        const kernelCommand = pid => commandOf(pid) ?? '';
        const kernel = linux ? out.descendants.find(p => /src\/repl-host\/kernel\.mjs/.test(kernelCommand(p.pid)) && !kernelCommand(p.pid).includes('--permission-profile'))
          : out.descendants.find(p => p.pid === out.process.pid);
        out.process.execPath = linux ? (kernel ? kernelCommand(kernel.pid).split(' ')[0] : null) : kernel?.comm ?? null;
        out.parentCommand = kernel ? commandOf(kernel.ppid) : null;
        const ancestors = [];
        for (let p = kernel; p; p = out.descendants.find(d => d.pid === p.ppid)) if (p !== kernel) ancestors.push(p.comm);
        out.ancestors = ancestors;
      } finally { await connection.close(); }
      report.modes[mode] = {reads: out.reads, moduleTree: out.moduleTree, writes: out.writes, link: out.link, clone: out.clone, tcp: out.tcp, unix: out.unix,
        tmpdir: {own: out.tmpdir.value === out.tmpdir.env && out.tmpdir.value === join(out.tmpdir.cwd, 'tmp') && out.tmpdir.cwd.startsWith(`${ownDir(mode)}/`)},
        kernel: {execPathIsNode: /(^|\/)node$/.test(out.process.execPath ?? ''), parentIsSupervisor: /src\/repl-host\/supervisor\.mjs/.test(out.parentCommand ?? ''),
          parentIsNodeRepl: /(^|\/)node_repl( |$)/.test(out.parentCommand ?? ''), sandbox: out.process.sandbox,
          ...(linux ? {underBwrap: out.ancestors.includes('bwrap'), underHelper: out.ancestors.some(comm => comm.startsWith('codex-linux-sa'))} : {})},
        ...(scripts ? {scriptDirectory: scripts} : {}),
        codexProcesses: out.descendants.filter(p => /(^|\/)codex$/.test(p.comm)).length};
      const r = report.modes[mode];
      const confined = mode !== 'disabled';
      for (const [label, result] of Object.entries(out.reads)) {
        // On Linux run/ is masked (under scoped as the ancestor of the session's own writable directory, an empty tmpfs
        // that may only be traversed), so another session's directory is not even there: ENOENT, which reveals less
        // than EACCES.
        const otherRun = label.startsWith('another session\'s run directory');
        const denied = confined;
        const refused = code => DENIED.has(code) || (linux && otherRun && code === 'ENOENT');
        check(`${mode}: ${denied ? 'denied' : 'readable'}: ${label}`, denied ? !result.ok && refused(result.code) : result.ok && result.value === true, result.ok ? undefined : result.code);
      }
      check(`${mode}: a package resolves and reads from the runtime's module tree`, out.moduleTree.ok && out.moduleTree.value === true, out.moduleTree.code);
      check(`${mode}: TMPDIR is the session's own, under ${ownDir(mode) === layout.run ? '$CUA_HOME/run/<id>' : '$CUA_HOME/kernel/<id>'}`, r.tmpdir.own);
      check(`${mode}: the ${ownDir(mode) === layout.run ? 'run' : 'kernel\'s own'} directory is ${mode === 'default' ? 'not ' : ''}writable`, mode === 'default' ? !out.writes.runDirectory.ok : out.writes.runDirectory.ok, out.writes.runDirectory.code);
      check(`${mode}: TMPDIR is ${mode === 'default' ? 'not ' : ''}writable`, mode === 'default' ? !out.writes.tmpdir.ok : out.writes.tmpdir.ok, out.writes.tmpdir.code);
      check(`${mode}: a write outside the session ${confined ? 'fails' : 'succeeds'}`, confined ? !out.writes.outside.ok : out.writes.outside.ok, out.writes.outside.code);
      if (confined) {
        check(`${mode}: a hard link of the store sentinel fails`, !out.link.ok, out.link.code);
        if (!linux) check(`${mode}: a clone (cp -c) of the store sentinel fails`, !out.clone.ok, out.clone.code);
        check(`${mode}: a TCP connect fails`, !out.tcp.ok, out.tcp.code);
        check(`${mode}: an AF_UNIX connect fails`, !out.unix.ok, out.unix.code);
        if (vendor) {
          check(`${mode}: the kernel is Node itself, node_repl's child, marked seatbelt (cua's compat executable exec'd it)`, r.kernel.execPathIsNode && r.kernel.parentIsNodeRepl && r.kernel.sandbox === 'seatbelt');
          check(`${mode}: node_repl's script directory lies in the session temp`, scripts?.count === 1, scripts?.count);
          check(`${mode}: the kernel reads its script directory`, scripts?.read?.ok === true, scripts?.read?.code);
          check(`${mode}: the kernel cannot write into its script directory`, scripts?.write?.ok === false && scripts?.add?.ok === false, `${scripts?.write?.code}/${scripts?.add?.code}`);
        } else if (linux) check(`${mode}: the kernel is Node under bubblewrap, started by the pinned helper, with no seatbelt marker`, r.kernel.execPathIsNode && r.kernel.underBwrap && r.kernel.underHelper && r.kernel.sandbox === null, out.ancestors);
        else check(`${mode}: the kernel is Node itself, the supervisor's child, marked seatbelt`, r.kernel.execPathIsNode && r.kernel.parentIsSupervisor && r.kernel.sandbox === 'seatbelt');
      }
      check(`${mode}: no process named codex`, r.codexProcesses === 0);
      rmSync(join(scratch, 'outside-write'), {force: true});
    }
    // Two concurrent sessions (vendor host only, scoped): an own-host kernel against this vendor-host session's script
    // directory and run directory, while its worker's script waits for its first start.
    if (vendor && modes.includes('scoped')) {
      const victim = await open(env('scoped'));
      try {
        const where = await victim.js(`const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
const tmp = os.tmpdir(); const dir = fs.readdirSync(tmp).find(n => n.startsWith('.tmp') && fs.existsSync(path.join(tmp, n, 'trusted-worker.js')));
nodeRepl.write(JSON.stringify({scripts: dir ? path.join(tmp, dir) : null, run: nodeRepl.cwd}));`);
        if (!where.scripts) check('across sessions: the vendor-host session\'s script directory was found', false);
        else {
          const before = readFileSync(join(where.scripts, 'trusted-worker.js'));
          const attacker = await open(env('scoped', 'cua'));
          let out;
          try { out = await attacker.js(attackCell(where)); } finally { await attacker.close(); }
          check('across sessions: an own-host kernel cannot write into a vendor-host session\'s script directory', !out.writeScripts.ok && DENIED.has(out.writeScripts.code), out.writeScripts.code);
          check('across sessions: an own-host kernel cannot read a vendor-host session\'s trusted-worker.js', !out.readScripts.ok && DENIED.has(out.readScripts.code), out.readScripts.code);
          check('across sessions: an own-host kernel cannot write into or list a vendor-host session\'s run directory', !out.writeRun.ok && !out.listRun.ok, `${out.writeRun.code}/${out.listRun.code}`);
          check('across sessions: the vendor-host session\'s trusted-worker.js is what node_repl wrote', readFileSync(join(where.scripts, 'trusted-worker.js')).equals(before));
        }
      } finally { await victim.close(); }
    }
    // A store root missing at launch, created mid-session: macOS creates no deny target, so the kernel's profile denies
    // the missing path itself (its realish path), and seatbelt keeps it denied once it appears. Linux creates it 0700 at
    // the kernel's launch (bubblewrap masks only a path that exists), and it stays denied. Both with the scratch HOME's
    // own ~/.config and with a ~/.config that is a symlink (the realish path is then the link's target). The store is the
    // scratch HOME's (the store's location follows HOME; nothing here touches the account's).
    if (modes.some(m => m !== 'disabled')) {
      const mode = modes.find(m => m !== 'disabled');
      const linked = join(scratch, 'user-linked');
      mkdirSync(join(scratch, 'config-real'), {mode: 0o700});
      mkdirSync(linked, {mode: 0o700});
      symlinkSync(join(scratch, 'config-real'), join(linked, '.config'));
      for (const [label, home] of [['', user], [' (through a symlinked ~/.config)', linked]]) {
        const lateStore = join(home, STORE_RELATIVE);
        rmSync(lateStore, {recursive: true, force: true});
        const connection = await open({...env(mode), HOME: home});
        try {
          await connection.js('nodeRepl.write(JSON.stringify(1))');
          if (linux) check(`a store root missing at launch is created 0700 (a missing fixed target inside HOME)${label}`, existsSync(lateStore) && (statSync(lateStore).mode & 0o777) === 0o700);
          else check(`a store root missing at launch is not created${label}`, !existsSync(lateStore));
          const late = sentinelIn(lateStore);
          const out = await connection.js(`const fs = await import('node:fs'); const r = f => { try { f(); return {ok: true}; } catch (e) { return {ok: false, code: e.code}; } };
nodeRepl.write(JSON.stringify({file: r(() => fs.readFileSync(${JSON.stringify(late)}, 'utf8')), listing: r(() => fs.readdirSync(${JSON.stringify(lateStore)}))}));`);
          check(`a store root created mid-session stays denied${label}`, !out.file.ok && DENIED.has(out.file.code), out.file.code);
          check(`a store root created mid-session cannot be listed${label}`, !out.listing.ok && DENIED.has(out.listing.code), out.listing.code);
        } finally { await connection.close(); }
      }
    }
    if (linux && modes.some(m => m !== 'disabled')) await creationCases({real, env, mode: modes.find(m => m !== 'disabled'), scratch, check, sentinelIn});
  } finally {
    tcp.close(); unix.close();
    for (const dir of [...homeDirs, otherRun]) rmSync(dir, {recursive: true, force: true});
    rmSync(scratch, {recursive: true, force: true});
  }
  report.ok = report.checks.every(c => c.pass);
  if (JSON.stringify(report).includes(value)) throw new Error('the report would carry a sentinel value; refusing to write it');
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {home: {type: 'string'}, host: {type: 'string', default: 'cua'}, modes: {type: 'string', default: MODES.join(',')}, node: {type: 'string'}, out: {type: 'string'}}});
  if (!values.home) { console.error('usage: own-sandbox.mjs --home <installed CUA_HOME> [--modes scoped,default,disabled] [--out <file>]'); process.exit(2); }
  const modes = values.modes.split(',');
  if (!modes.every(m => MODES.includes(m))) { console.error(`--modes takes ${MODES.join(', ')}`); process.exit(2); }
  if (!['cua', 'vendor'].includes(values.host)) { console.error('--host takes cua or vendor'); process.exit(2); }
  const report = await ownSandboxAcceptance({home: values.home, host: values.host, modes, node: values.node && resolve(values.node), log: line => console.error(line)});
  if (values.out) writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ok: report.ok, failed: report.checks.filter(c => !c.pass).map(c => c.label)}));
  process.exitCode = report.ok ? 0 : 1;
}
