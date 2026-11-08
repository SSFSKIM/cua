// #314's hosted A/B: A = main, B = fix/314-ff-wide (above 499 children with no visible subset, the width rule prints the
// children that show), each its own engine process built uninstrumented from its ref, on #304's pages (scripts/probe-304/
// ab.mjs's list and fixtures) in Chrome for Testing, Firefox and Safari. Per page both heads observe once untimed (the
// enablement settled); per position (0 / 25 / 50 / 90 %) the side tool reads the truth (scripts/probe-314/tool.swift
// `wide`: every element of more than 499 children, and which of them show), then the heads observe in the order X Y Y X
// (X alternating by page, position and repetition), then again with the settle forced (`settle: true`, the after-action
// settle whose busy walk the fix changed) in the order Y X X Y. Each observation gives its node count, times, every wide
// element's `shown` against the truth, the printed children of each (their order on screen, the fixture's paragraph and
// row numbers), and its printed tree, compared across heads and within a head (scripts/probe-304/treediff.mjs). On the
// local pages in Firefox and Safari, each head then clicks by token a row in the middle of the wide element's printed
// run and the fixed toolbar's button, on a fresh connection, and the page reports the click it got.
//   node scripts/probe-314/ab.mjs --group <group> --a <bin> --b <bin> --tool <bin> --out <dir>
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {gzipSync} from 'node:zlib';
import {printed, digest, diffPrinted, diffNodes} from '../probe-304/treediff.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-314 ab: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), TOOL = arg('tool'), GROUP = arg('group');
const BINS = {a: arg('a'), b: arg('b')};
const ONLY = arg('targets') ? arg('targets').split(',').filter(Boolean) : null;
if (!OUT || !BINS.a || !BINS.b || !TOOL || !GROUP) { console.error('usage: ab.mjs --group <g> --a <bin> --b <bin> --tool <bin> --out <dir>'); process.exit(2); }
const REP = Number(process.env.P314_REP ?? 1);
const BROWSER = GROUP.startsWith('firefox') ? 'firefox' : GROUP.startsWith('safari') ? 'safari' : 'chrome';
process.env.P287_BROWSER = BROWSER;
const {launchOther, browserVersion, placePid} = await import('../probe-287/browser.mjs');
mkdirSync(OUT, {recursive: true});
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-314 ab:', ...a);
const WIN = {x: 0, y: 40, w: 1024, h: 728};  // the hosted runner's one screen is 1024 x 768
const GH = ['https://', 'git', 'hub.com'].join('');

