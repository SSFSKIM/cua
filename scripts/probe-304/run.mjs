// #304's hosted measurement: on pages likely to have a visible control under a collapsed-frame container (hole 1) or a
// wide shown list starving the visible siblings after it (hole 2), at 0 / 25 / 50 / 90 % of the page, main's engine
// (`--main`) observes, scripts/probe-304/tool.swift hit-tests a 20 pt grid over the window, and the same engine with
// its budgets raised (`--wide`) observes the whole tree; both are built with scripts/probe-304/instrument.py, so each
// observation also returns the guard's own record and the walk's raw reads. Once per page the tool prices a frame read,
// a children read and a bare hit-test. The reading of each point and the candidate fixes' simulation are offline
// (scripts/probe-304/offline/). No click is posted; Safari is positioned through its scroll bar's AXValue.
//   node scripts/probe-304/run.mjs --group <group> --main <bin> --wide <bin> --tool <bin> --out <dir> [--variant <bin>]
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {gzipSync} from 'node:zlib';
import {rows, buildRecord, shares, checkPort, underStrip, clickable} from './guard.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-304: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), MAIN = arg('main'), WIDE = arg('wide'), TOOL = arg('tool'), GROUP = arg('group'), VARIANT = arg('variant');
const ONLY = arg('targets') ? arg('targets').split(',').filter(Boolean) : null;
if (!OUT || !MAIN || !WIDE || !TOOL || !GROUP) { console.error('usage: run.mjs --group <g> --main <bin> --wide <bin> --tool <bin> --out <dir>'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-304:', ...a);
const STEP = 20;
const WIN = {x: 0, y: 40, w: 1024, h: 728};  // the hosted runner's one screen is 1024 x 768
const GH = ['https://', 'git', 'hub.com'].join('');

// Hole 1: floats, absolutely positioned overlays, sticky or collapsed wrappers (documentation with sidebars, news, web
// apps that need no login). Hole 2: long tables and lists with controls after them in the document's order.
const PAGES = {
  'py-docs': {url: 'https://docs.python.org/3/library/stdtypes.html', hole: 1},
  'mdn-float': {url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/float', hole: 1},
  'rust-vec': {url: 'https://doc.rust-lang.org/std/vec/struct.Vec.html', hole: 1},
  'go-http': {url: 'https://pkg.go.dev/net/http', hole: 1},
  'k8s-docs': {url: 'https://kubernetes.io/docs/concepts/overview/', hole: 1},
  'wiki-article': {url: 'https://en.wikipedia.org/wiki/United_States', hole: 1},
  'bbc-news': {url: 'https://www.bbc.com/news', hole: 1},
  'guardian': {url: 'https://www.theguardian.com/international', hole: 1},
  'w3s-float': {url: 'https://www.w3schools.com/css/css_float.asp', hole: 1},
  'npm-react': {url: 'https://www.npmjs.com/package/react', hole: 1},
  'osm': {url: 'https://www.openstreetmap.org/#map=12/51.5/-0.1', hole: 1},
  'local-float': {local: '/float', hole: 1},
  'local-overlay': {local: '/overlay', hole: 1},
  'local-table': {local: '/', hole: 2},
  'local-table-bar': {local: '/bar', hole: 2},
  'local-table-6k': {local: '/bar6k', hole: 2},
  'wiki-table': {url: 'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population', hole: 2},
  'hn-thread': {url: 'https://news.ycombinator.com/item?id=13541679', hole: 2},
  'iana-media': {url: 'https://www.iana.org/assignments/media-types/media-types.xhtml', hole: 2},
  'gh-issues': {url: `${GH}/microsoft/vscode/issues`, hole: 2},
};
const GROUPS = {
  'chrome-a': ['py-docs', 'mdn-float', 'rust-vec', 'go-http', 'k8s-docs', 'npm-react'],
  'chrome-b': ['wiki-article', 'bbc-news', 'guardian', 'w3s-float', 'osm', 'local-float'],
  'chrome-c': ['local-table', 'local-table-bar', 'wiki-table', 'hn-thread', 'iana-media', 'gh-issues'],
  safari: ['py-docs', 'wiki-article', 'bbc-news', 'mdn-float', 'local-table', 'local-float'],
  // The fixtures again after run 42313992098 (the float wrapper given a role, the overlay page added).
  'chrome-fix': ['local-float', 'local-overlay', 'local-table-bar'],
  'safari-fix': ['local-float', 'local-overlay'],
  // A table longer than the node budget; Safari's docs.python.org with the width-omitted body's children read (run 42313992098).
  'chrome-big': ['local-table-6k'],
  'safari-diag': ['py-docs'],
  // The column-skip fix (F7) built and checked live against main on the pages whose tables cut the walk.
  'chrome-f7': ['local-table-bar', 'local-table-6k', 'iana-media', 'hn-thread', 'wiki-table'],
  // The wide trees again with each row's chosen children as element identities (scripts/probe-304/instrument-ids.py),
  // for the fix's invariant check (WideListInvariantTests): the pages whose shared elements (a table's cells, under
  // their rows and columns) the spike's dumps could not rebuild.
  'chrome-ids-a': ['local-table', 'local-table-bar', 'local-table-6k', 'iana-media'],
  'chrome-ids-b': ['wiki-article', 'wiki-table', 'py-docs', 'local-float', 'mdn-float', 'w3s-float', 'local-overlay'],
  'safari-ids': ['mdn-float', 'wiki-article'],
};
const TARGETS = GROUPS[GROUP]?.map(name => ({name, ...PAGES[name]}));
if (!TARGETS) { console.error(`unknown group ${GROUP}`); process.exit(2); }
const POSITIONS = [{name: 'top', frac: 0}, {name: 'f25', frac: 0.25}, {name: 'f50', frac: 0.5}, {name: 'f90', frac: 0.9}];

// ---- the fixtures ------------------------------------------------------------------------------------------------
// `/`: #299's 3,000-row table. `/bar`: the same table with a fixed toolbar of buttons after it in the document's order
// (a visible sibling after a wide shown list). `/float`: 50 sections of 60 paragraphs, each section with a row of
// floated buttons in an unclear'd wrapper (Chromium frames the wrapper as a collapsed strip while its buttons show).
// `/bar6k`: the barred table at 6,000 rows, more rows than the node budget.
const tableRows = count => {
  const rows = [];
  for (let i = 1; i <= count; i++) rows.push(`<tr><td>${i}</td><td><a href="#r${i}">Row ${i}</a></td><td>Name ${i}</td><td>${(i * 7919) % 10007}</td><td>Item ${i % 97}</td><td><button>Act ${i}</button></td></tr>`);
  return rows.join('');
};
const TABLE_ROWS = tableRows(3000), TABLE_ROWS_6K = tableRows(6000);
const TABLE = (bar, rows = TABLE_ROWS) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe304 table</title><style>body{font:14px sans-serif}td{padding:2px 8px;border-bottom:1px solid #ddd}
#bar{position:fixed;left:0;right:0;bottom:0;background:#eee;padding:6px;border-top:1px solid #999}#bar button{margin-right:8px}</style></head>
<body><h1>probe304 table</h1><table><thead><tr><th>#</th><th>Link</th><th>Name</th><th>Value</th><th>Group</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>
${bar ? `<div id="bar" role="toolbar">${Array.from({length: 10}, (_, i) => `<button>Tool ${i + 1}</button>`).join('')}</div>` : ''}</body></html>`;
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
// `/overlay`: a long article whose first section holds, in an empty wrapper, a banner fixed to the viewport's bottom and
// a button fixed to its top right (#304's Wikipedia sighting: a fixed donation banner under a strip, its in-flow parent
// scrolled off), and whose middle section holds an absolutely positioned toolbar in a zero-height wrapper.
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
const server = createServer((req, res) => {
  res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
  res.end(req.url.startsWith('/float') ? FLOAT : req.url.startsWith('/overlay') ? OVERLAY : req.url.startsWith('/bar6k') ? TABLE(true, TABLE_ROWS_6K) : req.url.startsWith('/bar') ? TABLE(true) : TABLE(false));
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
  execute(method, args, budgetMs = 60_000) { return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + budgetMs}, budgetMs + 60_000); }
  close() { this.s.destroy(); }
}
const sh = (cmd, args, timeout = 20_000) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = script => sh('osascript', ['-e', script]);
const pidOf = name => Number(sh('pgrep', ['-x', name]).out.split('\n')[0]) || null;
const place = proc => osa(`tell application "System Events"\ntell process "${proc}"\nset position of window 1 to {${WIN.x}, ${WIN.y}}\nset size of window 1 to {${WIN.w}, ${WIN.h}}\nend tell\nend tell`);

async function startEngine(bin, name) {
  // Each engine its own socket directory: the engine's lock is per directory (#299).
  const dir = join(OUT, `sock-${name}`); mkdirSync(dir, {recursive: true, mode: 0o700});
  const socket = join(dir, 'engine.sock');
  const child = spawn(bin, [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.on('data', d => { stderr = (stderr + d).slice(-20_000); });
  child.stdout.on('data', () => {});
  const connect = async () => {
    const wire = await Wire.connect(socket);
    const ping = await wire.call('ping', {clientApiVersion: 'cua-engine-1', desktop: 'dedicated'});
    if (ping.error) throw new Error(`ping ${name}: ${JSON.stringify(ping.error).slice(0, 300)}`);
    return wire;
  };
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null) throw new Error(`engine ${name} exited ${child.exitCode}: ${stderr.slice(0, 2000)}`);
    try { const w = await connect(); w.close(); return {name, child, connect, stderr: () => stderr}; } catch { await sleep(50); }
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
// Chrome over --remote-debugging-pipe (fd 3 in, fd 4 out, NUL-separated JSON), attached flat to the page target.
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
// The page's main scroller: the document's, or the element with the longest scroll range that fills half the viewport
// or more (a web app or a documentation page that scrolls its own pane).
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
async function observe(wire, pid, label, name, budgetMs) {
  const shots = join(OUT, 'shots', fileName(`${label}-${name}`)); mkdirSync(shots, {recursive: true});
  const from = Date.now();
  const r = await wire.execute('get_app_state', {pid, includeScreenshot: true, outputDirectory: shots}, budgetMs);
  const ms = Date.now() - from;
  rmSync(shots, {recursive: true, force: true});
  if (r.error) return {error: {name: r.error.data?.name ?? r.error.name, message: String(r.error.message ?? '').slice(0, 400)}, ms};
  return {sky: r.result, ms};
}
const stopsOf = t => [['nodeCapHit', 'nodeCap'], ['budgetHit', 'bytes'], ['deadlineHit', 'deadline']].filter(([k]) => t?.[k]).map(([, v]) => v);
function summarize(sky, points) {
  const t = sky.timings ?? {};
  const reads = rows(sky.probeReads ?? []);
  const rec = buildRecord(reads);
  const g = shares(rec, points);
  const charged = reads.filter(r => r.order >= 0);
  const strips = g.per.filter(x => x.c === 'containerOnly' && x.r.via === 'gap').length;
  const underStripPts = points.filter(p => clickable(p.chain) && underStrip(rec, p.chain)).length;
  return {stops: stopsOf(t), nodes: sky.nodes.length, reads: reads.length, charged: charged.length, recordOnly: reads.length - charged.length,
    offscreenCharged: charged.filter(r => !r.enters).length, walkMs: t.walkMs, totalMs: t.totalMs, bytes: t.estimatedBytes, truncated: sky.truncated,
    menu: sky.probeMenu, guard: {n: g.n, checked: g.checked, containerOnly: g.containerOnly, unrecorded: g.unrecorded, reasons: g.reasons},
    gapPoints: strips, underStripPoints: underStripPts, port: checkPort(rec, sky.probeRecord)};
}
const slim = sky => ({window: sky.window, truncated: sky.truncated, timings: sky.timings, probeRecord: sky.probeRecord, probeReads: sky.probeReads, probeMenu: sky.probeMenu,
  titles: sky.nodes.map(n => (n.title ?? n.description ?? '').slice(0, 30))});

const results = [];
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));
const pct = g => g ? `${g.checked}/${g.containerOnly}/${g.unrecorded}` : '-';
async function measure(ctx, target, at, pageInfo) {
  const label = `${GROUP}/${target.name}/${at.name}`;
  const row = {label, group: GROUP, target: target.name, hole: target.hole, pos: at.name, pageInfo};
  let main = null, wide = null, variant = null;
  try {
    main = await ctx.main.connect();
    const m = await observe(main, ctx.pid, label, 'main', 60_000);
    if (m.error) { row.mainError = m.error; return row; }
    const wf = m.sky.window.frame;
    const window = [wf.x, wf.y, wf.width, wf.height];
    const gridFile = join(OUT, `grid-${fileName(label)}.json`);
    row.grid = await ctx.tool.ask({op: 'grid', pid: ctx.pid, window, step: STEP, out: gridFile});
    const points = JSON.parse(readFileSync(gridFile, 'utf8')).points;
    writeFileSync(`${gridFile}.gz`, gzipSync(readFileSync(gridFile))); rmSync(gridFile);
    row.main = {rpcMs: m.ms, ...summarize(m.sky, points)};
    writeFileSync(join(OUT, `obs-${fileName(label)}-main.json.gz`), gzipSync(JSON.stringify(slim(m.sky))));
    wide = await ctx.wide.connect();
    const w = await observe(wide, ctx.pid, label, 'wide', 240_000);
    if (w.error) row.wideError = w.error;
    else {
      row.wide = {rpcMs: w.ms, ...summarize(w.sky, points)};
      writeFileSync(join(OUT, `obs-${fileName(label)}-wide.json.gz`), gzipSync(JSON.stringify(slim(w.sky))));
    }
    if (ctx.variant) {
      // The leading fix built (`--variant`), read at the same grid over its own record.
      variant = await ctx.variant.connect();
      const v = await observe(variant, ctx.pid, label, 'variant', 60_000);
      if (v.error) row.variantError = v.error;
      else {
        row.variant = {rpcMs: v.ms, ...summarize(v.sky, points)};
        writeFileSync(join(OUT, `obs-${fileName(label)}-variant.json.gz`), gzipSync(JSON.stringify(slim(v.sky))));
      }
    }
    // An element the width rule showed none of (more than 499 children, no visible subset): what its children's frames
    // gave the record-only bisection.
    if ((m.sky.probeReads ?? []).some(r => r[5] > 499 && r[6] === 0 && !r[12])) row.kids = await ctx.tool.ask({op: 'kids', pid: ctx.pid, window});
    if (!process.env.P304_NO_PRICE && (at.name === 'top' || !ctx.priced?.[target.name])) {
      row.price = await ctx.tool.ask({op: 'price', pid: ctx.pid, window, cap: 1500});
      (ctx.priced ??= {})[target.name] = true;
    }
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 3000);
  } finally {
    main?.close(); wide?.close(); variant?.close();
  }
  return row;
}
function line(r) {
  if (r.exception || r.mainError) return `PROBLEM ${JSON.stringify(r.mainError ?? '')} ${r.exception ?? ''}`;
  const part = (name, o) => !o ? `${name}: ${JSON.stringify(r[`${name}Error`] ?? 'none')}` :
    `${name}: stops=[${o.stops}] nodes=${o.nodes} reads=${o.reads} (offscreen charged ${o.offscreenCharged}, record-only ${o.recordOnly}) walk=${o.walkMs}ms ` +
    `guard=${pct(o.guard)} n=${o.guard.n} gap=${o.gapPoints} underStrip=${o.underStripPoints} port=${o.port ? `${o.port.differ}/${o.port.nodes}` : '-'} reasons=${JSON.stringify(o.guard.reasons)}`;
  return `page=${JSON.stringify(r.pageInfo)} grid=${r.grid?.points}pts p50=${r.grid?.p50}\n    ${part('main', r.main)}\n    ${part('wide', r.wide)}${r.variant ? `\n    ${part('variant', r.variant)}` : ''}${r.price ? `\n    price=${JSON.stringify(r.price)}` : ''}`;
}

// ---- the apps ----------------------------------------------------------------------------------------------------
async function runChrome(ctx) {
  const child = spawn(CFT, [`--user-data-dir=${join(OUT, 'chrome-profile')}`, '--no-first-run', '--no-default-browser-check',
    '--disable-search-engine-choice-screen', '--lang=en-US', '--disable-features=Translate', '--remote-debugging-pipe',
    `--window-position=${WIN.x},${WIN.y}`, `--window-size=${WIN.w},${WIN.h}`, 'about:blank'], {stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe']});
  const launchedAt = Date.now();
  ctx.pid = child.pid;
  const cdp = await Cdp.open(child);
  for (const target of TARGETS) {
    if (ONLY && !ONLY.includes(target.name)) continue;
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', {url: urlOf(target)});
    for (let i = 0; i < 90; i++) { await sleep(500); if ((await cdp.eval('document.readyState').catch(() => null)) === 'complete') break; }
    await sleep(5000);
    const left = launchedAt + 25_000 - Date.now(); if (left > 0) await sleep(left);  // past Chrome for Testing's toolbar re-layout
    let range = null;
    for (const at of POSITIONS) {
      if (at.frac > 0 && range === 0) continue;  // a page that does not scroll has one position
      const info = await cdp.eval(SCROLL_TO(at.frac)).catch(e => ({error: String(e)}));
      if (at.frac === 0) range = info?.range ?? null;
      await sleep(2500);
      const row = await measure(ctx, target, at, info);
      results.push(row); save();
      log(`${row.label}: ${line(row)}`);
    }
  }
  child.kill('SIGTERM'); await sleep(2000); if (child.exitCode === null) child.kill('SIGKILL');
}
async function runSafari(ctx) {
  // Safari's own AppleScript answers nothing on the runner (#305): its state through System Events, its position through
  // the scroll bar's AXValue.
  const title = () => osa('tell application "System Events" to get name of window 1 of process "Safari"').out;
  for (const target of TARGETS) {
    if (ONLY && !ONLY.includes(target.name)) continue;
    sh('pkill', ['-x', 'Safari']); await sleep(2500);
    sh('open', ['-a', 'Safari', urlOf(target)]);
    await sleep(target.local ? 8000 : 16000);
    ctx.pid = pidOf('Safari');
    place('Safari'); await sleep(2000);
    for (const at of POSITIONS) {
      const info = {title: title()};
      const wf = [WIN.x, WIN.y, WIN.w, WIN.h];
      info.scroll = await ctx.tool.ask({op: 'axscroll', pid: ctx.pid, window: wf, frac: at.frac});
      if (at.frac > 0 && info.scroll?.after != null && Math.abs(info.scroll.after - at.frac) > 0.05) info.scrollMissed = true;
      await sleep(2500);
      const row = await measure(ctx, target, at, info);
      results.push(row); save();
      log(`${row.label}: ${line(row)}`);
    }
  }
  sh('pkill', ['-x', 'Safari']);
}

const config = {
  group: GROUP, imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, runnerName: process.env.RUNNER_NAME ?? null,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), chrome: sh(CFT, ['--version']).out, safari: sh('defaults', ['read', '/Applications/Safari.app/Contents/Info', 'CFBundleShortVersionString']).out,
  mainCommit: process.env.P304_MAIN_COMMIT ?? null, probeCommit: process.env.GITHUB_SHA ?? null, rep: process.env.P304_REP ?? null, step: STEP, window: WIN,
};
const tool = startTool();
config.screen = await tool.ask({op: 'screen'});
log('config', JSON.stringify(config));
const ctx = {tool, main: await startEngine(MAIN, 'main'), wide: await startEngine(WIDE, 'wide'), variant: VARIANT ? await startEngine(VARIANT, 'variant') : null};
try {
  if (GROUP.startsWith('safari')) await runSafari(ctx); else await runChrome(ctx);
} catch (e) {
  config.exception = String(e?.stack || e).slice(0, 3000);
  log('exception', config.exception);
}
for (const e of [ctx.main, ctx.wide, ctx.variant].filter(Boolean)) { config[`${e.name}Stderr`] = e.stderr().slice(-3000); if (e.child.exitCode === null) e.child.kill('SIGKILL'); }
save();
tool.stop();
server.close();
process.exit(0);
