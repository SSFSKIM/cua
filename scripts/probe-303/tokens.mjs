// #303's hosted A/B: do Chromium's re-created table columns and header group keep their tokens across observations,
// origin/main's engine against fix/303-recreated-tokens's? Each (page, engine) on a fresh Chrome for Testing, one engine
// alive at a time, several observations on one connection; scripts/probe-303/tool.swift (#299's) keeps each table's
// column and child handles after the first observation and checks after each whether they still read (-25202: Chromium
// re-created them). The replacement page then replaces a DOM button with an identical clone and inserts a first column:
// a real replacement, which must take new tokens on both engines. No click is posted.
//   node scripts/probe-303/tokens.mjs --main <bin> --branch <bin> --tool <bin> --out <dir> [--pages a,b]
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-303: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), MAIN = arg('main'), BRANCH = arg('branch'), TOOL = arg('tool');
const ONLY = arg('pages') ? arg('pages').split(',') : null;
mkdirSync(OUT, {recursive: true});
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-303:', ...a);

let command = null;
const table = (rows, cols, extra = '') => {
  const body = [];
  for (let i = 1; i <= rows; i++) body.push(`<tr>${Array.from({length: cols}, (_, c) => c === 1 ? `<td><a href="#r${i}">Row ${i}</a></td>` : `<td>Cell ${i}.${c}</td>`).join('')}</tr>`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe303 columns</title><style>body{font:14px sans-serif}td{padding:2px 8px}</style></head>
<body><h1>probe303 columns</h1>${extra}<table id="t"><thead><tr>${Array.from({length: cols}, (_, c) => `<th>Col ${c}</th>`).join('')}</tr></thead><tbody>${body.join('')}</tbody></table>
<script>(() => {
  // The probe's commands, polled: replace the Save button with an identical clone (a new DOM node), or insert a first
  // column (a header cell and a cell in every row).
  let last = null;
  setInterval(async () => {
    const r = await fetch('/cmd', {cache: 'no-store'}); const c = await r.text();
    if (!c || c === last) return; last = c;
    if (c.startsWith('replace')) { const b = document.getElementById('save'); if (b) b.replaceWith(b.cloneNode(true)); }
    if (c.startsWith('insert')) {
      const t = document.getElementById('t');
      const th = document.createElement('th'); th.textContent = 'New'; t.tHead.rows[0].insertBefore(th, t.tHead.rows[0].firstChild);
      for (const row of t.tBodies[0].rows) { const td = document.createElement('td'); td.textContent = 'n'; row.insertBefore(td, row.firstChild); }
    }
    navigator.sendBeacon('/done', c);
  }, 100);
})();</script></body></html>`;
};
const PAGES = {'/small': table(20, 5), '/big': table(3000, 6), '/huge': table(6000, 6), '/replace': table(20, 5, '<p><button id="save" type="button">Save</button></p>')};
const TARGETS = [
  {name: 'small', path: '/small', observations: 3},
  {name: 'big', path: '/big', observations: 3},
  {name: 'huge', path: '/huge', observations: 3},
  {name: 'replace', path: '/replace', observations: 4, commands: {3: 'replace', 4: 'insert'}},
  {name: 'hn-thread', url: 'https://news.ycombinator.com/item?id=13541679', observations: 3},
].filter(t => !ONLY || ONLY.includes(t.name));
let done = [];
const server = createServer((req, res) => {
  if (req.url === '/cmd') { res.writeHead(200, {'content-type': 'text/plain', 'cache-control': 'no-store'}); res.end(command ?? ''); return; }
  if (req.url === '/done') { let b = ''; req.on('data', d => { b += d; }); req.on('end', () => { done.push(b); res.writeHead(204); res.end(); }); return; }
  res.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); res.end(PAGES[req.url] ?? PAGES['/small']);
});
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
  const dir = join(OUT, 's'); mkdirSync(dir, {recursive: true, mode: 0o700});
  const socket = join(dir, `${name}.sock`);
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
const tool = spawn(TOOL, [], {stdio: ['pipe', 'pipe', 'inherit']});
const waiting = [];
createInterface({input: tool.stdout}).on('line', l => waiting.shift()?.(JSON.parse(l)));
const ask = o => new Promise(resolve => { waiting.push(resolve); tool.stdin.write(JSON.stringify(o) + '\n'); });

// The tables' direct children of interest, by the flat node list's depths: every AXTable's AXColumn and AXGroup children.
function tables(nodes) {
  const out = [];
  nodes.forEach((n, i) => {
    if (n.role !== 'AXTable') return;
    const t = {token: n.token, columns: [], groups: [], rows: 0};
    for (let j = i + 1; j < nodes.length && nodes[j].depth > n.depth; j++) {
      const c = nodes[j];
      if (c.depth !== n.depth + 1) continue;
      if (c.role === 'AXColumn') t.columns.push(c.token);
      else if (c.role === 'AXGroup') t.groups.push(c.token);
      else if (c.role === 'AXRow') t.rows += 1;
    }
    out.push(t);
  });
  return out;
}

const results = [];
const config = {macOS: spawnSync('sw_vers', {encoding: 'utf8'}).stdout.replace(/\s+/g, ' '), mainCommit: process.env.P303_MAIN_COMMIT,
  branchCommit: process.env.P303_BRANCH_COMMIT, probeCommit: process.env.GITHUB_SHA, rep: process.env.P303_REP};
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));
const rep = Number(process.env.P303_REP || 1);
const order = rep % 2 ? [['main', MAIN], ['branch', BRANCH]] : [['branch', BRANCH], ['main', MAIN]];
for (const target of TARGETS) {
  for (const [name, bin] of order) {
    const row = {page: target.name, engine: name, observations: []};
    command = null; done = [];
    const chrome = spawn(CFT, [`--user-data-dir=${join(OUT, `chrome-${target.name}-${name}`)}`, '--no-first-run', '--no-default-browser-check',
      '--disable-search-engine-choice-screen', '--window-position=0,40', '--window-size=1024,728', target.url ?? `${BASE}${target.path}`], {stdio: 'ignore'});
    let engine;
    try {
      await sleep(28_000);  // loaded, and past Chrome for Testing's toolbar re-layout
      engine = await startEngine(bin, name);
      let window = null;
      for (let k = 1; k <= target.observations; k++) {
        const cmd = target.commands?.[k];
        if (cmd) { command = `${cmd}-${k}`; for (let i = 0; i < 50 && !done.includes(command); i++) await sleep(100); await sleep(500); }
        const t0 = Date.now();
        const r = await engine.wire.call('execute', {method: 'get_app_state', args: {pid: chrome.pid}, deadlineUnixMilliseconds: Date.now() + 60_000});
        const ms = Date.now() - t0;
        if (r.error) { row.observations.push({error: JSON.stringify(r.error).slice(0, 300), ms}); continue; }
        const sky = r.result;
        const wf = sky.window.frame;
        if (!window) { window = [wf.x, wf.y, wf.width, wf.height]; row.snap = await ask({op: 'handles', pid: chrome.pid, window, mode: 'snap'}); }
        const button = sky.nodes.find(n => n.role === 'AXButton' && /Save/.test(`${n.title ?? ''} ${n.description ?? ''}`));
        row.observations.push({ms, command: cmd ?? null, nodes: sky.nodes.length, truncated: sky.truncated ?? null, failures: sky.timings?.fetchFailures ?? 0,
          walkMs: sky.timings?.walkMs ?? null, budgetHit: sky.timings?.budgetHit ?? false, nodeCapHit: sky.timings?.nodeCapHit ?? false, tables: tables(sky.nodes), button: button?.token ?? null,
          check: await ask({op: 'handles', pid: chrome.pid, window, mode: 'check'})});
        await sleep(1000);
      }
    } catch (e) { row.exception = String(e?.stack || e).slice(0, 2000); }
    if (engine) { try { await engine.wire.call('shutdown', {}, 5000); } catch {} engine.wire.close(); engine.child.kill('SIGKILL'); }
    chrome.kill('SIGTERM'); await sleep(2000); if (chrome.exitCode === null) chrome.kill('SIGKILL');
    results.push(row); save();
    log(`${target.name} ${name}:${row.exception ? ' EXCEPTION ' + row.exception.slice(0, 300) : ''}\n    ${row.observations.map((o, k) => `obs${k + 1}${o.command ? '[' + o.command + ']' : ''} ms=${o.ms} walk=${o.walkMs} nodes=${o.nodes} failures=${o.failures} budget=${o.budgetHit} button=${o.button} tables=${JSON.stringify((o.tables ?? []).filter(t => t.columns.length || t.groups.length).map(t => [t.token, t.columns.join(','), t.groups.join(',')]))} handles=${JSON.stringify(o.check?.tables?.map(t => t.children))}${o.error ? ' ERROR ' + o.error : ''}`).join('\n    ')}`);
  }
}
tool.stdin.end();
server.close();
process.exit(0);
