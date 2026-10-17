// cua #115 spike driver (runs on the mini): one cua computer-surface session on the vendor host through
// serve-spike.mjs, read-only native calls only (listApps, Finder's AX state), with the helper's process tree polled.
//   node driver.mjs <phase>      phase: forward | refuse | unset
// Writes <scratch>/phase-<phase>.json and <scratch>/serve-<phase>.stderr. Refuses to run while a
// SkyComputerUseService this run did not start is running.
import {spawn, execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {writeFileSync, appendFileSync} from 'node:fs';

const S = '/Users/new/cua-115-spike';
const phase = process.argv[2];
if (!['forward', 'refuse', 'unset'].includes(phase)) throw new Error('phase: forward | refuse | unset');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, args) => { try { return execFileSync(cmd, args, {encoding: 'utf8'}); } catch (e) { return e.stdout ?? ''; } };
const now = () => new Date().toISOString();
const out = {phase, started: now(), events: []};
const ev = (what, data = {}) => { const e = {at: now(), what, ...data}; out.events.push(e); console.error(`[${e.at}] ${what} ${JSON.stringify(data).slice(0, 400)}`); };

const helperPids = () => sh('/usr/bin/pgrep', ['-f', 'SkyComputerUseService']).split('\n').filter(Boolean).map(Number);
const procInfo = pid => sh('/bin/ps', ['-o', 'pid=,ppid=,lstart=,command=', '-p', String(pid)]).trim();
const front = () => { const asn = sh('/usr/bin/lsappinfo', ['front']).trim(); return sh('/usr/bin/lsappinfo', ['info', '-only', 'bundleid', asn]).trim(); };

const pre = helperPids();
if (pre.length) {
  out.refused = {reason: 'a SkyComputerUseService this spike did not start is running', helpers: pre.map(procInfo)};
  writeFileSync(`${S}/phase-${phase}.json`, JSON.stringify(out, null, 2));
  console.error(JSON.stringify(out.refused));
  process.exit(3);
}
if (phase !== 'unset') writeFileSync(`${S}/shim/mode`, phase === 'refuse' ? 'refuse\n' : 'forward\n');
appendFileSync(`${S}/shim.log`, `# ---- phase ${phase} start ${now()}\n`);

// Process polling: every process seen, so the helper's descendants can be reconstructed afterwards.
const baseline = new Set(sh('/bin/ps', ['-axo', 'pid=']).split('\n').map(s => Number(s.trim())).filter(Boolean));
const seen = new Map();
const poll = () => {
  for (const line of sh('/bin/ps', ['-axo', 'pid=,ppid=,command=']).split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const pid = Number(m[1]);
    if (baseline.has(pid)) continue;
    if (!seen.has(pid)) seen.set(pid, {pid, ppid: Number(m[2]), command: m[3].slice(0, 300), firstSeen: now()});
  }
};
const poller = setInterval(poll, 150);