const PAGES = {
  'py-docs': {url: 'https://docs.python.org/3/library/stdtypes.html'},
  'mdn-float': {url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/float'},
  'rust-vec': {url: 'https://doc.rust-lang.org/std/vec/struct.Vec.html'},
  'go-http': {url: 'https://pkg.go.dev/net/http'},
  'k8s-docs': {url: 'https://kubernetes.io/docs/concepts/overview/'},
  'wiki-article': {url: 'https://en.wikipedia.org/wiki/United_States'},
  'bbc-news': {url: 'https://www.bbc.com/news'},
  'guardian': {url: 'https://www.theguardian.com/international'},
  'w3s-float': {url: 'https://www.w3schools.com/css/css_float.asp'},
  'npm-react': {url: 'https://www.npmjs.com/package/react'},
  'osm': {url: 'https://www.openstreetmap.org/#map=12/51.5/-0.1'},
  'local-float': {local: '/float'},
  'local-overlay': {local: '/overlay'},
  'local-fixed-tail': {local: '/fixedtail', click: true},
  'local-table': {local: '/', click: true},
  'local-table-bar': {local: '/bar', click: true},
  'local-table-6k': {local: '/bar6k', click: true},
  'wiki-table': {url: 'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population'},
  'hn-thread': {url: 'https://news.ycombinator.com/item?id=13541679'},
  'iana-media': {url: 'https://www.iana.org/assignments/media-types/media-types.xhtml'},
  'gh-issues': {url: `${GH}/microsoft/vscode/issues`},
};
const GROUPS = {
  // #304's 21 pages, its three groups.
  'chrome-a': ['py-docs', 'mdn-float', 'rust-vec', 'go-http', 'k8s-docs', 'npm-react'],
  'chrome-b': ['wiki-article', 'bbc-news', 'guardian', 'w3s-float', 'osm', 'local-float', 'local-overlay', 'local-fixed-tail'],
  'chrome-c': ['local-table', 'local-table-bar', 'local-table-6k', 'wiki-table', 'hn-thread', 'iana-media', 'gh-issues'],
  // The kit's pages likely to hold an element of more than 499 children (the truth says which do).
  firefox: ['local-fixed-tail', 'local-table', 'local-table-bar', 'local-table-6k', 'py-docs', 'wiki-article', 'hn-thread', 'iana-media'],
  safari: ['local-fixed-tail', 'local-table', 'py-docs', 'wiki-article', 'hn-thread', 'iana-media', 'mdn-float'],
};
const TARGETS = GROUPS[GROUP]?.map(name => ({name, ...PAGES[name]}));
if (!TARGETS) { console.error(`unknown group ${GROUP}`); process.exit(2); }
const POSITIONS = [{name: 'top', frac: 0}, {name: 'f25', frac: 0.25}, {name: 'f50', frac: 0.5}, {name: 'f90', frac: 0.9}];

// ---- the fixtures (scripts/probe-304/ab.mjs's), each local page reporting the clicks it gets -------------------------
const CLICKS = `<script>document.addEventListener('click', e => { const t = e.target.closest('a,button'); navigator.sendBeacon('/clicked', JSON.stringify({text: t ? t.textContent : e.target.tagName, trusted: e.isTrusted})); e.preventDefault(); }, true);</script>`;
const tableRows = count => {
  const rows = [];
  for (let i = 1; i <= count; i++) rows.push(`<tr><td>${i}</td><td><a href="#r${i}">Row ${i}</a></td><td>Name ${i}</td><td>${(i * 7919) % 10007}</td><td>Item ${i % 97}</td><td><button>Act ${i}</button></td></tr>`);
  return rows.join('');
};
const TABLE_ROWS = tableRows(3000), TABLE_ROWS_6K = tableRows(6000);
const TABLE = (bar, rows = TABLE_ROWS) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe304 table</title><style>body{font:14px sans-serif}td{padding:2px 8px;border-bottom:1px solid #ddd}
#bar{position:fixed;left:0;right:0;bottom:0;background:#eee;padding:6px;border-top:1px solid #999}#bar button{margin-right:8px}</style></head>
<body><h1>probe304 table</h1><table><thead><tr><th>#</th><th>Link</th><th>Name</th><th>Value</th><th>Group</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>
${bar ? `<div id="bar" role="toolbar">${Array.from({length: 10}, (_, i) => `<button>Tool ${i + 1}</button>`).join('')}</div>` : ''}${CLICKS}</body></html>`;
const FLOAT = (() => {
  const sections = [];
  for (let s = 1; s <= 50; s++) {
    const paras = [];
    for (let p = 1; p <= 60; p++) paras.push(`<p>Section ${s}, paragraph ${p}: the quick brown fox jumps over the lazy dog ${(s * p * 7919) % 10007}.</p>`);
    const buttons = Array.from({length: 8}, (_, b) => `<button style="float:left;margin:4px;padding:6px 10px">S${s} B${b + 1}</button>`).join('');
    sections.push(`<section><h2>Section ${s}</h2><div class="wrap" role="group" aria-label="Actions ${s}">${buttons}</div><div style="clear:both"></div>${paras.join('')}</section>`);
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe304 float</title><style>body{font:14px sans-serif}p{margin:4px 0}</style></head>
<body><h1>probe304 float</h1>${sections.join('')}</body></html>`;
})();
const OVERLAY = (() => {
  const sections = [];
  for (let s = 1; s <= 40; s++) {
    const paras = [];
    for (let p = 1; p <= 50; p++) paras.push(`<p>Section ${s}, paragraph ${p}: <a href="#s${s}p${p}">link ${p}</a> and some text ${(s * p * 7919) % 10007}.</p>`);
    const fixed = s === 1 ? `<div class="holder" role="group" aria-label="Holder"><div role="dialog" aria-label="Banner" style="position:fixed;left:0;right:0;bottom:0;background:#ffd;padding:10px;border-top:1px solid #999">${Array.from({length: 6}, (_, b) => `<button style="margin-right:10px;padding:8px 14px">Banner ${b + 1}</button>`).join('')}</div><button style="position:fixed;top:8px;right:16px;padding:8px 14px">Fixed corner</button></div>` : '';
    const abs = s === 20 ? `<div style="position:relative;height:0" role="group" aria-label="Zero"><div role="toolbar" aria-label="Floating" style="position:absolute;top:40px;left:200px;background:#eef;padding:8px">${Array.from({length: 5}, (_, b) => `<button style="margin-right:8px">Float ${b + 1}</button>`).join('')}</div></div>` : '';
    sections.push(`<section><h2>Section ${s}</h2>${fixed}${abs}${paras.join('')}</section>`);
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe304 overlay</title><style>body{font:14px sans-serif}p{margin:4px 0}</style></head>
<body><h1>probe304 overlay</h1>${sections.join('')}</body></html>`;
})();
// `/fixedtail`: a body of 2,500 paragraphs, each with a link, whose last child is a toolbar fixed to the viewport's bottom
// (2,501 children: #314's page).
const FIXED_TAIL = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe304 fixed tail</title><style>body{font:14px sans-serif}p{margin:4px 0}
#tail{position:fixed;left:0;right:0;bottom:0;background:#eee;padding:6px;border-top:1px solid #999}#tail button{margin-right:8px}</style></head>
<body>${Array.from({length: 2500}, (_, i) => `<p>Paragraph ${i + 1} with <a href="#p${i + 1}">link ${i + 1}</a> in it.</p>`).join('')}<div id="tail" role="toolbar" aria-label="Tail">${Array.from({length: 8}, (_, i) => `<button>Tail ${i + 1}</button>`).join('')}</div>${CLICKS}</body></html>`;
const clicks = [];
const server = createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => { if (req.url === '/clicked') { try { clicks.push({at: Date.now(), ...JSON.parse(body)}); } catch { clicks.push({at: Date.now(), raw: body.slice(0, 200)}); } } res.writeHead(204); res.end(); });
    return;
  }
  res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'});
  res.end(req.url.startsWith('/fixedtail') ? FIXED_TAIL : req.url.startsWith('/float') ? FLOAT : req.url.startsWith('/overlay') ? OVERLAY : req.url.startsWith('/bar6k') ? TABLE(true, TABLE_ROWS_6K) : req.url.startsWith('/bar') ? TABLE(true) : TABLE(false));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const LOCAL = `http://127.0.0.1:${server.address().port}`;
const urlOf = t => t.local ? `${LOCAL}${t.local}` : t.url;

// ---- the engines' wire, the shell, the tool -----------------------------------------------------------------------
class Wire {
  static connect(path) {
    return new Promise((resolve, reject) => {
      const s = createConnection(path);
      s.once('connect', () => { s.off('error', reject); resolve(new Wire(s)); });
      s.once('error', reject);
    });
  }
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
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method}: no answer in ${timeout} ms`)); }, timeout);
      this.pending.set(id, m => { clearTimeout(t); resolve(m); });
      this.s.write(Buffer.concat([head, bytes]));
    });
  }
  execute(method, args, {budgetMs = 60_000, lineage} = {}) {
    return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + budgetMs, ...(lineage ? {lineage} : {})}, budgetMs + 60_000);
  }
  close() { this.s.destroy(); }
}
const sh = (cmd, args, timeout = 20_000) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = script => sh('osascript', ['-e', script]);

async function startEngine(bin, name) {
  // Each engine its own process and socket directory (the engine's lock is per directory, #299); a short path (the
  // socket's limit is 103 bytes).
  const dir = join(process.env.RUNNER_TEMP || OUT, `s314${name}`); mkdirSync(dir, {recursive: true, mode: 0o700});
  const socket = join(dir, 'e.sock');
  const child = spawn(bin, [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.on('data', d => { stderr = (stderr + d).slice(-20_000); });
  child.stdout.on('data', () => {});
  const connect = async (desktop = 'dedicated') => {
    const wire = await Wire.connect(socket);
    const ping = await wire.call('ping', {clientApiVersion: 'cua-engine-1', desktop});
    if (ping.error) throw new Error(`ping ${name}: ${JSON.stringify(ping.error).slice(0, 300)}`);
    wire.identity = ping.result;
    return wire;
  };
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null) throw new Error(`engine ${name} exited ${child.exitCode}: ${stderr.slice(0, 2000)}`);
    try { const w = await connect(); const identity = w.identity; w.close(); return {name, child, connect, identity, stderr: () => stderr}; } catch { await sleep(50); }
  }
  throw new Error(`engine ${name} did not listen: ${stderr.slice(0, 2000)}`);
}
function startTool() {
  const child = spawn(TOOL, [], {stdio: ['pipe', 'pipe', 'pipe']});
  const lines = createInterface({input: child.stdout});
  const waiting = [];
  lines.on('line', l => { const w = waiting.shift(); if (w) { try { w(JSON.parse(l)); } catch { w({error: `bad answer ${l.slice(0, 200)}`}); } } });
  child.stderr.on('data', d => log('tool stderr', String(d).slice(0, 500)));
  return {
    ask: (o, timeout = 300_000) => new Promise(resolve => {
      const t = setTimeout(() => resolve({error: 'tool timeout'}), timeout);
      waiting.push(v => { clearTimeout(t); resolve(v); });
      child.stdin.write(JSON.stringify(o) + '\n');
    }),
    stop: () => { child.stdin.end(); setTimeout(() => child.kill('SIGKILL'), 1000); },
  };
}
class Cdp {
  static async open(child) {
    const cdp = new Cdp(child.stdio[3], child.stdio[4]);
    for (let i = 0; i < 60; i++) {
      const r = await cdp.send('Target.getTargets', {}, null).catch(() => null);
      const page = r?.result?.targetInfos?.find(t => t.type === 'page');
      if (page) { cdp.session = (await cdp.send('Target.attachToTarget', {targetId: page.targetId, flatten: true}, null)).result.sessionId; return cdp; }
      await sleep(500);
    }
    throw new Error('no CDP page');
  }
  constructor(input, output) {
    this.input = input; this.id = 1; this.pending = new Map(); this.buf = '';
    output.on('data', d => {
      this.buf += d.toString('utf8');
      let k;
      while ((k = this.buf.indexOf('\0')) >= 0) {
        const m = JSON.parse(this.buf.slice(0, k)); this.buf = this.buf.slice(k + 1);
        if (m.id) { this.pending.get(m.id)?.(m); this.pending.delete(m.id); }
      }
    });
  }
  send(method, params = {}, session = this.session) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timeout`)); }, 30_000);
      this.pending.set(id, m => { clearTimeout(t); resolve(m); });
      this.input.write(JSON.stringify(session ? {id, method, params, sessionId: session} : {id, method, params}) + '\0');
    });
  }
  async eval(expression) { const r = await this.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true}); return r.result?.result?.value; }
}
const SCROLL_TO = frac => `(() => {
  const doc = document.scrollingElement || document.documentElement;
  let best = doc, range = doc.scrollHeight - doc.clientHeight;
  for (const e of document.querySelectorAll('body *')) {
    if (e.clientHeight < innerHeight / 2) continue;
    const r = e.scrollHeight - e.clientHeight;
    if (r <= range || r < 100) continue;
    const o = getComputedStyle(e).overflowY;
    if (o === 'auto' || o === 'scroll') { best = e; range = r; }
  }
  best.scrollTop = ${frac} * range;
  return {scroller: best === doc ? 'document' : (best.tagName + (best.id ? '#' + best.id : '') + (best.className && typeof best.className === 'string' ? '.' + best.className.split(' ')[0] : '')),
    scrollTop: Math.round(best.scrollTop), range: Math.round(range), clientHeight: best.clientHeight, innerHeight};
})()`;

