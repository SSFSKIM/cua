// M5 copy of ../../../m3/maws/attest-serve.mjs, adapted only for M5's managed-Node and scratch-home rules
// (docs/doperpowers/specs/2026-10-14-own-repl-host-design.md, Decision Log "Four rulings shape M5's remaining live work",
// second bullet, and "cua install also installs a pinned official Node 24"). Loaded into the unchanged MAWS live probe
// (docs/evidence/2026-10-13-own-browser-service-parity/m4/maws-live/run.mjs) with `--import`; the probe and its judging
// are unchanged. What differs from the M3 copy:
// - It lives outside the checkout during the run (the source record requires a clean tree), so it imports the
//   checkout's modules from the working directory, which must be the parity clone (as for the M3 copy's relative imports).
// - The source record resolves the own host's Node as a connection does, with the answering CUA_HOME (M3's call named no
//   home, so it could not see the Node `cua install` placed there).
// - On each session's first js answer it witnesses the process that actually answers: the one descendant of that
//   `cua serve` whose argv is exactly `<Node> --disable-sigusr1 <checkout>/src/repl-host/supervisor.mjs` with the Node the
//   source record resolved (the same witness as the M5 remote endpoints, scripts/repl-parity/node-provenance.mjs), plus
//   that executable's reported version and whether it lies under the session's CUA_HOME `node/` subtree.
// - It records MAWS's Electron exit as observed by the probe's own child: the signals the probe sent it, the exit code and
//   signal, and how long after the first SIGTERM it ended (maws-fe's condition: Electron quits cleanly).
// Records (one JSON line each, appended to CUA_ATTEST_OUT; paths, versions and markers only, never content or page data):
//   {session, pid, kind: 'source', facts}                     at each `cua serve` spawn
//   {session, pid, kind: 'initialize', serverInfo}             the initialize answer's serverInfo
//   {session, pid, kind: 'result', tool, isError, replHost}    each tools/call answer's tool and `_meta['cua/replHost']`
//   {session, pid, kind: 'answering', witness}                 the answering supervisor, at the first js answer
//   {kind: 'maws', event: 'spawn'|'signal'|'exit', ...}        MAWS's Electron, as the probe's child
// NODE_OPTIONS is removed from this process's environment at once, so no child (Electron, cua serve, the host) loads this.
import childProcess from 'node:child_process';
import {appendFileSync, realpathSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {dirname, join, resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const out = process.env.CUA_ATTEST_OUT;
if (!out) throw new Error('attest-serve: set CUA_ATTEST_OUT');
delete process.env.NODE_OPTIONS;
const checkoutUrl = pathToFileURL(`${process.cwd()}/`);
const {resolveRuntime} = await import(new URL('src/runtime/manifest.mjs', checkoutUrl));
const {ownHostNode} = await import(new URL('src/runtime/launch.mjs', checkoutUrl));
const {defaultHome} = await import(new URL('src/runtime/layout.mjs', checkoutUrl));
const {descendants} = await import(new URL('scripts/repl-parity/processes.mjs', checkoutUrl));

const record = entry => appendFileSync(out, `${JSON.stringify(entry)}\n`);
const lines = (stream, onLine) => {
  let buffer = '';
  stream.on('data', chunk => {
    buffer += chunk;
    for (let at = buffer.indexOf('\n'); at !== -1; at = buffer.indexOf('\n')) { onLine(buffer.slice(0, at)); buffer = buffer.slice(at + 1); }
  });
};
const parse = line => { try { return JSON.parse(line); } catch { return null; } };
const version = path => childProcess.execFileSync(path, ['--version'], {encoding: 'utf8', env: {PATH: '/usr/bin:/bin'}}).trim();
const processRows = () => childProcess.execFileSync('ps', ['-axww', '-o', 'pid=,ppid=,command='], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024})
  .trim().split('\n').map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean)
  .map(m => ({pid: Number(m[1]), ppid: Number(m[2]), command: m[3]}));

