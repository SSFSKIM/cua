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
// trusted-worker.js is byte for byte what node_repl wrote.
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
import {execFileSync} from 'node:child_process';
import {randomBytes, randomUUID} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync, existsSync} from 'node:fs';
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

const MODES = ['scoped', 'default', 'disabled'];
const DENIED = new Set(['EPERM', 'EACCES']);

// One own-host connection -> {js(code), close()}. `env` is the connection's environment.
async function connect({home, env}) {
  const input = new PassThrough(), output = new PassThrough();
  const pending = new Map();
  createInterface({input: output}).on('line', line => { const msg = JSON.parse(line); pending.get(msg.id)?.(msg); });
  const connection = await openConnection({home, env, sessionId: randomUUID(), input, output, diagnostics: () => {}, chrome: {profiles: []}, listBackends: async () => ({backends: []})});
  let id = 0;
  const request = (method, params) => new Promise(done => { const n = ++id; pending.set(n, done); input.write(`${JSON.stringify({jsonrpc: '2.0', id: n, method, params})}\n`); });
  await request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'own-sandbox-acceptance', version: '0'}});
  // A cell's last text is its JSON report; the bootstrap's first-call document comes before it.
  const js = async code => {
    const result = (await request('tools/call', {name: 'js', arguments: {code: `${code}`}})).result;
    const texts = (result.content ?? []).filter(c => c.type === 'text').map(c => c.text);
    if (result.isError) throw new Error(`cell failed: ${texts[0]?.slice(0, 2000)}`);
    return JSON.parse(texts.at(-1));
  };
  return {js, close: async () => { input.end(); return connection.closed; }};
}

// The cell that tries everything: `targets` {label: {path, read: 'file' | 'dir', expect?}} and the rest.
const probeCell = ({targets, moduleDir, packageName, sentinel, writeOutside, tcpPort, socketPath}) => `
const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path'), net = await import('node:net');
const {createRequire} = await import('node:module'), {execFileSync} = await import('node:child_process');
// A cell has no \`process\`: what it is (its pid, its environment, its working directory) is read through a child it runs.
const run = (file, args = []) => execFileSync(file, args, {encoding: 'utf8'}).trim();
const env = Object.fromEntries(run('/usr/bin/env').split('\\n').map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const self = {pid: Number(run('/bin/sh', ['-c', 'echo $PPID'])), cwd: run('/bin/pwd'), tmpdir: env.TMPDIR, sandbox: env.CODEX_SANDBOX ?? null};
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
out.process = {pid: self.pid, sandbox: self.sandbox};
nodeRepl.write(JSON.stringify(out));
`;

const scriptDirCell = () => `
const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
const tmp = os.tmpdir();
const dirs = fs.readdirSync(tmp).filter(n => n.startsWith('.tmp') && fs.existsSync(path.join(tmp, n, 'kernel.js')));
const code = fn => { try { fn(); return {ok: true}; } catch (error) { return {ok: false, code: error.code ?? 'error'}; } };
nodeRepl.write(JSON.stringify({count: dirs.length, read: dirs.length ? code(() => fs.readFileSync(path.join(tmp, dirs[0], 'kernel.js'))) : null,
  write: dirs.length ? code(() => fs.writeFileSync(path.join(tmp, dirs[0], 'trusted-worker.js'), 'tampered', {flag: 'a'})) : null,
  add: dirs.length ? code(() => fs.writeFileSync(path.join(tmp, dirs[0], 'planted.js'), 'x')) : null}));
`;
const attackCell = ({scripts, run}) => `
const fs = await import('node:fs'), path = await import('node:path');
const code = fn => { try { fn(); return {ok: true}; } catch (error) { return {ok: false, code: error.code ?? 'error'}; } };
nodeRepl.write(JSON.stringify({
  writeScripts: code(() => fs.writeFileSync(path.join(${JSON.stringify(scripts)}, 'trusted-worker.js'), 'tampered', {flag: 'a'})),
  readScripts: code(() => fs.readFileSync(path.join(${JSON.stringify(scripts)}, 'trusted-worker.js'))),
  writeRun: code(() => fs.writeFileSync(path.join(${JSON.stringify(run)}, 'planted'), 'x')),
  listRun: code(() => fs.readdirSync(${JSON.stringify(run)}))}));
`;