const frontBefore = front();
const env = {...process.env, SPIKE_CLI: phase === 'unset' ? 'unset' : 'shim', CUA_SHIM_SECRETS: 'off'};
for (const k of ['CUA_REPL_HOST', 'CUA_SHIM_SURFACES', 'CUA_BROWSER_SERVICE', 'CUA_HOME']) delete env[k];
const child = spawn('/opt/homebrew/bin/node', [`${S}/serve-spike.mjs`], {stdio: ['pipe', 'pipe', 'pipe'], env, cwd: S});
let stderr = '';
child.stderr.on('data', d => { stderr += d; });
const exited = new Promise(resolve => child.on('exit', (code, signal) => resolve({code, signal})));
const waiters = new Map();
let nextId = 0;
const send = msg => child.stdin.write(JSON.stringify(msg) + '\n');
const elicitations = [];
createInterface({input: child.stdout}).on('line', line => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.method !== undefined && msg.id !== undefined) {
    // The vendor's per-connection app approval: accept only Finder's, for the session.
    const app = msg.params?._meta?.tool_params?.app ?? msg.params?.meta?.tool_params?.app ?? null;
    const accept = msg.method === 'elicitation/create' && app === 'com.apple.finder';
    elicitations.push({at: now(), method: msg.method, app, answered: accept ? 'accept' : 'decline', persist: msg.params?._meta?.persist ?? null, riskLevel: msg.params?._meta?.riskLevel ?? null});
    ev('elicitation', elicitations.at(-1));
    return send({jsonrpc: '2.0', id: msg.id, result: accept ? {action: 'accept', content: {}} : {action: 'decline'}});
  }
  waiters.get(msg.id)?.(msg);
});
const request = (method, params = {}, timeoutMs = 60_000) => new Promise(resolve => {
  const id = ++nextId;
  const timer = setTimeout(() => { waiters.delete(id); resolve({timedOut: true}); }, timeoutMs);
  waiters.set(id, msg => { clearTimeout(timer); waiters.delete(id); resolve(msg); });
  send({jsonrpc: '2.0', id, method, params});
});
const MARK = 'SPIKE115 ';
const cell = body => `{let __r; const __t0 = performance.now();
try { __r = {ok: true, value: (await (async () => {${body}\n})()) ?? null}; }
catch (e) { __r = {ok: false, error: String(e?.message ?? e).slice(0, 600), cause: e?.cause ? String(e.cause?.message ?? e.cause).slice(0, 400) : undefined, code: e?.code}; }
__r.ms = Math.round(performance.now() - __t0); nodeRepl.write(${JSON.stringify(MARK)} + JSON.stringify(__r));}`;
const js = async (name, body, timeoutMs = 90_000) => {
  ev(`call ${name}`);
  const t = Date.now();
  const reply = await request('tools/call', {name: 'js', arguments: {code: cell(body)}}, timeoutMs);
  const text = (reply.result?.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const line = text.split('\n').reverse().find(l => l.startsWith(MARK));
  const r = line ? JSON.parse(line.slice(MARK.length))
    : {ok: false, noMarker: true, timedOut: reply.timedOut ?? false, isError: reply.result?.isError ?? null, rpcError: reply.error ?? null, text: text.slice(0, 600)};
  r.wallMs = Date.now() - t;
  ev(`done ${name}`, r);
  return r;
};
const helperSnapshot = label => {
  const pids = helperPids();
  const snap = {label, helpers: pids.map(pid => {
    const children = sh('/usr/bin/pgrep', ['-P', String(pid)]).split('\n').filter(Boolean).map(c => procInfo(Number(c)));
    // The helper's own environment, names only plus the values that matter here.
    const envLine = sh('/bin/ps', ['eww', '-o', 'command=', '-p', String(pid)]);
    const keys = [...envLine.matchAll(/\s([A-Za-z_][A-Za-z0-9_]*)=/g)].map(m => m[1]);
    const pick = k => envLine.match(new RegExp(`\\s${k}=(\\S*)`))?.[1] ?? null;
    return {info: procInfo(pid), children, envKeys: [...new Set(keys)], CODEX_CLI_PATH: pick('CODEX_CLI_PATH'), CODEX_HOME: pick('CODEX_HOME'), SKY_CUA_SERVICE_PATH: pick('SKY_CUA_SERVICE_PATH')};
  })};
  ev('helper snapshot', snap);
  return snap;
};

out.results = {};
try {
  const init = await request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'cua-115-spike', version: '0'}}, 120_000);
  if (init.timedOut || init.error) throw new Error(`initialize failed: ${JSON.stringify(init).slice(0, 300)}`);
  send({jsonrpc: '2.0', method: 'notifications/initialized'});
  out.results.banner = await js('banner', 'return {ready: true};', 120_000);
  helperSnapshot('after banner, before any native call');
  out.results.listApps1 = await js('listApps#1', 'const apps = await cua.listApps({emit: false}); return {apps: apps.length, running: apps.filter(a => a.isRunning).length};');
  helperSnapshot('after listApps#1');
  await sleep(3000);
  helperSnapshot('3 s later');
  out.results.finderState = await js('Finder getApp+getAXState', 'const app = await cua.getApp("com.apple.finder"); const ax = await app.getAXState({emit: false, disableDiffing: true}); return {chars: ax?.length ?? null, lines: ax?.split("\\n").length ?? null};');
  helperSnapshot('after Finder state');
  out.results.listApps2 = await js('listApps#2', 'const apps = await cua.listApps({emit: false}); return {apps: apps.length};');
  out.results.finderState2 = await js('Finder getAXState#2', 'const app = await cua.getApp("com.apple.finder"); const ax = await app.getAXState({emit: false, disableDiffing: true}); return {chars: ax?.length ?? null};');
  helperSnapshot('end of calls');
} catch (error) {
  ev('driver error', {message: error.message});
}
out.elicitations = elicitations;
out.frontUnchanged = front() === frontBefore;
await request('tools/call', {name: 'end_task', arguments: {}}, 15_000);
child.stdin.end();
out.serveExit = await Promise.race([exited, sleep(20_000).then(() => null)]);
if (!out.serveExit) { child.kill('SIGTERM'); out.serveExit = 'killed after 20 s'; }
poll();
clearInterval(poller);

// The helper this phase started (none was running at the start): its descendants and its own record, then quit it.
const started = helperPids();
out.helperAtEnd = started.map(procInfo);
const descendants = root => { const acc = []; const walk = p => { for (const c of seen.values()) if (c.ppid === p) { acc.push(c); walk(c.pid); } }; walk(root); return acc; };
out.helperDescendantsSeen = started.map(pid => ({helper: pid, descendants: descendants(pid)}));
out.newCodexLikeProcesses = [...seen.values()].filter(p => /codex|app-server|cua-115-spike\/shim|CodexCLI/i.test(p.command));
out.newProcesses = [...seen.values()].map(p => `${p.pid}<${p.ppid} ${p.command.slice(0, 160)}`);
for (const pid of started) { try { process.kill(pid, 'SIGTERM'); } catch {} }
await sleep(2000);
out.helperAfterQuit = helperPids().map(procInfo);
out.finished = now();
writeFileSync(`${S}/serve-${phase}.stderr`, stderr);
writeFileSync(`${S}/phase-${phase}.json`, JSON.stringify(out, null, 2));
console.error(`wrote ${S}/phase-${phase}.json`);
process.exit(0);
