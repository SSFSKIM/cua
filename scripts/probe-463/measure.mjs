// #463's measurement kit: which transient UI a background coordinate click opens and route 3's shared-mode restore then
// closes, while the click answers ok. One engine head per dispatch, built unmodified. Built on #458's qual kit
// (scripts/probe-458/qual.mjs: the layouts, the 10 ms window-list sampler and the key-window watch).
// Controls (CONTROLS): TextEdit's format-bar menu button, its text view's context menu (a right click), its colour well;
// Chrome's toolbar (the app menu, the profile button, the bookmark star, the site-information icon, the extensions
// puzzle, the tab-search button), the page's context menu, and the page's <input list> (its datalist arrow), <input
// type=date> (its calendar icon) and <input type=color>. Routes:
// - click: the engine's coordinate click at the control the observation recorded (right button for the context menus),
//   in shared-behind, shared-front and dedicated-behind, layout a (#458 qual's: Finder F1 > F2 > the app's window(s) >
//   Calculator, built back to front as a person does);
// - element: the engine's element click on the node (left controls), shared-behind;
// - showmenu: the engine's perform_secondary_action "Show Menu" on the node, where it advertises AXShowMenu;
// - kit:AXPress, kit:AXShowMenu: the kit's own AX action on the node (found by role and frame), the app behind.
// Each row: one observation, then the watch (tool.swift `watch` with `fresh`): every window new since its start, any
// owner but the engine, any layer, sampled every 10 ms for 4 s, with the person's (Finder's) focused and main window read
// each sample; the window list again at 1.8 s; the answer and its meta.
//
//   node scripts/probe-463/measure.mjs --engine <bin> --tool <bin> --out <dir> [--reps n (caps every cell's)]
//        [--controls a,b] [--routes click,element,...] [--modes a,b] [--budget minutes] [--shots n]
// Runs only on a GitHub-hosted runner: it launches, places and closes its own apps.
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {launch, placePid, version} from '../probe-316/browser.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-463: runs only on a GitHub-hosted runner'); process.exit(2); }
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
const log = (...a) => console.log('probe-463:', ...a);
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

