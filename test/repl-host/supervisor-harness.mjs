// Drives cua's own REPL host (src/repl-host/supervisor.mjs) as cua's proxy does: a real supervisor process on the own
// host's Node, a real kernel, MCP over its stdio. The sandbox launcher is a double (`sandboxDouble`): a script that
// records its argv and runs the command after `--` as its own child, as `codex sandbox` does, without confining it; the
// real launcher is exercised only by the live parity runs. Every process belongs to the test and is gone after it.
import {spawn, execFileSync} from 'node:child_process';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const SUPERVISOR = fileURLToPath(new URL('../../src/repl-host/supervisor.mjs', import.meta.url));
const DEADLINE_MS = 20_000;

// The launcher double. `refuse`: it prints to stderr and exits 73 without running anything, like a sandbox that cannot
// start. `denyLifeline` ('kernel' | 'worker'): for that child it takes read access to the child's lifeline FIFO away
// before running it, as a sandbox policy that denied the path would.
export function sandboxDouble(dir, {refuse = false, denyLifeline = null} = {}) {
  const path = join(dir, refuse ? 'refusing-sandbox' : 'sandbox');
  const deny = denyLifeline ? `case "$*" in *${denyLifeline === 'worker' ? 'trusted-worker' : 'kernel'}.mjs*) chmod 000 "\${CUA_REPL_LIFELINE#*:*:}";; esac\n` : '';
  writeFileSync(path, refuse
    ? '#!/bin/sh\nmkdir -p "$CODEX_HOME/launches" && printf refused > "$CODEX_HOME/launches/$$"\nprintf \'fixture sandbox launcher refused\\n\' >&2\nexit 73\n'
    : '#!/bin/sh\nmkdir -p "$CODEX_HOME/launches"\nfor a in "$@"; do printf \'%s\\n\' "$a"; done > "$CODEX_HOME/launches/$$"\n' + deny
      + 'while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do shift; done\nshift\n"$@"\nexit $?\n');
  chmodSync(path, 0o755);
  return path;
}

// The launches the double recorded: [{pid, argv}] in pid order.
export function launches(codexHome) {
  const dir = join(codexHome, 'launches');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map(Number).sort((a, b) => a - b).map(pid => ({pid, argv: readFileSync(join(dir, String(pid)), 'utf8').split('\n').slice(0, -1)}));
}

// Whether `p` (from descendants()) is still that process: the same pid running the same command line, so a reused
// pid is never signalled.
function sameProcess(p) {
  try { return execFileSync('ps', ['-o', 'command=', '-p', String(p.pid)], {encoding: 'utf8'}).trim() === p.command; } catch { return false; }
}

export function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

// Every live process below `pid` with its command line.
export function descendants(pid) {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], {encoding: 'utf8'}).trim().split('\n').map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean)
    .map(m => ({pid: Number(m[1]), ppid: Number(m[2]), command: m[3]}));
  const owned = new Set([pid]);
  for (let changed = true; changed;) {
    changed = false;
    for (const row of rows) if (owned.has(row.ppid) && !owned.has(row.pid)) { owned.add(row.pid); changed = true; }
  }
  return rows.filter(row => row.pid !== pid && owned.has(row.pid));
}

export const SCOPED = cwd => ({type: 'managed', file_system: {type: 'restricted', entries: [
  {path: {type: 'special', value: {kind: 'root'}}, access: 'read'},
  {path: {type: 'special', value: {kind: 'project_roots'}}, access: 'write'},
  {path: {type: 'special', value: {kind: 'tmpdir'}}, access: 'write'},
]}, network: 'restricted'});

