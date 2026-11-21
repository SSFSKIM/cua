// #458's measurement kit: a click on a CLOSED pop-up button of a background app, per pop-up, route and desktop mode, on
// one engine head built unmodified. Built on #454's kit (scripts/probe-454/menus.mjs): the same page, re-sets, Finder
// cover and Apple-Events-free document-app handling.
//
// Each row: a re-set (the menu closed), one observation, the pop-up button's node in it, the kit's reads before (the
// app's windows, the button's AXExpanded and focus, the app's AXFrontmost and focused element, the window order), one
// route on the closed button, then the same reads at 300 ms and 1.8 s, the page's events and the frontmost app; a second
// tool samples the window list every 10 ms through the action (`watch`: a menu that opens and closes at once):
//   button         the engine's coordinate click on the button's node (today's case); button-2p the same forced to route
//                  2' (spikeRoute: posted to the app with no activation, as the kit's `observed` post)
//   element        the engine's element click on the button's node, then a re-observation: does it list the menu's
//                  items, does its screenshot hold the menu; element-1 the same forced to route 1 (behind modes)
//   element-item   `element`, then the engine's coordinate click on an item of the menu in the re-observation (#454's fix)
//   keys:<k>       the kit writes AXFocused on the button, then the engine's press_key <k> (space, Down);
//                  keys:fka-<k> with Full Keyboard Access on (AppleKeyboardUIMode 2) for the relaunched app
//   kit:axpress, kit:axshowmenu   the kit's AX action on the button
//   kit:observed   the kit's click posted to the app, the engine's events rebuilt, stamped to the observed window
//   kit:warpmove-observed   the same with the cursor warped to the point and a mouse-moved first
//   kit:hid        a HID-tap click at the point (a person's; moves the cursor)
// Kit routes run in the two shared modes only (the desktop mode is the engine's).
//
// Pop-ups: select (Chrome <select>), font (TextEdit's font family pop-up), language (Script Editor's language pop-up),
// combo (TextEdit's font size combo box, clicked on its arrow).
//
//   node scripts/probe-458/closed.mjs --engine <bin> --tool <bin> --out <dir> [--reps n] [--menus a,b] [--routes a,b]
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
  // TextEdit's format-bar font size (an NSComboBox): its list opens from the arrow at its right end.
  combo: {app: 'textedit', find: {roles: ['AXComboBox']}, current: '14',
    node: sky => sky.nodes.find(n => n.role === 'AXComboBox' && n.frame?.width > 4),
    at: f => ({x: f.x + f.width - 7, y: f.y + f.height / 2})},
};
const ROUTES = ['button', 'button-2p', 'element', 'element-1', 'element-item', 'keys:space', 'keys:Down', 'keys:fka-space',
  'kit:axpress', 'kit:axshowmenu', 'kit:observed', 'kit:warpmove-observed', 'kit:hid'];
const COMBO_ROUTES = new Set(['button', 'button-2p', 'element', 'element-item', 'keys:space', 'kit:axpress', 'kit:axshowmenu', 'kit:observed', 'kit:hid']);
const applies = (menu, route, mode) => (!route.startsWith('kit:') || mode.desktop === 'shared') && (route !== 'element-1' || !mode.front)
  && (MENUS[menu].app !== 'chrome' || !route.includes('fka')) && (menu !== 'combo' || COMBO_ROUTES.has(route));
