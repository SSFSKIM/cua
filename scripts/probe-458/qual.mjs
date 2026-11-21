// #458's qualification kit: main against the fix, on one engine head per dispatch built unmodified. Cells:
// - delivery: the engine's coordinate click on a closed pop-up (TextEdit's font pop-up, Script Editor's language pop-up,
//   Chrome's <select>, TextEdit's font-size combo box on its arrow) in shared-behind, dedicated-behind and shared-front,
//   with the person's windows over the app's (layout a); read at 300 ms and 1.8 s (the app's new windows: a menu's at
//   layer 101, the combo box's list at layer 0), the answer and its meta, the whole window order against the one before
//   the click, the frontmost app, the person's focused window; then the pick of an item (#454's path) or Escape;
// - the restore layouts b, c, d (font and select, shared-behind): a third app's window over the app's as well as the
//   person's (b); three of the person's windows over it, a third app's between them (c); the person's app with a window
//   under the app's, which must stay under (d);
// - parity, 5 rows: a plain page button (Chrome's Beta), an open menu's item (#454: the kit's AXPress opens the font
//   menu), the combo box's text (behind and frontmost).
// A second tool samples the window list every 10 ms (how long the app's window covered F1). Layouts are built with the
// kit's AXRaise, back to front (tool.swift `arrange`), and read back (`layoutBuilt.ok`).
//
//   node scripts/probe-458/qual.mjs --engine <bin> --tool <bin> --out <dir> [--reps n] [--menus a,b] [--routes kinds or
//        layouts] [--modes a,b] [--budget minutes] [--shots n]
// Runs only on a GitHub-hosted runner: it launches, places and closes its own apps.
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {launch, placePid, version} from '../probe-316/browser.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-458: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const list = name => arg(name)?.split(',').map(s => s.trim()).filter(Boolean);
const OUT = arg('out'), TOOL = arg('tool'), ENGINE = arg('engine');
const REPS = Number(arg('reps') ?? 5);
const ONLY_MENUS = list('menus'), ONLY_ROUTES = list('routes'), ONLY_MODES = list('modes');
const BUDGET_MS = Number(arg('budget') ?? 140) * 60_000;
const STARTED = Date.now();
mkdirSync(join(OUT, 'screens'), {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-458:', ...a);
const WIN = {x: 400, y: 30, w: 620, h: 720};
const COVER = {x: 0, y: 40, w: 380, h: 300};
const sh = (cmd, args, timeout = 20_000) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = script => sh('osascript', ['-e', script]);
const pidOf = name => Number(sh('pgrep', ['-x', name]).out.split('\n')[0]) || null;
const fileName = s => s.replace(/[^a-z0-9-]+/gi, '_');
const frontmost = () => {
  const asn = sh('lsappinfo', ['front']).out;
  return (sh('lsappinfo', ['info', '-only', 'bundleid', asn]).out.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] ?? null;
};
const setFront = pid => osa(`tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`).status;

// ---- the page (#452's): a <select>, three buttons low on the page; pointer, focus, input and change events beaconed.
const SCRIPT = `<script>(() => { const load = Math.random().toString(36).slice(2, 10);
const send = (type, extra) => navigator.sendBeacon('/ev', JSON.stringify({load, origin: location.origin, path: location.pathname, type, t: Date.now(), ...extra}));
const idOf = t => { const e = t && t.closest ? t.closest('[id]') : null; return e ? e.id : (t && t.tagName) || null; };
for (const k of ['pointerdown', 'mousedown', 'click', 'focusin', 'submit']) document.addEventListener(k, e => send(k, {id: idOf(e.target), trusted: e.isTrusted}), true);
for (const k of ['input', 'change']) document.addEventListener(k, e => send(k, {id: idOf(e.target), value: e.target.value ?? null}), true);
const run = c => { if (c === 'reload') location.replace('/'); if (c.startsWith('goto:')) location.replace(c.slice(5)); };
(async () => { for (;;) { try { const r = await fetch('/cmd?load=' + load, {cache: 'no-store'}); const j = await r.json(); if (j.cmd) run(j.cmd); } catch (e) { await new Promise(r => setTimeout(r, 500)); } } })();
addEventListener('load', () => send('ready', {}));
})();</script>`;
const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe454 page</title>
<style>body{font:15px -apple-system,Helvetica,sans-serif;margin:0} .a{position:absolute;left:16px}</style></head>
<body id="page"><div id="wrap" style="position:relative;height:560px">
<h3 class="a" style="top:2px;margin:0">probe454 page</h3>
<div class="a" style="top:40px"><select id="sel" aria-label="Choice"><option>One</option><option>Two</option><option>Three</option></select> <button id="top" type="button" style="margin-left:120px">Top</button></div>
<div class="a" style="top:440px"><button id="b1" type="button">Alpha</button> <button id="b2" type="button">Beta</button> <button id="b3" type="button">Gamma</button></div>
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
const SOCK_DIR = join(process.env.RUNNER_TEMP ?? OUT, 's458'); mkdirSync(SOCK_DIR, {recursive: true, mode: 0o700});
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
// A second tool, so the window list is sampled while the first one, or the engine, acts (`watch`).
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
function findNode(sky, roles, want) {
  return sky.nodes.find(n => roles.includes(n.role) && n.frame && n.frame.width > 2 && n.frame.height > 2 && [n.title, n.description, n.placeholder].some(s => typeof s === 'string' && s.trim() === want));
}
function toPixels(sky, p) {
  const f = sky.window.frame, scale = sky.screenshot.width / f.width;
  const px = {x: Math.round((p.x - f.x) * scale), y: Math.round((p.y - f.y) * scale)};
  return {px, screen: {x: f.x + px.x / scale, y: f.y + px.y / scale}};
}
const centre = f => ({x: f.x + f.width / 2, y: f.y + f.height / 2});
const winArr = f => [f.x, f.y, f.width, f.height];
const rect = a => a && {x: a[0], y: a[1], width: a[2], height: a[3]};
const inside = (p, r) => Boolean(r) && p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
const within = (f, r) => f.x >= r.x - 1 && f.y >= r.y - 1 && f.x + f.width <= r.x + r.width + 1 && f.y + f.height <= r.y + r.height + 1;
const rowLabel = r => [r.title, r.description, r.value].filter(v => typeof v === 'string' && v).join(' | ');

/// The menu's elements a picker chooses from: its AX rows, then the two hit scans' (frames inside the menu's window).
function candidates(pop) {
  const pr = rect(pop.popup.bounds);
  const out = [];
  for (const [by, xs] of [['ax', pop.axRows ?? []], ['scan', pop.scan ?? []], ['systemScan', pop.systemScan ?? []]]) {
    for (const r of xs) { const f = rect(r.frame); if (r.role && f && f.width >= 6 && f.height >= 6 && within(f, pr)) out.push({by, ...r, f}); }
  }
  return out;
}
const pick = (c, extra = {}) => c && {by: c.by, role: c.role, title: c.title ?? null, label: rowLabel(c), frame: c.frame, point: centre(c.f), ...extra};
/// The item titled `want`, else the first enabled item after the checked one (`current`), on screen inside the menu.
function menuPick(pop, current, want) {
  const pr = rect(pop.popup.bounds);
  const items = candidates(pop).filter(c => /AXMenuItem/.test(c.role) && c.title && c.f.y >= 0 && c.f.y + c.f.height <= 880)
    .filter((c, i, a) => a.findIndex(d => d.title === c.title) === i).sort((a, b) => a.f.y - b.f.y);
  if (want) return pick(items.find(c => c.title === want) ?? candidates(pop).find(c => rowLabel(c).split(' | ').includes(want)), {expect: want});
  const at = items.findIndex(r => r.mark || r.title === current);
  const next = items.slice(at + 1).find(r => r.enabled !== false && r.title !== current && within(r.f, pr));
  return next ? pick(next, {expect: next.title}) : null;
}




// ---- the controls -------------------------------------------------------------------------------------------------
const MENUS = {
  select: {app: 'chrome', find: {roles: ['AXPopUpButton', 'AXComboBox', 'AXMenuButton'], any: '^Choice'}, current: 'One', want: 'Three',
    node: sky => sky.nodes.find(n => ['AXPopUpButton', 'AXComboBox', 'AXMenuButton'].includes(n.role) && /^Choice/.test(label(n)) && n.frame?.width > 4)},
  font: {app: 'textedit', find: {roles: ['AXPopUpButton'], value: 'Helvetica'}, current: 'Helvetica',
    node: sky => sky.nodes.find(n => n.role === 'AXPopUpButton' && n.value === 'Helvetica')},
  language: {app: 'scripteditor', find: {roles: ['AXPopUpButton'], value: 'AppleScript'}, current: 'AppleScript', want: 'JavaScript',
    node: sky => sky.nodes.find(n => n.role === 'AXPopUpButton' && n.value === 'AppleScript')},
  // TextEdit's font-size combo box, clicked on its arrow (the observation's AXButton inside the box, rightmost).
  combo: {app: 'textedit', find: {roles: ['AXComboBox']}, list: true,
    node: sky => {
      const box = sky.nodes.find(n => n.role === 'AXComboBox' && n.frame?.width > 4);
      return box && sky.nodes.filter(n => n.role === 'AXButton' && n.frame && within(n.frame, box.frame)).sort((a, b) => (b.frame.x + b.frame.width) - (a.frame.x + a.frame.width))[0];
    }},
};
const MODES = {
  'shared-behind': {name: 'shared-behind', desktop: 'shared', front: false},
  'shared-front': {name: 'shared-front', desktop: 'shared', front: true},
  'dedicated-behind': {name: 'dedicated-behind', desktop: 'dedicated', front: false},
};
// The cells: delivery (every control, three modes, layout a), the restore layouts (font and select, shared-behind) and
// parity (5 rows each).
const CELLS = [];
for (const control of ['select', 'font', 'combo', 'language']) for (const mode of ['shared-behind', 'dedicated-behind', 'shared-front']) CELLS.push({kind: 'delivery', control, mode, layout: 'a'});
for (const layout of ['b', 'c', 'd']) for (const control of ['select', 'font']) CELLS.push({kind: 'delivery', control, mode: 'shared-behind', layout});
CELLS.push({kind: 'parity', control: 'button', app: 'chrome', mode: 'shared-behind', layout: 'a', reps: 5});
CELLS.push({kind: 'parity', control: 'menu-item', app: 'textedit', mode: 'shared-behind', layout: 'a', reps: 5});
for (const mode of ['shared-behind', 'shared-front']) CELLS.push({kind: 'parity', control: 'combo-text', app: 'textedit', mode, layout: 'a', reps: 5});
const appOf = cell => cell.app ?? MENUS[cell.control].app;
const SHOTS = Number(arg('shots') ?? 1);

// ---- the layouts --------------------------------------------------------------------------------------------------
// Windows: the app's (App, at WIN) and, for document apps, its second (App2, at WIN2); the person's Finder windows F1
// (focused) to F4; Calculator (Calc), a third app. `order` front to back; a name a layout does not place is absent.
const WIN2 = {x: 460, y: 90, w: 600, h: 690};
const FW = {F1: {x: 760, y: 420, w: 420, h: 320}, F2: {x: 240, y: 480, w: 360, h: 300}, F3: {x: 480, y: 560, w: 320, h: 220}, F4: {x: 600, y: 200, w: 500, h: 300}};
const CALC_BEHIND = {x: 980, y: 260}, CALC_OVER = {x: 250, y: 300};
const LAYOUTS = {
  a: {finder: ['F2', 'F1'], calc: CALC_BEHIND, order: ['F1', 'F2', 'App', 'App2', 'Calc']},
  b: {finder: ['F1'], calc: CALC_OVER, order: ['F1', 'Calc', 'App', 'App2']},
  c: {finder: ['F3', 'F2', 'F1'], calc: CALC_OVER, order: ['F1', 'F2', 'Calc', 'F3', 'App', 'App2']},
  d: {finder: ['F4', 'F1'], calc: CALC_BEHIND, order: ['F1', 'App', 'F4', 'App2', 'Calc']},
};
const dirs = Object.fromEntries(Object.keys(FW).map(k => [k, join(process.env.RUNNER_TEMP ?? OUT, `p458${k}`)]));
for (const d of Object.values(dirs)) mkdirSync(d, {recursive: true});
const LINES = Array.from({length: 22}, (_, i) => `Line ${String(i + 1).padStart(2, '0')} words of a plain document ending eol${String(i + 1).padStart(2, '0')}`);
const rtf = lines => `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs28\n${lines.map(l => `${l}\\par`).join('\n')}\n}`;
const teFile = join(OUT, 'p458.rtf'), teFile2 = join(OUT, 'p458-second.rtf');
writeFileSync(teFile, rtf(LINES)); writeFileSync(teFile2, rtf(['The second window']));
const seFile = join(OUT, 'p458.applescript'), seFile2 = join(OUT, 'p458-second.applescript');
writeFileSync(seFile, LINES.map(l => `-- ${l}`).join('\n') + '\nreturn 1\n'); writeFileSync(seFile2, '-- the second window\nreturn 2\n');
const bounds = f => `{${f.x}, ${f.y}, ${f.x + f.w}, ${f.y + f.h}}`;
const skip = () => [engine?.pid].filter(Boolean);
const orderNow = async () => ((await ask({op: 'order', skip: skip()})).windows ?? []);
const at = (w, f) => Math.abs(w.bounds[0] - f.x) <= 3 && Math.abs(w.bounds[1] - f.y) <= 3;
/// The layout's windows by name in a window list.
function named(list, appPid) {
  const out = {};
  for (const w of list) {
    if (w.owner === 'Finder') { for (const [k, f] of Object.entries(FW)) if (at(w, f)) out[k] = w.n; }
    else if (w.owner === 'Calculator') out.Calc ??= w.n;
    else if (w.pid === appPid) { if (at(w, WIN) || (Math.abs(w.bounds[0] - WIN.x) <= 3 && Math.abs(w.bounds[1] - (WIN.y + 1)) <= 3)) out.App ??= w.n; else if (at(w, WIN2)) out.App2 ??= w.n; }
  }
  return out;
}
const nameOf = (names, n) => Object.entries(names).find(([, v]) => v === n)?.[0] ?? null;
/// Builds the layout: Finder's windows reopened (every other closed), Calculator placed, Finder made frontmost, then the
/// layout's windows raised back to front by AXRaise (`arrange`); with `front`, the app made frontmost after. Answers the
/// order it reads.
async function buildLayout(layoutName, appPid, front) {
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
  const wins = [...L.order].reverse().map(k => names[k]).filter(Boolean);
  const arranged = await ask({op: 'arrange', wins}, 15_000);
  if (front) { setFront(appPid); await sleep(700); }
  await sleep(300);
  list = await orderNow();
  const actual = list.map(w => nameOf(names, w.n)).filter(Boolean);
  const want = L.order.filter(k => names[k]);
  return {layout: layoutName, names, arranged: arranged.raised, actual, ok: front || JSON.stringify(actual) === JSON.stringify(want)};
}
async function escapeTwice(pid) {
  try { const w = await connect('shared'); for (let i = 0; i < 2; i++) { await w.execute('press_key', {pid, key: 'Escape'}); await sleep(250); } w.close(); } catch {}
}
function chromeApp() {
  const profileRoot = join(process.env.RUNNER_TEMP ?? OUT, 'p458c');
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
      await escapeTwice(b.pid);
      const prev = lastReady()?.load ?? null;
      sendCmd(`goto:${URL_}`);
      if (!(await newLoad(prev))) { notes.push('no reload: relaunch'); await relaunch(); }
      await ask({op: 'focusweb', pid: b.pid});
      placePid(b.pid, WIN);
      notes.push(await buildLayout(layout.name, b.pid, layout.front));
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
      return [await buildLayout(layout.name, pid(), layout.front)];
    },
    close: () => quit(name),
  };
}