// ---- the page: the transient openers high on the page (clear of F1 and F2), a blank area for the context menu.
const SCRIPT = `<script>(() => { const load = Math.random().toString(36).slice(2, 10);
const send = (type, extra) => navigator.sendBeacon('/ev', JSON.stringify({load, origin: location.origin, path: location.pathname, type, t: Date.now(), ...extra}));
const idOf = t => { const e = t && t.closest ? t.closest('[id]') : null; return e ? e.id : (t && t.tagName) || null; };
for (const k of ['pointerdown', 'mousedown', 'click', 'contextmenu', 'focusin', 'submit']) document.addEventListener(k, e => send(k, {id: idOf(e.target), trusted: e.isTrusted, button: e.button}), true);
for (const k of ['input', 'change']) document.addEventListener(k, e => send(k, {id: idOf(e.target), value: e.target.value ?? null}), true);
const run = c => { if (c === 'reload') location.replace('/'); if (c.startsWith('goto:')) location.replace(c.slice(5)); };
(async () => { for (;;) { try { const r = await fetch('/cmd?load=' + load, {cache: 'no-store'}); const j = await r.json(); if (j.cmd) run(j.cmd); } catch (e) { await new Promise(r => setTimeout(r, 500)); } } })();
addEventListener('load', () => send('ready', {}));
})();</script>`;
const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe463 page</title>
<style>body{font:15px -apple-system,Helvetica,sans-serif;margin:0} .a{position:absolute;left:16px} input{font-size:15px}
input[list]::-webkit-calendar-picker-indicator{opacity:1;display:block}</style></head>
<body id="page"><div id="wrap" style="position:relative;height:560px">
<h3 class="a" style="top:2px;margin:0">probe463 page</h3>
<div class="a" style="top:40px"><input id="dl" list="fruits" aria-label="Fruit" style="width:180px"><datalist id="fruits"><option value="Apple"><option value="Banana"><option value="Cherry"></datalist></div>
<div class="a" style="top:90px"><input id="date" type="date" aria-label="When" value="2026-11-21"></div>
<div class="a" style="top:140px"><input id="color" type="color" aria-label="Hue" value="#3366cc" style="width:60px;height:30px"></div>
<div id="blank" class="a" style="top:190px;width:300px;height:160px">Blank area for the context menu.</div>
</div>${SCRIPT}</body></html>`;

const events = [];
let pollers = [], queued = null;
function serve(req, res) {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'});
    res.end(PAGE);
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
const SOCK_DIR = join(process.env.RUNNER_TEMP ?? OUT, 's463'); mkdirSync(SOCK_DIR, {recursive: true, mode: 0o700});
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

// ---- the controls -------------------------------------------------------------------------------------------------
// `node` finds the control in the observation; `point` (default the centre) is where the coordinate click goes; `right`
// a right click; `alts` the element routes that apply.
const PRIORITY = ['AXPopUpButton', 'AXMenuButton', 'AXButton', 'AXCheckBox', 'AXRadioButton', 'AXColorWell', 'AXComboBox', 'AXTextField', 'AXDateField'];
const rank = n => { const i = PRIORITY.indexOf(n.role); return i < 0 ? 99 : i; };
/// A toolbar node (above the web area) whose label matches `re`, a button-like role first.
const toolbar = re => sky => {
  const wf = sky.window.frame;
  return sky.nodes.filter(n => big(n.frame) && n.frame.y < wf.y + 130 && n.role !== 'AXStaticText' && labelled(n, re)).sort((a, b) => rank(a) - rank(b))[0];
};
/// Whether any of the node's labels (title, description, value, placeholder) matches `re`.
const labelled = (n, re) => label(n).split(' | ').some(s => re.test(s));
const pageNode = (re, roles) => sky => sky.nodes.filter(n => big(n.frame) && (!roles || roles.includes(n.role)) && labelled(n, re) && n.role !== 'AXStaticText').sort((a, b) => rank(a) - rank(b))[0];
const LEFT_ALTS = ['element', 'showmenu', 'kit:AXPress', 'kit:AXShowMenu'];
const CONTROLS = {
  // TextEdit: the format bar's list-style menu button (a pull-down), the title bar's document-actions menu button (it
  // opens the document's popover), the text view's context menu, the text colour well.
  'te-menubutton': {app: 'textedit', alts: LEFT_ALTS, node: sky => sky.nodes.find(n => n.role === 'AXMenuButton' && big(n.frame) && labelled(n, /^list style$/i))},
  'te-doctitle': {app: 'textedit', alts: LEFT_ALTS, node: sky => sky.nodes.find(n => n.role === 'AXMenuButton' && big(n.frame) && labelled(n, /^document actions$/i))},
  'te-context': {app: 'textedit', right: true, alts: ['showmenu', 'kit:AXShowMenu'],
    node: sky => sky.nodes.find(n => n.role === 'AXTextArea' && big(n.frame)), point: f => ({x: f.x + 120, y: f.y + 40})},
  'te-color': {app: 'textedit', alts: LEFT_ALTS,
    node: sky => sky.nodes.find(n => n.role === 'AXColorWell' && big(n.frame) && labelled(n, /^text color$/i))},
  // Chrome's toolbar.
  'cr-appmenu': {app: 'chrome', alts: LEFT_ALTS, node: toolbar(/customize and control|^chrome$/i)},
  'cr-profile': {app: 'chrome', alts: LEFT_ALTS, node: toolbar(/^you$|profile|^guest|not signed in|^person/i)},
  'cr-star': {app: 'chrome', alts: LEFT_ALTS, node: toolbar(/bookmark this tab|edit bookmark/i)},
  'cr-siteinfo': {app: 'chrome', alts: LEFT_ALTS, node: toolbar(/view site information|site information|not secure/i)},
  'cr-puzzle': {app: 'chrome', alts: LEFT_ALTS, node: toolbar(/^extensions$/i)},
  'cr-tabsearch': {app: 'chrome', alts: LEFT_ALTS, node: toolbar(/search tabs|tab search/i)},
  // The page.
  'cr-context': {app: 'chrome', right: true, alts: ['showmenu', 'kit:AXShowMenu'],
    node: sky => sky.nodes.find(n => n.role === 'AXWebArea' && big(n.frame)), point: f => ({x: f.x + 220, y: f.y + 260})},
  'pg-datalist': {app: 'chrome', alts: LEFT_ALTS, node: pageNode(/^Fruit/), point: f => ({x: f.x + f.width - 9, y: f.y + f.height / 2})},
  'pg-date': {app: 'chrome', alts: LEFT_ALTS, node: pageNode(/^When/), point: f => ({x: f.x + f.width - 12, y: f.y + f.height / 2})},
  'pg-color': {app: 'chrome', alts: LEFT_ALTS, node: pageNode(/^Hue/)},
};
const MODES = {
  'shared-behind': {name: 'shared-behind', desktop: 'shared', front: false},
  'shared-front': {name: 'shared-front', desktop: 'shared', front: true},
  'dedicated-behind': {name: 'dedicated-behind', desktop: 'dedicated', front: false},
};
// The cells, with their rows: the coordinate click in the three modes, then the element routes behind.
const CELLS = [];
for (const [control, c] of Object.entries(CONTROLS)) {
  CELLS.push({route: 'click', control, mode: 'shared-behind', reps: 6});
  CELLS.push({route: 'click', control, mode: 'shared-front', reps: 5});
  CELLS.push({route: 'click', control, mode: 'dedicated-behind', reps: 3});
  for (const alt of c.alts) CELLS.push({route: alt, control, mode: 'shared-behind', reps: alt.startsWith('kit:') ? 3 : 5});
}
const appOf = cell => CONTROLS[cell.control].app;
const cellKey = c => `${c.control}|${c.route}|${c.mode}`;

// ---- the layout (#458 qual's a) -------------------------------------------------------------------------------------
const WIN2 = {x: 460, y: 90, w: 600, h: 690};
const FW = {F1: {x: 760, y: 420, w: 420, h: 320}, F2: {x: 240, y: 480, w: 360, h: 300}};
const CALC = {x: 980, y: 260};
const ORDER = ['F1', 'F2', 'App', 'App2', 'Calc'];
const dirs = Object.fromEntries(Object.keys(FW).map(k => [k, join(process.env.RUNNER_TEMP ?? OUT, `p463${k}`)]));
for (const d of Object.values(dirs)) mkdirSync(d, {recursive: true});
const LINES = Array.from({length: 22}, (_, i) => `Line ${String(i + 1).padStart(2, '0')} words of a plain document ending eol${String(i + 1).padStart(2, '0')}`);
const rtf = lines => `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs28\n${lines.map(l => `${l}\\par`).join('\n')}\n}`;
const teFile = join(OUT, 'p463.rtf'), teFile2 = join(OUT, 'p463-second.rtf');
writeFileSync(teFile, rtf(LINES)); writeFileSync(teFile2, rtf(['The second window']));
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
async function buildLayout(appPid, front) {
  osa('tell application "Finder" to close every window');
  await sleep(300);
  for (const k of ['F2', 'F1']) {
    sh('open', [dirs[k]]);
    await sleep(700);
    osa(`tell application "Finder" to set bounds of front Finder window to ${bounds(FW[k])}`);
  }
  if (!pidOf('Calculator')) { sh('open', ['-a', 'Calculator']); await sleep(2500); }
  osa(`tell application "System Events" to tell process "Calculator" to set position of window 1 to {${CALC.x}, ${CALC.y}}`);
  setFront(pidOf('Finder'));
  await sleep(500);
  let list = await orderNow();
  const names = named(list, appPid);
  const wins = [...ORDER].reverse().map(k => names[k]).filter(Boolean);
  for (const n of wins) await ask({op: 'front', n}, 15_000);
  if (front) { setFront(appPid); await sleep(700); }
  await sleep(300);
  list = await orderNow();
  const actual = list.map(w => nameOf(names, w.n)).filter(Boolean);
  const want = ORDER.filter(k => names[k]);
  return {layout: 'a', names, actual, ok: front || JSON.stringify(actual) === JSON.stringify(want)};
}
async function escapeTwice(pid) {
  try { const w = await connect('shared'); for (let i = 0; i < 2; i++) { await w.execute('press_key', {pid, key: 'Escape'}); await sleep(250); } w.close(); } catch {}
}
function chromeApp() {
  const profileRoot = join(process.env.RUNNER_TEMP ?? OUT, 'p463c');
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
    reset: async front => {
      const notes = [];
      if (!b || b.exitCode !== null) { await relaunch(); notes.push('launched'); }
      await ask({op: 'hover', x: 200, y: 860});
      await escapeTwice(b.pid);
      // What a row opened (a bubble, a picker, the colour panel) is closed; anything left relaunches Chrome.
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
      notes.push(await buildLayout(b.pid, front));
      return notes;
    },
    close: async () => { if (b && b.exitCode === null) { b.kill('SIGTERM'); await sleep(1500); } },
  };
}
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
    reset: async front => {
      await ask({op: 'hover', x: 200, y: 860});
      await quit(name);
      sh('open', ['-a', appName, file2]);
      for (let i = 0; i < 40; i++) { await sleep(300); if (Number(osa(`tell application "System Events" to count windows of process "${name}"`).out) >= 1) break; }
      sh('open', ['-a', appName, file]);
      for (let i = 0; i < 40; i++) { await sleep(300); if (Number(osa(`tell application "System Events" to count windows of process "${name}"`).out) >= 2) break; }
      await sleep(500);
      place(2, WIN2); place(1, WIN);
      await sleep(400);
      return [await buildLayout(pid(), front)];
    },
    close: () => quit(name),
  };
}

// ---- one row ------------------------------------------------------------------------------------------------------
const results = [];
const config = {kit: 'probe-463 measure', engineRef: process.env.P463_ENGINE_REF ?? null, engineLabel: process.env.P463_ENGINE_LABEL ?? null, reps: REPS,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), commit: process.env.GITHUB_SHA ?? null, image: process.env.ImageVersion ?? null, url: URL_, inventory: {}};
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));
function moved(before, after) {
  const common = new Set(before.map(w => w.n).filter(n => after.some(w => w.n === n)));
  const b = before.filter(w => common.has(w.n)), a = after.filter(w => common.has(w.n));
  const front = (list, n) => new Set(list.slice(0, list.findIndex(w => w.n === n)).map(w => w.n));
  return b.filter(w => { const x = front(b, w.n), y = front(a, w.n); return x.size !== y.size || [...x].some(n => !y.has(n)); }).map(w => w.n);
}
const orderNames = (list, names) => list.map(w => nameOf(names, w.n) ?? `${w.owner}:${w.n}`);
/// The observation's openers and the toolbar strip, once per app: what a selector could pick.
function inventory(sky) {
  const wf = sky.window.frame;
  const roles = new Set(['AXMenuButton', 'AXPopUpButton', 'AXColorWell', 'AXDisclosureTriangle', 'AXComboBox', 'AXDateField', 'AXTimeField']);
  return sky.nodes.filter(n => big(n.frame) && (roles.has(n.role) || (n.frame.y < wf.y + 130 && n.role !== 'AXStaticText')))
    .slice(0, 80).map(n => [n.role, label(n).slice(0, 60), winArr(n.frame).map(Math.round), n.actions ?? null]);
}
const hasAction = (n, a) => (n.actions ?? []).some(x => x === a || x === a.replace(/^AX/, '').replace(/([a-z])([A-Z])/g, '$1 $2'));
/// The watch's fresh windows as spans, in ms since the action began: [n, owner, layer, alpha, bounds, from, to or null].
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
const unsupported = new Set(), misses = new Map();

async function runRow(app, cell, rep) {
  const mode = MODES[cell.mode], ctl = CONTROLS[cell.control];
  const lab = `${cell.control}-${cell.route}-${cell.mode}-${rep}`;
  const row = {label: lab, ...cell, rep};
  results.push(row);
  let w;
  try {
    await ask({op: 'forget'});
    const notes = await app.reset(mode.front);
    row.reset = notes.filter(x => !x?.layout);
    row.layoutBuilt = notes.find(x => x?.layout) ?? null;
    const pid = app.pid();
    const names = row.layoutBuilt?.names ?? {};
    w = await connect(mode.desktop);
    const sky0 = await observe(w, pid, `${lab}-obs`);
    if (!config.inventory[ctl.app]) { config.inventory[ctl.app] = inventory(sky0); }
    const node = ctl.node(sky0);
    if (!node) { row.problem = 'no control in the observation'; row.inventory = inventory(sky0); misses.set(cell.control, (misses.get(cell.control) ?? 0) + 1); return; }
    row.node = {role: node.role, label: label(node).slice(0, 80), frame: node.frame, actions: node.actions ?? null, token: node.token ?? null};
    const action = cell.route === 'showmenu' || cell.route === 'kit:AXShowMenu' ? 'AXShowMenu' : cell.route === 'kit:AXPress' ? 'AXPress' : null;
    if (action && !hasAction(node, action)) { row.problem = `no ${action} advertised`; unsupported.add(cellKey(cell)); return; }
    if (cell.route === 'element' && !node.token) { row.problem = 'no token'; return; }
    const wf = sky0.window.frame;
    const pop0 = await ask({op: 'popup', pid, window: winArr(wf)});
    const baseline = new Set((pop0.appWindows ?? []).map(x => x.n));
    const ord0 = await orderNow();
    const finder = pidOf('Finder');
    row.before = {order: orderNames(ord0, names), front: frontmost(), personFocusedWindow: (await ask({op: 'state', pid: finder})).focusedWindow ?? null};
    row.f1Bounds = ord0.find(x => x.n === names.F1)?.bounds ?? null;
    const watching = askWatch({op: 'watch', pid, ms: WATCH_MS, target: pop0.target?.n ?? -1, user: names.F1 ?? -1, skip: skip(), person: finder, fresh: true}, 20_000);
    await sleep(40);
    const mark = events.length;
    const t0 = Date.now();
    row.actAt = t0;
    if (cell.route === 'click') {
      const point = (ctl.point ?? centre)(node.frame);
      const {px} = toPixels(sky0, point);
      row.point = px;
      row.click = brief(await w.execute('click', {pid, x: px.x, y: px.y, ...(ctl.right ? {mouse_button: 'right'} : {})}));
    } else if (cell.route === 'element') {
      row.click = brief(await w.execute('click', {pid, element: node.token}));
    } else if (cell.route === 'showmenu') {
      row.click = brief(await w.execute('perform_secondary_action', {pid, element: node.token, action: 'Show Menu'}));
    } else {
      const r = await ask({op: 'open', pid, find: {roles: [node.role], frame: winArr(node.frame)}, action}, 15_000);
      row.kit = {result: r.result ?? null, error: r.error ?? null, ms: r.ms ?? null};
    }
    row.actMs = Date.now() - t0;
    const left = t0 + AT_MS - Date.now(); if (left > 0) await sleep(left);
    // At 1.8 s: the app's windows new since the observation, the order, the frontmost app, the person's focused window.
    const pop = await ask({op: 'popup', pid, window: winArr(wf)});
    const person = await ask({op: 'state', pid: finder});
    const ord1 = await orderNow();
    row.after = {at: Date.now() - t0, appNew: (pop.appWindows ?? []).filter(x => !baseline.has(x.n) && x.bounds?.[2] >= 10 && x.bounds?.[3] >= 10).map(x => ({layer: x.layer, alpha: x.alpha, bounds: x.bounds})),
      front: frontmost(), personFocusedWindow: person.focusedWindow ?? null, order: orderNames(ord1, names)};
    if (rep <= SHOTS) sh('screencapture', ['-x', '-t', 'jpg', join(OUT, 'screens', `${fileName(lab)}.jpg`)]);
    row.watch = await watching;
    row.spans = spans(row.watch, t0);
    delete row.watch.freshSamples;
    row.watch.samples = row.watch.samples?.slice(0, 40);
    // The person's key window through the row (#458 qual's): each sample's focused and main window against F1.
    if (row.f1Bounds) {
      const isF1 = f => Array.isArray(f) && f.slice(0, 2).every((v, i) => Math.abs(v - row.f1Bounds[i]) <= 3);
      const ps = row.watch.personSamples ?? [];
      row.key = {samples: ps.length, reads: row.watch.personReads,
        focusedOff: ps.filter(x => x[1] !== null && !isF1(x[1])).map(x => [x[0], x[1]]), mainOff: ps.filter(x => x[2] !== null && !isF1(x[2])).map(x => [x[0], x[2]]),
        unread: ps.filter(x => x[1] === null).length, endF1: isF1(ps[ps.length - 1]?.[1])};
      row.key.offMs = Math.round(ps.reduce((sum, x, i) => x[1] !== null && !isF1(x[1]) ? sum + ((ps[i + 1]?.[0] ?? WATCH_MS) - x[0]) : sum, 0));
      delete row.watch.personSamples;
    }
    row.moved = moved(ord0, ord1).map(n => nameOf(names, n) ?? n);
    row.page = [...new Set(events.slice(mark).filter(e => ['mousedown', 'click', 'contextmenu', 'focusin', 'change', 'input'].includes(e.type)).map(e => `${e.type}:${e.id}`))];
    // The restore's times on the action's clock: the hold's start and its release (delivery.releasedAt).
    const d = row.click?.meta?.delivery;
    if (d) row.restoreAt = {hold: d.holdStartedAt != null ? d.holdStartedAt - t0 : null, release: d.releasedAt != null ? d.releasedAt - t0 : null, screenHoldMs: d.screenHoldMs ?? null, restores: d.restores ?? null};
  } catch (e) { row.exception = String(e?.stack || e).slice(0, 1500); }
  finally {
    w?.close(); save();
    const ui = (row.spans ?? []).filter(s => s.bounds[2] >= 30 && s.bounds[3] >= 20);
    log(`${lab}: ${row.problem ?? row.exception?.split('\n')[0] ?? `${row.click?.error ?? (row.kit ? `kit ${row.kit.result ?? row.kit.error}` : 'ok')} route=${row.click?.route} node=${row.node?.role}:${row.node?.label} ui=${JSON.stringify(ui.map(s => [s.owner, s.layer, s.alpha, s.bounds.map(Math.round), s.from, s.to]))} restore=${JSON.stringify(row.restoreAt ?? null)} appNew@1.8=${row.after?.appNew?.length} moved=${JSON.stringify(row.moved)} front=${row.after?.front} keyOff=${row.key?.offMs} layout=${row.layoutBuilt?.ok} msg=${(row.click?.message ?? '').slice(0, 140)}`}`);
  }
}

async function run() {
  config.chrome = version('stable');
  const cells = CELLS.filter(c => (!ONLY_CONTROLS || ONLY_CONTROLS.includes(c.control)) && (!ONLY_MODES || ONLY_MODES.includes(c.mode)) && (!ONLY_ROUTES || ONLY_ROUTES.includes(c.route)));
  for (const appName of ['textedit', 'chrome']) {
    const mine = cells.filter(c => appOf(c) === appName);
    if (!mine.length) continue;
    const app = appName === 'chrome' ? chromeApp() : docApp('TextEdit', 'TextEdit', teFile, teFile2);
    const most = Math.max(...mine.map(c => Math.min(c.reps, REPS)));
    for (let rep = 1; rep <= most; rep++) for (const cell of mine) {
      if (rep > Math.min(cell.reps, REPS)) continue;
      // A control two observations did not hold, or an action its node does not advertise, is not tried again.
      if (unsupported.has(cellKey(cell)) || (misses.get(cell.control) ?? 0) >= 2) continue;
      if (Date.now() - STARTED > BUDGET_MS) { config.budgetStop = true; save(); return; }
      await runRow(app, cell, rep);
    }
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