const MODES = [
  {name: 'shared-behind', desktop: 'shared', front: false},
  {name: 'shared-front', desktop: 'shared', front: true},
  {name: 'dedicated-behind', desktop: 'dedicated', front: false},
];
const SHOTS = Number(arg('shots') ?? 1);
const fka = on => on ? sh('defaults', ['write', '-g', 'AppleKeyboardUIMode', '-int', '2']) : sh('defaults', ['delete', '-g', 'AppleKeyboardUIMode']);
// ---- the apps -----------------------------------------------------------------------------------------------------
const finderCover = join(process.env.RUNNER_TEMP ?? OUT, 'p458cover');
mkdirSync(finderCover, {recursive: true});
const LINES = Array.from({length: 22}, (_, i) => `Line ${String(i + 1).padStart(2, '0')} words of a plain document ending eol${String(i + 1).padStart(2, '0')}`);
const teFile = join(OUT, 'p458.rtf');
writeFileSync(teFile, `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs28\n${LINES.map(l => `${l}\\par`).join('\n')}\n}`);
const seFile = join(OUT, 'p458.applescript');
writeFileSync(seFile, LINES.map(l => `-- ${l}`).join('\n') + '\nreturn 1\n');
const TEXT_PHRASES = [['eol20', 2], ['eol16', 2], ['eol12', 2], ['Line 20', 1], ['Line 16', 1], ['Line 12', 1], ['eol08', 2], ['eol04', 2], ['Line 08', 1], ['Line 04', 1], ['eol02', 2], ['Line 02', 1]];

async function raiseFinderCover() {
  sh('open', [finderCover]);
  await sleep(700);
  osa(`tell application "Finder" to set bounds of front Finder window to {${COVER.x}, ${COVER.y}, ${COVER.x + COVER.w}, ${COVER.y + COVER.h}}`);
  setFront(pidOf('Finder'));
  await sleep(700);
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
    reset: async front => {
      const notes = [];
      if (!b || b.exitCode !== null) { await relaunch(); notes.push('launched'); }
      await ask({op: 'hover', x: 200, y: 600});  // the pointer off Chrome (the kit's hid route moves it)
      await escapeTwice(b.pid);
      const prev = lastReady()?.load ?? null;
      sendCmd(`goto:${URL_}`);
      if (!(await newLoad(prev))) { notes.push('no reload: relaunch'); await relaunch(); }
      await ask({op: 'focusweb', pid: b.pid});
      placePid(b.pid, WIN);
      const left = await ask({op: 'popup', pid: b.pid, window: [WIN.x, WIN.y + 1, WIN.w, WIN.h - 42]});
      if (left.popup) notes.push(`overlay left ${JSON.stringify(left.popup.bounds)}`);
      if (front) { setFront(b.pid); await sleep(700); } else await raiseFinderCover();
      return notes;
    },
    close: async () => { if (b && b.exitCode === null) { b.kill('SIGTERM'); await sleep(1500); } },
  };
}
/// A document app ended by signal and reopened on the kit's file: Apple Events to the app raise the runner's Automation
/// prompt (#452's smoke run 44802527126); the persistence defaults (the workflow's) keep a relaunch from restoring anything.
async function quit(name) {
  if (!pidOf(name)) return;
  sh('pkill', ['-x', name]);
  for (let i = 0; i < 40 && pidOf(name); i++) await sleep(100);
  if (pidOf(name)) { sh('pkill', ['-9', '-x', name]); await sleep(500); }
}
function docApp(name, appName, file) {
  const pid = () => pidOf(name);
  return {
    pid,
    reset: async (front, frame = WIN) => {
      await ask({op: 'hover', x: 200, y: 600});
      await quit(name);
      sh('open', ['-a', appName, file]);
      for (let i = 0; i < 40; i++) { await sleep(300); if (Number(osa(`tell application "System Events" to count windows of process "${name}"`).out) >= 1) break; }
      await sleep(500);
      osa(`tell application "System Events" to tell process "${name}" to set position of window 1 to {${frame.x}, ${frame.y}}`);
      osa(`tell application "System Events" to tell process "${name}" to set size of window 1 to {${frame.w}, ${frame.h}}`);
      await sleep(400);
      if (front) { setFront(pid()); await sleep(700); } else await raiseFinderCover();
      return [];
    },
    close: () => quit(name),
  };
}