// ---- one row ------------------------------------------------------------------------------------------------------
const results = [];
const config = {kit: 'probe-458 qual', engineRef: process.env.P458_ENGINE_REF ?? null, engineLabel: process.env.P458_ENGINE_LABEL ?? null, reps: REPS,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), commit: process.env.GITHUB_SHA ?? null, image: process.env.ImageVersion ?? null, url: URL_};
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));
/// The windows of `before` whose order differs in `after` (both front to back, those in both).
function moved(before, after) {
  const common = new Set(before.map(w => w.n).filter(n => after.some(w => w.n === n)));
  const b = before.filter(w => common.has(w.n)), a = after.filter(w => common.has(w.n));
  const front = (list, n) => new Set(list.slice(0, list.findIndex(w => w.n === n)).map(w => w.n));
  return b.filter(w => { const x = front(b, w.n), y = front(a, w.n); return x.size !== y.size || [...x].some(n => !y.has(n)); }).map(w => w.n);
}
/// The state after an action: the app's windows new since `baseline` (a menu's at layer 101; the combo box's list at layer
/// 0), the opener's value and AXExpanded, the frontmost app, the app's AXFrontmost, the person's focused window, the order.
async function snap(pid, wf, baseline) {
  const pop = await ask({op: 'popup', pid, window: winArr(wf)});
  const st = await ask({op: 'state', pid});
  const person = await ask({op: 'state', pid: pidOf('Finder')});
  const fresh = (pop.appWindows ?? []).filter(x => !baseline.has(x.n) && x.bounds?.[2] >= 20 && x.bounds?.[3] >= 20).map(x => ({n: x.n, layer: x.layer, bounds: x.bounds}));
  return {menuUp: fresh.some(x => x.layer >= 100), newWindows: fresh, value: st.opener?.value ?? null, expanded: st.opener?.expanded ?? null,
    focused: st.focused ? `${st.focused.role}${typeof st.focused.subrole === 'string' ? `/${st.focused.subrole}` : ''}` : null,
    appFrontmost: st.axFrontmost, front: frontmost(), personFocusedWindow: person.focusedWindow ?? null, order: await orderNow()};
}
const orderNames = (list, names) => list.map(w => nameOf(names, w.n) ?? `${w.owner}:${w.n}`);