const commandOf = pid => { try { return execFileSync('ps', ['-ww', '-o', 'command=', '-p', String(pid)], {encoding: 'utf8'}).trim(); } catch { return null; } };
const descendants = pid => {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,comm='], {encoding: 'utf8'}).trim().split('\n').map(l => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map(m => [Number(m[1]), Number(m[2]), m[3]]);
  const owned = new Set([pid]);
  for (let changed = true; changed;) { changed = false; for (const [p, pp] of rows) if (owned.has(pp) && !owned.has(p)) { owned.add(p); changed = true; } }
  return rows.filter(([p]) => p !== pid && owned.has(p));
};

export async function ownSandboxAcceptance({home, host = 'cua', modes = MODES, node, log = () => {}}) {
  const vendor = host === 'vendor';
  const real = realHome(home);
  const layout = homeLayout(real);
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
      CUA_SHIM_SANDBOX: mode, CUA_RUNTIME_IDLE_MS: '0', ...(node && which === 'cua' ? {CUA_NODE: node} : {})});
    const cell = probeCell({targets, moduleDir, packageName, sentinel: sentinels.store, writeOutside: join(scratch, 'outside-write'), tcpPort: tcp.address().port, socketPath});
    for (const mode of modes) {
      const connection = await connect({home: real, env: env(mode)});
      let out, scripts = null;
      try {
        out = await connection.js(cell);
        if (vendor && mode !== 'disabled') scripts = await connection.js(scriptDirCell());
        out.descendants = descendants(process.pid).map(([pid, ppid, comm]) => ({pid, ppid, comm}));
        const kernel = out.descendants.find(p => p.pid === out.process.pid);
        out.process.execPath = kernel?.comm ?? null;
        out.parentCommand = kernel ? commandOf(kernel.ppid) : null;
      } finally { await connection.close(); }
      report.modes[mode] = {reads: out.reads, moduleTree: out.moduleTree, writes: out.writes, link: out.link, clone: out.clone, tcp: out.tcp, unix: out.unix,
        tmpdir: {own: out.tmpdir.value === out.tmpdir.env && out.tmpdir.value === join(out.tmpdir.cwd, 'tmp') && out.tmpdir.cwd.startsWith(`${layout.run}/`)},
        kernel: {execPathIsNode: /(^|\/)node$/.test(out.process.execPath ?? ''), parentIsSupervisor: /src\/repl-host\/supervisor\.mjs/.test(out.parentCommand ?? ''),
          parentIsNodeRepl: /(^|\/)node_repl( |$)/.test(out.parentCommand ?? ''), sandbox: out.process.sandbox},
        ...(scripts ? {scriptDirectory: scripts} : {}),
        codexProcesses: out.descendants.filter(p => /(^|\/)codex$/.test(p.comm)).length};
      const r = report.modes[mode];
      const confined = mode !== 'disabled';
      for (const [label, result] of Object.entries(out.reads))
        check(`${mode}: ${confined ? 'denied' : 'readable'}: ${label}`, confined ? !result.ok && DENIED.has(result.code) : result.ok && result.value === true, result.ok ? undefined : result.code);
      check(`${mode}: a package resolves and reads from the runtime's module tree`, out.moduleTree.ok && out.moduleTree.value === true, out.moduleTree.code);
      check(`${mode}: TMPDIR is the session's own, under $CUA_HOME/run/<id>`, r.tmpdir.own);
      check(`${mode}: the run directory is ${mode === 'default' ? 'not ' : ''}writable`, mode === 'default' ? !out.writes.runDirectory.ok : out.writes.runDirectory.ok, out.writes.runDirectory.code);
      check(`${mode}: TMPDIR is ${mode === 'default' ? 'not ' : ''}writable`, mode === 'default' ? !out.writes.tmpdir.ok : out.writes.tmpdir.ok, out.writes.tmpdir.code);
      check(`${mode}: a write outside the session ${confined ? 'fails' : 'succeeds'}`, confined ? !out.writes.outside.ok : out.writes.outside.ok, out.writes.outside.code);
      if (confined) {
        check(`${mode}: a hard link of the store sentinel fails`, !out.link.ok, out.link.code);
        check(`${mode}: a clone (cp -c) of the store sentinel fails`, !out.clone.ok, out.clone.code);
        check(`${mode}: a TCP connect fails`, !out.tcp.ok, out.tcp.code);
        check(`${mode}: an AF_UNIX connect fails`, !out.unix.ok, out.unix.code);
        if (vendor) {
          check(`${mode}: the kernel is Node itself, node_repl's child, marked seatbelt (cua's compat executable exec'd it)`, r.kernel.execPathIsNode && r.kernel.parentIsNodeRepl && r.kernel.sandbox === 'seatbelt');
          check(`${mode}: node_repl's script directory lies in the session temp`, scripts?.count === 1, scripts?.count);
          check(`${mode}: the kernel reads its script directory`, scripts?.read?.ok === true, scripts?.read?.code);
          check(`${mode}: the kernel cannot write into its script directory`, scripts?.write?.ok === false && scripts?.add?.ok === false, `${scripts?.write?.code}/${scripts?.add?.code}`);
        } else check(`${mode}: the kernel is Node itself, the supervisor's child, marked seatbelt`, r.kernel.execPathIsNode && r.kernel.parentIsSupervisor && r.kernel.sandbox === 'seatbelt');
      }
      check(`${mode}: no process named codex`, r.codexProcesses === 0);
      rmSync(join(scratch, 'outside-write'), {force: true});
    }
    // Two concurrent sessions (vendor host only, scoped): an own-host kernel against this vendor-host session's script
    // directory and run directory, while its worker's script waits for its first start.
    if (vendor && modes.includes('scoped')) {
      const victim = await connect({home: real, env: env('scoped')});
      try {
        const where = await victim.js(`const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
const tmp = os.tmpdir(); const dir = fs.readdirSync(tmp).find(n => n.startsWith('.tmp') && fs.existsSync(path.join(tmp, n, 'trusted-worker.js')));
nodeRepl.write(JSON.stringify({scripts: dir ? path.join(tmp, dir) : null, run: nodeRepl.cwd}));`);
        if (!where.scripts) check('across sessions: the vendor-host session\'s script directory was found', false);
        else {
          const before = readFileSync(join(where.scripts, 'trusted-worker.js'));
          const attacker = await connect({home: real, env: env('scoped', 'cua')});
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
    // the missing path itself (its realish path), and seatbelt keeps it denied once it appears. Both with the scratch
    // HOME's own ~/.config and with a ~/.config that is a symlink (the realish path is then the link's target). The
    // store is the scratch HOME's (the store's location follows HOME; nothing here touches the account's).
    if (modes.some(m => m !== 'disabled')) {
      const mode = modes.find(m => m !== 'disabled');
      const linked = join(scratch, 'user-linked');
      mkdirSync(join(scratch, 'config-real'), {mode: 0o700});
      mkdirSync(linked, {mode: 0o700});
      symlinkSync(join(scratch, 'config-real'), join(linked, '.config'));
      for (const [label, home] of [['', user], [' (through a symlinked ~/.config)', linked]]) {
        const lateStore = join(home, STORE_RELATIVE);
        rmSync(lateStore, {recursive: true, force: true});
        const connection = await connect({home: real, env: {...env(mode), HOME: home}});
        try {
          await connection.js('nodeRepl.write(JSON.stringify(1))');
          check(`a store root missing at launch is not created${label}`, !existsSync(lateStore));
          const late = sentinelIn(lateStore);
          const out = await connection.js(`const fs = await import('node:fs'); const r = f => { try { f(); return {ok: true}; } catch (e) { return {ok: false, code: e.code}; } };
nodeRepl.write(JSON.stringify({file: r(() => fs.readFileSync(${JSON.stringify(late)}, 'utf8')), listing: r(() => fs.readdirSync(${JSON.stringify(lateStore)}))}));`);
          check(`a store root created mid-session stays denied${label}`, !out.file.ok && DENIED.has(out.file.code), out.file.code);
          check(`a store root created mid-session cannot be listed${label}`, !out.listing.ok && DENIED.has(out.listing.code), out.listing.code);
        } finally { await connection.close(); }
      }
    }
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
