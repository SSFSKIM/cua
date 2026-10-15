// M4 task 3 copy of ../../m3/maws/attest-serve.mjs, for the unchanged Linux acceptance runners
// (scripts/accept/linux-native.mjs, linux-chrome.mjs, linux-chrome-features.mjs) on cua-linux. Two changes: the runtime
// release is resolved from the serve's CUA_HOME or, as `cua serve` itself does, the default home (linux-native runs on
// the default home, where the M3 copy assumed CUA_HOME); and the source record also names that home and the requested
// REPL host and surfaces from the serve's environment. Everything else is M3's, quoted below.
//
// > M3 task 4 copy of ../../m2/maws/attest-serve.mjs, extended (controller review): besides each session's identity and
// > result markers it records, once per `cua serve` session at spawn, the safe source facts that bind the session to the
// > code it ran: the checkout its bin/cua.mjs lives in, that checkout's HEAD commit and clean-tree status, the runtime
// > release its CUA_HOME resolves, and the own host's Node as launch resolves it from that child's environment (path and
// > the version the executable reports). Paths and versions only; no environment dump, content or page data.
// > Host attestation for the unchanged MAWS live probe (docs/evidence/2026-10-13-own-browser-service-parity/m4/maws-live/run.mjs)
// > on cua's own REPL host (docs/doperpowers/specs/2026-10-14-own-repl-host-design.md, M2; acceptance 7 must attest the
// > answering host, not only the browser service). Loaded into the probe's process with `--import`, before the probe's
// > own modules: it wraps child_process.spawn so that every `cua serve` the probe or its maws-features harness starts has
// > its MCP traffic observed, and appends one JSON line per observation to CUA_ATTEST_OUT:
// >   {session, pid, kind: 'initialize', serverInfo}             the initialize answer's serverInfo
// >   {session, pid, kind: 'result', tool, isError, replHost}    each tools/call answer: the tool's name and the
// >                                                              `_meta['cua/replHost']` marker it carried (null if none)
// > Nothing else is recorded: no content, page text or tab data. The probe and its judging are unchanged; NODE_OPTIONS is
// > removed from this process's environment at once, so no child (MAWS's Electron, cua serve, the host) loads this.
import childProcess from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {dirname, resolve} from 'node:path';
import {resolveRuntime} from '../../../../../src/runtime/manifest.mjs';
import {ownHostNode} from '../../../../../src/runtime/launch.mjs';
import {defaultHome} from '../../../../../src/runtime/layout.mjs';

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

const spawn = childProcess.spawn;
let sessions = 0;
childProcess.spawn = function attestedSpawn(command, args, ...rest) {
  const child = spawn.call(this, command, args, ...rest);
  if (!Array.isArray(args) || !/(^|\/)bin\/cua\.mjs$/.test(args[0] ?? '') || args[1] !== 'serve') return child;
  const session = ++sessions;
  const env = rest.find(o => o && typeof o === 'object' && !Array.isArray(o))?.env ?? process.env;
  const checkout = resolve(dirname(args[0]), '..');
  const git = gitArgs => childProcess.execFileSync('git', gitArgs, {cwd: checkout, encoding: 'utf8'}).trim();
  const version = path => childProcess.execFileSync(path, ['--version'], {encoding: 'utf8', env: {PATH: '/usr/bin:/bin'}}).trim();
  let ownNode = null;
  try { const path = ownHostNode({ambient: env, execPath: command}); ownNode = {path, version: version(path)}; } catch {}
  const home = env.CUA_HOME || defaultHome(env);
  const runtime = resolveRuntime({home});
  record({session, pid: child.pid, kind: 'source', facts: {
    checkout, commit: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain']) !== '',
    release: runtime.release, ownNode, platform: process.platform,
    home, requested: {CUA_REPL_HOST: env.CUA_REPL_HOST ?? null, CUA_BROWSER_SERVICE: env.CUA_BROWSER_SERVICE ?? null, CUA_SHIM_SURFACES: env.CUA_SHIM_SURFACES ?? null},
  }});
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
  });
  return child;
};
syncBuiltinESMExports();