// Starts a supervisor -> the driver. `env` adds to (or, as undefined, removes from) the host's environment; `sandbox`
// is 'double' (default), 'refusing' or null (no CODEX_CLI_PATH). `services` ({name: module source}) are fixture trusted
// services, written as <root>/trusted/<name>.mjs (the one trusted code path) and registered with rpc enabled.
// `capabilities` are the client's in initialize; `onServerRequest(msg)` answers the requests the host sends the client
// (elicitations), returning the reply's {result} or {error}, or nothing to leave it unanswered.
export async function startHost(t, {node, env = {}, sandbox = 'double', denyLifeline = null, initialize = true, services = null, capabilities = {}, onServerRequest = () => undefined} = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cua-host-')));
  const cwd = join(root, 'run');
  const codexHome = join(root, 'codex');
  const tmp = join(root, 'tmp');
  const trusted = join(root, 'trusted');
  for (const dir of [cwd, codexHome, tmp, trusted]) mkdirSync(dir, {mode: 0o700});
  const serviceEnv = {};
  if (services) {
    for (const [name, source] of Object.entries(services)) writeFileSync(join(trusted, `${name}.mjs`), source);
    Object.assign(serviceEnv, {CUA_REPL_TRUSTED_SERVICES: JSON.stringify(Object.fromEntries(Object.keys(services).map(name => [name, join(trusted, `${name}.mjs`)]))),
      CUA_REPL_TRUSTED_CODE_PATHS: trusted, CUA_REPL_TRUSTED_RPC_ENABLED: '1'});
  }
  const base = {PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: root, TMPDIR: tmp, CODEX_HOME: codexHome, CUA_REPL_NODE_PATH: node, ...serviceEnv,
    ...(sandbox ? {CODEX_CLI_PATH: sandboxDouble(root, {refuse: sandbox === 'refusing', denyLifeline})} : {})};
  const childEnv = Object.fromEntries(Object.entries({...base, ...env}).filter(([, v]) => v !== undefined));
  const child = spawn(node, ['--disable-sigusr1', SUPERVISOR], {cwd, env: childEnv, stdio: ['pipe', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({code, signal})));
  const pending = new Map();
  const frames = [];
  const serverRequests = [];
  createInterface({input: child.stdout}).on('line', line => {
    const msg = JSON.parse(line);
    frames.push(msg);
    if (msg.method !== undefined) {
      serverRequests.push(msg);
      if (msg.id === undefined) return;
      Promise.resolve(onServerRequest(msg)).then(reply => { if (reply) send({jsonrpc: '2.0', id: msg.id, ...reply}); });
      return;
    }
    pending.get(msg.id)?.(msg);
    pending.delete(msg.id);
  });
  // Processes the test saw below the host (track()): ended at teardown even when the host is gone by then and they
  // were reparented, so a test that kills the host itself still leaves nothing running.
  const tracked = new Map();
  t.after(async () => {
    const owned = [...descendants(child.pid), ...tracked.values()];
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
    for (const p of owned) { try { if (sameProcess(p)) process.kill(p.pid, 'SIGKILL'); } catch { /* gone */ } }
    rmSync(root, {recursive: true, force: true});
  });
  let nextId = 0;
  const send = msg => child.stdin.write(`${JSON.stringify(msg)}\n`);
  const request = (method, params) => {
    const id = ++nextId;
    const reply = new Promise((resolve, reject) => {
      const fail = why => { if (pending.delete(id)) reject(new Error(`no reply to ${method}: ${why}; stderr: ${stderr}`)); };
      const timer = setTimeout(() => fail(`none within ${DEADLINE_MS} ms`), DEADLINE_MS);
      pending.set(id, msg => { clearTimeout(timer); resolve(msg); });
      exited.then(status => setTimeout(() => { clearTimeout(timer); fail(`the host exited (${JSON.stringify(status)})`); }, 50));
    });
    send({jsonrpc: '2.0', id, method, ...(params === undefined ? {} : {params})});
    return reply;
  };
  const meta = (mode = 'scoped', extra = {}) => ({...extra, ...(mode === 'default' ? {} : {'codex/sandbox-state-meta': mode === 'disabled'
    ? {permissionProfile: {type: 'disabled'}, sandboxCwd: pathToFileURL(cwd).href} : {permissionProfile: SCOPED(cwd), sandboxCwd: pathToFileURL(cwd).href}})});
  const call = (name, args, {mode = 'scoped', extra} = {}) => request('tools/call', {name, arguments: args, _meta: meta(mode, extra)}).then(r => r.result ?? r);
  const js = (code, {timeoutMs, ...rest} = {}) => call('js', {code, ...(timeoutMs ? {timeout_ms: timeoutMs} : {})}, rest);
  // Records what runs below the host now -> those processes.
  const track = () => { const now = descendants(child.pid); for (const p of now) tracked.set(p.pid, p); return now; };
  const host = {child, cwd, root, codexHome, tmp, trusted, send, request, call, js, exited, frames, serverRequests, track, stderr: () => stderr};
  if (initialize) {
    host.initialized = await request('initialize', {protocolVersion: '2025-06-18', capabilities, clientInfo: {name: 'test', version: '0'}});
    send({jsonrpc: '2.0', method: 'notifications/initialized'});
  }
  return host;
}

export const texts = result => (result.content ?? []).filter(c => c.type === 'text').map(c => c.text);
