// M4: the own host's lifeline (src/repl-host/lifeline.mjs) under the real `codex sandbox` launcher, scoped, on a macOS
// device. Run in the device's prepared parity clone; harness-owned processes only. For each scenario it starts a session
// child (`device.mjs session`): the real proxy (openConnection, as `cua serve` builds it), its anchor, cua's supervisor
// and, under the real launcher, a kernel and a trusted worker, in a scratch capability home browser-only. The one
// addition to the production launch is a fixture trusted service (`spin`) that can block the worker's event loop. The
// session makes the worker and the kernel busy in synchronous code and reports their pids, the launcher's policy markers
// and whether each child holds its lifeline FIFO open (lsof). Then this observer:
//   supervisor        SIGKILLs the supervisor only (the proxy and anchor live on, as in production)
//   everything-above  SIGKILLs the proxy, the anchor and the supervisor together, so nothing of cua's can tear the
//                     group down and only the lifeline can end the busy children
// and watches whether the kernel and the worker end within BOUND_MS, and whether any process it recorded is left
// reparented to launchd (ppid 1). Everything it recorded is ended and the scratch home removed afterwards.
//   CUA_NODE=<own Node> CUA_PARITY_SCRATCH_PREFIX=cua-m4t3- node docs/evidence/.../m4/lifeline-sandbox-check/device.mjs
import {execFileSync, spawn} from 'node:child_process';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {openConnection} from '../../../../../src/mcp/connection.mjs';
import {defaultHome} from '../../../../../src/runtime/layout.mjs';
import {prepareCapabilityHome} from '../../../../../scripts/browser-parity/capability-home.mjs';
import {cellsServeEnv} from '../../../../../test/repl-parity/fixture-launch.mjs';
import {REPL_HOST_VERSION} from '../../../../../src/repl-host/identity.mjs';

const BOUND_MS = 5000;
const LAUNCHER = /(^|\/)codex sandbox |(^|\/)sandbox-exec /;
const SELF = fileURLToPath(import.meta.url);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const table = () => execFileSync('ps', ['-axo', 'pid=,ppid=,pcpu=,command='], {encoding: 'utf8'}).trim().split('\n')
  .map(line => line.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/)).filter(Boolean)
  .map(m => ({pid: Number(m[1]), ppid: Number(m[2]), cpu: Number(m[3]), command: m[4]}));
