// M5 task 6 copy of ../../../m4/accept/attest-serve.mjs, for the unchanged Linux acceptance runners on cua-linux at M5.
// Two changes, both for the managed Node (Decision Log, M5 task 1b): the predicted own-host Node is resolved as launch
// resolves it, with the serve's home (so the cua-installed Node counts), and each session also records the Node that
// actually ran cua's supervisor: at the session's first host result, the `supervisor.mjs` process in the serve's
// process subtree, its executable and the version that executable reports. Everything else is M4's, quoted below.
// This file runs on the VM from a scratch copy whose relative imports are rewritten to the prepared clone (see ./run.mjs),
// so the clone stays clean at the recorded head.
//
// > M4 task 3 copy of ../../m3/maws/attest-serve.mjs, for the unchanged Linux acceptance runners
// > (scripts/accept/linux-native.mjs, linux-chrome.mjs, linux-chrome-features.mjs) on cua-linux. Two changes: the runtime
// > release is resolved from the serve's CUA_HOME or, as `cua serve` itself does, the default home; and the source record
// > also names that home and the requested REPL host and surfaces from the serve's environment.
// > [M3:] besides each session's identity and result markers it records, once per `cua serve` session at spawn, the safe
// > source facts that bind the session to the code it ran: the checkout its bin/cua.mjs lives in, that checkout's HEAD
// > commit and clean-tree status, the runtime release its CUA_HOME resolves, and the own host's Node as launch resolves it
// > from that child's environment (path and the version the executable reports). Paths and versions only; no environment
// > dump, content or page data. It wraps child_process.spawn so that every `cua serve` the runner starts has its MCP
// > traffic observed, and appends one JSON line per observation to CUA_ATTEST_OUT:
// >   {session, pid, kind: 'initialize', serverInfo}             the initialize answer's serverInfo
// >   {session, pid, kind: 'result', tool, isError, replHost}    each tools/call answer: the tool's name and the
// >                                                              `_meta['cua/replHost']` marker it carried (null if none)
// > NODE_OPTIONS is removed from this process's environment at once, so no child (cua serve, the host) loads this.
// Added here:
//   {session, pid, kind: 'supervisor', node: {path, version} | null, argv}   once, at the first host result
import childProcess from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {dirname, resolve} from 'node:path';
import {resolveRuntime} from '../../../../../../src/runtime/manifest.mjs';
import {ownHostNode} from '../../../../../../src/runtime/launch.mjs';
import {defaultHome} from '../../../../../../src/runtime/layout.mjs';

const out = process.env.CUA_ATTEST_OUT;
if (!out) throw new Error('attest-serve: set CUA_ATTEST_OUT');
delete process.env.NODE_OPTIONS;
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

// The supervisor process under `root`, by its argv (`<node> --disable-sigusr1 <...>/src/repl-host/supervisor.mjs`).
function answeringSupervisor(root) {
  const rows = childProcess.execFileSync('ps', ['-eo', 'pid=,ppid=,args='], {encoding: 'utf8'}).trim().split('\n')
    .map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map(m => ({pid: Number(m[1]), ppid: Number(m[2]), args: m[3]}));
  const owned = new Set([root]);
  for (let changed = true; changed;) { changed = false; for (const r of rows) if (owned.has(r.ppid) && !owned.has(r.pid)) { owned.add(r.pid); changed = true; } }
  const found = rows.filter(r => owned.has(r.pid) && /\/src\/repl-host\/supervisor\.mjs(\s|$)/.test(r.args));
  if (found.length !== 1) return {node: null, argv: null, found: found.length};
  const [node, ...rest] = found[0].args.split(/\s+/);
  let reported = null;
  try { reported = version(node); } catch {}
  return {node: {path: node, version: reported}, argv: [node, ...rest.map(a => a.replace(/^.*\//, '…/'))], found: 1};
}

const spawn = childProcess.spawn;
let sessions = 0;
childProcess.spawn = function attestedSpawn(command, args, ...rest) {
  const child = spawn.call(this, command, args, ...rest);
  if (!Array.isArray(args) || !/(^|\/)bin\/cua\.mjs$/.test(args[0] ?? '') || args[1] !== 'serve') return child;
  const session = ++sessions;
  const env = rest.find(o => o && typeof o === 'object' && !Array.isArray(o))?.env ?? process.env;
  const checkout = resolve(dirname(args[0]), '..');
  const git = gitArgs => childProcess.execFileSync('git', gitArgs, {cwd: checkout, encoding: 'utf8'}).trim();
  const home = env.CUA_HOME || defaultHome(env);
  let ownNode = null;
  try { const path = ownHostNode({ambient: env, home, execPath: command}); ownNode = {path, version: version(path)}; } catch {}
  const runtime = resolveRuntime({home});
  record({session, pid: child.pid, kind: 'source', facts: {
    checkout, commit: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain']) !== '',
    release: runtime.release, ownNode, platform: process.platform,
    home, cuaNodeSet: env.CUA_NODE !== undefined,
    requested: {CUA_REPL_HOST: env.CUA_REPL_HOST ?? null, CUA_BROWSER_SERVICE: env.CUA_BROWSER_SERVICE ?? null, CUA_SHIM_SURFACES: env.CUA_SHIM_SURFACES ?? null},
  }});
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
    if (!witnessed && ['js', 'js_reset'].includes(tool)) { witnessed = true; record({session, pid: child.pid, kind: 'supervisor', ...answeringSupervisor(child.pid)}); }
  });
  return child;
};
syncBuiltinESMExports();
