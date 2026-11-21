// #458's restore kit: after a background app's pop-up menu is opened by the engine's element click on its closed
// button (AXPress) and finished with, can the person's window order be put back? On one engine head built unmodified;
// the restore itself is the kit's (tool.swift `restore`: route 3's delivery-guard repair, an AXRaise on the person's
// focused window inside a screen-update hold while the app's window is in front of it).
//
// The layout: the app's window, its second window behind it (document apps), the person's Finder frontmost with its
// focused window F1 over the app's lower right and a second window F2 over its lower left, and Calculator behind them
// all. Each row: a re-set, one observation, the element click on the button, then a route:
//   pick+r, escape+r, cancel+r   the menu ended by the engine's coordinate click on an item (#454's AXPick path), the
//                                engine's Escape, or the kit's AXCancel on the menu, then the kit's restore
//   pick, escape                 the same with no restore (the baseline)
//   raise-open                   the restore while the menu is still open, then Escape
//   person-click                 a HID click inside F1 while the menu is open (the person clicking elsewhere), then the
//                                restore
//   timeout                      the menu left open 8 s, then Escape, no restore
// Read before the open, once it is open and at the end (and between, where a route has two steps): the menu, the
// pop-up's value, the frontmost app, the app's AXFrontmost, the person's focused window, the full layer-0 window order;
// a second tool samples the window list every 10 ms through the row (how long the app's window covered F1).
//
//   node scripts/probe-458/restore.mjs --engine <bin> --tool <bin> --out <dir> [--reps n] [--menus a,b] [--routes a,b]
//        [--modes a,b] [--budget minutes] [--shots n]
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



const MENUS = {
  select: {app: 'chrome', find: {roles: ['AXPopUpButton', 'AXComboBox', 'AXMenuButton'], any: '^Choice'}, current: 'One', want: 'Three',
    node: sky => sky.nodes.find(n => ['AXPopUpButton', 'AXComboBox', 'AXMenuButton'].includes(n.role) && /^Choice/.test(label(n)) && n.frame?.width > 4)},
  font: {app: 'textedit', find: {roles: ['AXPopUpButton'], value: 'Helvetica'}, current: 'Helvetica',
    node: sky => sky.nodes.find(n => n.role === 'AXPopUpButton' && n.value === 'Helvetica')},
  language: {app: 'scripteditor', find: {roles: ['AXPopUpButton'], value: 'AppleScript'}, current: 'AppleScript', want: 'JavaScript',
    node: sky => sky.nodes.find(n => n.role === 'AXPopUpButton' && n.value === 'AppleScript')},
};
// After the open (the engine's element click on the closed button, AXPress), how the menu ends and whether the kit then
// restores the person's window order (`+r`).
const ROUTES = ['pick+r', 'escape+r', 'cancel+r', 'pick', 'escape', 'raise-open', 'person-click', 'timeout'];
const DEDICATED_ROUTES = new Set(['pick+r', 'escape+r']);
const MODES = [
  {name: 'shared-behind', desktop: 'shared', front: false},
  {name: 'dedicated-behind', desktop: 'dedicated', front: false},
];
const applies = (route, mode) => mode.desktop === 'shared' || DEDICATED_ROUTES.has(route);
const SHOTS = Number(arg('shots') ?? 1);