const spawn = childProcess.spawn;
let sessions = 0;
childProcess.spawn = function attestedSpawn(command, args, ...rest) {
  const child = spawn.call(this, command, args, ...rest);
  if (/\/Electron\.app\/Contents\/MacOS\/Electron$/.test(String(command)) && /maws-live\/launch\.cjs$/.test(args?.[0] ?? '')) return watchMaws(child);
  if (!Array.isArray(args) || !/(^|\/)bin\/cua\.mjs$/.test(args[0] ?? '') || args[1] !== 'serve') return child;
  const session = ++sessions;
  const env = rest.find(o => o && typeof o === 'object' && !Array.isArray(o))?.env ?? process.env;
  const checkout = resolve(dirname(args[0]), '..');
  const git = gitArgs => childProcess.execFileSync('git', gitArgs, {cwd: checkout, encoding: 'utf8'}).trim();
  const home = defaultHome(env);
  let ownNode = null;
  try { const path = ownHostNode({ambient: env, home, execPath: command}); ownNode = {path, version: version(path)}; } catch {}
  const runtime = resolveRuntime({home: env.CUA_HOME});
  record({session, pid: child.pid, kind: 'source', facts: {
    checkout, commit: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain']) !== '',
    release: runtime.release, home, cuaNodeSet: env.CUA_NODE !== undefined, ownNode, platform: process.platform,
  }});
  const answering = () => {
    const entry = join(checkout, 'src/repl-host/supervisor.mjs');
    const found = ownNode ? descendants(processRows(), child.pid).filter(row => row.command === `${ownNode.path} --disable-sigusr1 ${entry}`) : [];
    let managedRoot = null;
    try { managedRoot = join(realpathSync(home), 'node') + sep; } catch {}
    const witness = found.length === 1
      ? {pid: found[0].pid, path: ownNode.path, version: version(ownNode.path), underHomeNode: managedRoot !== null && ownNode.path.startsWith(managedRoot)}
      : {error: found.length ? 'ambiguous' : 'no owned supervisor with the resolved Node'};
    record({session, pid: child.pid, kind: 'answering', witness});
  };
  let witnessed = false;
  const tools = new Map();   // request id -> tool name
  const write = child.stdin.write.bind(child.stdin);
  child.stdin.write = (chunk, ...more) => {
    for (const line of String(chunk).split('\n')) {
      const msg = parse(line);
      if (msg?.method === 'tools/call' && msg.id !== undefined) tools.set(JSON.stringify(msg.id), msg.params?.name ?? null);
    }
    return write(chunk, ...more);
  };
  lines(child.stdout, line => {
    const msg = parse(line);
    if (!msg || msg.id === undefined || msg.method !== undefined) return;
    if (msg.result?.serverInfo) return record({session, pid: child.pid, kind: 'initialize', serverInfo: msg.result.serverInfo});
    const key = JSON.stringify(msg.id);
    if (!tools.has(key)) return;
    const tool = tools.get(key);
    tools.delete(key);
    record({session, pid: child.pid, kind: 'result', tool, isError: msg.result?.isError ?? null, replHost: msg.result?._meta?.['cua/replHost'] ?? null});
    if (tool === 'js' && !witnessed) { witnessed = true; answering(); }
  });
  return child;
};

function watchMaws(child) {
  record({kind: 'maws', event: 'spawn', pid: child.pid, at: Date.now()});
  let firstTerm = null;
  const kill = child.kill.bind(child);
  child.kill = (signal = 'SIGTERM', ...more) => {
    const at = Date.now();
    if (signal === 'SIGTERM' && firstTerm === null) firstTerm = at;
    record({kind: 'maws', event: 'signal', signal, at});
    return kill(signal, ...more);
  };
  child.on('exit', (code, signal) => record({kind: 'maws', event: 'exit', code, signal, at: Date.now(), msAfterSigterm: firstTerm === null ? null : Date.now() - firstTerm}));
  return child;
}
syncBuiltinESMExports();
