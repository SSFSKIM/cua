// #299's measurement on a GitHub-hosted macOS runner: how often real, large pages and apps cut the engine's observation,
// which limit cuts it, and what share of a window's clickable area #296's stale-point guard then leaves unchecked.
// origin/main's engine (`--engine`) and the same engine with its node, byte and deadline budgets raised (`--wide`, built
// by the workflow) each observe every target at each scroll position; scripts/probe-299/tool.swift hit-tests a 20 pt grid
// over the window; classify.mjs reads each point as the guard would over each engine's own observation. The tool then
// prices a geometry-only walk of the window's visible part and a click-time point-directed descent. No click is posted.
//   node scripts/probe-299/run.mjs --group <chrome-a|chrome-b|safari|native> --engine <bin> --wide <bin> --tool <bin> --out <dir>
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {gzipSync} from 'node:zlib';
import {record, classify, treeStats} from './classify.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-299: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), ENGINE = arg('engine'), WIDE = arg('wide'), TOOL = arg('tool'), GROUP = arg('group');
const ONLY = arg('targets') ? arg('targets').split(',').filter(Boolean) : null;
if (!OUT || !ENGINE || !WIDE || !TOOL || !GROUP) { console.error('usage: run.mjs --group <g> --engine <bin> --wide <bin> --tool <bin> --out <dir>'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-299:', ...a);
const STEP = 20;
const WIN = {x: 0, y: 40, w: 1024, h: 728};  // the hosted runner's one screen is 1024 x 768
const GH = ['https://', 'git', 'hub.com'].join('');

// ---- the targets -------------------------------------------------------------------------------------------------
const TARGETS = {
  'chrome-a': [
    {name: 'wiki-article', url: 'https://en.wikipedia.org/wiki/United_States', deep: true},
    {name: 'wiki-table', url: 'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population', deep: true},
    {name: 'local-table', local: 'table', deep: true},
  ],
  'chrome-b': [
    {name: 'hn-front', url: 'https://news.ycombinator.com/news'},
    {name: 'hn-thread', url: 'https://news.ycombinator.com/item?id=13541679', deep: true},
    {name: 'gh-issues', url: `${GH}/microsoft/vscode/issues`},
    {name: 'gh-tree', url: `${GH}/torvalds/linux`},
    {name: 'gh-blob', url: `${GH}/torvalds/linux/blob/master/kernel/sched/core.c`, deep: true},
  ],
  safari: [
    {name: 'wiki-article', url: 'https://en.wikipedia.org/wiki/United_States', deep: true},
    {name: 'hn-thread', url: 'https://news.ycombinator.com/item?id=13541679'},
    {name: 'local-table', local: 'table'},
  ],
  native: [
    {name: 'finder-frameworks', finder: '/System/Library/PrivateFrameworks'},
    {name: 'textedit-long', textedit: true},
  ],
}[GROUP];
if (!TARGETS) { console.error(`unknown group ${GROUP}`); process.exit(2); }
// The top and a screen or two down; on a long target also well past where the walk's node budget cuts (#299's first
// run, 42201089541: at ten screens every Chrome target was still inside the first 4,000 nodes), by page fraction where
// Chrome scrolls by script and by screens where the engine scrolls.
const positions = t => [{name: 'top', screens: 0}, {name: 's1', screens: 1}, {name: 's2', screens: 2},
  ...(!t.deep ? [] : GROUP.startsWith('chrome') ? [{name: 'f25', frac: 0.25}, {name: 'f50', frac: 0.5}, {name: 'f90', frac: 0.9}]
    : [{name: 'd20', screens: 20}, {name: 'd60', screens: 60}])].map((p, index) => ({...p, index}));

// The local table: 3,000 rows of six cells, each row with a link and a button.
const TABLE = (() => {
  const rows = [];
  for (let i = 1; i <= 3000; i++) rows.push(`<tr><td>${i}</td><td><a href="#r${i}">Row ${i}</a></td><td>Name ${i}</td><td>${(i * 7919) % 10007}</td><td>Item ${i % 97}</td><td><button>Act ${i}</button></td></tr>`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe299 table</title><style>body{font:14px sans-serif}td{padding:2px 8px;border-bottom:1px solid #ddd}</style></head>
<body><h1>probe299 table</h1><table><thead><tr><th>#</th><th>Link</th><th>Name</th><th>Value</th><th>Group</th><th>Action</th></tr></thead><tbody>${rows.join('')}</tbody></table></body></html>`;
})();
const server = createServer((req, res) => { res.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); res.end(TABLE); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const LOCAL = `http://127.0.0.1:${server.address().port}/`;
const urlOf = t => t.local ? LOCAL : t.url;

// ---- the engine's wire, the shell, the tool -----------------------------------------------------------------------
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
  call(method, params = {}, timeout = 200_000) {
    const id = this.id++;
    const bytes = Buffer.from(JSON.stringify({jsonrpc: '2.0', id, method, params}), 'utf8');
    const head = Buffer.alloc(4); head.writeUInt32LE(bytes.length, 0);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method}: no answer in ${timeout} ms`)); }, timeout);
      this.pending.set(id, m => { clearTimeout(t); resolve(m); });
      this.s.write(Buffer.concat([head, bytes]));
    });
  }
  execute(method, args) { return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + 180_000}); }
  close() { this.s.destroy(); }
}
const sh = (cmd, args, timeout = 20_000) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = script => sh('osascript', ['-e', script]);
const pidOf = name => Number(sh('pgrep', ['-x', name]).out.split('\n')[0]) || null;
const place = proc => osa(`tell application "System Events"\ntell process "${proc}"\nset position of window 1 to {${WIN.x}, ${WIN.y}}\nset size of window 1 to {${WIN.w}, ${WIN.h}}\nend tell\nend tell`);

async function startEngine(bin, name) {
  const dir = join(OUT, `sock-${name}`); mkdirSync(dir, {recursive: true, mode: 0o700});
  const socket = join(dir, `${name}.sock`);
  const child = spawn(bin, [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.on('data', d => { stderr = (stderr + d).slice(-20_000); });
  child.stdout.on('data', () => {});
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null) throw new Error(`engine ${name} exited ${child.exitCode}: ${stderr.slice(0, 2000)}`);
    try {
      const wire = await Wire.connect(socket);
      const ping = await wire.call('ping', {clientApiVersion: 'cua-engine-1', desktop: 'dedicated'});
      return {name, child, wire, ping: ping.result ?? ping.error, stderr: () => stderr};
    } catch { await sleep(50); }
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

// ---- Chrome over CDP (navigation and scrolling only) -------------------------------------------------------------
// Over --remote-debugging-pipe (fd 3 in, fd 4 out, NUL-separated JSON), attached flat to the page target.
class Cdp {
  static async open(child) {
    const cdp = new Cdp(child.stdio[3], child.stdio[4]);
    for (let i = 0; i < 60; i++) {
      const r = await cdp.send('Target.getTargets', {}, null).catch(() => null);
      const page = r?.result?.targetInfos?.find(t => t.type === 'page');
      if (page) {
        const a = await cdp.send('Target.attachToTarget', {targetId: page.targetId, flatten: true}, null);
        cdp.session = a.result.sessionId;
        return cdp;
      }
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
const PAGE_INFO = '({scrollY: Math.round(scrollY), innerHeight, scrollHeight: document.documentElement.scrollHeight, readyState: document.readyState, title: document.title.slice(0, 80)})';

// ---- one measurement ---------------------------------------------------------------------------------------------
const slimNode = n => [n.depth, n.role, n.frame ? [n.frame.x, n.frame.y, n.frame.width, n.frame.height] : null, n.children,
  n.shown ? [n.shown.count, n.shown.of, n.shown.subset] : null, (n.actions ?? []).filter(a => /ByPage$/.test(a)), (n.title ?? n.description ?? '').slice(0, 30)];
const fileName = s => s.replace(/[^a-z0-9-]+/gi, '_');

async function observe(engine, pid, label) {
  const shots = join(OUT, 'shots', fileName(`${label}-${engine.name}`)); mkdirSync(shots, {recursive: true});
  const from = Date.now();
  const r = await engine.wire.execute('get_app_state', {pid, includeScreenshot: true, outputDirectory: shots});
  const ms = Date.now() - from;
  if (r.error) return {error: {name: r.error.data?.name ?? r.error.name, message: String(r.error.message ?? '').slice(0, 400)}, ms};
  return {sky: r.result, ms};
}
function summarize(sky) {
  const t = sky.timings ?? {};
  const stops = ['nodeCapHit', 'budgetHit', 'deadlineHit'].filter(k => t[k]).map(k => ({nodeCapHit: 'nodeCap', budgetHit: 'bytes', deadlineHit: 'deadline'})[k]);
  const {recs, anomalies} = record(sky.nodes, stops);
  const stats = treeStats(sky.nodes, recs);
  const fired = [...stops];
  if (sky.truncated?.depth) fired.push('depth');
  if (stats.widthVisible) fired.push(`width-visible×${stats.widthVisible}`);
  if (stats.widthOmitted) fired.push(`width-omitted×${stats.widthOmitted}`);
  if (t.fetchFailures) fired.push(`failures×${t.fetchFailures}`);
  // Where the content lies (a scroll check that needs no page script): the web area, or the first scroll area, and the
  // topmost frame among its first 300 descendants; and the walk's last node (where a global cut fell).
  const host = sky.nodes.findIndex(n => n.role === 'AXWebArea') >= 0 ? sky.nodes.findIndex(n => n.role === 'AXWebArea') : sky.nodes.findIndex(n => n.role === 'AXScrollArea');
  let contentTop = null;
  if (host >= 0) for (let j = host + 1; j < Math.min(sky.nodes.length, host + 300) && sky.nodes[j].depth > sky.nodes[host].depth; j++) {
    const f = sky.nodes[j].frame; if (f && f.height > 1 && (contentTop === null || f.y < contentTop)) contentTop = Math.round(f.y);
  }
  const last = sky.nodes[sky.nodes.length - 1];
  return {recs, stops, summary: {fired, truncated: sky.truncated, ...stats, anomalies, menuBarNodes: sky.menuBar?.length ?? 0,
    host: host >= 0 ? {role: sky.nodes[host].role, frame: sky.nodes[host].frame, contentTop} : null, lastNode: last && {role: last.role, depth: last.depth, frame: last.frame},
    walkMs: t.walkMs, totalMs: t.totalMs, estimatedBytes: t.estimatedBytes, nodesTiming: t.nodes, fetchFailures: t.fetchFailures,
    stalePointRecordMs: t.stalePointRecordMs, window: sky.window?.frame, timings: t}};
}
const results = [];
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));

async function measure(ctx, target, at, pageInfo) {
  const pos = at.name;
  const label = `${GROUP}/${target.name}/${pos}`;
  const row = {label, target: target.name, pos, posIndex: at.index, pageInfo};
  try {
    const obs = {};
    const main = await observe(ctx.main, ctx.pid, label);
    if (main.error) { row.mainError = main.error; return row; }
    const wf = main.sky.window.frame;
    const window = [wf.x, wf.y, wf.width, wf.height];
    const gridFile = join(OUT, `grid-${fileName(label)}.json`);
    row.grid = await ctx.tool.ask({op: 'grid', pid: ctx.pid, window, step: STEP, out: gridFile});
    const wide = await observe(ctx.wide, ctx.pid, label);
    const points = JSON.parse(readFileSync(gridFile, 'utf8')).points;
    writeFileSync(`${gridFile}.gz`, gzipSync(readFileSync(gridFile))); spawnSync('rm', [gridFile]);
    for (const [name, o] of [['main', main], ['wide', wide]]) {
      if (o.error) { obs[name] = {error: o.error, ms: o.ms}; continue; }
      const s = summarize(o.sky);
      const c = classify(s.recs, points);
      obs[name] = {rpcMs: o.ms, ...s.summary, guard: {all: c.all, clickable: c.clickable, containerOnlyReasons: c.containerOnlyReasons,
        containerOnlyRoles: c.containerOnlyRoles, missedClickable: c.missedClickable, noHit: c.noHit, otherWindow: c.otherWindow}};
      if (name === 'main') obs.main.containerOnlyClickablePoints = c.containerOnlyClickablePoints.length;
      if (name === 'main') row.descendPoints = c.containerOnlyClickablePoints;
      writeFileSync(join(OUT, `obs-${fileName(label)}-${name}.json.gz`), gzipSync(JSON.stringify({window: o.sky.window, truncated: o.sky.truncated,
        timings: o.sky.timings, nodes: o.sky.nodes.map(slimNode)})));
    }
    row.obs = obs;
    row.vwalk = await ctx.tool.ask({op: 'vwalk', pid: ctx.pid, window, prune: true, cap: 200_000, deadlineMs: 60_000});
    if (pos === 'top') row.fullWalk = await ctx.tool.ask({op: 'vwalk', pid: ctx.pid, window, prune: false, cap: 150_000, deadlineMs: 90_000});
    // The descent at up to 15 of main's container-only clickable points (else 15 spread grid points).
    let pts = row.descendPoints ?? [];
    if (pts.length > 15) pts = Array.from({length: 15}, (_, i) => pts[Math.floor(i * pts.length / 15)]);
    if (!pts.length) pts = Array.from({length: 15}, (_, i) => points[Math.floor((i + 0.5) * points.length / 15)]).map(p => [p.x, p.y]);
    row.descend = await ctx.tool.ask({op: 'descend', pid: ctx.pid, window, points: pts});
    delete row.descendPoints;
    if (row.descend.rows) row.descend.rows = row.descend.rows.map(r => [r.ms, r.levels, r.childReads, r.role]);
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 3000);
  }
  return row;
}
const pct = v => v == null ? '-' : `${v}%`;
function line(r) {
  if (r.exception || r.mainError) return `PROBLEM ${JSON.stringify(r.mainError ?? '')} ${r.exception ?? ''}`;
  const part = name => {
    const o = r.obs?.[name];
    if (!o) return `${name}: none`;
    if (o.error) return `${name}: ERROR ${o.error.name} ${o.error.message?.slice(0, 120)}`;
    const g = o.guard.clickable;
    return `${name}: fired=[${o.fired.join(',')}] nodes=${o.nodes} depth=${o.maxDepth} bytes=${o.estimatedBytes} walk=${o.walkMs}ms incomplete=${o.incomplete} ` +
      `clickable n=${g.n} checked=${pct(g.checked)} containerOnly=${pct(g.containerOnly)} unrecorded=${pct(g.unrecorded)} reasons=${JSON.stringify(o.guard.containerOnlyReasons)} missed=${o.guard.missedClickable}`;
  };
  return `page=${JSON.stringify(r.pageInfo)} grid=${r.grid?.points}pts/${r.grid?.ms}ms\n    ${part('main')}\n    ${part('wide')}\n    vwalk=${JSON.stringify(r.vwalk)} full=${JSON.stringify(r.fullWalk ?? null)} descend p50=${r.descend?.p50} p95=${r.descend?.p95}`;
}

// ---- the apps ----------------------------------------------------------------------------------------------------
async function engineScroll(ctx, pages) {
  const r = await ctx.main.wire.execute('scroll', {pid: ctx.pid, direction: 'down', pages});
  return r.error ? {error: r.error.data?.name ?? r.error.message} : {ok: true};
}
async function runChrome(ctx) {
  const child = spawn(CFT, [`--user-data-dir=${join(OUT, 'chrome-profile')}`, '--no-first-run', '--no-default-browser-check',
    '--disable-search-engine-choice-screen', '--lang=en-US', '--disable-features=Translate', '--remote-debugging-pipe',
    `--window-position=${WIN.x},${WIN.y}`, `--window-size=${WIN.w},${WIN.h}`, 'about:blank'], {stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe']});
  const launchedAt = Date.now();
  ctx.pid = child.pid;
  const cdp = await Cdp.open(child);
  config.chromePid = child.pid;
  for (const target of TARGETS) {
    if (ONLY && !ONLY.includes(target.name)) continue;
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', {url: urlOf(target)});
    for (let i = 0; i < 90; i++) { await sleep(500); if ((await cdp.eval('document.readyState').catch(() => null)) === 'complete') break; }
    await sleep(5000);
    const left = launchedAt + 25_000 - Date.now(); if (left > 0) await sleep(left);  // past Chrome for Testing's toolbar re-layout
    for (const pos of positions(target)) {
      await cdp.eval(pos.frac != null ? `window.scrollTo(0, ${pos.frac} * (document.documentElement.scrollHeight - innerHeight))` : `window.scrollTo(0, ${pos.screens} * innerHeight)`);
      await sleep(2500);
      const info = await cdp.eval(PAGE_INFO).catch(e => ({error: String(e)}));
      const row = await measure(ctx, target, pos, info);
      results.push(row); save();
      log(`${row.label}: ${line(row)}`);
    }
  }
  child.kill('SIGTERM'); await sleep(2000); if (child.exitCode === null) child.kill('SIGKILL');
}
async function runSafari(ctx) {
  for (const target of TARGETS) {
    if (ONLY && !ONLY.includes(target.name)) continue;
    osa('tell application "Safari" to quit'); await sleep(2000);
    sh('open', ['-a', 'Safari', urlOf(target)]);
    await sleep(target.local ? 6000 : 15000);
    ctx.pid = pidOf('Safari');
    place('Safari'); await sleep(2000);
    let scrolled = 0;
    for (const pos of positions(target)) {
      const scroll = [];
      while (scrolled < pos.screens) { const step = Math.min(5, pos.screens - scrolled); scroll.push(await engineScroll(ctx, step)); scrolled += step; await sleep(400); }
      await sleep(2000);
      const row = await measure(ctx, target, pos, {safariTitle: osa('tell application "Safari" to get name of current tab of window 1').out, scroll});
      results.push(row); save();
      log(`${row.label}: ${line(row)}`);
    }
  }
  osa('tell application "Safari" to quit');
}
async function runNative(ctx) {
  for (const target of TARGETS) {
    if (ONLY && !ONLY.includes(target.name)) continue;
    let proc, info = {};
    if (target.finder) {
      proc = 'Finder';
      sh('open', [target.finder]); await sleep(3000);
      info.listView = osa('tell application "Finder" to set current view of front Finder window to list view');
      await sleep(2000);
    } else {
      proc = 'TextEdit';
      const lines = [];
      for (let i = 1; i <= 20000; i++) lines.push(`Line ${i}: the quick brown fox jumps over the lazy dog, ${(i * 7919) % 10007}.`);
      const file = join(OUT, 'long.txt'); writeFileSync(file, lines.join('\n'));
      sh('open', ['-a', 'TextEdit', file]); await sleep(4000);
    }
    ctx.pid = pidOf(proc);
    info.place = place(proc); await sleep(1500);
    let scrolled = 0;
    for (const pos of positions(target)) {
      const scroll = [];
      while (scrolled < pos.screens) { const step = Math.min(5, pos.screens - scrolled); scroll.push(await engineScroll(ctx, step)); scrolled += step; await sleep(400); }
      await sleep(1500);
      const row = await measure(ctx, target, pos, {...info, scroll});
      results.push(row); save();
      log(`${row.label}: ${line(row)}`);
    }
    if (target.finder) osa('tell application "Finder" to close front Finder window');
    else osa('tell application "TextEdit" to quit saving no');
  }
}

const config = {
  group: GROUP, imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, runnerName: process.env.RUNNER_NAME ?? null,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), chrome: sh(CFT, ['--version']).out, safari: sh('defaults', ['read', '/Applications/Safari.app/Contents/Info', 'CFBundleShortVersionString']).out,
  engineCommit: process.env.P299_MAIN_COMMIT ?? null, probeCommit: process.env.GITHUB_SHA ?? null, rep: process.env.P299_REP ?? null, step: STEP, window: WIN,
};
const tool = startTool();
config.screen = await tool.ask({op: 'screen'});
log('config', JSON.stringify(config));
const ctx = {tool, main: await startEngine(ENGINE, 'main'), wide: await startEngine(WIDE, 'wide')};
config.ping = {main: ctx.main.ping, wide: ctx.wide.ping};
try {
  if (GROUP.startsWith('chrome')) await runChrome(ctx);
  else if (GROUP === 'safari') await runSafari(ctx);
  else await runNative(ctx);
} catch (e) {
  config.exception = String(e?.stack || e).slice(0, 3000);
  log('exception', config.exception);
}
save();
for (const e of [ctx.main, ctx.wide]) { config[`${e.name}Stderr`] = e.stderr().slice(-3000); try { await e.wire.call('shutdown', {}, 5000); } catch {} e.wire.close(); if (e.child.exitCode === null) e.child.kill('SIGKILL'); }
save();
tool.stop();
server.close();
process.exit(0);