// ---- an observation and its readings ------------------------------------------------------------------------------
const fileName = s => s.replace(/[^a-z0-9+-]+/gi, '_');
/// One observation on a fresh connection (a fresh lineage, so neither head's tokens carry over from its last revision).
async function observe(head, pid, label, {settle = false, screenshot = true} = {}) {
  const w = await engines[head].connect();
  const shots = join(OUT, 'shots', fileName(`${label}-${head}`)); mkdirSync(shots, {recursive: true});
  try {
    const from = Date.now();
    const r = await w.execute('get_app_state', {pid, ...(screenshot ? {includeScreenshot: true, outputDirectory: shots} : {}), ...(settle ? {settle: true} : {})});
    const ms = Date.now() - from;
    if (r.error) return {error: {name: r.error.data?.name ?? r.error.name, message: String(r.error.message ?? '').slice(0, 400)}, ms};
    return {sky: r.result, ms};
  } finally { w.close(); rmSync(shots, {recursive: true, force: true}); }
}
const stopsOf = t => [['nodeCapHit', 'nodeCap'], ['budgetHit', 'bytes'], ['deadlineHit', 'deadline']].filter(([k]) => t?.[k]).map(([, v]) => v);
const rectOf = f => f ? [f.x, f.y, f.width, f.height] : null;
const near = (a, b) => a && b && a.every((v, i) => Math.abs(v - b[i]) <= 2);
const labelOf = n => String(n.title ?? n.description ?? n.value ?? '').slice(0, 60);
/// A node's direct children in the printed preorder (the nodes after it one level deeper, until its depth again).
function directChildren(nodes, i) {
  const out = [], d = nodes[i].depth;
  for (let j = i + 1; j < nodes.length && nodes[j].depth > d; j++) if (nodes[j].depth === d + 1) out.push(j);
  return out;
}
/// The first label in a node's subtree that names a fixture row ("Paragraph N", "Row N").
function rowLabel(nodes, i) {
  const d = nodes[i].depth;
  for (let j = i; j < nodes.length && (j === i || nodes[j].depth > d); j++) {
    const m = labelOf(nodes[j]).match(/^(Paragraph \d+|Row \d+|\d+)\b/);
    if (m) return m[1];
  }
  return null;
}
const positionsOf = ranges => ranges.flatMap(([lo, hi]) => Array.from({length: hi - lo}, (_, k) => lo + k));
/// Every printed element of more than 499 children: its `shown`, its printed children (their count, their order down
/// the screen, the fixture rows they name), and the truth's element at its frame: which children show there, against
/// those the head printed (missing: show, not printed; extra: printed, do not show).
function wides(sky, truth) {
  const nodes = sky.nodes;
  const out = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    // `children` is the count the width rule kept; `shown.of` the element's own.
    const total = n.shown?.of ?? n.children;
    if (!(total > 499)) continue;
    const kids = directChildren(nodes, i);
    const ys = kids.map(j => nodes[j].frame?.y).filter(y => y != null);
    const rowsNamed = kids.map(j => rowLabel(nodes, j)).filter(Boolean);
    const frame = rectOf(n.frame);
    const t = truth?.wide?.find(w => w.role === n.role && w.children === total && near(w.frame, frame));
    const row = {i, role: n.role, children: total, frame, shown: n.shown ?? null, printedChildren: kids.length,
      ordered: ys.every((y, k) => k === 0 || y >= ys[k - 1] - 0.5), firstRows: rowsNamed.slice(0, 3), lastRows: rowsNamed.slice(-3)};
    if (t) {
      const truthShown = new Set(positionsOf(t.shown));
      const kept = n.shown ? positionsOf(n.shown.ranges ?? []) : positionsOf([[0, total]]);
      const keptSet = new Set(kept);
      row.truth = {shownCount: t.shownCount, shown: t.shown, visibleChildren: t.visibleChildren, visibleRows: t.visibleRows, frameless: t.frameless, clip: t.clip,
        missing: [...truthShown].filter(p => !keptSet.has(p)).length, extra: kept.filter(p => !truthShown.has(p)).length};
    }
    out.push(row);
  }
  return out;
}
function summarize(sky, truth) {
  const t = sky.timings ?? {};
  const text = printed(sky);
  return {stops: stopsOf(t), truncated: sky.truncated ?? null, nodes: sky.nodes.length, menu: sky.menuBar?.length ?? null,
    timings: t, settleMarker: sky.settle ?? null,
    wides: wides(sky, truth), printedDigest: digest(text), printedLines: text.split('\n').length, text};
}
const slim = (sky, text) => ({window: sky.window, truncated: sky.truncated, timings: sky.timings, settle: sky.settle ?? null, printed: text, nodes: sky.nodes, menuBar: sky.menuBar});