// ---- one row ------------------------------------------------------------------------------------------------------
const results = [];
const config = {kit: 'probe-458 closed', engineRef: process.env.P458_ENGINE_REF ?? null, reps: REPS,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), commit: process.env.GITHUB_SHA ?? null, image: process.env.ImageVersion ?? null, url: URL_};
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));

const slimWin = x => x && {n: x.n, layer: x.layer, bounds: x.bounds};
/// The reads after an action: the app's windows new since `beforeNs` (a menu's is layer 101), the button's AXExpanded,
/// value and focus, its AXMenu children, the app's open AXMenus, the app's AXFrontmost and the frontmost app.
async function reads(pid, wf, beforeNs, full = true) {
  const pop = await ask({op: 'popup', pid, window: winArr(wf)});
  const fresh = (pop.appWindows ?? []).filter(x => !beforeNs.has(x.n) && x.bounds?.[2] >= 20 && x.bounds?.[3] >= 20).map(slimWin);
  const out = {newWindows: fresh, overlay: slimWin(pop.popup), menuWindow: fresh.some(x => x.layer >= 100)};
  if (!full) return out;
  const st = await ask({op: 'state', pid});
  const info = await ask({op: 'menuinfo', pid});
  const f = st.focused;
  return {...out, expanded: st.opener?.expanded ?? null, value: st.opener?.value ?? null, openerFocused: st.opener?.focused ?? null,
    focused: f ? `${f.role}${typeof f.subrole === 'string' ? `/${f.subrole}` : ''}` : null, focusedIsOpener: f?.isOpener ?? null,
    openerMenus: st.openerMenus ?? null, axMenus: (info.menus ?? []).map(m => ({role: m.role, count: m.count, frame: m.frame, under: (m.chain ?? []).slice(1, 3).map(c => c[0]).join('<')})),
    axFrontmost: st.axFrontmost, order: (st.order ?? []).map(o => o[0]), front: frontmost()};
}
const opened = r => Boolean(r && (r.menuWindow || r.expanded === true));