function descendants(root) {
  const rows = table(), owned = new Set([root]);
  for (let changed = true; changed;) { changed = false; for (const r of rows) if (owned.has(r.ppid) && !owned.has(r.pid)) { owned.add(r.pid); changed = true; } }
  return rows.filter(r => r.pid !== root && owned.has(r.pid));
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const fifos = pid => { try { return execFileSync('lsof', ['-a', '-p', String(pid), '-d', '0-255', '-F', 't'], {encoding: 'utf8'}).split('\n').filter(l => l === 'tFIFO').length; } catch { return 0; } };

async function session() {
  const scratch = prepareCapabilityHome({source: defaultHome()});
  const trusted = join(scratch.dir, 'trusted');
  mkdirSync(trusted);
  writeFileSync(join(trusted, 'spin.mjs'), "export async function handleRpc(r) { if (r.op === 'spin') { setTimeout(() => { for (;;) {} }, 200); return 'spinning soon'; } return 'ok'; }\n");
  const env = cellsServeEnv(process.env, {scratch, sandbox: 'scoped', host: 'cua'});
  const input = new PassThrough(), output = new PassThrough();
  let launch = null;
  const connection = await openConnection({home: scratch.dir, env, sessionId: randomUUID(), input, output, chrome: {profiles: []}, listBackends: async () => [],
    prepareLaunch: l => {
      launch = {command: l.command, args: l.args.map(a => a.replace(/.*\//, '')), tmpdir: l.env.TMPDIR, codexCli: Boolean(l.env.CODEX_CLI_PATH)};
      const services = {...JSON.parse(l.env.CUA_REPL_TRUSTED_SERVICES || '{}'), spin: join(trusted, 'spin.mjs')};
      return {...l, env: {...l.env, CUA_REPL_TRUSTED_SERVICES: JSON.stringify(services), CUA_REPL_TRUSTED_CODE_PATHS: [l.env.CUA_REPL_TRUSTED_CODE_PATHS, trusted].filter(Boolean).join(':'), CUA_REPL_TRUSTED_RPC_ENABLED: '1'}};
    }});
  const pending = new Map();
  createInterface({input: output}).on('line', line => { const m = JSON.parse(line); if (m.id !== undefined && m.method === undefined) { pending.get(m.id)?.(m); pending.delete(m.id); } });
  let id = 0;
  const request = (method, params) => new Promise(resolve => { const n = ++id; pending.set(n, resolve); input.write(JSON.stringify({jsonrpc: '2.0', id: n, method, params}) + '\n'); });
  const js = async code => (await request('tools/call', {name: 'js', arguments: {code, timeout_ms: 600000}})).result;
  const init = await request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'lifeline-check', version: '0'}});
  input.write(JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'}) + '\n');
  const warm = await js("nodeRepl.write(JSON.stringify(await nodeRepl.rpc('spin', {op: 'ok'})));");
  const spin = await js("nodeRepl.write(JSON.stringify(await nodeRepl.rpc('spin', {op: 'spin'})));");
  const kernelBusy = await js('setTimeout(() => { for (;;) {} }, 300); nodeRepl.write("kernel spinning soon");');
  await sleep(1500);
  const tree = descendants(process.pid);
  const pick = re => tree.filter(p => re.test(p.command));
  // The launcher's own command line names the child it runs, so it is told apart first.
  const role = p => (LAUNCHER.test(p.command) ? 'launcher' : /anchor\.mjs/.test(p.command) ? 'anchor' : /supervisor\.mjs/.test(p.command) ? 'supervisor'
    : /kernel\.mjs/.test(p.command) ? 'kernel' : /trusted-worker\.mjs/.test(p.command) ? 'worker' : 'other');
  const launchers = pick(LAUNCHER);
  const facts = {
    serverInfo: init.result?.serverInfo, launch,
    cells: {warm: warm?.content?.[0]?.text, spin: spin?.content?.[0]?.text, kernel: kernelBusy?.content?.[0]?.text, replHost: kernelBusy?._meta?.['cua/replHost'],
      outcomes: Object.fromEntries([['warm', warm], ['spin', spin], ['kernel', kernelBusy]].map(([name, r]) => [name, {isError: r?.isError ?? null, text: (r?.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('').slice(-200)}]))},
    processes: tree.map(p => ({pid: p.pid, ppid: p.ppid, role: role(p), cpu: p.cpu, fifos: ['kernel', 'worker'].includes(role(p)) ? fifos(p.pid) : undefined})),
    launcherPolicy: launchers.map(p => ({sandbox: / sandbox /.test(p.command) || /sandbox-exec/.test(p.command), nodeReplPermissions: p.command.includes('default_permissions="node_repl"'), networkOff: /network\s*=\s*\{\s*enabled\s*=\s*false\s*\}/.test(p.command), launches: /kernel\.mjs/.test(p.command) ? 'kernel' : /trusted-worker\.mjs/.test(p.command) ? 'worker' : null})),
    proxy: process.pid, scratch: scratch.dir,
  };
  process.stdout.write(JSON.stringify(facts) + '\n');
  process.stdin.resume();
  process.stdin.once('end', async () => { await connection.close('signal'); scratch.cleanup(); process.exit(0); });
}

async function scenario(name) {
  const child = spawn(process.execPath, [SELF, 'session'], {stdio: ['pipe', 'pipe', 'inherit'], env: process.env});
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({code, signal})));
  const facts = await new Promise((resolve, reject) => { createInterface({input: child.stdout}).once('line', line => resolve(JSON.parse(line))); child.once('exit', () => reject(new Error('session ended before it was ready'))); });
  const byRole = r => facts.processes.filter(p => p.role === r).map(p => p.pid);
  const [supervisor] = byRole('supervisor'), [anchor] = byRole('anchor');
  const children = [...byRole('kernel'), ...byRole('worker')];
  // Nothing is disrupted unless the session proves what the check is about: a busy kernel and worker that answered as
  // cua's host, with their identities recorded.
  const unready = readiness(facts);
  if (unready.length) {
    child.stdin.end();
    await Promise.race([exited, sleep(20000)]);
    for (const p of facts.processes) if (alive(p.pid)) try { process.kill(p.pid, 'SIGKILL'); } catch { /* gone */ }
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
    return {scenario: name, facts: {...facts, scratch: undefined}, notDisrupted: unready, killed: [], childrenEndedMs: null, leftAfterwards: [], reparentedToLaunchd: [],
      cleanup: {recordedAlive: facts.processes.filter(p => alive(p.pid)).length}};
  }
  const killed = name === 'supervisor' ? [supervisor] : [child.pid, anchor, supervisor].filter(Boolean);
  const started = performance.now();
  for (const pid of killed) try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
  while (children.some(alive) && performance.now() - started < BOUND_MS) await sleep(50);
  const endedMs = children.some(alive) ? null : Math.round(performance.now() - started);
  await sleep(500);
  const now = new Map(table().map(r => [r.pid, r]));
  const recorded = facts.processes.map(p => p.pid);
  const left = recorded.filter(pid => now.has(pid) && !killed.includes(pid)).map(pid => ({pid, ppid: now.get(pid).ppid, command: now.get(pid).command.slice(0, 80)}));
  const result = {scenario: name, facts: {...facts, scratch: undefined}, killed: killed.map(pid => ({pid, role: pid === child.pid ? 'proxy' : facts.processes.find(p => p.pid === pid)?.role})),
    childrenEndedMs: endedMs, leftAfterwards: left, reparentedToLaunchd: left.filter(p => p.ppid === 1)};
  // Cleanup: the session (if alive) closes its connection and scratch; anything recorded that is left is ended by pid.
  if (child.exitCode === null && child.signalCode === null) { child.stdin.end(); await Promise.race([exited, sleep(20000)]); }
  for (const p of facts.processes) if (alive(p.pid)) try { process.kill(p.pid, 'SIGKILL'); } catch { /* gone */ }
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  await exited;
  if (/\/cua-[a-z0-9-]*cap-[A-Za-z0-9]+$/.test(facts.scratch)) rmSync(facts.scratch, {recursive: true, force: true});
  result.cleanup = {recordedAlive: facts.processes.filter(p => alive(p.pid)).length};
  return result;
}

// What a session must have shown before it is disrupted -> the problems (none: ready). A kernel and a worker each
// identified by pid and holding its lifeline open; initialize and the kernel's result attesting cua's host at this
// version; the worker's spin and the kernel's busy cell answered, not failed. A session recorded with each cell's
// outcome (`cells.outcomes`) must also show all three cells, warm included, without error.
export function readiness(facts, version = REPL_HOST_VERSION) {
  const problems = [];
  for (const role of ['kernel', 'worker']) {
    const found = (facts?.processes ?? []).filter(p => p.role === role);
    if (!found.length) problems.push(`no ${role} was recorded`);
    for (const p of found) {
      if (!Number.isInteger(p.pid) || p.pid <= 1) problems.push(`the ${role} has no identity`);
      if (!(p.fifos >= 1)) problems.push(`the ${role} ${p.pid} does not hold its lifeline`);
    }
  }
  if (facts?.serverInfo?.name !== 'cua-repl-host' || facts?.serverInfo?.version !== version) problems.push('initialize did not attest cua\'s host');
  if (facts?.cells?.replHost?.host !== 'cua' || facts?.cells?.replHost?.version !== version) problems.push('the kernel\'s result did not attest cua\'s host');
  if (facts?.cells?.spin !== '"spinning soon"') problems.push('the worker did not answer its spin');
  if (facts?.cells?.kernel !== 'kernel spinning soon') problems.push('the kernel did not answer its busy cell');
  for (const [name, outcome] of Object.entries(facts?.cells?.outcomes ?? {})) if (outcome?.isError !== false) problems.push(`the ${name} cell failed`);
  return problems;
}

// The whole check's verdict -> {ok, problems}: both scenarios, each ready before its disruption, its children ended
// within the bound, nothing reparented to launchd and nothing recorded left.
export function verdict(results, version = REPL_HOST_VERSION) {
  const problems = [];
  const names = (results ?? []).map(r => r.scenario);
  for (const expected of ['supervisor', 'everything-above']) if (!names.includes(expected)) problems.push(`no ${expected} scenario`);
  for (const r of results ?? []) {
    const at = message => problems.push(`${r.scenario}: ${message}`);
    for (const problem of readiness(r.facts, version)) at(problem);
    if (r.notDisrupted?.length) at('not disrupted');
    const killedRoles = (r.killed ?? []).map(k => k.role);
    for (const role of r.scenario === 'supervisor' ? ['supervisor'] : ['proxy', 'anchor', 'supervisor']) if (!killedRoles.includes(role)) at(`the ${role} was not killed`);
    if (typeof r.childrenEndedMs !== 'number') at('the children did not end within the bound');
    if (r.reparentedToLaunchd?.length !== 0) at('a process was left reparented to launchd');
    if (r.cleanup?.recordedAlive !== 0) at('a recorded process was left');
  }
  return {ok: problems.length === 0, problems};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === 'session') await session();
  else if (process.argv[2] === 'verdict') {
    // Re-judges a recorded result: node device.mjs verdict <result.json>
    const {readFileSync} = await import('node:fs');
    const judged = verdict(JSON.parse(readFileSync(process.argv[3], 'utf8')).results);
    console.log(JSON.stringify(judged, null, 1));
    process.exitCode = judged.ok ? 0 : 1;
  } else {
    const results = [];
    for (const name of ['supervisor', 'everything-above']) results.push(await scenario(name));
    const judged = verdict(results);
    console.log(JSON.stringify({ok: judged.ok, problems: judged.problems, platform: process.platform, boundMs: BOUND_MS, results}, null, 1));
    process.exitCode = judged.ok ? 0 : 1;
  }
}