const results = [];
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));

/// Consecutive slots compared: the heads side by side where they differ, each head against itself where it observed twice
/// in a row (the page's own control).
function compare(slots) {
  const out = [];
  for (let i = 0; i + 1 < slots.length; i++) {
    const j = i + 1, x = slots[i], y = slots[j];
    if (!x?.obs || !y?.obs) continue;
    out.push({slots: [i + 1, j + 1], heads: [x.head, y.head], same: x.head === y.head, settle: [x.settle, y.settle],
      printed: diffPrinted(x.text, y.text), nodes: diffNodes(x.sky.nodes, y.sky.nodes)});
  }
  return out;
}

const lean = r => r.error ? {error: {name: r.error.data?.name ?? r.error.name, message: String(r.error.message ?? '').slice(0, 300)}}
  : {result: JSON.parse(JSON.stringify(r.result ?? null, (k, v) => (k === 'nodes' || k === 'screenshot' ? undefined : v)))};
/// Each head, on a fresh shared-mode connection: an observation, then a click by token on the row in the middle of the
/// widest element's printed run, then on the fixed toolbar's button; the page's report of each.
async function clickCells(ctx, label, order) {
  const out = [];
  for (const head of order) {
    const w = await engines[head].connect('shared');
    try {
      const o = await w.execute('get_app_state', {pid: ctx.pid});
      if (o.error) { out.push({head, error: lean(o).error}); continue; }
      const sky = o.result, nodes = sky.nodes;
      const totalOf = n => n.shown?.of ?? n.children;
      const wide = nodes.map((n, i) => [n, i]).filter(([n]) => totalOf(n) > 499).sort((x, y) => totalOf(y[0]) - totalOf(x[0]))[0];
      const targets = [];
      if (wide) {
        const kids = directChildren(nodes, wide[1]);
        // Rows: the wide element's printed children, but not a fixed bar (the last child, named Tail or a toolbar).
        const rows = kids.filter(j => nodes[j].role !== 'AXToolbar' && rowLabel(nodes, j));
        if (rows.length) {
          const mid = rows[Math.floor(rows.length / 2)];
          const d = nodes[mid].depth;
          let link = null;
          for (let j = mid; j < nodes.length && (j === mid || nodes[j].depth > d); j++) if (nodes[j].role === 'AXLink' || nodes[j].role === 'AXButton') { link = j; break; }
          if (link != null) targets.push({kind: 'row', j: link, row: rowLabel(nodes, mid)});
        }
      }
      const bar = nodes.findIndex(n => n.role === 'AXButton' && /^(Tail|Tool) 3$/.test(labelOf(n)));
      if (bar >= 0) targets.push({kind: 'bar', j: bar, row: labelOf(nodes[bar])});
      const cell = {head, nodes: nodes.length, wide: wide ? {children: totalOf(wide[0]), shown: wide[0].shown ?? null} : null, clicks: []};
      if (!targets.length) cell.none = 'no row or bar printed';
      for (const t of targets) {
        const n = nodes[t.j];
        const before = clicks.length;
        const from = Date.now();
        const r = lean(await w.execute('click', {pid: ctx.pid, element: n.token}, {lineage: sky.lineage}));
        const ms = Date.now() - from;
        for (let k = 0; k < 20 && clicks.length === before; k++) await sleep(100);
        cell.clicks.push({kind: t.kind, row: t.row, role: n.role, label: labelOf(n), frame: rectOf(n.frame), ms, answer: r, page: clicks.slice(before)});
        await sleep(500);
      }
      out.push(cell);
    } catch (e) {
      out.push({head, exception: String(e?.stack || e).slice(0, 1500)});
    } finally { w.close(); }
  }
  log(`${label} clicks: ${JSON.stringify(out.map(c => [c.head, c.none ?? c.error ?? c.exception ?? c.clicks.map(k => [k.kind, k.row, k.answer.error?.name ?? 'ok', k.page.map(p => p.text?.trim())])]))}`);
  return out;
}