// ---- the layout ---------------------------------------------------------------------------------------------------
// The app's window at WIN, its second window (document apps) at WIN2 behind it; the person's app, Finder, frontmost
// with F1 (its focused window) over the app's lower right and F2 over its lower left; a third app, Calculator, behind
// them all, partly under the app's window and F1.
const WIN2 = {x: 460, y: 90, w: 600, h: 690};
const F1 = {x: 760, y: 420, w: 420, h: 320};
const F2 = {x: 240, y: 480, w: 360, h: 300};
const CALC = {x: 980, y: 260};
const PERSON_CLICK = {x: 1100, y: 690};  // inside F1, outside the app's window and every menu
const dirF1 = join(process.env.RUNNER_TEMP ?? OUT, 'p458F1'), dirF2 = join(process.env.RUNNER_TEMP ?? OUT, 'p458F2');
mkdirSync(dirF1, {recursive: true}); mkdirSync(dirF2, {recursive: true});
const LINES = Array.from({length: 22}, (_, i) => `Line ${String(i + 1).padStart(2, '0')} words of a plain document ending eol${String(i + 1).padStart(2, '0')}`);
const rtf = lines => `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs28\n${lines.map(l => `${l}\\par`).join('\n')}\n}`;
const teFile = join(OUT, 'p458.rtf'), teFile2 = join(OUT, 'p458-second.rtf');
writeFileSync(teFile, rtf(LINES)); writeFileSync(teFile2, rtf(['The second window']));
const seFile = join(OUT, 'p458.applescript'), seFile2 = join(OUT, 'p458-second.applescript');
writeFileSync(seFile, LINES.map(l => `-- ${l}`).join('\n') + '\nreturn 1\n'); writeFileSync(seFile2, '-- the second window\nreturn 2\n');
const bounds = f => `{${f.x}, ${f.y}, ${f.x + f.w}, ${f.y + f.h}}`;

async function personFront() {
  for (const [dir, f] of [[dirF2, F2], [dirF1, F1]]) {
    sh('open', [dir]);
    await sleep(700);
    osa(`tell application "Finder" to set bounds of front Finder window to ${bounds(f)}`);
  }
  setFront(pidOf('Finder'));
  await sleep(700);
}
async function thirdApp() {
  if (!pidOf('Calculator')) { sh('open', ['-a', 'Calculator']); await sleep(2500); }
  osa(`tell application "System Events" to tell process "Calculator" to set position of window 1 to {${CALC.x}, ${CALC.y}}`);
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
    reset: async () => {
      const notes = [];
      if (!b || b.exitCode !== null) { await relaunch(); notes.push('launched'); }
      await ask({op: 'hover', x: 200, y: 860});
      await escapeTwice(b.pid);
      const prev = lastReady()?.load ?? null;
      sendCmd(`goto:${URL_}`);
      if (!(await newLoad(prev))) { notes.push('no reload: relaunch'); await relaunch(); }
      await ask({op: 'focusweb', pid: b.pid});
      placePid(b.pid, WIN);
      setFront(b.pid); await sleep(500);  // the app's window over Calculator, then the person's in front
      await personFront();
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
    reset: async () => {
      await ask({op: 'hover', x: 200, y: 860});
      await quit(name);
      sh('open', ['-a', appName, file2]);
      for (let i = 0; i < 40; i++) { await sleep(300); if (Number(osa(`tell application "System Events" to count windows of process "${name}"`).out) >= 1) break; }
      sh('open', ['-a', appName, file]);
      for (let i = 0; i < 40; i++) { await sleep(300); if (Number(osa(`tell application "System Events" to count windows of process "${name}"`).out) >= 2) break; }
      await sleep(500);
      place(2, WIN2); place(1, WIN);
      await sleep(400);
      await personFront();
      return [];
    },
    close: () => quit(name),
  };
}

// ---- one row ------------------------------------------------------------------------------------------------------
const results = [];
const config = {kit: 'probe-458 restore', engineRef: process.env.P458_ENGINE_REF ?? null, reps: REPS,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), commit: process.env.GITHUB_SHA ?? null, image: process.env.ImageVersion ?? null, url: URL_};
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));
const skip = () => [engine?.pid].filter(Boolean);
const orderNow = async () => ((await ask({op: 'order', skip: skip()})).windows ?? []);
/// The windows of `before` whose order differs in `after` (both front to back, those in both): a window moves when the
/// set of windows in front of it changes.
function moved(before, after) {
  const common = new Set(before.map(w => w.n).filter(n => after.some(w => w.n === n)));
  const b = before.filter(w => common.has(w.n)), a = after.filter(w => common.has(w.n));
  const front = (list, n) => new Set(list.slice(0, list.findIndex(w => w.n === n)).map(w => w.n));
  return b.filter(w => { const x = front(b, w.n), y = front(a, w.n); return x.size !== y.size || [...x].some(n => !y.has(n)); }).map(w => `${w.owner}:${w.n}`);
}

