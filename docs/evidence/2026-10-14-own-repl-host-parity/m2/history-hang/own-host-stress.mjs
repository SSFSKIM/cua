// Throwaway stress probe for M2 task 3 (run on the mini from anywhere): the real own supervisor of the prepared parity
// clone, the real codex sandbox, a trivial trusted service. Per iteration: initialize, a first rpc (fresh kernel and
// worker), turn_ended, EOF. A step past its bound gets the stuck children sampled. Owned processes only.
import {spawn, execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, writeFileSync, rmSync, appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline';
const REPO = '/Users/new/Developer/GitHub/cua-parity';
const CODEX = `${process.env.HOME}/Library/Application Support/cua/runtimes/26.928.40906-darwin-arm64/CodexCLI.app/Contents/MacOS/codex`;
const N = Number(process.argv[2] ?? 50), OUT = process.argv[3] ?? '/tmp/cua-own-stress';
mkdirSync(OUT, {recursive: true});
const log = line => { appendFileSync(join(OUT, 'log.txt'), line + '\n'); console.log(line); };
const descendants = pid => { const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], {encoding: 'utf8'}).trim().split('\n').map(l => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map(m => ({pid: +m[1], ppid: +m[2], cmd: m[3]}));
  const own = new Set([pid]); for (let c = true; c;) { c = false; for (const r of rows) if (own.has(r.ppid) && !own.has(r.pid)) { own.add(r.pid); c = true; } } return rows.filter(r => r.pid !== pid && own.has(r.pid)); };
const sampleStuck = (pid, tag) => { for (const d of descendants(pid).filter(d => /repl-host\/(kernel|trusted-worker)\.mjs/.test(d.cmd) && /node /.test(d.cmd.split(' --')[0] + ' '))) {
  try { writeFileSync(join(OUT, `${tag}-${d.pid}.txt`), d.cmd.slice(0, 160) + '\n' + execFileSync('sample', [String(d.pid), '2', '-mayDie'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']})); } catch (e) { writeFileSync(join(OUT, `${tag}-${d.pid}.txt`), String(e.stdout ?? e)); } } };
let hangs = 0;
for (let i = 1; i <= N; i++) {
  const root = mkdtempSync('/tmp/cua-own-stress-run-');
  for (const d of ['run', 'tmp', 'codex', 'trusted']) mkdirSync(join(root, d));
  writeFileSync(join(root, 'trusted', 'svc.mjs'), 'export const handleRpc = () => new Date(Date.UTC(2100,0,1)).toISOString();\n');
  const child = spawn(process.execPath, ['--disable-sigusr1', join(REPO, 'src/repl-host/supervisor.mjs')], {cwd: join(root, 'run'), stdio: ['pipe', 'pipe', 'pipe'],
    env: {PATH: '/usr/bin:/bin', HOME: process.env.HOME, TMPDIR: join(root, 'tmp'), CODEX_HOME: join(root, 'codex'), CODEX_CLI_PATH: CODEX, CUA_REPL_NODE_PATH: process.execPath,
      CUA_REPL_TRUSTED_SERVICES: JSON.stringify({svc: join(root, 'trusted', 'svc.mjs')}), CUA_REPL_TRUSTED_CODE_PATHS: join(root, 'trusted'), CUA_REPL_TRUSTED_RPC_ENABLED: '1'}});
  child.stderr.resume();
  const exited = new Promise(r => child.once('exit', (c, s) => r({c, s})));
  const pending = new Map(); let id = 0;
  createInterface({input: child.stdout}).on('line', l => { const m = JSON.parse(l); pending.get(m.id)?.(m); });
  const req = (method, params, ms) => new Promise(r => { const n = ++id; const t = setTimeout(() => r({timedOut: true}), ms); pending.set(n, m => { clearTimeout(t); r(m); }); child.stdin.write(JSON.stringify({jsonrpc: '2.0', id: n, method, params}) + '\n'); });
  const cwd = join(root, 'run'), sp = k => ({path: {type: 'special', value: {kind: k}}});
  const meta = {'codex/sandbox-state-meta': {permissionProfile: {type: 'managed', file_system: {type: 'restricted', entries: [{...sp('root'), access: 'read'}, {...sp('project_roots'), access: 'write'}, {...sp('tmpdir'), access: 'write'}]}, network: 'restricted'}, sandboxCwd: pathToFileURL(cwd).href}};
  const t0 = performance.now();
  await req('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'stress', version: '0'}}, 10000);
  const js = req('tools/call', {name: 'js', arguments: {code: 'nodeRepl.write(await nodeRepl.rpc("svc", {}))', timeout_ms: 20000}, _meta: meta}, 25000);
  const watch = setTimeout(() => sampleStuck(child.pid, `iter${i}-js`), 9000);
  const r1 = await js; clearTimeout(watch);
  const jsMs = performance.now() - t0, text = r1.result?.content?.[0]?.text ?? JSON.stringify(r1).slice(0, 120);
  const t1 = performance.now();
  const watch2 = setTimeout(() => sampleStuck(child.pid, `iter${i}-turn`), 8000);
  const r2 = await req('tools/call', {name: 'turn_ended', arguments: {hook_event_name: 'Stop', session_id: 's', turn_id: 't'}, _meta: meta}, 15000); clearTimeout(watch2);
  const turnMs = performance.now() - t1;
  child.stdin.end();
  const status = await Promise.race([exited, new Promise(r => setTimeout(() => r(null), 10000))]);
  const failed = !String(text).startsWith("2100"); const bad = failed || turnMs > 8000 || !status;
  if (bad) hangs++;
  log(`iter ${i} js=${Math.round(jsMs)}ms ${text.slice(0, 60)} turn=${Math.round(turnMs)}ms${r2.timedOut ? ' TIMEDOUT' : ''} exit=${status ? JSON.stringify(status) : 'NONE'}${bad ? " <<< HANG" : jsMs > 10000 ? " (slow start, recovered)" : ""}`);
  if (!status) { for (const d of descendants(child.pid)) try { process.kill(d.pid, 'SIGKILL'); } catch {} child.kill('SIGKILL'); await exited; }
  rmSync(root, {recursive: true, force: true});
}
log(`DONE ${N} iterations, ${hangs} hung`);
