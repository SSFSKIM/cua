// #301's AXColumn question: does a Chromium table column keep its token across observations on one connection, on main
// and on the branch, and does its handle stay CFEqual between reads? Chrome for Testing shows a small local table (20
// rows, 5 columns: nothing cuts) and then #299's 3,000-row table; each engine observes 3 times on one connection;
// scripts/probe-299/tool.swift keeps the tables' column and child handles from before the first observation and checks
// them after each. No click is posted.
//   node scripts/probe-299/col.mjs --main <bin> --branch <bin> --tool <bin> --out <dir>
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-299 col: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), MAIN = arg('main'), BRANCH = arg('branch'), TOOL = arg('tool');
mkdirSync(OUT, {recursive: true});
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-299 col:', ...a);

const table = (rows, cols) => {
  const body = [];
  for (let i = 1; i <= rows; i++) body.push(`<tr>${Array.from({length: cols}, (_, c) => c === 1 ? `<td><a href="#r${i}">Row ${i}</a></td>` : `<td>Cell ${i}.${c}</td>`).join('')}</tr>`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe299 columns</title><style>body{font:14px sans-serif}td{padding:2px 8px}</style></head>
<body><h1>probe299 columns</h1><table><thead><tr>${Array.from({length: cols}, (_, c) => `<th>Col ${c}</th>`).join('')}</tr></thead><tbody>${body.join('')}</tbody></table></body></html>`;
};
const PAGES = {'/small': table(20, 5), '/big': table(3000, 6)};
const server = createServer((req, res) => { res.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); res.end(PAGES[req.url] ?? PAGES['/small']); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

class Wire {
  static connect(path) { return new Promise((resolve, reject) => { const s = createConnection(path); s.once('connect', () => { s.off('error', reject); resolve(new Wire(s)); }); s.once('error', reject); }); }
  constructor(s) {
    this.s = s; this.chunks = []; this.len = 0; this.pending = new Map(); this.id = 1;
    s.on('data', d => {
      this.chunks.push(d); this.len += d.length;
      for (;;) {
        if (this.len < 4) return;
        if (this.chunks[0].length < 4) this.chunks = [Buffer.concat(this.chunks)];
        const n = this.chunks[0].readUInt32LE(0);
        if (this.len < 4 + n) return;
        let buf = this.chunks.length === 1 ? this.chunks[0] : Buffer.concat(this.chunks);
        const msg = JSON.parse(buf.subarray(4, 4 + n).toString('utf8'));
        buf = buf.subarray(4 + n); this.chunks = buf.length ? [buf] : []; this.len = buf.length;
        this.pending.get(msg.id)?.(msg); this.pending.delete(msg.id);
      }
    });
    s.on('error', () => {});
  }
  call(method, params = {}, timeout = 120_000) {
    const id = this.id++;
    const bytes = Buffer.from(JSON.stringify({jsonrpc: '2.0', id, method, params}), 'utf8');
    const head = Buffer.alloc(4); head.writeUInt32LE(bytes.length, 0);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method}: no answer`)); }, timeout);
      this.pending.set(id, m => { clearTimeout(t); resolve(m); });
      this.s.write(Buffer.concat([head, bytes]));
    });
  }
  close() { this.s.destroy(); }
}
async function startEngine(bin, name) {
  const dir = join(OUT, `sock-${name}`); mkdirSync(dir, {recursive: true, mode: 0o700});
  const socket = join(dir, 'engine.sock');
  const child = spawn(bin, [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'ignore', 'ignore']});
  for (let i = 0; i < 300; i++) {
    try {
      const w = await Wire.connect(socket);
      await w.call('ping', {clientApiVersion: 'cua-engine-1', desktop: 'dedicated'});
      return {name, child, wire: w};
    } catch { await sleep(50); }
  }
  throw new Error(`engine ${name} did not listen`);
}
const child = spawn(TOOL, [], {stdio: ['pipe', 'pipe', 'inherit']});
const waiting = [];
createInterface({input: child.stdout}).on('line', l => waiting.shift()?.(JSON.parse(l)));
const ask = o => new Promise(resolve => { waiting.push(resolve); child.stdin.write(JSON.stringify(o) + '\n'); });

const results = [];
const config = {macOS: spawnSync('sw_vers', {encoding: 'utf8'}).stdout.replace(/\s+/g, ' '), mainCommit: process.env.P299_MAIN_COMMIT, branchCommit: process.env.P299_BRANCH_COMMIT,
  probeCommit: process.env.GITHUB_SHA, rep: process.env.P299_REP};
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));
const engines = [await startEngine(MAIN, 'main'), await startEngine(BRANCH, 'branch')];
for (const page of ['/small', '/big']) {
  const chrome = spawn(CFT, [`--user-data-dir=${join(OUT, `chrome${page.replace('/', '-')}`)}`, '--no-first-run', '--no-default-browser-check',
    '--disable-search-engine-choice-screen', '--window-position=0,40', '--window-size=1024,728', `${BASE}${page}`], {stdio: 'ignore'});
  await sleep(28_000);  // loaded, and past Chrome for Testing's toolbar re-layout
  for (const engine of engines) {
    const row = {page, engine: engine.name, observations: []};
    try {
      let window = null;
      for (let k = 1; k <= 3; k++) {
        const r = await engine.wire.call('execute', {method: 'get_app_state', args: {pid: chrome.pid}, deadlineUnixMilliseconds: Date.now() + 60_000});
        if (r.error) { row.observations.push({error: JSON.stringify(r.error).slice(0, 300)}); continue; }
        const sky = r.result;
        const wf = sky.window.frame;
        if (!window) { window = [wf.x, wf.y, wf.width, wf.height]; row.snap = await ask({op: 'handles', pid: chrome.pid, window, mode: 'snap'}); }
        const columns = sky.nodes.filter(n => n.role === 'AXColumn').map(n => ({token: n.token, depth: n.depth, frame: n.frame && [n.frame.x, n.frame.y, n.frame.width, n.frame.height].map(Math.round), children: n.children}));
        const tables = sky.nodes.filter(n => n.role === 'AXTable').map(n => n.token);
        row.observations.push({nodes: sky.nodes.length, truncated: sky.truncated, failures: sky.timings?.fetchFailures ?? 0, tables, columns,
          check: await ask({op: 'handles', pid: chrome.pid, window, mode: 'check'})});
        await sleep(1000);
      }
    } catch (e) { row.exception = String(e?.stack || e).slice(0, 2000); }
    results.push(row); save();
    log(`${page} ${engine.name}: ${row.observations.map((o, k) => `obs${k + 1} nodes=${o.nodes} failures=${o.failures} trunc=${JSON.stringify(o.truncated)} tables=${o.tables} columns=${(o.columns ?? []).map(c => c.token).join(',')} check=${JSON.stringify(o.check?.tables?.map(t => ({eq: `${t.columnHandlesEqual}/${t.columnsKept}`, now: t.columnsNow, children: t.children})))}`).join('\n    ')}`);
  }
  chrome.kill('SIGTERM'); await sleep(2000);
}
for (const e of engines) { e.wire.close(); e.child.kill('SIGKILL'); }
child.stdin.end();
server.close();
process.exit(0);