async function snap(pid, wf, label) {
  const pop = await ask({op: 'popup', pid, window: winArr(wf)});
  const st = await ask({op: 'state', pid});
  const person = await ask({op: 'state', pid: pidOf('Finder')});
  const ord = await orderNow();
  return {label, menuUp: (pop.appWindows ?? []).some(x => x.layer >= 100 && x.bounds?.[2] >= 20 && x.bounds?.[3] >= 20), value: st.opener?.value ?? null,
    appFrontmost: st.axFrontmost, front: frontmost(), personFocusedWindow: person.focusedWindow ?? null, personFrontmost: person.axFrontmost,
    order: ord.map(w => `${w.owner}:${w.n}`), orderRaw: ord};
}

async function runRow(app, menuName, mode, route, rep) {
  const mn = MENUS[menuName];
  const lab = `${menuName}-${mode.name}-${route}-${rep}`;
  const row = {label: lab, menu: menuName, mode: mode.name, route, rep, steps: []};
  results.push(row);
  let w;
  const t = () => Date.now() - row.t0;
  try {
    await ask({op: 'forget'});
    row.reset = await app.reset();
    const pid = app.pid();
    w = await connect(mode.desktop);
    const sky0 = await observe(w, pid, `${lab}-obs`);
    const wf = sky0.window.frame;
    const n = mn.node(sky0);
    if (!n) { row.problem = 'no pop-up button in the observation'; return; }
    const remembered = await ask({op: 'open', pid, find: mn.find});
    if (remembered.error) { row.problem = `kit opener: ${remembered.error}`; return; }
    row.valueBefore = remembered.value;
    const pop0 = await ask({op: 'popup', pid, window: winArr(wf)});
    const target = pop0.target?.n;
    const ord0 = await orderNow();
    const f1 = ord0.find(x => x.owner === 'Finder' && Math.abs(x.bounds[0] - F1.x) <= 3 && Math.abs(x.bounds[1] - F1.y) <= 3);
    if (!target || !f1) { row.problem = `layout: target ${target} F1 ${f1?.n}`; return; }
    row.before = await snap(pid, wf, 'before');
    row.layoutOk = row.before.order[0] === `Finder:${f1.n}`;
    row.target = target; row.f1 = f1.n;
    const mark0 = events.length;
    row.t0 = Date.now();
    const watching = askWatch({op: 'watch', pid, ms: route === 'timeout' ? 14_000 : 7000, target, user: f1.n, skip: skip()}, 30_000);
    await sleep(30);
    row.open = {at: t(), ...brief(await w.execute('click', {pid, element: n.token}))};
    await sleep(900);
    row.opened = await snap(pid, wf, 'opened');
    if (!row.opened.menuUp) { row.problem = 'the element click opened no menu'; row.watch = await watching; return; }
    const restore = async tag => { const at = t(); const r = await ask({op: 'restore', user: pidOf('Finder'), target, hold: true}, 10_000); row.steps.push({step: `restore:${tag}`, at, ...r}); return r; };
    const end = async tag => {
      if (tag === 'pick') {
        const sky1 = await observe(w, pid, `${lab}-reobs`);
        const pop = await ask({op: 'popup', pid, window: winArr(sky1.window.frame)});
        row.pick = pop.popup ? menuPick(pop, mn.current, mn.want) : null;
        if (!row.pick) throw Object.assign(new Error('no item in the open menu'), {setup: true});
        const {px} = toPixels(sky1, row.pick.point);
        row.steps.push({step: 'pick', at: t(), ...brief(await w.execute('click', {pid, x: px.x, y: px.y}))});
      } else if (tag === 'escape') row.steps.push({step: 'escape', at: t(), ...brief(await w.execute('press_key', {pid, key: 'Escape'}))});
      else if (tag === 'cancel') row.steps.push({step: 'cancel', at: t(), ...(await ask({op: 'cancel', pid}, 10_000))});
      await sleep(500);
    };
    if (route.endsWith('+r')) { await end(route.slice(0, -2)); await restore('after'); await sleep(400); row.final = await snap(pid, wf, 'final'); }
    else if (route === 'pick' || route === 'escape') { await end(route); await sleep(400); row.final = await snap(pid, wf, 'final'); }
    else if (route === 'raise-open') {
      await restore('open'); await sleep(400);
      row.mid = await snap(pid, wf, 'after restore, menu open');
      await end('escape'); await sleep(400);
      row.final = await snap(pid, wf, 'after Escape');
    } else if (route === 'person-click') {
      row.steps.push({step: 'person click', at: t(), ...(await ask({op: 'post', pid, x: PERSON_CLICK.x, y: PERSON_CLICK.y, stamp: 'hid'}))});
      await sleep(900);
      row.mid = await snap(pid, wf, 'after the person\'s click');
      await restore('after person'); await sleep(400);
      row.final = await snap(pid, wf, 'after restore');
    } else if (route === 'timeout') {
      await sleep(8000);
      row.mid = await snap(pid, wf, 'after 8 s');
      await end('escape'); await sleep(400);
      row.final = await snap(pid, wf, 'after Escape');
    }
    row.watch = await watching;
    const ev = events.slice(mark0);
    row.changes = ev.filter(e => ['input', 'change'].includes(e.type)).map(e => `${e.type}:${e.id}=${e.value}`);
    if (rep <= SHOTS) sh('screencapture', ['-x', '-t', 'jpg', join(OUT, 'screens', `${fileName(lab)}.jpg`)]);
    row.moved = moved(row.before.orderRaw, row.final.orderRaw);
    row.personOnTop = row.final.order[0] === `Finder:${f1.n}`;
    const pickedTo = row.changes.filter(c => c.startsWith('change:sel=')).map(c => c.split('=')[1]).pop() ?? (row.final.value !== row.valueBefore ? row.final.value : null);
    row.picked = pickedTo;
  } catch (e) { if (e.setup) row.problem = e.message; else row.exception = String(e?.stack || e).slice(0, 1500); }
  finally {
    w?.close(); save();
    const r = row.steps.filter(s => s.step.startsWith('restore'));
    log(`${lab}: ${row.problem ?? row.exception?.split('\n')[0] ?? `open=${row.open?.error ?? 'ok'}/${row.open?.route} top=${row.final?.order?.[0]} personOnTop=${row.personOnTop} moved=${JSON.stringify(row.moved)} picked=${row.picked} menuUp=${row.final?.menuUp} front=${row.final?.front} restore=${JSON.stringify(r.map(s => ({ms: s.ms, raises: s.raises?.length, first: s.firstAbove, last: s.lastAbove, err: s.error})))} covered=${row.watch?.aboveMs}`}`);
  }
}

async function run() {
  config.chrome = version('stable');
  await thirdApp();
  const menus = Object.keys(MENUS).filter(m => !ONLY_MENUS || ONLY_MENUS.includes(m));
  const modes = MODES.filter(m => !ONLY_MODES || ONLY_MODES.includes(m.name));
  const routes = ROUTES.filter(r => !ONLY_ROUTES || ONLY_ROUTES.includes(r));
  for (const appName of ['chrome', 'textedit', 'scripteditor']) {
    const mine = menus.filter(m => MENUS[m].app === appName);
    if (!mine.length) continue;
    const app = appName === 'chrome' ? chromeApp() : appName === 'textedit' ? docApp('TextEdit', 'TextEdit', teFile, teFile2) : docApp('Script Editor', 'Script Editor', seFile, seFile2);
    for (let rep = 1; rep <= REPS; rep++) for (const m of mine) for (const mode of modes) for (const route of routes) {
      if (!applies(route, mode)) continue;
      if (Date.now() - STARTED > BUDGET_MS) { config.budgetStop = true; save(); return; }
      await runRow(app, m, mode, route, rep);
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