async function runRow(app, menuName, mode, route, rep) {
  const mn = MENUS[menuName];
  const lab = `${menuName}-${mode.name}-${route}-${rep}`;
  const row = {label: lab, menu: menuName, app: mn.app, mode: mode.name, desktop: mode.desktop, front: mode.front, route, rep};
  results.push(row);
  let w;
  const useFka = route.includes('fka');
  try {
    await ask({op: 'forget'});
    if (useFka) row.fka = fka(true).status;
    row.reset = await app.reset(mode.front);
    const pid = app.pid();
    w = await connect(mode.desktop);
    const sky0 = await observe(w, pid, `${lab}-obs`);
    const wf = sky0.window.frame;
    row.window = wf;
    const n = mn.node(sky0);
    if (!n) { row.problem = 'no pop-up button in the observation'; return; }
    row.node = {role: n.role, title: n.title ?? null, value: n.value ?? null, actions: n.actions, frame: n.frame, token: n.token};
    const remembered = await ask({op: 'open', pid, find: mn.find});
    if (remembered.error) { row.problem = `kit opener: ${remembered.error}`; return; }
    row.opener = {actions: remembered.actions, value: remembered.value, frame: remembered.opener?.frame};
    const pop0 = await ask({op: 'popup', pid, window: winArr(wf)});
    const beforeNs = new Set((pop0.appWindows ?? []).map(x => x.n));
    row.before = await reads(pid, wf, new Set());
    row.before.windows = (pop0.appWindows ?? []).map(slimWin);
    const point = mn.at ? mn.at(n.frame) : centre(n.frame);
    const {px, screen} = toPixels(sky0, point);
    row.point = {px, screen};
    const mark0 = events.length;
    const watchStart = Date.now();
    const watching = askWatch({op: 'watch', pid, ms: 2500}, 10_000);
    await sleep(30);
    const t0 = Date.now();
    if (route === 'button' || route === 'button-2p') {
      row.click = brief(await w.execute('click', {pid, x: px.x, y: px.y, ...(route === 'button-2p' ? {spikeRoute: "2'"} : {})}));
    } else if (route === 'element' || route === 'element-1' || route === 'element-item') {
      row.click = brief(await w.execute('click', {pid, element: n.token, ...(route === 'element-1' ? {spikeRoute: '1'} : {})}));
    } else if (route.startsWith('keys:')) {
      const key = route.split(':')[1].replace(/^fka-/, '');
      row.focusWrite = await ask({op: 'open', pid, find: mn.find, action: 'focus'});
      await sleep(300);
      const st = await ask({op: 'state', pid});
      row.focusAfterWrite = {result: row.focusWrite.result, openerFocused: st.opener?.focused ?? null, focusedIsOpener: st.focused?.isOpener ?? null,
        focused: st.focused ? `${st.focused.role}${typeof st.focused.subrole === 'string' ? `/${st.focused.subrole}` : ''}` : null};
      row.click = brief(await w.execute('press_key', {pid, key}));
    } else if (route === 'kit:axpress' || route === 'kit:axshowmenu') {
      const a = await ask({op: 'open', pid, find: mn.find, action: route === 'kit:axpress' ? 'AXPress' : 'AXShowMenu'}, 15_000);
      row.kitAct = {result: a.result ?? a.error, ms: a.ms};
    } else if (route.startsWith('kit:')) {
      const flag = route.slice(4);
      const target = pop0.target;
      if (!target) { row.problem = 'the observed window is not on screen'; return; }
      row.kitPost = await ask({op: 'post', pid, x: screen.x, y: screen.y, stamp: flag === 'hid' ? 'hid' : 'observed',
        win: [target.n, ...target.bounds], warp: /warp/.test(flag), move: /move/.test(flag)});
    }
    row.actMs = Date.now() - t0;
    row.actAt = t0 - watchStart;
    await sleep(300);
    row.quick = await reads(pid, wf, beforeNs, false);
    await sleep(1500);
    row.after = await reads(pid, wf, beforeNs);
    row.watch = await watching;
    row.watch.actAt = row.actAt;
    row.watch.actMs = row.actMs;
    const ev = events.slice(mark0);
    row.after.page = [...new Set(ev.filter(e => ['pointerdown', 'mousedown', 'click', 'focusin'].includes(e.type)).map(e => `${e.type}:${e.id}`))];
    row.after.changes = ev.filter(e => ['input', 'change'].includes(e.type)).map(e => `${e.type}:${e.id}=${e.value}`);
    if (rep <= SHOTS) sh('screencapture', ['-x', '-t', 'jpg', join(OUT, 'screens', `${fileName(lab)}.jpg`)]);
    const answer = row.click ? (row.click.error ? `refused:${row.click.error}` : 'ok') : row.kitAct ? `ax:${row.kitAct.result}` : row.kitPost ? 'posted' : '-';
    const seen = (row.watch.samples ?? []).some(x => x[1] > 0);
    row.opened = opened(row.after) ? 'opened' : seen || row.quick.menuWindow ? 'opened-closed' : 'none';
    row.activated = row.before.front !== row.after.front ? `${row.before.front}->${row.after.front}` : null;
    row.landing = `${answer}/${row.opened}`;
    if (route.startsWith('element')) {
      // Observable once open: the engine's next observation, its menu items and its screenshot.
      const sky1 = await observe(w, pid, `${lab}-reobs`);
      const items = (sky1.nodes ?? []).filter(x => x.role === 'AXMenuItem');
      row.reobs = {menuItems: items.length, titles: items.slice(0, 6).map(x => x.title ?? null), tokens: items.filter(x => x.token).length,
        screenshot: sky1.screenshot?.url?.replace(/^.*\/shots\//, '') ?? null, shotSize: sky1.screenshot ? [sky1.screenshot.width, sky1.screenshot.height] : null,
        window: sky1.window?.frame ?? null};
      if (route === 'element-item' && row.opened === 'opened') {
        const pop = await ask({op: 'popup', pid, window: winArr(sky1.window.frame)});
        row.pick = pop.popup ? menuPick(pop, mn.current, mn.want) : null;
        if (!row.pick) { row.problem = 'no item to click in the open menu'; return; }
        row.pick.inShot = inside(row.pick.point, rect(winArr(sky1.window.frame)));
        const ip = toPixels(sky1, row.pick.point);
        const mark1 = events.length;
        row.itemClick = brief(await w.execute('click', {pid, x: ip.px.x, y: ip.px.y}));
        await sleep(1500);
        const ev1 = events.slice(mark1);
        const st = await ask({op: 'state', pid});
        const pop1 = await ask({op: 'popup', pid, window: winArr(sky1.window.frame)});
        const changed = ev1.filter(e => e.type === 'change' && e.id === 'sel').map(e => e.value).pop() ?? (st.opener?.value !== row.opener.value ? st.opener?.value : null);
        row.item = {changes: ev1.filter(e => ['input', 'change'].includes(e.type)).map(e => `${e.type}:${e.id}=${e.value}`), value: st.opener?.value ?? null,
          menuUp: Boolean(pop1.popup && pop1.popup.layer >= 100), front: frontmost()};
        row.item.landing = row.itemClick.error ? `refused:${row.itemClick.error}` : changed === row.pick.expect ? 'taken' : changed ? `taken-other:${changed}` : row.item.menuUp ? 'menu-still-up' : 'closed-not-taken';
        if (row.itemClick.error && changed === row.pick.expect) row.item.landing += '+taken';
      }
    }
  } catch (e) { row.exception = String(e?.stack || e).slice(0, 1500); }
  finally {
    if (useFka) fka(false);
    w?.close(); save();
    const sp = row.click?.stalePoint;
    log(`${lab}: ${row.problem ?? row.exception?.split('\n')[0] ?? `${row.landing} route=${row.click?.route ?? row.kitPost?.stamp ?? '-'} ${sp ? `${sp.verdict}/${sp.reason}` : ''} plan=${JSON.stringify(row.click?.meta?.elementClick ?? null)?.slice(0, 120)} after=${JSON.stringify({w: row.after?.newWindows, x: row.after?.expanded, f: row.after?.focused, m: row.after?.axMenus?.length})} front=${row.before?.front}->${row.after?.front} page=${row.after?.page?.join(',') ?? ''} reobs=${row.reobs ? `${row.reobs.menuItems}items` : '-'} item=${row.item?.landing ?? '-'} msg=${(row.click?.message ?? '').slice(0, 160)}`}`);
  }
}

async function run() {
  config.chrome = version('stable');
  const menus = Object.keys(MENUS).filter(m => !ONLY_MENUS || ONLY_MENUS.includes(m));
  const modes = MODES.filter(m => !ONLY_MODES || ONLY_MODES.includes(m.name));
  const routes = ROUTES.filter(r => !ONLY_ROUTES || ONLY_ROUTES.includes(r) || (r.startsWith('kit:') && ONLY_ROUTES.includes('kit')) || (r.startsWith('keys:') && ONLY_ROUTES.includes('keys')));
  for (const appName of ['chrome', 'textedit', 'scripteditor']) {
    const mine = menus.filter(m => MENUS[m].app === appName);
    if (!mine.length) continue;
    const app = appName === 'chrome' ? chromeApp() : appName === 'textedit' ? docApp('TextEdit', 'TextEdit', teFile) : docApp('Script Editor', 'Script Editor', seFile);
    for (let rep = 1; rep <= REPS; rep++) for (const m of mine) for (const mode of modes) for (const route of routes) {
      if (!applies(m, route, mode)) continue;
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