async function measure(ctx, target, at, pageInfo, posIndex) {
  const label = `${GROUP}/${target.name}/${at.name}`;
  const first = (ctx.pageIndex + posIndex + REP) % 2 === 0 ? 'a' : 'b';
  const second = first === 'a' ? 'b' : 'a';
  // X Y Y X plain, then Y X X Y with the settle forced: each head twice per kind, balanced for order.
  const order = [[first, false], [second, false], [second, false], [first, false], [second, true], [first, true], [first, true], [second, true]];
  const row = {label, group: GROUP, target: target.name, pos: at.name, pageInfo, order};
  try {
    const window = [WIN.x, WIN.y, WIN.w, WIN.h];
    row.truth = await ctx.tool.ask({op: 'wide', pid: ctx.pid, window, over: 499});
    const slots = [];
    for (let k = 0; k < order.length; k++) {
      const [head, settle] = order[k];
      const o = await observe(head, ctx.pid, `${label}-${k + 1}`, {settle});
      if (o.error) { slots.push({head, settle, error: o.error, rpcMs: o.ms}); continue; }
      const s = summarize(o.sky, row.truth);
      const {text, ...obs} = s;
      writeFileSync(join(OUT, `obs-${fileName(label)}-${k + 1}-${head}.json.gz`), gzipSync(JSON.stringify(slim(o.sky, text))));
      slots.push({head, settle, obs: {rpcMs: o.ms, ...obs}, text, sky: o.sky});
    }
    row.truthAfter = await ctx.tool.ask({op: 'wide', pid: ctx.pid, window, over: 499});
    row.slots = slots.map(({head, settle, obs, error, rpcMs}) => ({head, settle, ...(obs ? {obs} : {error, rpcMs})}));
    row.compare = compare(slots);
    if (target.click && BROWSER !== 'chrome') row.clicks = await clickCells(ctx, label, [first, second]);
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 3000);
  }
  return row;
}
function line(r) {
  if (r.exception) return `PROBLEM ${r.exception}`;
  const w = x => x.wides.map(v => `${v.role}/${v.children}:${v.shown ? `${v.shown.subset}${JSON.stringify(v.shown.ranges)}` : 'all'}->${v.printedChildren}${v.ordered ? '' : '(unordered)'}${v.truth ? ` truth=${v.truth.shownCount} miss=${v.truth.missing} extra=${v.truth.extra}` : ' notruth'} [${v.firstRows.join(',')}..${v.lastRows.join(',')}]`).join('; ');
  const part = s => s.obs ? `${s.head}${s.settle ? '+settle' : ''}: nodes=${s.obs.nodes} total=${s.obs.timings.totalMs}ms walk=${s.obs.timings.walkMs}ms${s.settle ? ` settle=${s.obs.timings.settleMs}ms(${s.obs.timings.settle}) busyWalk=${s.obs.timings.settleBusyWalkMs}ms×${s.obs.timings.settleBusyWalks}` : ''} rpc=${s.obs.rpcMs}ms stops=[${s.obs.stops}] printed=${s.obs.printedDigest} wide=${w(s.obs)}`
    : `${s.head}${s.settle ? '+settle' : ''}: ERROR ${JSON.stringify(s.error)}`;
  const cmp = (r.compare ?? []).map(c => `${c.slots.join('-')}${c.same ? '(same)' : ''}:${c.printed ? `≠${c.printed.differing}@${c.printed.first}` : '='}`).join(' ');
  return `page=${JSON.stringify(r.pageInfo)} truth=${JSON.stringify(r.truth?.wide?.map(t => [t.role, t.children, t.shownCount, t.visibleChildren]))} ${r.truth?.ms}ms\n    ${r.slots.map(part).join('\n    ')}\n    compare ${cmp}`;
}

