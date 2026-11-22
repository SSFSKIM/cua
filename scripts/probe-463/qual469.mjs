// #469's qualification kit (ruling 1036/1039): main against the fix, one engine head per dispatch, built unmodified. The
// fix keeps main's posted click for an AXPopUpButton outside a web page whose AXDOMClassList reads (`popUpClick.kept:
// browserView`, or `viewClassUnread`); AppKit's and a page's <select> are still pressed. Cells (CELLS), the app behind:
// Chrome's site information, tab search and app menu; an Electron fixture's toolbar pop-up button (aria-haspopup="menu",
// it opens the app's native menu) and its <select> (scripts/probe-463/electron, built as probe/433-qual's Electron lane);
// #458's pop-ups (TextEdit font, Script Editor language, Chrome <select>) in probe/458-qual's layouts a-d; parity: the
// combo box's arrow, a plain page button. Each row: one observation, the engine's coordinate click at the control's
// centre, the watch (tool.swift `watch`: new windows every 10 ms, and every 5 ms Finder's focused and main window and the
// system's focused application), the window order and frontmost app at 1.8 s.
//
//   node scripts/probe-463/qual469.mjs --engine <bin> --tool <bin> --out <dir> [--reps n] [--controls a,b] [--modes a,b]
//        [--budget minutes] [--shots n]
// Runs only on a GitHub-hosted runner: it launches, places and closes its own apps.
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {execFile} from 'node:child_process';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {launch, placePid, version} from '../probe-316/browser.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-469: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const list = name => arg(name)?.split(',').map(s => s.trim()).filter(Boolean);
const OUT = arg('out'), TOOL = arg('tool'), ENGINE = arg('engine');
const REPS = Number(arg('reps') ?? 99);
const ONLY_CONTROLS = list('controls'), ONLY_ROUTES = list('routes'), ONLY_MODES = list('modes');
const BUDGET_MS = Number(arg('budget') ?? 140) * 60_000;
const SHOTS = Number(arg('shots') ?? 1);
const WATCH_MS = 4000, AT_MS = 1800;
const STARTED = Date.now();
mkdirSync(join(OUT, 'screens'), {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-469:', ...a);
const WIN = {x: 400, y: 30, w: 620, h: 720};
const sh = (cmd, args, timeout = 20_000) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = script => sh('osascript', ['-e', script]);
const pidOf = name => Number(sh('pgrep', ['-x', name]).out.split('\n')[0]) || null;
const fileName = s => s.replace(/[^a-z0-9-]+/gi, '_');
const frontmost = () => {
  const asn = sh('lsappinfo', ['front']).out;
  return (sh('lsappinfo', ['info', '-only', 'bundleid', asn]).out.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] ?? null;
};
const setFront = pid => osa(`tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`).status;


const SCRIPT = `<script>(() => { const load = Math.random().toString(36).slice(2, 10);
const send = (type, extra) => navigator.sendBeacon('/ev', JSON.stringify({load, origin: location.origin, path: location.pathname, type, t: Date.now(), ...extra}));
const idOf = t => { const e = t && t.closest ? t.closest('[id]') : null; return e ? e.id : (t && t.tagName) || null; };
for (const k of ['pointerdown', 'mousedown', 'click', 'contextmenu', 'focusin', 'submit']) document.addEventListener(k, e => send(k, {id: idOf(e.target), trusted: e.isTrusted, button: e.button}), true);
for (const k of ['input', 'change']) document.addEventListener(k, e => send(k, {id: idOf(e.target), value: e.target.value ?? null}), true);
const run = c => { if (c === 'reload') location.replace('/'); if (c.startsWith('goto:')) location.replace(c.slice(5)); };
(async () => { for (;;) { try { const r = await fetch('/cmd?load=' + load, {cache: 'no-store'}); const j = await r.json(); if (j.cmd) run(j.cmd); } catch (e) { await new Promise(r => setTimeout(r, 500)); } } })();
addEventListener('load', () => send('ready', {}));
})();</script>`;
// probe/458-qual's page, the <select> high and the plain button clear of every layout's Finder windows.
const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe469 page</title>
<style>body{font:15px -apple-system,Helvetica,sans-serif;margin:0} .a{position:absolute;left:16px}</style></head>
<body id="page"><div id="wrap" style="position:relative;height:560px">
<h3 class="a" style="top:2px;margin:0">probe469 page</h3>
<div class="a" style="top:40px"><select id="sel" aria-label="Choice"><option>One</option><option>Two</option><option>Three</option></select></div>
<div class="a" style="top:100px"><button id="b1" type="button">Alpha</button> <button id="b2" type="button">Beta</button></div>
</div>${SCRIPT}</body></html>`;
// The Electron fixture's page: a toolbar whose pop-up button asks for the app's native menu, and a <select>.
const ELECTRON_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe469 electron</title>
<style>body{font:15px -apple-system,Helvetica,sans-serif;margin:0} [role=toolbar]{display:flex;gap:10px;padding:8px 16px;background:#eee;border-bottom:1px solid #ccc}
button,select{font-size:15px}</style></head>
<body id="page"><div role="toolbar" aria-label="Toolbar"><button id="menu" type="button" aria-haspopup="menu" aria-label="More actions">More ▾</button>
<select id="esel" aria-label="Zoom"><option>100%</option><option>125%</option><option>150%</option></select></div>
<p style="margin:16px">probe469 electron</p>
<script>document.getElementById('menu').addEventListener('click', e => { const r = e.currentTarget.getBoundingClientRect(); window.probe469.menu({x: r.left, y: r.bottom}); });</script>
${SCRIPT}</body></html>`;

const events = [];
let pollers = [], queued = null;
function serve(req, res) {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?') || req.url === '/electron')) {
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'});
    res.end(req.url === '/electron' ? ELECTRON_PAGE : PAGE);
    return;
  }
  if (req.method === 'GET' && req.url.startsWith('/cmd')) {
    if (queued) { res.writeHead(200, {'content-type': 'application/json'}); res.end(JSON.stringify({cmd: queued})); queued = null; return; }
    pollers.push(res);
    const t = setTimeout(() => { pollers = pollers.filter(p => p !== res); res.writeHead(200, {'content-type': 'application/json'}); res.end('{}'); }, 15_000);
    res.on('close', () => clearTimeout(t));
    return;
  }
  let body = '';
  req.on('data', d => { body += d; if (body.length > 8192) req.destroy(); });
  req.on('end', () => {
    if (req.url === '/ev') { try { events.push({...JSON.parse(body), at: Date.now()}); } catch {} }
    res.writeHead(204); res.end();
  });
}
const server = createServer(serve);
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;
const sendCmd = c => {
  const live = pollers; pollers = [];
  if (!live.length) { queued = c; return; }
  for (const p of live) { try { p.writeHead(200, {'content-type': 'application/json'}); p.end(JSON.stringify({cmd: c})); } catch {} }
};
const lastReady = () => [...events].reverse().find(e => e.type === 'ready') ?? null;
async function newLoad(prev, ms = 9000) {
  for (let i = 0; i < ms / 100; i++) { const l = lastReady(); if (l && l.load !== prev) return l; await sleep(100); }
  return null;
}

// ---- the engine's wire --------------------------------------------------------------------------------------------
class Wire {
  static connect(path) { return new Promise((resolve, reject) => { const s = createConnection(path); s.once('connect', () => { s.off('error', reject); resolve(new Wire(s)); }); s.once('error', reject); }); }
  constructor(s) {
    this.s = s; this.chunks = []; this.len = 0; this.pending = new Map(); this.id = 1; this.lineage = null;
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
  call(method, params = {}, timeout = 90_000) {
    const id = this.id++;
    const bytes = Buffer.from(JSON.stringify({jsonrpc: '2.0', id, method, params}), 'utf8');
    const head = Buffer.alloc(4); head.writeUInt32LE(bytes.length, 0);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method}: no answer`)); }, timeout);
      this.pending.set(id, m => { clearTimeout(t); resolve(m); });
      this.s.write(Buffer.concat([head, bytes]));
    });
  }
  async execute(method, args) {
    const r = await this.call('execute', {method, args, lineage: this.lineage, deadlineUnixMilliseconds: Date.now() + 60_000});
    if (r.result?.lineage) this.lineage = r.result.lineage;
    return r;
  }
  close() { this.s.destroy(); }
}
const SOCK_DIR = join(process.env.RUNNER_TEMP ?? OUT, 's469'); mkdirSync(SOCK_DIR, {recursive: true, mode: 0o700});
const SOCKET = join(SOCK_DIR, 'e.sock');
let engine = null, engineErr = '';
function startEngine() {
  rmSync(SOCKET, {force: true});
  engine = spawn(ENGINE, [], {env: {...process.env, CUA_ENGINE_SOCKET: SOCKET}, stdio: ['ignore', 'ignore', 'pipe']});
  engine.stderr.on('data', d => { engineErr = (engineErr + d).slice(-20_000); });
}
async function connect(mode) {
  if (!engine || engine.exitCode !== null) { log('engine (re)start'); startEngine(); }
  for (let i = 0; i < 300; i++) {
    try {
      const w = await Wire.connect(SOCKET);
      const ping = await w.call('ping', {clientApiVersion: 'cua-engine-1', desktop: mode});
      if (ping.error) throw new Error(JSON.stringify(ping.error));
      return w;
    } catch { await sleep(50); }
  }
  throw new Error('engine did not listen');
}
function toolProcess() {
  const t = spawn(TOOL, [], {stdio: ['pipe', 'pipe', 'inherit']});
  const waiting = [];
  createInterface({input: t.stdout}).on('line', l => { try { waiting.shift()?.(JSON.parse(l)); } catch { waiting.shift()?.({error: 'bad answer'}); } });
  const ask = (o, timeout = 30_000) => new Promise(resolve => { const k = setTimeout(() => resolve({error: 'tool timeout'}), timeout); waiting.push(v => { clearTimeout(k); resolve(v); }); t.stdin.write(JSON.stringify(o) + '\n'); });
  return {t, ask};
}
const {t: tool, ask} = toolProcess();
// A second tool samples the window list while the first one, or the engine, acts (`watch`).
const {t: watcher, ask: askWatch} = toolProcess();

// ---- shared steps -------------------------------------------------------------------------------------------------
const errName = r => r?.error ? (r.error.data?.errorName ?? r.error.data?.name ?? r.error.errorName ?? r.error.name ?? r.error.code ?? 'error') : null;
const metaOf = r => r?.error ? (r.error.data?.meta ?? r.error.meta ?? null) : (r?.result?.meta ?? null);
function brief(r) {
  const m = metaOf(r) ?? {};
  return {error: errName(r), message: r?.error ? String(r.error.message ?? '') : null, route: m.inputRoute ?? null,
    stalePoint: m.stalePoint ?? null, posted: m.startedAt != null, note: r?.result?.note ?? null, meta: m};
}
async function observe(w, pid, lab) {
  const shots = join(OUT, 'shots', fileName(lab)); mkdirSync(shots, {recursive: true});
  const r = await w.execute('get_app_state', {pid, includeScreenshot: true, outputDirectory: shots});
  if (r.error) throw new Error(`get_app_state: ${JSON.stringify(r.error).slice(0, 400)}`);
  return r.result;
}
const label = n => [n.title, n.description, n.value, n.placeholder].filter(v => typeof v === 'string' && v).join(' | ');
function toPixels(sky, p) {
  const f = sky.window.frame, scale = sky.screenshot.width / f.width;
  const px = {x: Math.round((p.x - f.x) * scale), y: Math.round((p.y - f.y) * scale)};
  return {px, screen: {x: f.x + px.x / scale, y: f.y + px.y / scale}};
}
const centre = f => ({x: f.x + f.width / 2, y: f.y + f.height / 2});
const winArr = f => [f.x, f.y, f.width, f.height];
const big = f => f && f.width > 4 && f.height > 4;

// ---- the controls ---------------------------------------------------------------------------------------------------
const PRIORITY = ['AXPopUpButton', 'AXMenuButton', 'AXButton', 'AXCheckBox', 'AXComboBox'];
const rank = n => { const i = PRIORITY.indexOf(n.role); return i < 0 ? 99 : i; };
const labelled = (n, re) => label(n).split(' | ').some(s => re.test(s));
const toolbar = re => sky => sky.nodes.filter(n => big(n.frame) && n.frame.y < sky.window.frame.y + 130 && n.role !== 'AXStaticText' && labelled(n, re)).sort((a, b) => rank(a) - rank(b))[0];
const pageNode = (re, roles) => sky => sky.nodes.filter(n => big(n.frame) && roles.includes(n.role) && labelled(n, re)).sort((a, b) => rank(a) - rank(b))[0];
const CONTROLS = {
  // Chrome's toolbar and tab strip (#469): the two bubble buttons and the menu one, all AXPopUpButtons.
  'cr-siteinfo': {app: 'chrome', node: toolbar(/^view site information$/i)},
  'cr-tabsearch': {app: 'chrome', node: toolbar(/^tab search$/i)},
  'cr-appmenu': {app: 'chrome', node: toolbar(/^chrome$/i)},
  // The Electron fixture's toolbar: an aria-haspopup="menu" button that opens the app's native menu, and a <select>.
  'el-menu': {app: 'electron', node: pageNode(/^More actions$/, ['AXPopUpButton', 'AXMenuButton', 'AXButton'])},
  'el-select': {app: 'electron', node: pageNode(/^Zoom/, ['AXPopUpButton', 'AXComboBox', 'AXMenuButton'])},
  // #458's pop-ups (probe/458-qual's cells).
  select: {app: 'chrome', node: pageNode(/^Choice/, ['AXPopUpButton', 'AXComboBox', 'AXMenuButton'])},
  font: {app: 'textedit', node: sky => sky.nodes.find(n => n.role === 'AXPopUpButton' && n.value === 'Helvetica' && big(n.frame))},
  language: {app: 'scripteditor', node: sky => sky.nodes.find(n => n.role === 'AXPopUpButton' && n.value === 'AppleScript' && big(n.frame))},
  // Parity: TextEdit's font-size combo box on its arrow, and a plain page button.
  combo: {app: 'textedit', node: sky => {
    const box = sky.nodes.find(n => n.role === 'AXComboBox' && big(n.frame));
    return box && sky.nodes.filter(n => n.role === 'AXButton' && n.frame && within(n.frame, box.frame)).sort((a, b) => (b.frame.x + b.frame.width) - (a.frame.x + a.frame.width))[0];
  }},
  button: {app: 'chrome', node: pageNode(/^Beta$/, ['AXButton'])},
};
const within = (f, r) => f.x >= r.x - 1 && f.y >= r.y - 1 && f.x + f.width <= r.x + r.width + 1 && f.y + f.height <= r.y + r.height + 1;
const MODES = {
  'shared-behind': {desktop: 'shared', front: false},
  'dedicated-behind': {desktop: 'dedicated', front: false},
};
const CELLS = [];
for (const control of ['cr-siteinfo', 'cr-tabsearch', 'cr-appmenu', 'el-menu']) {
  CELLS.push({control, mode: 'shared-behind', layout: 'a', reps: 10});
  CELLS.push({control, mode: 'dedicated-behind', layout: 'a', reps: 5});
}
CELLS.push({control: 'el-select', mode: 'shared-behind', layout: 'a', reps: 5});
for (const control of ['font', 'language', 'select']) {
  CELLS.push({control, mode: 'shared-behind', layout: 'a', reps: 8});
  CELLS.push({control, mode: 'dedicated-behind', layout: 'a', reps: 5});
  for (const layout of ['b', 'c', 'd']) CELLS.push({control, mode: 'shared-behind', layout, reps: 6});
}
for (const control of ['combo', 'button']) CELLS.push({control, mode: 'shared-behind', layout: 'a', reps: 6});
const appOf = cell => CONTROLS[cell.control].app;

// ---- the layouts (probe/458-qual's a-d) -----------------------------------------------------------------------------
const WIN2 = {x: 460, y: 90, w: 600, h: 690};
const FW = {F1: {x: 760, y: 420, w: 420, h: 320}, F2: {x: 240, y: 480, w: 360, h: 300}, F3: {x: 480, y: 560, w: 320, h: 220}, F4: {x: 600, y: 200, w: 500, h: 300}};
const CALC_BEHIND = {x: 980, y: 260}, CALC_OVER = {x: 250, y: 300};
const LAYOUTS = {
  a: {finder: ['F2', 'F1'], calc: CALC_BEHIND, order: ['F1', 'F2', 'App', 'App2', 'Calc']},
  b: {finder: ['F1'], calc: CALC_OVER, order: ['F1', 'Calc', 'App', 'App2']},
  c: {finder: ['F3', 'F2', 'F1'], calc: CALC_OVER, order: ['F1', 'F2', 'Calc', 'F3', 'App', 'App2']},
  d: {finder: ['F4', 'F1'], calc: CALC_BEHIND, order: ['F1', 'App', 'F4', 'App2', 'Calc']},
};
const dirs = Object.fromEntries(Object.keys(FW).map(k => [k, join(process.env.RUNNER_TEMP ?? OUT, `q469${k}`)]));
for (const d of Object.values(dirs)) mkdirSync(d, {recursive: true});
const LINES = Array.from({length: 22}, (_, i) => `Line ${String(i + 1).padStart(2, '0')} words of a plain document ending eol${String(i + 1).padStart(2, '0')}`);
const rtf = lines => `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs28\n${lines.map(l => `${l}\\par`).join('\n')}\n}`;
const teFile = join(OUT, 'q469.rtf'), teFile2 = join(OUT, 'q469-second.rtf');
writeFileSync(teFile, rtf(LINES)); writeFileSync(teFile2, rtf(['The second window']));
const seFile = join(OUT, 'q469.applescript'), seFile2 = join(OUT, 'q469-second.applescript');
writeFileSync(seFile, LINES.map(l => `-- ${l}`).join('\n') + '\nreturn 1\n'); writeFileSync(seFile2, '-- the second window\nreturn 2\n');
const bounds = f => `{${f.x}, ${f.y}, ${f.x + f.w}, ${f.y + f.h}}`;
const skip = () => [engine?.pid].filter(Boolean);
const orderNow = async () => ((await ask({op: 'order', skip: skip()})).windows ?? []);
const at = (w, f) => Math.abs(w.bounds[0] - f.x) <= 3 && Math.abs(w.bounds[1] - f.y) <= 3;
function named(list, appPid) {
  const out = {};
  for (const w of list) {
    if (w.owner === 'Finder') { for (const [k, f] of Object.entries(FW)) if (at(w, f)) out[k] = w.n; }
    else if (w.owner === 'Calculator') out.Calc ??= w.n;
    else if (w.pid === appPid) { if (at(w, WIN) || (Math.abs(w.bounds[0] - WIN.x) <= 3 && Math.abs(w.bounds[1] - (WIN.y + 1)) <= 3)) out.App ??= w.n; else if (w.bounds[2] >= 200) out.App2 ??= w.n; }
  }
  return out;
}
const nameOf = (names, n) => Object.entries(names).find(([, v]) => v === n)?.[0] ?? null;
async function buildLayout(layoutName, appPid) {
  const L = LAYOUTS[layoutName];
  osa('tell application "Finder" to close every window');
  await sleep(300);
  for (const k of L.finder) {
    sh('open', [dirs[k]]);
    await sleep(700);
    osa(`tell application "Finder" to set bounds of front Finder window to ${bounds(FW[k])}`);
  }
  if (!pidOf('Calculator')) { sh('open', ['-a', 'Calculator']); await sleep(2500); }
  osa(`tell application "System Events" to tell process "Calculator" to set position of window 1 to {${L.calc.x}, ${L.calc.y}}`);
  setFront(pidOf('Finder'));
  await sleep(500);
  let list = await orderNow();
  const names = named(list, appPid);
  for (const n of [...L.order].reverse().map(k => names[k]).filter(Boolean)) await ask({op: 'front', n}, 15_000);
  await sleep(300);
  list = await orderNow();
  const actual = list.map(w => nameOf(names, w.n)).filter(Boolean);
  const want = L.order.filter(k => names[k]);
  return {layout: layoutName, names, actual, ok: JSON.stringify(actual) === JSON.stringify(want)};
}
async function escapeTwice(pid) {
  try { const w = await connect('shared'); for (let i = 0; i < 2; i++) { await w.execute('press_key', {pid, key: 'Escape'}); await sleep(250); } w.close(); } catch {}
}
function chromeApp() {
  const profileRoot = join(process.env.RUNNER_TEMP ?? OUT, 'q469c');
  let b = null, launches = 0;
  const relaunch = async () => {
    if (b && b.exitCode === null) { b.kill('SIGTERM'); for (let i = 0; i < 20 && b.exitCode === null; i++) await sleep(250); if (b.exitCode === null) b.kill('SIGKILL'); await sleep(1000); }
    launches++;
    const prev = lastReady()?.load ?? null;
    b = await launch('stable', URL_, join(profileRoot, String(launches)), WIN);
    if (!(await newLoad(prev, 30_000))) throw new Error('Chrome did not load the page');
    const left = b.launchedAt + 22_000 - Date.now(); if (left > 0) await sleep(left);
    placePid(b.pid, WIN);
    await sleep(1500);
    const w = await connect('shared');
    for (let i = 0; i < 2; i++) { await observe(w, b.pid, `warm-${launches}-${i}`).catch(() => {}); await sleep(1200); }
    w.close();
  };
  return {
    pid: () => b.pid,
    reset: async layout => {
      const notes = [];
      if (!b || b.exitCode !== null) { await relaunch(); notes.push('launched'); }
      await ask({op: 'hover', x: 200, y: 860});
      await ask({op: 'cancel', pid: b.pid});
      await escapeTwice(b.pid);
      let extra = await ask({op: 'closeExtra', pid: b.pid, keep: [WIN.x, WIN.y, WIN.w, WIN.h]});
      if (extra.closed?.length) notes.push({closed: extra.closed});
      const prev = lastReady()?.load ?? null;
      sendCmd(`goto:${URL_}`);
      if (!(await newLoad(prev))) { notes.push('no reload: relaunch'); await relaunch(); }
      await sleep(400);
      extra = await ask({op: 'closeExtra', pid: b.pid, keep: [WIN.x, WIN.y, WIN.w, WIN.h]});
      if (extra.left?.length) { notes.push({left: extra.left, then: 'relaunch'}); await relaunch(); }
      await ask({op: 'focusweb', pid: b.pid});
      placePid(b.pid, WIN);
      notes.push(await buildLayout(layout, b.pid));
      return notes;
    },
    close: async () => { if (b && b.exitCode === null) { b.kill('SIGTERM'); await sleep(1500); } },
  };
}
/// The Electron fixture (scripts/probe-463/electron), relaunched for every row with a fresh profile.
function electronApp() {
  const dir = resolve('scripts/probe-463/electron');
  const bin = createRequire(join(dir, 'package.json'))('electron');
  let p = null, n = 0, version = null;
  const stop = async () => { if (p && p.exitCode === null) { p.kill('SIGTERM'); for (let i = 0; i < 20 && p.exitCode === null; i++) await sleep(150); if (p.exitCode === null) p.kill('SIGKILL'); await sleep(500); } };
  return {
    pid: () => p.pid,
    version: () => version,
    reset: async layout => {
      await ask({op: 'hover', x: 200, y: 860});
      await stop();
      n++;
      let ready = null;
      p = spawn(bin, [dir], {env: {...process.env, P463_URL: `${URL_}electron`, P463_PROFILE: join(process.env.RUNNER_TEMP ?? OUT, `q469e${n}`)}, stdio: ['ignore', 'pipe', 'inherit']});
      createInterface({input: p.stdout}).on('line', l => { try { const q = JSON.parse(l); if (q.kind === 'fixture-ready') ready = q; if (q.kind === 'menu-popup') menuPopups.push(q.t); } catch {} });
      for (let i = 0; i < 300 && !ready; i++) await sleep(100);
      if (!ready) throw new Error('Electron fixture not ready');
      version = `Electron ${ready.electron} / Chromium ${ready.chrome}`;
      await sleep(1500);
      const w = await connect('shared');
      await observe(w, p.pid, `warm-e${n}`).catch(() => {});
      w.close();
      await sleep(800);
      return [await buildLayout(layout, p.pid)];
    },
    close: stop,
  };
}
const menuPopups = [];
async function quit(name) {
  if (!pidOf(name)) return;
  sh('pkill', ['-x', name]);
  for (let i = 0; i < 40 && pidOf(name); i++) await sleep(100);
  if (pidOf(name)) { sh('pkill', ['-9', '-x', name]); await sleep(500); }
}
function docApp(name, appName, file, file2) {
  const pid = () => pidOf(name);
  const place = (i, f) => {
    osa(`tell application "System Events" to tell process "${name}" to set position of window ${i} to {${f.x}, ${f.y}}`);
    osa(`tell application "System Events" to tell process "${name}" to set size of window ${i} to {${f.w}, ${f.h}}`);
  };
  return {
    pid,
    reset: async layout => {
      await ask({op: 'hover', x: 200, y: 860});
      await quit(name);
      sh('open', ['-a', appName, file2]);
      for (let i = 0; i < 40; i++) { await sleep(300); if (Number(osa(`tell application "System Events" to count windows of process "${name}"`).out) >= 1) break; }
      sh('open', ['-a', appName, file]);
      for (let i = 0; i < 40; i++) { await sleep(300); if (Number(osa(`tell application "System Events" to count windows of process "${name}"`).out) >= 2) break; }
      await sleep(500);
      place(2, WIN2); place(1, WIN);
      await sleep(400);
      return [await buildLayout(layout, pid())];
    },
    close: () => quit(name),
  };
}

// ---- one row --------------------------------------------------------------------------------------------------------
const results = [];
const config = {kit: 'probe-463 qual469', engineRef: process.env.P463_ENGINE_REF ?? null, engineLabel: process.env.P463_ENGINE_LABEL ?? null, reps: REPS,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), commit: process.env.GITHUB_SHA ?? null, image: process.env.ImageVersion ?? null, url: URL_};
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));
function moved(before, after) {
  const common = new Set(before.map(w => w.n).filter(n => after.some(w => w.n === n)));
  const b = before.filter(w => common.has(w.n)), a = after.filter(w => common.has(w.n));
  const front = (list, n) => new Set(list.slice(0, list.findIndex(w => w.n === n)).map(w => w.n));
  return b.filter(w => { const x = front(b, w.n), y = front(a, w.n); return x.size !== y.size || [...x].some(n => !y.has(n)); }).map(w => w.n);
}
const orderNames = (list, names) => list.map(w => nameOf(names, w.n) ?? `${w.owner}:${w.n}`);
const meets = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
/// The layer-0 windows in front of F1 that overlap it, by name.
function covering(list, names) {
  const i = list.findIndex(w => w.n === names.F1);
  if (i < 0) return null;
  return list.slice(0, i).filter(w => meets(w.bounds, list[i].bounds)).map(w => nameOf(names, w.n) ?? `${w.owner}:${w.n}`);
}
function spans(watch, actAt) {
  const out = [], open = new Map();
  for (const [t, rows] of watch.freshSamples ?? []) {
    const ms = Math.round(watch.t0Epoch + t - actAt);
    const now = new Set(rows.map(r => r[0]));
    for (const r of rows) {
      const s = open.get(r[0]);
      if (!s) { const span = {n: r[0], owner: r[2], layer: r[3], alpha: r[4], bounds: r.slice(5), from: ms, to: null}; open.set(r[0], span); out.push(span); }
      else { s.alpha = Math.max(s.alpha, r[4]); s.bounds = r.slice(5); }
    }
    for (const [n, s] of open) if (!now.has(n)) { s.to = ms; open.delete(n); }
  }
  return out;
}
const misses = new Map();
/// The frontmost app as LaunchServices answers it (`lsappinfo front`, its ASN), read back to back for `ms`: each change
/// as [epoch ms, ASN]. The 5 ms watch's AX focused application also follows an open menu's tracking, so this is the
/// frontmost-app reading; that one is kept beside it.
const frontAsn = () => new Promise(r => execFile('lsappinfo', ['front'], {timeout: 2000}, (e, out) => r((out || '').trim())));
async function sampleFront(ms) {
  const out = [], start = Date.now();
  let last = null, reads = 0;
  while (Date.now() - start < ms) { const a = await frontAsn(); reads++; if (a !== last) { out.push([Date.now(), a]); last = a; } }
  return {changes: out, reads};
}
const bundleOf = asn => (sh('lsappinfo', ['info', '-only', 'bundleid', asn]).out.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] ?? asn;

async function runRow(app, cell, rep) {
  const mode = MODES[cell.mode], ctl = CONTROLS[cell.control];
  const lab = `${cell.control}-${cell.mode}-${cell.layout}-${rep}`;
  const row = {label: lab, ...cell, rep};
  results.push(row);
  let w;
  try {
    await ask({op: 'forget'});
    const notes = await app.reset(cell.layout);
    row.reset = notes.filter(x => !x?.layout);
    row.layoutBuilt = notes.find(x => x?.layout) ?? null;
    const pid = app.pid();
    const names = row.layoutBuilt?.names ?? {};
    w = await connect(mode.desktop);
    const sky0 = await observe(w, pid, `${lab}-obs`);
    const node = ctl.node(sky0);
    if (!node) {
      row.problem = 'no control in the observation';
      row.inventory = sky0.nodes.filter(n => big(n.frame) && n.role !== 'AXStaticText' && (n.frame.y < sky0.window.frame.y + 200 || /PopUp|Menu|Combo/.test(n.role))).slice(0, 60).map(n => [n.role, label(n).slice(0, 50), winArr(n.frame).map(Math.round)]);
      misses.set(cell.control, (misses.get(cell.control) ?? 0) + 1);
      return;
    }
    row.node = {role: node.role, label: label(node).slice(0, 80), frame: node.frame, actions: node.actions ?? null};
    const wf = sky0.window.frame;
    const pop0 = await ask({op: 'popup', pid, window: winArr(wf)});
    const ord0 = await orderNow();
    const finder = pidOf('Finder');
    row.before = {order: orderNames(ord0, names), front: frontmost(), covering: covering(ord0, names)};
    row.f1Bounds = ord0.find(x => x.n === names.F1)?.bounds ?? null;
    const asn0 = await frontAsn();
    const fronting = sampleFront(WATCH_MS);
    const watching = askWatch({op: 'watch', pid, ms: WATCH_MS, target: pop0.target?.n ?? -1, user: names.F1 ?? -1, skip: skip(), person: finder, fresh: true}, 20_000);
    await sleep(40);
    const mark = events.length, popMark = menuPopups.length;
    const t0 = Date.now();
    const {px} = toPixels(sky0, centre(node.frame));
    row.point = px;
    row.click = brief(await w.execute('click', {pid, x: px.x, y: px.y}));
    row.actMs = Date.now() - t0;
    const left = t0 + AT_MS - Date.now(); if (left > 0) await sleep(left);
    const ord1 = await orderNow();
    row.after = {front: frontmost(), order: orderNames(ord1, names), covering: covering(ord1, names)};
    if (rep <= SHOTS) sh('screencapture', ['-x', '-t', 'jpg', join(OUT, 'screens', `${fileName(lab)}.jpg`)]);
    row.watch = await watching;
    const fr = await fronting;
    row.front = {before: bundleOf(asn0), reads: fr.reads, off: fr.changes.filter(c => c[1] !== asn0).map(c => [c[0] - t0, bundleOf(c[1])]),
      endSame: (fr.changes[fr.changes.length - 1]?.[1] ?? asn0) === asn0};
    row.spans = spans(row.watch, t0);
    delete row.watch.freshSamples;
    row.watch.samples = row.watch.samples?.slice(0, 30);
    // The person's key window and the frontmost app through the row (5 ms loop): focused or main window off F1, and
    // the system's focused application other than Finder.
    if (row.f1Bounds) {
      const isF1 = f => Array.isArray(f) && f.slice(0, 2).every((v, i) => Math.abs(v - row.f1Bounds[i]) <= 3);
      const ps = row.watch.personSamples ?? [];
      row.key = {samples: ps.length, reads: row.watch.personReads,
        focusedOff: ps.filter(x => x[1] !== null && !isF1(x[1])).map(x => [x[0], x[1]]), mainOff: ps.filter(x => x[2] !== null && !isF1(x[2])).map(x => [x[0], x[2]]),
        unread: ps.filter(x => x[1] === null).length, endF1: isF1(ps[ps.length - 1]?.[1]),
        frontOff: ps.filter(x => x[3] && x[3] !== finder).map(x => [x[0], x[3]]), frontUnread: ps.filter(x => !x[3]).length,
        endFront: ps[ps.length - 1]?.[3] === finder};
      delete row.watch.personSamples;
    }
    row.moved = moved(ord0, ord1).map(n => nameOf(names, n) ?? n);
    row.page = [...new Set(events.slice(mark).filter(e => ['mousedown', 'click', 'focusin', 'change'].includes(e.type)).map(e => `${e.type}:${e.id}`))];
    if (appOf(cell) === 'electron') row.menuPopups = menuPopups.slice(popMark).map(t => t - t0);
    const d = row.click?.meta?.delivery;
    if (d) row.restoreAt = {release: d.releasedAt != null ? d.releasedAt - t0 : null, screenHoldMs: d.screenHoldMs ?? null, restores: d.restores ?? null};
  } catch (e) { row.exception = String(e?.stack || e).slice(0, 1500); }
  finally {
    w?.close(); save();
    const ui = (row.spans ?? []).filter(s => s.bounds[2] >= 30 && s.bounds[3] >= 20);
    const pc = row.click?.meta?.popUpClick;
    log(`${lab}: ${row.problem ?? row.exception?.split('\n')[0] ?? `${row.click?.error ?? 'ok'} route=${row.click?.route} popUpClick=${JSON.stringify(pc ?? null)} node=${row.node?.role}:${row.node?.label} ui=${JSON.stringify(ui.map(s => [s.layer, s.bounds.map(Math.round), s.from, s.to]))} front=${row.after?.front} frontOff=${JSON.stringify(row.front?.off ?? null)} keyOff=${row.key?.focusedOff?.length} covering=${JSON.stringify(row.after?.covering)} layout=${row.layoutBuilt?.ok}:${row.layoutBuilt?.actual?.join('>')} msg=${(row.click?.message ?? '').slice(0, 120)}`}`);
  }
}

async function run() {
  config.chrome = version('stable');
  const cells = CELLS.filter(c => (!ONLY_CONTROLS || ONLY_CONTROLS.includes(c.control)) && (!ONLY_MODES || ONLY_MODES.includes(c.mode)));
  for (const appName of ['chrome', 'electron', 'textedit', 'scripteditor']) {
    const mine = cells.filter(c => appOf(c) === appName);
    if (!mine.length) continue;
    const app = appName === 'chrome' ? chromeApp() : appName === 'electron' ? electronApp()
      : appName === 'textedit' ? docApp('TextEdit', 'TextEdit', teFile, teFile2) : docApp('Script Editor', 'Script Editor', seFile, seFile2);
    const most = Math.max(...mine.map(c => Math.min(c.reps, REPS)));
    for (let rep = 1; rep <= most; rep++) for (const cell of mine) {
      if (rep > Math.min(cell.reps, REPS) || (misses.get(cell.control) ?? 0) >= 2) continue;
      if (Date.now() - STARTED > BUDGET_MS) { config.budgetStop = true; save(); return; }
      await runRow(app, cell, rep);
    }
    if (app.version) config.electron = app.version();
    await app.close();
  }
}

log('config', JSON.stringify(config));
try { await run(); } catch (e) { config.exception = String(e?.stack || e).slice(0, 2000); log('EXCEPTION', config.exception); }
config.engineStderr = engineErr.slice(-4000);
config.minutes = Math.round((Date.now() - STARTED) / 600) / 100;
save();
engine?.kill('SIGKILL');
tool.stdin.end(); watcher.stdin.end(); server.close();
process.exit(0);
