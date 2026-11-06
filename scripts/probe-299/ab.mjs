// #301's hosted A/B on #299's pages: origin/main's engine (`--main`, c4057c3a) against feat/301-visible-first's
// (`--branch`), both built with scripts/probe-299/instrument.py so an observation also returns the stale-point guard's own
// record (`probeRecord`). Each target at each position: main observes, scripts/probe-299/tool.swift hit-tests a 20 pt
// grid, the branch observes; the guard's reading at each grid point is read over each engine's own record (and, for
// main, also emulated from the printed tree, as #299 did). Token stability: each engine observes again at the same
// position on the same connection, and at `+1` positions (one screen past the one before) the previous row's
// connections observe again. Where a list is too wide for the width rule, the tool reads every child's frame against the
// branch's bisection. No click is posted.
//   node scripts/probe-299/ab.mjs --group <chrome-a|chrome-b|safari|native> --main <bin> --branch <bin> --tool <bin> --out <dir>
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {gzipSync} from 'node:zlib';
import {record, classify, classifyRecord, treeStats, verdicts} from './classify.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-299 ab: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), MAIN = arg('main'), BRANCH = arg('branch'), TOOL = arg('tool'), GROUP = arg('group');
const ONLY = arg('targets') ? arg('targets').split(',').filter(Boolean) : null;
if (!OUT || !MAIN || !BRANCH || !TOOL || !GROUP) { console.error('usage: ab.mjs --group <g> --main <bin> --branch <bin> --tool <bin> --out <dir>'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-299 ab:', ...a);
const STEP = 20;
const WIN = {x: 0, y: 40, w: 1024, h: 728};  // the hosted runner's one screen is 1024 x 768
const GH = ['https://', 'git', 'hub.com'].join('');

const TARGETS = {
  'chrome-a': [
    {name: 'wiki-article', url: 'https://en.wikipedia.org/wiki/United_States', deep: true},
    {name: 'wiki-table', url: 'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population', deep: true},
    {name: 'local-table', local: '/', deep: true},
    {name: 'local-list', local: '/list', deep: true},
  ],
  // #301's re-run after the seeding was dropped (ruling 66f90453): the Chrome pages the budget cuts, at 0 / 25 / 50 / 90 %.
  'chrome-cut': [
    {name: 'wiki-article', url: 'https://en.wikipedia.org/wiki/United_States', deep: true},
    {name: 'wiki-table', url: 'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population', deep: true},
    {name: 'local-table', local: '/', deep: true},
    {name: 'hn-thread', url: 'https://news.ycombinator.com/item?id=13541679', deep: true},
  ],
  'chrome-b': [
    {name: 'hn-front', url: 'https://news.ycombinator.com/news'},
    {name: 'hn-thread', url: 'https://news.ycombinator.com/item?id=13541679', deep: true},
    {name: 'gh-issues', url: `${GH}/microsoft/vscode/issues`},
    {name: 'gh-tree', url: `${GH}/torvalds/linux`},
    {name: 'gh-blob', url: `${GH}/torvalds/linux/blob/master/kernel/sched/core.c`},
  ],
  safari: [
    {name: 'wiki-article', url: 'https://en.wikipedia.org/wiki/United_States', deep: true},
    {name: 'hn-thread', url: 'https://news.ycombinator.com/item?id=13541679', deep: true},
    {name: 'local-table', local: '/'},
    {name: 'local-list', local: '/list', deep: true},
  ],
  native: [
    {name: 'finder-frameworks', finder: '/System/Library/PrivateFrameworks'},
    {name: 'textedit-long', textedit: true},
  ],
}[GROUP];
if (!TARGETS) { console.error(`unknown group ${GROUP}`); process.exit(2); }
// The top, a screen or two, and well past the node budget's cut; `adjacent` positions lie one screen past the one before
// and reuse its connections (token stability across a scroll).
const positions = t => GROUP === 'chrome-cut'
  ? [{name: 'top', screens: 0}, {name: 'f25', frac: 0.25}, {name: 'f50', frac: 0.5}, {name: 'f90', frac: 0.9}].map((p, index) => ({...p, index}))
  : [{name: 'top', screens: 0}, {name: 's1', screens: 1}, {name: 's2', screens: 2},
  ...(!t.deep ? [] : GROUP.startsWith('chrome')
    ? [{name: 'f25', frac: 0.25}, {name: 'f50', frac: 0.5}, {name: 'f50+1', frac: 0.5, plus: 1, adjacent: true}, {name: 'f90', frac: 0.9}]
    : [{name: 'd20', screens: 20}, {name: 'd20+1', screens: 21, adjacent: true}, {name: 'd60', screens: 60}])].map((p, index) => ({...p, index}));

// The fixtures: a 3,000-row table (each row a link and a button), and 1,500 links in one plain container (wider than the
// width rule's 499 with no visible subset, unless the browser offers one).
const TABLE = (() => {
  const rows = [];
  for (let i = 1; i <= 3000; i++) rows.push(`<tr><td>${i}</td><td><a href="#r${i}">Row ${i}</a></td><td>Name ${i}</td><td>${(i * 7919) % 10007}</td><td>Item ${i % 97}</td><td><button>Act ${i}</button></td></tr>`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe299 table</title><style>body{font:14px sans-serif}td{padding:2px 8px;border-bottom:1px solid #ddd}</style></head>
<body><h1>probe299 table</h1><table><thead><tr><th>#</th><th>Link</th><th>Name</th><th>Value</th><th>Group</th><th>Action</th></tr></thead><tbody>${rows.join('')}</tbody></table></body></html>`;
})();
const LIST = (() => {
  const items = [];
  for (let i = 1; i <= 1500; i++) items.push(`<a href="#i${i}">Entry ${i}, value ${(i * 7919) % 10007}</a>`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe299 list</title><style>body{font:14px sans-serif}#list a{display:block;padding:4px 8px;border-bottom:1px solid #ddd}</style></head>
<body><h1>probe299 list</h1><div id="list">${items.join('')}</div></body></html>`;
})();
const server = createServer((req, res) => { res.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); res.end(req.url.startsWith('/list') ? LIST : TABLE); });
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
  execute(method, args) { return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + 60_000}); }
  close() { this.s.destroy(); }
}
const sh = (cmd, args, timeout = 20_000) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = script => sh('osascript', ['-e', script]);
const pidOf = name => Number(sh('pgrep', ['-x', name]).out.split('\n')[0]) || null;
const place = proc => osa(`tell application "System Events"\ntell process "${proc}"\nset position of window 1 to {${WIN.x}, ${WIN.y}}\nset size of window 1 to {${WIN.w}, ${WIN.h}}\nend tell\nend tell`);

async function startEngine(bin, name) {
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
const PAGE_INFO = '({scrollY: Math.round(scrollY), innerHeight, scrollHeight: document.documentElement.scrollHeight})';

// ---- an observation and its readings ------------------------------------------------------------------------------
const fileName = s => s.replace(/[^a-z0-9+-]+/gi, '_');
async function observe(wire, pid, label, name) {
  const shots = join(OUT, 'shots', fileName(`${label}-${name}`)); mkdirSync(shots, {recursive: true});
  const from = Date.now();
  const r = await wire.execute('get_app_state', {pid, includeScreenshot: true, outputDirectory: shots});
  const ms = Date.now() - from;
  if (r.error) return {error: {name: r.error.data?.name ?? r.error.name, message: String(r.error.message ?? '').slice(0, 400)}, ms};
  return {sky: r.result, ms};
}
const webIndex = sky => sky.nodes.findIndex(n => n.role === 'AXWebArea');
function contentTop(sky) {
  const host = webIndex(sky) >= 0 ? webIndex(sky) : sky.nodes.findIndex(n => n.role === 'AXScrollArea');
  let top = null;
  if (host >= 0) for (let j = host + 1; j < Math.min(sky.nodes.length, host + 300) && sky.nodes[j].depth > sky.nodes[host].depth; j++) {
    const f = sky.nodes[j].frame; if (f && f.height > 1 && (top === null || f.y < top)) top = Math.round(f.y);
  }
  return top;
}
function summarize(sky, points) {
  const t = sky.timings ?? {};
  const stops = [['nodeCapHit', 'nodeCap'], ['budgetHit', 'bytes'], ['deadlineHit', 'deadline']].filter(([k]) => t[k]).map(([, v]) => v);
  const {recs} = record(sky.nodes, stops);
  const stats = treeStats(sky.nodes, recs);
  const fired = [...stops];
  if (sky.truncated?.depth) fired.push('depth');
  if (stats.widthVisible) fired.push(`width-visible×${stats.widthVisible}`);
  if (stats.widthOmitted) fired.push(`width-omitted×${stats.widthOmitted}`);
  if (t.fetchFailures) fired.push(`failures×${t.fetchFailures}`);
  const tr = sky.truncated;
  const marker = tr?.count != null ? {count: tr.count, above: tr.above ?? null, below: tr.below ?? null,
    elsewhere: tr.above != null ? tr.count - tr.above - tr.below : null} : null;
  const emulated = classify(recs, points);
  // The marker the service prints (src/services/engine/render.mjs at feat/301-visible-first b2685041, `truncationMarkers`).
  const direction = tr?.count && Number.isInteger(tr.above) && Number.isInteger(tr.below)
    ? (tr.above > 0 ? (tr.below > 0 ? ', above and below the visible area' : ', above the visible area') : tr.below > 0 ? ', below the visible area' : '') : null;
  const markerLine = tr?.count ? (direction !== null ? `[truncated: at least ${tr.count} elements omitted${direction}]` : `[truncated: ${tr.count} elements omitted]`) : null;
  const verdict = sky.probeRecord ? verdicts(sky.probeRecord, points) : null;
  const own = sky.probeRecord ? classifyRecord(sky.probeRecord, points) : null;
  return {fired, nodes: sky.nodes.length, maxDepth: stats.maxDepth, widthOmitted: stats.widthOmitted, bytes: t.estimatedBytes, walkMs: t.walkMs, totalMs: t.totalMs,
    truncated: marker, seed: t.seedMs != null ? {ms: t.seedMs, points: t.seedPoints, hits: t.seedHits, chains: t.seedChains, seeds: t.seeds, promoted: t.seedPromoted, capped: Boolean(t.seedCapped)} : null,
    recordOnlyNodes: t.recordOnlyNodes ?? 0, stalePointRecordMs: t.stalePointRecordMs, contentTop: contentTop(sky),
    markerLine, verdicts: verdict, guard: own?.clickable ?? null, guardAll: own?.all ?? null, recordNodes: own?.recordNodes ?? null, guardEmulated: emulated.clickable};
}
const slim = sky => ({window: sky.window, truncated: sky.truncated, timings: sky.timings, probeRecord: sky.probeRecord,
  nodes: sky.nodes.map(n => [n.depth, n.role, n.frame ? [n.frame.x, n.frame.y, n.frame.width, n.frame.height] : null, n.children,
    n.shown ? [n.shown.count, n.shown.of, n.shown.subset] : null, (n.actions ?? []).filter(a => /ByPage$/.test(a)), (n.title ?? n.description ?? '').slice(0, 30), n.token])});

/// Nodes present in both observations, matched by role, label and frame (a web area's descendants moved by `dy`, the
/// scroll between them), strips, frameless nodes and keys either side holds twice left out; and how many changed token.
function stability(a, b, dy = 0) {
  const keys = (sky, shift) => {
    const out = new Map(), dup = new Set();
    const web = webIndex(sky);
    const webDepth = web >= 0 ? sky.nodes[web].depth : Infinity;
    let inWeb = false;
    const stack = [];
    sky.nodes.forEach((n, i) => {
      if (i === web) inWeb = true; else if (inWeb && n.depth <= webDepth) inWeb = false;
      while (stack.length && sky.nodes[stack[stack.length - 1]].depth >= n.depth) stack.pop();
      const parentRole = stack.length ? sky.nodes[stack[stack.length - 1]].role : null;
      stack.push(i);
      if (n.role === 'AXColumn' || (n.role === 'AXGroup' && parentRole === 'AXTable')) return;
      const f = n.frame;
      if (!f || f.width <= 1 || f.height <= 1) return;
      const k = `${n.role}|${n.title ?? ''}|${n.description ?? ''}|${Math.round(f.x)}|${Math.round(f.y + (inWeb && i !== web ? shift : 0))}|${Math.round(f.width)}|${Math.round(f.height)}`;
      if (out.has(k)) dup.add(k); else out.set(k, n.token);
    });
    for (const k of dup) out.delete(k);
    return out;
  };
  const ka = keys(a, 0), kb = keys(b, dy);
  let matched = 0, same = 0;
  const changed = [];
  for (const [k, tok] of kb) if (ka.has(k)) { matched += 1; if (ka.get(k) === tok) same += 1; else if (changed.length < 5) changed.push([k.slice(0, 80), ka.get(k), tok]); }
  return {aNodes: a.nodes.length, bNodes: b.nodes.length, matched, sameToken: same, changedToken: matched - same, changedExamples: changed};
}
/// A walk nothing cut, main's against the branch's (fresh connections both): the same nodes in the same order, tokens too.
function noCutEqual(a, b) {
  const sig = n => `${n.token}|${n.role}|${n.depth}|${n.title ?? ''}`;
  let firstDiff = null;
  for (let i = 0; i < Math.max(a.nodes.length, b.nodes.length); i++) if (sig(a.nodes[i] ?? {}) !== sig(b.nodes[i] ?? {})) { firstDiff = i; break; }
  return {mainNodes: a.nodes.length, branchNodes: b.nodes.length, equal: firstDiff === null, firstDiff,
    at: firstDiff === null ? null : [a.nodes[firstDiff] && sig(a.nodes[firstDiff]), b.nodes[firstDiff] && sig(b.nodes[firstDiff])]};
}

// ---- one row -----------------------------------------------------------------------------------------------------
const results = [];
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));
let carried = null;  // the previous row's connections and last observations, for an adjacent row

async function measure(ctx, target, at, pageInfo) {
  const label = `${GROUP}/${target.name}/${at.name}`;
  const row = {label, target: target.name, pos: at.name, posIndex: at.index, pageInfo};
  let conns = null;
  try {
    const prev = at.adjacent && carried?.target === target.name ? carried : null;
    if (carried && !prev) { carried.conns.main.close(); carried.conns.branch.close(); carried = null; }
    conns = prev ? prev.conns : {main: await ctx.main.connect(), branch: await ctx.branch.connect()};
    const m1 = await observe(conns.main, ctx.pid, label, 'main');
    if (m1.error) { row.mainError = m1.error; return row; }
    const wf = m1.sky.window.frame;
    const window = [wf.x, wf.y, wf.width, wf.height];
    const gridFile = join(OUT, `grid-${fileName(label)}.json`);
    row.grid = await ctx.tool.ask({op: 'grid', pid: ctx.pid, window, step: STEP, out: gridFile});
    const points = JSON.parse(readFileSync(gridFile, 'utf8')).points;
    writeFileSync(`${gridFile}.gz`, gzipSync(readFileSync(gridFile))); spawnSync('rm', [gridFile]);
    const b1 = await observe(conns.branch, ctx.pid, label, 'branch');
    row.main = {rpcMs: m1.ms, ...summarize(m1.sky, points)};
    writeFileSync(join(OUT, `obs-${fileName(label)}-main.json.gz`), gzipSync(JSON.stringify(slim(m1.sky))));
    if (b1.error) row.branchError = b1.error;
    else {
      row.branch = {rpcMs: b1.ms, ...summarize(b1.sky, points)};
      writeFileSync(join(OUT, `obs-${fileName(label)}-branch.json.gz`), gzipSync(JSON.stringify(slim(b1.sky))));
      if (!m1.sky.truncated && !b1.sky.truncated && !prev) row.noCut = noCutEqual(m1.sky, b1.sky);
    }
    if (prev) {
      // Across a scroll of one screen: the previous row's last observations against these, on the same connections.
      const dy = pageInfo?.scrollY != null && prev.pageInfo?.scrollY != null ? pageInfo.scrollY - prev.pageInfo.scrollY
        : (prev.main.contentTopValue != null && contentTop(m1.sky) != null ? prev.main.contentTopValue - contentTop(m1.sky) : 0);
      row.adjacent = {dy, main: stability(prev.main.sky, m1.sky, dy), branch: b1.sky ? stability(prev.branch.sky, b1.sky, dy) : null};
      carried = null;
    } else {
      // At the same position, again on the same connections.
      const m2 = await observe(conns.main, ctx.pid, `${label}-again`, 'main');
      const b2 = await observe(conns.branch, ctx.pid, `${label}-again`, 'branch');
      row.samePosition = {main: m2.sky ? stability(m1.sky, m2.sky) : m2.error, branch: b1.sky && b2.sky ? stability(b1.sky, b2.sky) : b2.error ?? null};
      const next = positions(target)[at.index + 1];
      if (next?.adjacent && b2.sky && m2.sky) {
        carried = {target: target.name, conns, pageInfo, main: {sky: m2.sky, contentTopValue: contentTop(m2.sky)}, branch: {sky: b2.sky}};
        conns = null;
      }
    }
    if (row.main.widthOmitted || row.branch?.recordOnlyNodes || GROUP === 'safari') row.wide = await ctx.tool.ask({op: 'wide', pid: ctx.pid, window});
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 3000);
  } finally {
    // Connections handed on to the next (adjacent) row were cleared above; any others end with the row.
    if (conns) { conns.main.close(); conns.branch.close(); }
  }
  return row;
}
const pct = g => g ? `${g.checked}/${g.containerOnly}/${g.unrecorded}` : '-';
function line(r) {
  if (r.exception || r.mainError) return `PROBLEM ${JSON.stringify(r.mainError ?? '')} ${r.exception ?? ''}`;
  const part = (name, o) => !o ? `${name}: ${JSON.stringify(r[`${name}Error`] ?? 'none')}` :
    `${name}: fired=[${o.fired.join(',')}] nodes=${o.nodes} bytes=${o.bytes} walk=${o.walkMs}ms guard=${pct(o.guard)} (emulated ${pct(o.guardEmulated)}) record=${o.recordNodes} ` +
    `truncated=${JSON.stringify(o.truncated)} marker=${JSON.stringify(o.markerLine)} verdicts=${JSON.stringify(o.verdicts?.clickable)} underStrip=${JSON.stringify(o.verdicts?.underStripParent)} recordOnly=${o.recordOnlyNodes}`;
  const st = r.samePosition ? `same=${JSON.stringify({m: r.samePosition.main?.changedToken + '/' + r.samePosition.main?.matched, b: r.samePosition.branch?.changedToken + '/' + r.samePosition.branch?.matched})}` : '';
  const adj = r.adjacent ? `adjacent dy=${r.adjacent.dy} ${JSON.stringify({m: r.adjacent.main.changedToken + '/' + r.adjacent.main.matched, b: r.adjacent.branch?.changedToken + '/' + r.adjacent.branch?.matched})}` : '';
  const wide = r.wide?.wide?.length ? `wide=${JSON.stringify(r.wide.wide.map(w => ({n: w.children, vis: w.visibleChildren + w.visibleRows, brute: w.brute, bisected: w.bisected, missing: w.missing, extra: w.extra, ordered: `${w.orderedPairs}/${w.pairs}`, reads: w.bisectReads})))}` : '';
  return `page=${JSON.stringify(r.pageInfo)} grid=${r.grid?.points}pts\n    ${part('main', r.main)}\n    ${part('branch', r.branch)}\n    ${st}${adj} noCut=${JSON.stringify(r.noCut ? {equal: r.noCut.equal, n: [r.noCut.mainNodes, r.noCut.branchNodes], at: r.noCut.at} : null)} ${wide}`;
}

// ---- the apps ----------------------------------------------------------------------------------------------------
async function engineScroll(ctx, pages) {
  const w = await ctx.main.connect();
  try { const r = await w.execute('scroll', {pid: ctx.pid, direction: 'down', pages}); return r.error ? {error: r.error.data?.name ?? r.error.message} : {ok: true}; }
  finally { w.close(); }
}
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
    for (const at of positions(target)) {
      await cdp.eval(at.frac != null ? `window.scrollTo(0, ${at.frac} * (document.documentElement.scrollHeight - innerHeight) + ${at.plus ?? 0} * innerHeight)` : `window.scrollTo(0, ${at.screens} * innerHeight)`);
      await sleep(2500);
      const info = await cdp.eval(PAGE_INFO).catch(e => ({error: String(e)}));
      const row = await measure(ctx, target, at, info);
      results.push(row); save();
      log(`${row.label}: ${line(row)}`);
    }
  }
  child.kill('SIGTERM'); await sleep(2000); if (child.exitCode === null) child.kill('SIGKILL');
}
async function runScrolled(ctx, open, close) {
  for (const target of TARGETS) {
    if (ONLY && !ONLY.includes(target.name)) continue;
    const info = await open(target);
    let scrolled = 0;
    for (const at of positions(target)) {
      const scroll = [];
      while (scrolled < at.screens) { const step = Math.min(5, at.screens - scrolled); scroll.push(await engineScroll(ctx, step)); scrolled += step; await sleep(400); }
      await sleep(2000);
      const row = await measure(ctx, target, at, {...info, scrolledScreens: scrolled, scroll});
      results.push(row); save();
      log(`${row.label}: ${line(row)}`);
    }
    await close(target);
  }
}
const runSafari = ctx => runScrolled(ctx, async target => {
  osa('tell application "Safari" to quit'); await sleep(2000);
  sh('open', ['-a', 'Safari', urlOf(target)]);
  await sleep(target.local ? 6000 : 15000);
  ctx.pid = pidOf('Safari');
  place('Safari'); await sleep(2000);
  return {};
}, async () => { osa('tell application "Safari" to quit'); await sleep(1500); });
const runNative = ctx => runScrolled(ctx, async target => {
  const info = {};
  let proc;
  if (target.finder) {
    proc = 'Finder';
    sh('open', [target.finder]); await sleep(3000);
    info.listView = osa('tell application "Finder" to set current view of front Finder window to list view').status;
    await sleep(2000);
  } else {
    proc = 'TextEdit';
    const lines = [];
    for (let i = 1; i <= 20000; i++) lines.push(`Line ${i}: the quick brown fox jumps over the lazy dog, ${(i * 7919) % 10007}.`);
    const file = join(OUT, 'long.txt'); writeFileSync(file, lines.join('\n'));
    sh('open', ['-a', 'TextEdit', file]); await sleep(4000);
  }
  ctx.pid = pidOf(proc);
  info.place = place(proc).status; await sleep(1500);
  return info;
}, async target => { if (target.finder) osa('tell application "Finder" to close front Finder window'); else osa('tell application "TextEdit" to quit saving no'); });

const config = {
  group: GROUP, imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, runnerName: process.env.RUNNER_NAME ?? null,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), chrome: sh(CFT, ['--version']).out, safari: sh('defaults', ['read', '/Applications/Safari.app/Contents/Info', 'CFBundleShortVersionString']).out,
  mainCommit: process.env.P299_MAIN_COMMIT ?? null, branchCommit: process.env.P299_BRANCH_COMMIT ?? null, probeCommit: process.env.GITHUB_SHA ?? null, rep: process.env.P299_REP ?? null, step: STEP, window: WIN,
};
const tool = startTool();
config.screen = await tool.ask({op: 'screen'});
log('config', JSON.stringify(config));
const ctx = {tool, main: await startEngine(MAIN, 'main'), branch: await startEngine(BRANCH, 'branch')};
try {
  if (GROUP.startsWith('chrome')) await runChrome(ctx);
  else if (GROUP === 'safari') await runSafari(ctx);
  else await runNative(ctx);
} catch (e) {
  config.exception = String(e?.stack || e).slice(0, 3000);
  log('exception', config.exception);
}
if (carried) { carried.conns.main.close(); carried.conns.branch.close(); }
for (const e of [ctx.main, ctx.branch]) { config[`${e.name}Stderr`] = e.stderr().slice(-3000); if (e.child.exitCode === null) e.child.kill('SIGKILL'); }
save();
tool.stop();
server.close();
process.exit(0);