/// Both heads once, untimed, after a page is loaded: the enablement settled whichever head owns the app's attribute.
async function warm(ctx, target) {
  const out = {};
  for (const head of ctx.headOrder) {
    const o = await observe(head, ctx.pid, `${GROUP}/${target.name}/warm`);
    out[head] = o.error ? {error: o.error} : {nodes: o.sky.nodes.length, totalMs: o.sky.timings?.totalMs, stops: stopsOf(o.sky.timings), enablement: o.sky.timings?.enablementWrite ?? null};
  }
  await sleep(3000);
  return out;
}

// ---- the apps ----------------------------------------------------------------------------------------------------
async function runChrome(ctx) {
  const child = spawn(CFT, [`--user-data-dir=${join(OUT, 'chrome-profile')}`, '--no-first-run', '--no-default-browser-check',
    '--disable-search-engine-choice-screen', '--lang=en-US', '--disable-features=Translate', '--remote-debugging-pipe',
    `--window-position=${WIN.x},${WIN.y}`, `--window-size=${WIN.w},${WIN.h}`, 'about:blank'], {stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe']});
  const launchedAt = Date.now();
  ctx.pid = child.pid;
  const cdp = await Cdp.open(child);
  ctx.pageIndex = 0;
  for (const target of TARGETS) {
    if (ONLY && !ONLY.includes(target.name)) continue;
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', {url: urlOf(target)});
    for (let i = 0; i < 90; i++) { await sleep(500); if ((await cdp.eval('document.readyState').catch(() => null)) === 'complete') break; }
    await sleep(5000);
    const left = launchedAt + 25_000 - Date.now(); if (left > 0) await sleep(left);  // past Chrome for Testing's toolbar re-layout
    await cdp.eval(SCROLL_TO(0)).catch(() => null);
    const warmed = await warm(ctx, target);
    log(`${target.name}: warm ${JSON.stringify(warmed)}`);
    let range = null;
    for (const [posIndex, at] of POSITIONS.entries()) {
      if (at.frac > 0 && range === 0) continue;  // a page that does not scroll has one position
      const info = await cdp.eval(SCROLL_TO(at.frac)).catch(e => ({error: String(e)}));
      if (at.frac === 0) range = info?.range ?? null;
      await sleep(2500);
      const row = await measure(ctx, target, at, info, posIndex);
      if (posIndex === 0) row.warm = warmed;
      results.push(row); save();
      log(`${row.label}: ${line(row)}`);
    }
    ctx.pageIndex += 1;
  }
  child.kill('SIGTERM'); await sleep(2000); if (child.exitCode === null) child.kill('SIGKILL');
}
/// Firefox and Safari: a fresh launch per page, positioned through its scroll bar's AXValue (Safari's own AppleScript
/// answers nothing on the runner).
async function runOther(ctx) {
  ctx.pageIndex = 0;
  let child = null;
  const end = async () => {
    if (!child || child.exitCode !== null) return;
    child.kill('SIGTERM');
    for (let i = 0; i < 20 && child.exitCode === null; i++) await sleep(250);
    if (child.exitCode === null) child.kill('SIGKILL');
    await sleep(1500);
  };
  for (const target of TARGETS) {
    if (ONLY && !ONLY.includes(target.name)) continue;
    await end();
    child = await launchOther(urlOf(target), join(OUT, `${BROWSER}-profile`), WIN);
    await sleep(target.local ? 8000 : 16000);
    ctx.pid = child.pid;
    placePid(child.pid, WIN); await sleep(2000);
    const warmed = await warm(ctx, target);
    log(`${target.name}: warm ${JSON.stringify(warmed)}`);
    for (const [posIndex, at] of POSITIONS.entries()) {
      const info = {title: osa(`tell application "System Events" to get name of window 1 of (first process whose unix id is ${child.pid})`).out};
      // Safari through its scroll bar's AXValue; Firefox exposes no scroll bar (run 42442898846), so through
      // AXScrollToVisible on the content element where the viewport's bottom should fall (the tool's `scrollto`).
      info.scroll = await ctx.tool.ask({op: BROWSER === 'firefox' ? 'scrollto' : 'axscroll', pid: ctx.pid, window: [WIN.x, WIN.y, WIN.w, WIN.h], frac: at.frac});
      if (at.frac > 0 && info.scroll?.after != null && Math.abs(info.scroll.after - at.frac) > 0.05) info.scrollMissed = true;
      if (at.frac > 0 && info.scroll?.after == null) { results.push({label: `${GROUP}/${target.name}/${at.name}`, skipped: 'not positioned', pageInfo: info}); save(); continue; }
      await sleep(2500);
      const row = await measure(ctx, target, at, info, posIndex);
      if (posIndex === 0) row.warm = warmed;
      results.push(row); save();
      log(`${row.label}: ${line(row)}`);
    }
    ctx.pageIndex += 1;
  }
  await end();
}

const config = {
  group: GROUP, browser: BROWSER, imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, runnerName: process.env.RUNNER_NAME ?? null,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), chrome: sh(CFT, ['--version']).out, browserVersion: browserVersion(),
  safari: sh('defaults', ['read', '/Applications/Safari.app/Contents/Info', 'CFBundleShortVersionString']).out,
  aCommit: process.env.P314_A_COMMIT ?? null, bCommit: process.env.P314_B_COMMIT ?? null, probeCommit: process.env.GITHUB_SHA ?? null, rep: REP, window: WIN,
};
const tool = startTool();
config.screen = await tool.ask({op: 'screen'});
// One engine process per head, started (and warmed) in the order the repetition gives.
const headOrder = REP % 2 === 1 ? ['a', 'b'] : ['b', 'a'];
const engines = {};
for (const h of headOrder) engines[h] = await startEngine(BINS[h], h);
config.engines = Object.fromEntries(headOrder.map(h => [h, {bin: BINS[h], pid: engines[h].child.pid, identity: engines[h].identity}]));
log('config', JSON.stringify(config));
const ctx = {tool, headOrder};
try {
  if (BROWSER === 'chrome') await runChrome(ctx); else await runOther(ctx);
} catch (e) {
  config.exception = String(e?.stack || e).slice(0, 3000);
  log('exception', config.exception);
}
for (const e of Object.values(engines)) { config[`${e.name}Stderr`] = e.stderr().slice(-3000); if (e.child.exitCode === null) e.child.kill('SIGKILL'); }
save();
tool.stop();
server.close();
process.exit(0);
