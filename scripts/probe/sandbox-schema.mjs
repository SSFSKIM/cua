// Spike #33 driver (spike/sandbox-schema only; not for main): usage `node scripts/probe/sandbox-schema.mjs <label> <none|disabled|JSON sandbox state>`.
// Payloads measured: see https://github.com/SSFSKIM/cua/issues/33. Run from a throwaway worktree: cells try to write into its src/.
// one `cua serve` connection per candidate payload (CUA_SHIM_SANDBOX_JSON / CUA_SHIM_SANDBOX),
// one js cell that tries each write target and a loopback TCP connect, elicitations declined.
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createInterface} from 'node:readline';
import {mkdirSync, rmSync, existsSync, readdirSync} from 'node:fs';

const [label, payloadJson] = process.argv.slice(2);
const WORKTREE = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const WR = '/tmp/cua33-wr';            // the declared writable root
const SECRETS = `${WORKTREE}/src/secrets`;
mkdirSync(WR, {recursive: true});

let accepted = 0;
const listener = createServer(s => { accepted++; s.end(); });
await new Promise(r => listener.listen(0, '127.0.0.1', r));
const port = listener.address().port;

const env = {...process.env, CUA_SHIM_SECRETS: 'off'};
delete env.CUA_SHIM_SANDBOX; delete env.CUA_SHIM_SANDBOX_JSON;
if (payloadJson === 'none') env.CUA_SHIM_SANDBOX = 'default';
else if (payloadJson === 'disabled') env.CUA_SHIM_SANDBOX = 'disabled';
else env.CUA_SHIM_SANDBOX_JSON = payloadJson;

const server = spawn(process.execPath, [`${WORKTREE}/bin/cua.mjs`, 'serve'], {cwd: WORKTREE, stdio: ['pipe', 'pipe', 'pipe'], env});
let stderr = '';
server.stderr.on('data', d => { stderr += d; });
const pending = new Map(); let nextId = 0; let declined = 0;
const send = m => server.stdin.write(JSON.stringify(m) + '\n');
createInterface({input: server.stdout}).on('line', line => {
  const msg = JSON.parse(line);
  if (msg.method === 'elicitation/create' && msg.id !== undefined) { declined++; return send({jsonrpc: '2.0', id: msg.id, result: {action: 'decline'}}); }
  if (msg.method !== undefined && msg.id !== undefined) return send({jsonrpc: '2.0', id: msg.id, error: {code: -32601, message: 'no'}});
  const w = pending.get(msg.id); if (!w) return; pending.delete(msg.id);
  msg.error ? w.reject(new Error(`${msg.error.code}: ${msg.error.message}`)) : w.resolve(msg.result);
});
const request = (method, params = {}, ms = 60_000) => new Promise((resolve, reject) => {
  const id = ++nextId;
  const t = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)); }, ms);
  pending.set(id, {resolve: v => { clearTimeout(t); resolve(v); }, reject: e => { clearTimeout(t); reject(e); }});
  send({jsonrpc: '2.0', id, method, params});
});

const cell = `
const fs = await import('node:fs'); const os = await import('node:os'); const net = await import('node:net');
const tag = 'cua33-' + Math.random().toString(36).slice(2);
const cwd = nodeRepl.cwd ?? (await import('node:url')).fileURLToPath(new URL('.', import.meta.url ?? 'file:///'));
const out = {nodeReplKeys: Object.keys(nodeRepl), cwd, tmpdir: os.tmpdir(), nodeReplTmp: globalThis.nodeRepl?.tmpDir ?? null};
const tryWrite = p => { try { fs.writeFileSync(p, 'x'); fs.unlinkSync(p); return 'ok'; } catch (e) { return e.code + ' ' + e.message.split(',')[0]; } };
out.a_tmpdir = tryWrite(os.tmpdir() + '/' + tag);
out.a2_privateTmp = tryWrite('/private/tmp/' + tag);
out.b_writableRoot = tryWrite(${JSON.stringify(WR)} + '/' + tag);
out.c_secrets = tryWrite(${JSON.stringify(SECRETS)} + '/' + tag + '.mjs');
out.c2_services = tryWrite(${JSON.stringify(WORKTREE + '/src/services')} + '/' + tag + '.mjs');
out.e_cwd = tryWrite(cwd + '/' + tag);
out.f_nodeReplTmp = out.nodeReplTmp ? tryWrite(out.nodeReplTmp + '/' + tag) : 'n/a';
out.g_home = tryWrite(os.homedir() + '/' + tag);
out.r_readSecrets = (() => { try { return fs.readdirSync(${JSON.stringify(SECRETS)}).length + ' entries'; } catch (e) { return e.code; } })();
out.d_tcp = await new Promise(res => { const s = net.connect(${port}, '127.0.0.1'); const t = setTimeout(() => { s.destroy(); res('timeout'); }, 3000);
  s.on('connect', () => { clearTimeout(t); s.destroy(); res('connected'); }); s.on('error', e => { clearTimeout(t); res(e.code + ' ' + e.message); }); });
out.d_ext = await new Promise(res => { const s = net.connect(443, '1.1.1.1'); const t = setTimeout(() => { s.destroy(); res('timeout'); }, 4000);
  s.on('connect', () => { clearTimeout(t); s.destroy(); res('connected'); }); s.on('error', e => { clearTimeout(t); res(e.code); }); });
out.dns = await (await import('node:dns')).promises.lookup('example.com').then(r => 'ok ' + r.family, e => e.code);
nodeRepl.write(JSON.stringify(out));`;

const report = {label, payload: payloadJson};
try {
  await request('initialize', {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'cua-spike33', version: '0'}}, 120_000);
  send({jsonrpc: '2.0', method: 'notifications/initialized'});
  await request('tools/call', {name: 'js', arguments: {code: '1', title: 'spike 33'}}, 120_000);
  const r = await request('tools/call', {name: 'js', arguments: {code: cell, title: 'spike 33', timeout_ms: 30000}}, 120_000);
  report.isError = !!r.isError;
  report.text = r.content?.filter(c => c.type === 'text').map(c => c.text).join('\n');
  await request('tools/call', {name: 'end_task', arguments: {}}).catch(e => { report.endTask = e.message; });
} catch (e) { report.error = e.message; }
server.stdin.end();
await new Promise(r => server.on('exit', r));
listener.close();
report.tcpAccepted = accepted; report.declined = declined;
report.stderrTail = stderr.split('\n').filter(Boolean).slice(-5);
// leftovers check
report.leftovers = {wr: readdirSync(WR), secrets: readdirSync(SECRETS).filter(f => f.startsWith('cua33-')), services: readdirSync(`${WORKTREE}/src/services`).filter(f => f.startsWith('cua33-'))};
console.log(JSON.stringify(report, null, 1));
