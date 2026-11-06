// #296's false-positive spike on a GitHub-hosted macOS runner: the stale-point guard emulated outside the engine.
// origin/main's engine (a child of the job shell, with its Accessibility, PostEvent and Screen Recording grants) observes
// with a screenshot; the deepest node of that observation whose frame holds the click point is the guard's recorded
// node; scripts/probe-296/tool.swift finds its handle at once, and at click time runs the guard (hit-test, frame
// re-read, identity, verdict); the engine then posts the click anyway, and the click's real effect (the page's click
// beacon, the native app's log, Reload's GET) says whether the verdict was right. TextEdit stays frontmost.
//   --group chrome   Chrome for Testing: its toolbar's Reload (#294's re-layout, a fresh Chrome per cell; shared and
//                    dedicated), then the dynamic pages in dedicated mode (one Chrome, observed 25 s after launch), and
//                    two shared-mode pages as the control that #282 element-routes them (no guard there)
//   --group safari   the dynamic pages in Safari, shared mode (a non-Chromium web view: posted, so guarded)
//   --group native   scripts/probe-296/app.swift's AppKit window, shared and dedicated mode
// Each case runs at 1 s, 5 s and 20 s between the observation and the click.
//   node scripts/probe-296/live.mjs --group <g> --engine <cua-engine> --tool <tool> --app <Probe296 binary> --out <dir> [--cells <prefix,…>]
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-296 live: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), ENGINE = arg('engine'), TOOL = arg('tool'), APP = arg('app'), GROUP = arg('group');
const ONLY = arg('cells') ? arg('cells').split(',').filter(Boolean) : null;
if (!OUT || !ENGINE || !TOOL || !GROUP) { console.error('usage: live.mjs --group <g> --engine <bin> --tool <bin> --app <bin> --out <dir>'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-296 live:', ...a);
const DELAYS = [1, 5, 20];

// ---- the pages -------------------------------------------------------------------------------------------------
const BODY = {
  toolbar: `<p><b>probe296 toolbar</b></p><p>Plain status text here</p>`,
  static: `<p><button id="static" class="p296-static">Static</button></p>`,
  pulse: `<p style="margin:40px"><button id="pulse" class="p296-pulse">Pulse</button></p>`,
  rotate: `<p style="margin:60px"><button id="rotate" class="p296-rotate">Rotate</button></p>`,
  spinner: `<p><span class="spinner"></span> <button id="beside" class="p296-beside">Beside</button></p>`,
  counter: `<p><span id="counter" class="g"></span> <button id="nextto" class="p296-nextto">Next to</button></p>`,
  label: `<p><button id="label" class="p296-label g">Elapsed 0.0 s</button></p>`,
  feed: `<div id="feedbox" class="p296-feedbox"></div>`,
  scroll: `<div id="scrollbox" class="p296-scrollbox"></div>`,
  recreate: `<p id="wrap"></p>`,
  swap: `<p><button id="save" class="p296-save fixed">Save</button></p>`,
  swaprole: `<p><button id="keep" class="p296-keep fixed">Keep</button></p>`,
};
const page = c => `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe296 ${c}</title>
<style>body{margin:8px;font:14px sans-serif}button{font:14px sans-serif;padding:6px 12px}.g{font-family:Georgia,serif}
.fixed{width:120px;height:32px;padding:0}a.fixed{display:inline-block;line-height:32px;text-align:center;border:1px solid #888;color:#000;text-decoration:none}
@keyframes pulse{0%{transform:scale(.9)}50%{transform:scale(1.1)}100%{transform:scale(.9)}}#pulse{animation:pulse 1s infinite}
@keyframes spin{to{transform:rotate(360deg)}}#rotate{animation:spin 4s linear infinite}
.spinner{display:inline-block;width:24px;height:24px;border:3px solid #ccc;border-top-color:#333;border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle}
#feedbox{height:330px;width:300px;overflow:hidden;border:1px solid #888}#scrollbox{height:240px;width:300px;overflow:auto;border:1px solid #888}
.item,.row{display:block;width:270px;height:28px;margin:2px;padding:0}</style></head>
<body><p><b>probe296 ${c}</b></p>${BODY[c]}
<script>(() => {
const P = new URLSearchParams(location.search), CASE = P.get('case'), K = P.get('k');
const send = (ev, extra) => navigator.sendBeacon('/b', JSON.stringify({ev, k: K, case: CASE, t: Date.now(), ...extra}));
document.addEventListener('click', e => { const t = e.target.closest('[id]'); send('click', {id: t ? t.id : null, gen: t && t.dataset.gen, sx: e.screenX, sy: e.screenY, trusted: e.isTrusted}); e.preventDefault(); }, true);
const $ = id => document.getElementById(id);
const mk = (tag, id, text, cls) => { const e = document.createElement(tag); e.id = id; e.textContent = text; e.className = cls; return e; };
if (CASE === 'counter') setInterval(() => { $('counter').textContent = (performance.now() / 1000).toFixed(1); }, 100);
if (CASE === 'label') setInterval(() => { $('label').textContent = 'Elapsed ' + (performance.now() / 1000).toFixed(1) + ' s'; }, 100);
if (CASE === 'recreate') { let gen = 0; const make = () => { const b = mk('button', 'again', 'Again', 'p296-again'); b.dataset.gen = ++gen; $('wrap').replaceChildren(b); }; make(); setInterval(make, 500); }
if (CASE === 'feed') { let n = 0; const add = () => { n += 1; $('feedbox').prepend(mk('button', 'item-' + n, 'Item ' + n, 'item p296-item p296-item-' + n)); return n; };
  for (let i = 0; i < 10; i++) add(); setInterval(() => send('prepend', {n: add()}), 2000); }
if (CASE === 'scroll') { for (let i = 1; i <= 40; i++) $('scrollbox').append(mk('button', 'row-' + i, 'Row ' + i, 'row p296-row p296-row-' + i)); $('scrollbox').scrollTop = 300; }
const run = c => {
  if (c.op === 'nav') location.href = '/?case=' + c.case + '&k=' + c.k;
  else if (c.op === 'scroll') { $('scrollbox').scrollTop += c.by; send('scrolled', {top: $('scrollbox').scrollTop}); }
  else if (c.op === 'swap') { $('save').replaceWith(mk('button', 'delete', 'Delete', 'p296-delete fixed')); send('swapped'); }
  else if (c.op === 'swaprole') { const a = mk('a', 'remove', 'Remove', 'p296-remove fixed'); a.href = '#'; $('keep').replaceWith(a); send('swapped'); }
};
setInterval(async () => { try { const r = await fetch('/cmd'); for (const c of await r.json()) run(c); } catch {} }, 100);
addEventListener('load', () => send('load')); })();</script></body></html>`;

let beacons = [], loads = 0, commands = [];
const server = createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
    loads += 1;
    const c = new URL(req.url, 'http://x').searchParams.get('case') ?? 'toolbar';
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}); res.end(page(BODY[c] ? c : 'toolbar')); return;
  }
  if (req.method === 'GET' && req.url === '/cmd') { const out = commands; commands = []; res.writeHead(200, {'content-type': 'application/json', 'cache-control': 'no-store'}); res.end(JSON.stringify(out)); return; }
  if (req.method === 'GET') { res.writeHead(404); res.end(); return; }
  let body = '';
  req.on('data', d => { body += d; if (body.length > 65536) req.destroy(); });
  req.on('end', () => { try { beacons.push({arrive: Date.now(), ...JSON.parse(body)}); } catch {} res.writeHead(204); res.end(); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;

// ---- the engine's wire, the shell, the guard tool ----------------------------------------------------------------
class Wire {
  static connect(path) {
    return new Promise((resolve, reject) => {
      const s = createConnection(path);
      s.once('connect', () => { s.off('error', reject); resolve(new Wire(s)); });
      s.once('error', reject);
    });
  }
  constructor(s) {
    this.s = s; this.buf = Buffer.alloc(0); this.pending = new Map(); this.id = 1;
    s.on('data', d => {
      this.buf = Buffer.concat([this.buf, d]);
      while (this.buf.length >= 4) {
        const n = this.buf.readUInt32LE(0);
        if (this.buf.length < 4 + n) break;
        const msg = JSON.parse(this.buf.subarray(4, 4 + n).toString('utf8'));
        this.buf = this.buf.subarray(4 + n);
        this.pending.get(msg.id)?.(msg); this.pending.delete(msg.id);
      }
    });
    s.on('error', () => {});
  }
  call(method, params = {}, timeout = 90_000) {
    const id = this.id++;
    const bytes = Buffer.from(JSON.stringify({jsonrpc: '2.0', id, method, params}), 'utf8');
    const head = Buffer.alloc(4); head.writeUInt32LE(bytes.length, 0);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method}: no answer in ${timeout} ms`)); }, timeout);
      this.pending.set(id, m => { clearTimeout(t); resolve(m); });
      this.s.write(Buffer.concat([head, bytes]));
    });
  }
  execute(method, args, extra = {}) { return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + 80_000, ...extra}); }
  close() { this.s.destroy(); }
}
const sh = (cmd, args) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout: 20_000}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = script => sh('osascript', ['-e', script]);
const fileName = label => label.replace(/[^a-z0-9-]+/gi, '_');
const frontmost = () => {
  const asn = sh('lsappinfo', ['front']).out;
  const info = sh('lsappinfo', ['info', '-only', 'bundleid', asn]).out;
  return (info.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] || info || null;
};
const pidOf = name => Number(sh('pgrep', ['-x', name]).out.split('\n')[0]) || null;
const lean = response => JSON.parse(JSON.stringify(response, (k, v) => (k === 'nodes' || k === 'menuBar' ? `[${Array.isArray(v) ? v.length : '?'} omitted]` : v)));

// The guard tool as a line server: each request answers with one JSON line.
function guardTool(pid) {
  const child = spawn(TOOL, ['guard', String(pid)], {stdio: ['pipe', 'pipe', 'pipe']});
  const lines = createInterface({input: child.stdout});
  const waiting = [];
  lines.on('line', l => { const w = waiting.shift(); if (w) { try { w(JSON.parse(l)); } catch { w({error: `bad answer ${l.slice(0, 200)}`}); } } });
  child.on('close', () => { for (const w of waiting.splice(0)) w({error: 'tool exited'}); });
  return {
    ask: (o, timeout = 30_000) => new Promise(resolve => {
      const t = setTimeout(() => resolve({error: 'tool timeout'}), timeout);
      waiting.push(v => { clearTimeout(t); resolve(v); });
      child.stdin.write(JSON.stringify(o) + '\n');
    }),
    stop: () => { child.stdin.end(); setTimeout(() => child.kill('SIGKILL'), 1000); },
  };
}

const TEXT_DOC = join(OUT, 'front.txt');
writeFileSync(TEXT_DOC, 'TextEdit is the frontmost window.\n');
async function frontTextEdit() {
  for (let i = 0; i < 4; i++) {
    if (frontmost() === 'com.apple.TextEdit') break;
    sh('open', ['-a', 'TextEdit', TEXT_DOC]);
    await sleep(1500);
  }
  osa('tell application "System Events"\ntell process "TextEdit"\nset position of window 1 to {0, 40}\nset size of window 1 to {380, 300}\nend tell\nend tell');
  return frontmost();
}
async function startEngine(label) {
  const dir = join(OUT, 'sock');
  mkdirSync(dir, {recursive: true, mode: 0o700});
  const socket = join(dir, `${fileName(label).slice(-60)}.sock`);
  const child = spawn(ENGINE, [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  child.stdout.on('data', () => {});
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null) throw new Error(`engine exited ${child.exitCode}: ${stderr.slice(0, 2000)}`);
    try { return {child, wire: await Wire.connect(socket), stderr: () => stderr}; } catch { await sleep(50); }
  }
  throw new Error(`engine did not listen: ${stderr.slice(0, 2000)}`);
}
async function observe(w, pid, label) {
  const shots = join(OUT, `shots-${fileName(label)}`); mkdirSync(shots, {recursive: true});
  const from = Date.now();
  const state = await w.execute('get_app_state', {pid, includeScreenshot: true, outputDirectory: shots});
  const at = Date.now();
  if (state.error) throw new Error(`get_app_state: ${JSON.stringify(state.error).slice(0, 500)}`);
  return {sky: state.result, at, ms: at - from};
}

// ---- the targets and the guard's recorded node -------------------------------------------------------------------
const centre = f => ({x: f.x + f.width / 2, y: f.y + f.height / 2});
const holds = (f, p) => f && f.width > 0 && f.height > 0 && p.x >= f.x && p.x <= f.x + f.width && p.y >= f.y && p.y <= f.y + f.height;
const hasClass = (n, c) => Array.isArray(n.domClassList) && n.domClassList.includes(c);
const findReload = sky => sky.nodes.find(n => n.role === 'AXButton' && /reload/i.test(`${n.title ?? ''} ${n.description ?? ''} ${n.help ?? ''}`));
function findTarget(sky, spec) {
  const nodes = sky.nodes;
  if (spec.kind === 'toolbar') return findReload(sky);
  if (spec.kind === 'native') return nodes.find(n => n.identifier === spec.id && n.role === 'AXButton');
  if (spec.case === 'feed') {
    const box = nodes.find(n => hasClass(n, 'p296-feedbox'));
    const items = nodes.filter(n => hasClass(n, 'p296-item') && n.frame && box?.frame && n.frame.y >= box.frame.y - 1).sort((a, b) => a.frame.y - b.frame.y);
    return items[2];
  }
  if (spec.case === 'scroll') {
    const box = nodes.find(n => hasClass(n, 'p296-scrollbox'));
    if (!box?.frame) return null;
    const mid = box.frame.y + box.frame.height / 2;
    const rows = nodes.filter(n => hasClass(n, 'p296-row') && n.frame && n.frame.y >= box.frame.y && n.frame.y + n.frame.height <= box.frame.y + box.frame.height);
    return rows.sort((a, b) => Math.abs(centre(a.frame).y - mid) - Math.abs(centre(b.frame).y - mid))[0];
  }
  return nodes.find(n => hasClass(n, `p296-${spec.id}`)) ?? nodes.find(n => n.role === 'AXButton' && (n.title === spec.text || n.description === spec.text));
}
const targetId = (n, spec) => spec.kind === 'native' ? n.identifier : spec.kind === 'toolbar' ? 'reload'
  : (n.domClassList ?? []).find(c => /^p296-(item|row)-\d+$/.test(c))?.replace(/^p296-/, '') ?? spec.id;
// The deepest node of the observation whose frame holds the point (the later one in the walk's order on a tie).
function deepest(sky, p) {
  let best = null;
  for (const n of sky.nodes) if (holds(n.frame, p) && (!best || n.depth >= best.depth)) best = n;
  return best;
}
const slim = n => n && {role: n.role, subrole: n.subrole, title: n.title, description: n.description, identifier: n.identifier, classes: n.domClassList, depth: n.depth, frame: n.frame, token: n.token};

// ---- the cells ---------------------------------------------------------------------------------------------------
const WEB = [
  {case: 'static', id: 'static', text: 'Static'},
  {case: 'pulse', id: 'pulse', text: 'Pulse'},
  {case: 'rotate', id: 'rotate', text: 'Rotate'},
  {case: 'spinner', id: 'beside', text: 'Beside'},
  {case: 'counter', id: 'nextto', text: 'Next to'},
  {case: 'label', id: 'label'},
  {case: 'feed', name: 'feed'},
  {case: 'scroll', name: 'scroll-moved', mid: {op: 'scroll', by: 90}},
  {case: 'scroll', name: 'scroll-still'},
  {case: 'recreate', id: 'again', text: 'Again', anyGen: true},
  {case: 'swap', id: 'save', text: 'Save', mid: {op: 'swap'}},
  {case: 'swaprole', id: 'keep', text: 'Keep', mid: {op: 'swaprole'}},
];
const NATIVE = [
  {id: 'static'}, {id: 'nextto'}, {id: 'label'}, {id: 'again', anyGen: true},
  {id: 'save', mid: {op: 'swap'}}, {id: 'keep', mid: {op: 'swaprole'}}, {id: 'move', mid: {op: 'move'}},
];
const CELLS = [];
if (GROUP === 'chrome') {
  for (const mode of ['shared', 'dedicated']) for (const s of DELAYS) CELLS.push({label: `chrome/${mode}/toolbar-reload/${s}s`, kind: 'toolbar', app: 'chrome', mode, delay: s});
  for (const w of WEB) for (const s of DELAYS) CELLS.push({label: `chrome/dedicated/${w.name ?? w.case}/${s}s`, kind: 'web', app: 'chrome', mode: 'dedicated', delay: s, ...w});
  for (const w of [WEB[0], WEB[10]]) CELLS.push({label: `chrome/shared-routed/${w.name ?? w.case}/5s`, kind: 'web', app: 'chrome', mode: 'shared', delay: 5, routedControl: true, ...w});
}
if (GROUP === 'safari') for (const w of WEB) for (const s of DELAYS) CELLS.push({label: `safari/shared/${w.name ?? w.case}/${s}s`, kind: 'web', app: 'safari', mode: 'shared', delay: s, ...w});
if (GROUP === 'native') for (const mode of ['shared', 'dedicated']) for (const n of NATIVE) for (const s of DELAYS) CELLS.push({label: `native/${mode}/${n.id}/${s}s`, kind: 'native', app: 'native', mode, delay: s, ...n});
const RUN = CELLS.filter(c => !ONLY || ONLY.some(p => c.label.startsWith(p)));

// ---- the apps ----------------------------------------------------------------------------------------------------
let navK = 0;
async function nav(c) {
  const k = `k${++navK}`;
  commands.push({op: 'nav', case: c, k});
  for (let i = 0; i < 60; i++) { if (beacons.some(b => b.ev === 'load' && b.k === k)) break; await sleep(200); }
  if (!beacons.some(b => b.ev === 'load' && b.k === k)) throw new Error(`nav to ${c}: no load in 12 s`);
  await sleep(1500);
  return k;
}
async function waitLoad(ms = 40_000) {
  for (let i = 0; i < ms / 250 && !beacons.some(b => b.ev === 'load'); i++) await sleep(250);
  if (!beacons.some(b => b.ev === 'load')) throw new Error('the page did not load');
}
async function launchChrome(label, c) {
  beacons = [];
  const child = spawn(CFT, [`--user-data-dir=${join(OUT, `chrome-${fileName(label)}`)}`, '--no-first-run', '--no-default-browser-check',
    '--disable-search-engine-choice-screen', '--window-position=400,30', '--window-size=620,720', `${URL_}?case=${c}&k=k0`], {stdio: 'ignore'});
  const launchedAt = Date.now();
  await waitLoad();
  return {pid: child.pid, launchedAt, stop: async () => { if (child.exitCode === null) { child.kill('SIGTERM'); await sleep(2000); if (child.exitCode === null) child.kill('SIGKILL'); } }};
}
async function launchSafari() {
  beacons = [];
  osa('tell application "Safari" to quit');
  await sleep(1500);
  sh('open', ['-a', 'Safari', `${URL_}?case=static&k=k0`]);
  await waitLoad();
  const pid = pidOf('Safari');
  osa('tell application "System Events"\ntell process "Safari"\nset position of window 1 to {400, 30}\nset size of window 1 to {620, 720}\nend tell\nend tell');
  await sleep(800);
  return {pid, launchedAt: Date.now(), stop: async () => { osa('tell application "Safari" to quit'); await sleep(1500); }};
}
const CMD = join(OUT, 'native-cmd.txt'), NLOG = join(OUT, 'native-log.jsonl');
let nativeNonce = 0;
const nativeCmd = op => writeFileSync(CMD, `n${++nativeNonce} ${op}\n`);
const nativeLog = () => existsSync(NLOG) ? readFileSync(NLOG, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
async function launchNative() {
  writeFileSync(CMD, '');
  const child = spawn(APP, [CMD, NLOG], {stdio: 'ignore'});
  for (let i = 0; i < 80 && !nativeLog().some(e => e.ev === 'ready'); i++) await sleep(250);
  await sleep(1000);
  return {pid: child.pid, launchedAt: Date.now(), stop: async () => { child.kill('SIGTERM'); await sleep(500); }};
}

// ---- one cell ----------------------------------------------------------------------------------------------------
async function cell(spec, shared) {
  const row = {label: spec.label, spec};
  let engine, guard, fresh;
  try {
    let target = shared;
    if (spec.kind === 'toolbar') { fresh = await launchChrome(spec.label, 'toolbar'); target = fresh; }
    row.pid = target.pid;
    row.front = await frontTextEdit();
    if (spec.kind === 'web') row.navK = await nav(spec.case);
    if (spec.kind === 'native') { nativeCmd('reset'); await sleep(400); }
    engine = await startEngine(spec.label);
    const w = engine.wire;
    row.ping = (await w.call('ping', {clientApiVersion: 'cua-engine-1', desktop: spec.mode})).result ?? null;
    let o, node;
    for (let attempt = 0; attempt < 3; attempt++) {
      o = await observe(w, target.pid, `${spec.label}-${attempt}`);
      node = findTarget(o.sky, spec);
      if (node?.frame) break;
      await sleep(1000);
    }
    row.observation = {ms: o.ms, sinceLaunchMs: o.at - target.launchedAt, nodes: o.sky.nodes.length, window: o.sky.window?.frame, screenshot: o.sky.screenshot && {width: o.sky.screenshot.width, height: o.sky.screenshot.height}};
    if (!node?.frame) { row.problem = 'no target node'; row.roles = [...new Set(o.sky.nodes.map(n => n.role))].slice(0, 40); return row; }
    row.target = slim(node);
    row.intended = targetId(node, spec);
    const wf = o.sky.window.frame, scale = o.sky.screenshot.width / wf.width;
    const c = centre(node.frame);
    const px = {x: Math.round((c.x - wf.x) * scale), y: Math.round((c.y - wf.y) * scale)};
    const point = {x: wf.x + px.x / scale, y: wf.y + px.y / scale};
    Object.assign(row, {px, point, scale});
    const rec = deepest(o.sky, point);
    row.recorded = slim(rec);
    guard = guardTool(target.pid);
    const f = rec.frame;
    row.record = await guard.ask({op: 'record', x: point.x, y: point.y, role: rec.role, frame: [f.x, f.y, f.width, f.height]});
    row.recordAfterObservationMs = Date.now() - o.at;
    const navBefore = beacons.length;
    if (spec.mid) {
      const at = o.at + Math.max(300, spec.delay * 500) - Date.now(); if (at > 0) await sleep(at);
      if (spec.kind === 'native') nativeCmd(spec.mid.op); else commands.push(spec.mid);
      row.midAtMs = Date.now() - o.at;
    }
    const wait = o.at + spec.delay * 1000 - Date.now(); if (wait > 0) await sleep(wait);
    row.check = await guard.ask({op: 'check', x: point.x, y: point.y});
    const loadsBefore = loads, logBefore = nativeLog().length, started = Date.now();
    row.clickAfterObservationMs = started - o.at;
    row.clickSinceLaunchMs = started - target.launchedAt;
    const r = lean(await w.execute('click', {pid: target.pid, x: px.x, y: px.y}));
    row.click = r.error ? {error: {name: r.error.name ?? r.error.data?.name, message: String(r.error.message ?? '').slice(0, 300), data: r.error.data}} : {meta: r.result?.meta ?? r.result};
    row.clickMs = Date.now() - started;
    await sleep(spec.kind === 'toolbar' ? 3000 : 1500);
    // The effect.
    if (spec.kind === 'toolbar') row.effect = {loadsDelta: loads - loadsBefore, hit: loads - loadsBefore > 0 ? ['reload'] : []};
    else if (spec.kind === 'native') { const ev = nativeLog().slice(logBefore).filter(e => e.ev === 'click'); row.effect = {events: ev, hit: ev.map(e => e.id)}; }
    else { const ev = beacons.slice(navBefore).filter(b => b.ev === 'click' && b.t >= started - 50); row.effect = {events: ev.map(b => ({id: b.id, gen: b.gen, sx: b.sx, sy: b.sy, trusted: b.trusted, dt: b.t - started})), hit: ev.map(b => b.id).filter(Boolean)}; }
    row.pageEvents = beacons.slice(navBefore).filter(b => ['prepend', 'scrolled', 'swapped'].includes(b.ev) && b.t >= o.at - 50 && b.t <= started).map(b => ({ev: b.ev, dt: b.t - o.at, n: b.n, top: b.top}));
    try { await w.call('shutdown', {}, 5000); } catch {}
    w.close();
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 3000);
  } finally {
    guard?.stop();
    if (engine) { row.engineStderr = engine.stderr().slice(-1500); if (engine.child.exitCode === null) engine.child.kill('SIGKILL'); }
    if (fresh) await fresh.stop();
    await sleep(500);
  }
  judge(row);
  return row;
}

// Whether the intended target was still under the point (the click's effect; with no effect, the guard's own hit at
// click time), and so whether the guard's verdict was right.
function judge(row) {
  if (!row.check || row.check.error || !row.effect) return;
  const hitIds = [row.check.hit?.domId, row.check.hit?.id, ...(row.check.hitUp ?? []).flatMap(e => [e.domId, e.id])].filter(Boolean);
  const reloadHit = /reload/i.test(`${row.check.hit?.desc ?? ''} ${row.check.hit?.title ?? ''}`);
  let under, source;
  if (row.effect.hit.length) { under = row.effect.hit.includes(row.intended); source = 'effect'; }
  else { under = row.spec.kind === 'toolbar' ? reloadHit : hitIds.includes(row.intended); source = 'hit'; }
  row.truth = {targetUnder: under, source, hitIds};
  const refuse = row.check.verdict === 'refuse';
  row.outcome = refuse ? (under ? 'FP' : 'correct-refuse') : (under ? 'correct-pass' : 'FN');
}

function summary(r) {
  if (r.exception || r.problem) return `PROBLEM ${JSON.stringify(r.problem ?? '')} ${r.exception ?? ''}`;
  const m = r.click?.meta;
  const route = m ? `route ${m.inputRoute} el ${JSON.stringify(m.elementClick?.reason ?? m.elementClick?.route ?? null)}` : `ERROR ${r.click?.error?.name} ${String(r.click?.error?.message ?? '').slice(0, 80)}`;
  const ch = r.check ?? {};
  return `${r.outcome ?? '?'} verdict=${ch.verdict}/${ch.reason} identity=${ch.identity} rel=${ch.relation} ms=${JSON.stringify(ch.ms)} ` +
    `rec=${r.recorded?.role}@${r.recorded?.depth}(${r.record?.method},${r.record?.distance}) target=${r.intended} effect=${JSON.stringify(r.effect?.hit)} truth=${JSON.stringify(r.truth && {u: r.truth.targetUnder, s: r.truth.source})} ` +
    `hit=${ch.hit?.role}:${ch.hit?.domId ?? ch.hit?.id ?? ch.hit?.title ?? ch.hit?.desc} node=${JSON.stringify(ch.nodeFrame)} recreated=${JSON.stringify(ch.recreatedBest && ch.recreatedBest.distance)} ` +
    `click@${r.clickAfterObservationMs}ms(launch+${r.clickSinceLaunchMs}) ${route} page=${JSON.stringify(r.pageEvents)}`;
}

const config = {
  group: GROUP, imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, runnerName: process.env.RUNNER_NAME ?? null,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), chrome: sh(CFT, ['--version']).out,
  engineCommit: process.env.P296_ENGINE_COMMIT ?? null, probeCommit: process.env.GITHUB_SHA ?? null, rep: process.env.P296_REP ?? null,
};
log('config', JSON.stringify(config));
const rows = [];
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, cells: rows}, null, 1));
let shared = null;
for (const spec of RUN) {
  if (spec.kind !== 'toolbar' && !shared) {
    shared = spec.app === 'chrome' ? await launchChrome('pages', 'static') : spec.app === 'safari' ? await launchSafari() : await launchNative();
    log(`${spec.app} launched pid ${shared.pid}`);
    if (spec.app === 'chrome') { const left = shared.launchedAt + 25_000 - Date.now(); if (left > 0) await sleep(left); }  // past the toolbar's re-layout
  }
  const row = await cell(spec, shared);
  rows.push(row);
  save();
  log(`${row.label}: front=${row.front}\n    ${summary(row)}`);
}
if (shared) await shared.stop();
server.close();
process.exit(0);
