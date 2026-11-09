// #310's hosted A/B: with AXColumn elements waiting in rule C's last queue, what does a Chrome table's observation cost,
// and does a table that fits the budget still print the same tree? origin/main's engine (A) against
// fix/310-columns-last's (B) on #304's local tables (3,000 rows, the same with a fixed toolbar, 6,000 with it) and on
// tables that fit (120 and 200 rows of #304's row, 600 lean rows), at the top and half way down. Per (page, position)
// one Chrome for Testing, a throwaway observation by A (Chromium's accessibility enabled), then three pairs, the order
// alternating, each observation on its own engine process and connection, one engine alive at a time. No click.
//   node scripts/probe-310/walk.mjs --a <bin> --b <bin> --out <dir> [--pages a,b]
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-310: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), A = arg('a'), B = arg('b');
const ONLY = arg('pages') ? arg('pages').split(',') : null;
mkdirSync(OUT, {recursive: true});
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-310:', ...a);

// #304's fixture rows (scripts/probe-304/ab.mjs), and a lean row of two text cells.
const tableRows = count => {
  const rows = [];
  for (let i = 1; i <= count; i++) rows.push(`<tr><td>${i}</td><td><a href="#r${i}">Row ${i}</a></td><td>Name ${i}</td><td>${(i * 7919) % 10007}</td><td>Item ${i % 97}</td><td><button>Act ${i}</button></td></tr>`);
  return rows.join('');
};
const leanRows = count => Array.from({length: count}, (_, i) => `<tr><td>${i + 1}</td><td>Lean ${i + 1}</td></tr>`).join('');
const SCROLL = `<script>addEventListener('load', () => { const f = Number(new URLSearchParams(location.search).get('frac') || 0); scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight)); });</script>`;
const TABLE = (bar, rows, head = '<th>#</th><th>Link</th><th>Name</th><th>Value</th><th>Group</th><th>Action</th>') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe310 table</title><style>body{font:14px sans-serif}td{padding:2px 8px;border-bottom:1px solid #ddd}
#bar{position:fixed;left:0;right:0;bottom:0;background:#eee;padding:6px;border-top:1px solid #999}#bar button{margin-right:8px}</style></head>
<body><h1>probe310 table</h1><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
${bar ? `<div id="bar" role="toolbar">${Array.from({length: 10}, (_, i) => `<button>Tool ${i + 1}</button>`).join('')}</div>` : ''}${SCROLL}</body></html>`;
const PAGES = {
  '/table': TABLE(false, tableRows(3000)), '/bar': TABLE(true, tableRows(3000)), '/bar6k': TABLE(true, tableRows(6000)),
  '/fit120': TABLE(false, tableRows(120)), '/fit200': TABLE(false, tableRows(200)), '/lean600': TABLE(false, leanRows(600), '<th>#</th><th>Text</th>'),
};
const TARGETS = [
  {name: 'local-table', path: '/table'}, {name: 'local-table-bar', path: '/bar'}, {name: 'local-table-6k', path: '/bar6k'},
  {name: 'fit-120', path: '/fit120'}, {name: 'fit-200', path: '/fit200'}, {name: 'lean-600', path: '/lean600'},
].filter(t => !ONLY || ONLY.includes(t.name));
const POSITIONS = [{name: 'top', frac: 0}, {name: 'f50', frac: 0.5}];
const server = createServer((req, res) => { res.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); res.end(PAGES[req.url.split('?')[0]] ?? PAGES['/table']); });
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
// One observation on its own engine process: start, ping, observe, shut down.
async function observe(bin, name, pid) {
  const dir = join(OUT, 's'); mkdirSync(dir, {recursive: true, mode: 0o700});
  const socket = join(dir, `${name}.sock`);
  const child = spawn(bin, [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'ignore', 'ignore']});
  let wire;
  try {
    for (let i = 0; i < 300 && !wire; i++) {
      try { wire = await Wire.connect(socket); await wire.call('ping', {clientApiVersion: 'cua-engine-1', desktop: 'dedicated'}); } catch { wire = null; await sleep(50); }
    }
    if (!wire) throw new Error(`engine ${name} did not listen`);
    const t0 = Date.now();
    const r = await wire.call('execute', {method: 'get_app_state', args: {pid}, deadlineUnixMilliseconds: Date.now() + 60_000});
    const ms = Date.now() - t0;
    if (r.error) return {engine: name, error: JSON.stringify(r.error).slice(0, 300), ms};
    const sky = r.result, t = sky.timings ?? {};
    const sig = sky.nodes.map(n => [n.role, n.title ?? '', n.description ?? '', typeof n.value === 'string' ? n.value.slice(0, 40) : n.value ?? '', n.frame ? [n.frame.x, n.frame.y, n.frame.width, n.frame.height].map(Math.round).join(',') : ''].join('|'));
    return {engine: name, ms, walkMs: t.walkMs ?? null, widthMs: t.widthMs ?? t.width ?? null, wideListMs: t.wideListMs ?? null, wideListFrames: t.wideListFrames ?? null,
      frameReads: t.frameReads ?? null, columnsLast: t.wideListColumnsLast ?? 0, nodes: sky.nodes.length, budgetHit: !!t.budgetHit, nodeCapHit: !!t.nodeCapHit,
      deadlineHit: !!t.deadlineHit, failures: t.fetchFailures ?? 0, truncated: sky.truncated ?? null, columns: sky.nodes.filter(n => n.role === 'AXColumn').length, sig};
  } finally {
    if (wire) { try { await wire.call('shutdown', {}, 5000); } catch {} wire.close(); }
    child.kill('SIGKILL');
    await sleep(300);
  }
}

const results = [];
const config = {macOS: spawnSync('sw_vers', {encoding: 'utf8'}).stdout.replace(/\s+/g, ' '), aCommit: process.env.P310_A_COMMIT,
  bCommit: process.env.P310_B_COMMIT, probeCommit: process.env.GITHUB_SHA, rep: process.env.P310_REP};
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));
for (const target of TARGETS) {
  for (const position of POSITIONS) {
    const row = {page: target.name, position: position.name, observations: []};
    const chrome = spawn(CFT, [`--user-data-dir=${join(OUT, `chrome-${target.name}-${position.name}`)}`, '--no-first-run', '--no-default-browser-check',
      '--disable-search-engine-choice-screen', '--window-position=0,40', '--window-size=1024,728', `${BASE}${target.path}?frac=${position.frac}`], {stdio: 'ignore'});
    try {
      await sleep(28_000);  // loaded, and past Chrome for Testing's toolbar re-layout
      row.warmup = await observe(A, 'warm', chrome.pid);
      delete row.warmup.sig;
      for (let k = 0; k < 3; k++) {
        const pair = k % 2 ? [['B', B], ['A', A]] : [['A', A], ['B', B]];
        for (const [name, bin] of pair) row.observations.push({pair: k, ...(await observe(bin, name, chrome.pid))});
      }
    } catch (e) { row.exception = String(e?.stack || e).slice(0, 2000); }
    chrome.kill('SIGTERM'); await sleep(2000); if (chrome.exitCode === null) chrome.kill('SIGKILL');
    // The printed trees compared pairwise (the page is still), then the signatures dropped from the saved rows but one.
    const pairs = [0, 1, 2].map(k => ({a: row.observations.find(o => o.pair === k && o.engine === 'A'), b: row.observations.find(o => o.pair === k && o.engine === 'B')}));
    row.compare = pairs.map(({a, b}) => {
      if (!a?.sig || !b?.sig) return null;
      const as = new Set(a.sig), bs = new Set(b.sig);
      return {equalInOrder: a.sig.length === b.sig.length && a.sig.every((s, i) => s === b.sig[i]), onlyA: a.sig.filter(s => !bs.has(s)).slice(0, 20), onlyB: b.sig.filter(s => !as.has(s)).slice(0, 20),
        onlyACount: a.sig.filter(s => !bs.has(s)).length, onlyBCount: b.sig.filter(s => !as.has(s)).length, walkDelta: (b.walkMs ?? 0) - (a.walkMs ?? 0)};
    });
    row.observations.forEach((o, i) => { if (i > 1) delete o.sig; });
    results.push(row); save();
    log(`${target.name} ${position.name}:${row.exception ? ' EXCEPTION ' + row.exception.slice(0, 300) : ''}\n    ${row.observations.map(o => `${o.engine}${o.pair} walk=${o.walkMs} width=${o.widthMs} wide=${o.wideListMs}/${o.wideListFrames} colsLast=${o.columnsLast} nodes=${o.nodes} cols=${o.columns} budget=${o.budgetHit} cap=${o.nodeCapHit} failures=${o.failures}${o.error ? ' ERROR ' + o.error : ''}`).join('\n    ')}\n    compare ${JSON.stringify(row.compare.map(c => c && {eq: c.equalInOrder, onlyA: c.onlyACount, onlyB: c.onlyBCount, dWalk: c.walkDelta}))}`);
  }
}
server.close();
process.exit(0);