async function runRow(app, cell, rep) {
  const mode = MODES[cell.mode];
  const lab = `${cell.kind}-${cell.control}-${cell.mode}-${cell.layout}-${rep}`;
  const row = {label: lab, ...cell, rep};
  results.push(row);
  let w;
  try {
    await ask({op: 'forget'});
    const notes = await app.reset({name: cell.layout, front: mode.front});
    row.layoutBuilt = notes.find(x => x?.layout) ?? null;
    const pid = app.pid();
    const names = row.layoutBuilt?.names ?? {};
    w = await connect(mode.desktop);
    const sky0 = await observe(w, pid, `${lab}-obs`);
    const wf = sky0.window.frame;
    const pop0 = await ask({op: 'popup', pid, window: winArr(wf)});
    const baseline = new Set((pop0.appWindows ?? []).map(x => x.n));
    const ord0 = await orderNow();
    row.before = {order: orderNames(ord0, names), front: frontmost(), personFocusedWindow: (await ask({op: 'state', pid: pidOf('Finder')})).focusedWindow ?? null};
    const target = pop0.target?.n;
    const t0 = Date.now();
    const watching = askWatch({op: 'watch', pid, ms: 5000, target: target ?? -1, user: names.F1 ?? -1, skip: skip()}, 20_000);
    await sleep(30);
    let point, node;
    if (cell.kind === 'delivery') {
      const mn = MENUS[cell.control];
      node = mn.node(sky0);
      if (!node) { row.problem = 'no control in the observation'; return; }
      await ask({op: 'open', pid, find: mn.find});
      point = centre(node.frame);
    } else if (cell.control === 'button') {
      node = findNode(sky0, ['AXButton'], 'Beta');
      if (!node) { row.problem = 'no Beta button'; return; }
      point = centre(node.frame);
    } else if (cell.control === 'combo-text') {
      node = sky0.nodes.find(n => n.role === 'AXComboBox' && n.frame?.width > 4);
      if (!node) { row.problem = 'no combo box'; return; }
      await ask({op: 'open', pid, find: {roles: ['AXComboBox']}});
      point = {x: node.frame.x + 12, y: node.frame.y + node.frame.height / 2};
    } else if (cell.control === 'menu-item') {
      // #454's cell: the font menu opened by the kit's AXPress, then the engine's click on an item.
      const open = await ask({op: 'open', pid, find: MENUS.font.find, action: 'AXPress'}, 15_000);
      row.kitOpen = open.result ?? open.error;
      await sleep(900);
      const sky1 = await observe(w, pid, `${lab}-reobs`);
      const pop = await ask({op: 'popup', pid, window: winArr(sky1.window.frame)});
      row.pick = pop.popup ? menuPick(pop, MENUS.font.current) : null;
      if (!row.pick) { row.problem = 'no item in the kit-opened menu'; return; }
      point = row.pick.point;
      row.pickSky = true;
      row.click = brief(await w.execute('click', {pid, ...toPixels(sky1, point).px}));
    }
    row.node = node && {role: node.role, frame: node.frame, actions: node.actions};
    if (!row.click) {
      const {px} = toPixels(sky0, point);
      row.point = px;
      const mark = events.length;
      row.click = brief(await w.execute('click', {pid, x: px.x, y: px.y}));
      row.clickEvents = () => events.slice(mark);
    }
    row.actMs = Date.now() - t0;
    await sleep(300);
    const quick = await ask({op: 'popup', pid, window: winArr(wf)});
    row.quickNew = (quick.appWindows ?? []).filter(x => !baseline.has(x.n) && x.bounds?.[2] >= 20).map(x => x.layer);
    await sleep(1500);
    const after = await snap(pid, wf, baseline);
    row.after = {...after, order: orderNames(after.order, names)};
    row.watch = await watching;
    row.moved = moved(ord0, after.order).map(n => nameOf(names, n) ?? n);
    row.orderRestored = row.moved.length === 0;
    if (row.clickEvents) { row.page = [...new Set(row.clickEvents().filter(e => ['click', 'mousedown', 'focusin', 'change'].includes(e.type)).map(e => `${e.type}:${e.id}${e.value ? `=${e.value}` : ''}`))]; delete row.clickEvents; }
    const opened = MENUS[cell.control]?.list ? after.newWindows.length > 0 || after.expanded === true : after.menuUp;
    row.opened = cell.kind === 'delivery' ? (opened ? 'open at 1.8 s' : row.quickNew.length ? 'opened-closed' : 'none') : null;
    // The pick afterwards (#454's path), for the pop-up menus left open.
    if (cell.kind === 'delivery' && after.menuUp && !MENUS[cell.control].list) {
      const mn = MENUS[cell.control];
      const sky1 = await observe(w, pid, `${lab}-reobs`);
      const pop = await ask({op: 'popup', pid, window: winArr(sky1.window.frame)});
      row.pick = pop.popup ? menuPick(pop, mn.current, mn.want) : null;
      if (row.pick) {
        const mark = events.length;
        row.itemClick = brief(await w.execute('click', {pid, ...toPixels(sky1, row.pick.point).px}));
        await sleep(1200);
        const st = await ask({op: 'state', pid});
        const ord2 = await orderNow();
        const changed = events.slice(mark).filter(e => e.type === 'change' && e.id === 'sel').map(e => e.value).pop() ?? (st.opener?.value !== after.value ? st.opener?.value : null);
        row.item = {taken: changed === row.pick.expect, changed: changed ?? null, front: frontmost(), moved: moved(ord0, ord2).map(n => nameOf(names, n) ?? n)};
      }
    } else if (cell.kind === 'delivery' && opened) {
      await w.execute('press_key', {pid, key: 'Escape'}); await sleep(500);
      const ord2 = await orderNow();
      row.afterEscape = {moved: moved(ord0, ord2).map(n => nameOf(names, n) ?? n), front: frontmost()};
    }
    if (rep <= SHOTS) sh('screencapture', ['-x', '-t', 'jpg', join(OUT, 'screens', `${fileName(lab)}.jpg`)]);
  } catch (e) { if (e.setup) row.problem = e.message; else row.exception = String(e?.stack || e).slice(0, 1500); }
  finally {
    w?.close(); save();
    const pc = row.click?.meta?.popUpClick;
    log(`${lab}: ${row.problem ?? row.exception?.split('\n')[0] ?? `${row.click?.error ?? 'ok'} route=${row.click?.route} popUpClick=${JSON.stringify(pc ?? null)} opened=${row.opened} restored=${row.orderRestored} moved=${JSON.stringify(row.moved)} front=${row.after?.front} app=${row.after?.appFrontmost} cover=${row.watch?.aboveMs} item=${row.itemClick ? `${row.itemClick.error ?? 'ok'}/${row.item?.taken}` : '-'} layout=${row.layoutBuilt?.ok}:${row.layoutBuilt?.actual?.join('>')} msg=${(row.click?.message ?? '').slice(0, 140)}`}`);
  }
}

async function run() {
  config.chrome = version('stable');
  const cells = CELLS.filter(c => (!ONLY_MENUS || ONLY_MENUS.includes(c.control)) && (!ONLY_MODES || ONLY_MODES.includes(c.mode)) && (!ONLY_ROUTES || ONLY_ROUTES.includes(c.layout) || ONLY_ROUTES.includes(c.kind)));
  for (const appName of ['chrome', 'textedit', 'scripteditor']) {
    const mine = cells.filter(c => appOf(c) === appName);
    if (!mine.length) continue;
    const app = appName === 'chrome' ? chromeApp() : appName === 'textedit' ? docApp('TextEdit', 'TextEdit', teFile, teFile2) : docApp('Script Editor', 'Script Editor', seFile, seFile2);
    for (let rep = 1; rep <= REPS; rep++) for (const cell of mine) {
      if (rep > (cell.reps ?? REPS)) continue;
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
