// #337 / #452's qualification kit: a click inside another window of the same app that lies over the observed window
// (the overlay), and a click outside it, per overlay kind and desktop mode, on one engine head.
//
// Each row: a re-set, one observation, the overlay opened (kit-side, the same way in every mode), a re-observation whose
// screenshot holds it, then one coordinate click placed in that screenshot: on an item of the overlay (inside) or on a
// control of the observed window outside the overlay's bounds (outside). The side tool reads the overlay's window
// (number, layer, owner, bounds) and its items; after the click, where it went: the overlay's item taken, the window
// beneath (the page's beacons, TextEdit's caret), the overlay dismissed, or nothing.
//
// Overlays (Chrome, stable): omnibox (⌘L and a typed URL), select (a <select>'s menu, opened by AXPress), datalist (an
// <input list>'s suggestion popup, opened by focusing the field and typing), permission (a geolocation prompt bubble, a
// fresh origin per row). TextEdit: menu (the format bar's font-family popup menu, opened by AXPress), popover (the format
// bar's text colour well, opened by AXPress).
// Modes: shared-behind (a cover app frontmost: TextEdit for Chrome, Finder for TextEdit), shared-front, dedicated-behind.
//
//   node scripts/probe-337/qualify.mjs --engine <bin> --tool <bin> --out <dir> [--reps n] [--overlays a,b] [--modes a,b]
//        [--sides inside,outside] [--budget minutes]
// Runs only on a GitHub-hosted runner: it launches, places and closes its own apps.
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {launch, placePid, version} from '../probe-316/browser.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-337: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const list = name => arg(name)?.split(',').map(s => s.trim()).filter(Boolean);
const OUT = arg('out'), ENGINE = arg('engine'), TOOL = arg('tool');
const REPS = Number(arg('reps') ?? 5);
const ONLY_OVERLAYS = list('overlays'), ONLY_MODES = list('modes'), SIDES = list('sides') ?? ['inside', 'outside'];
const BUDGET_MS = Number(arg('budget') ?? 120) * 60_000;
const STARTED = Date.now();
mkdirSync(join(OUT, 'screens'), {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-337:', ...a);
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

// ---- the page: a <select>, an <input list>, three buttons low on the page; every pointer, focus, input and change
// event beaconed with the nearest id (and a field's value), a geolocation request on /geo, and a long-poll the probe
// re-sets the page through.
const SCRIPT = `<script>(() => { const load = Math.random().toString(36).slice(2, 10);
const send = (type, extra) => navigator.sendBeacon('/ev', JSON.stringify({load, origin: location.origin, path: location.pathname, type, t: Date.now(), ...extra}));
const idOf = t => { const e = t && t.closest ? t.closest('[id]') : null; return e ? e.id : (t && t.tagName) || null; };
for (const k of ['pointerdown', 'mousedown', 'click', 'focusin', 'submit']) document.addEventListener(k, e => send(k, {id: idOf(e.target), trusted: e.isTrusted}), true);
for (const k of ['input', 'change']) document.addEventListener(k, e => send(k, {id: idOf(e.target), value: e.target.value ?? null}), true);
const run = c => { if (c === 'reload') location.replace('/'); if (c.startsWith('goto:')) location.replace(c.slice(5)); };
(async () => { for (;;) { try { const r = await fetch('/cmd?load=' + load, {cache: 'no-store'}); const j = await r.json(); if (j.cmd) run(j.cmd); } catch (e) { await new Promise(r => setTimeout(r, 500)); } } })();
addEventListener('load', () => { send('ready', {}); if (location.pathname === '/geo') navigator.geolocation.getCurrentPosition(() => send('geo', {ok: true}), e => send('geo', {code: e.code})); });
})();</script>`;
const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe337 page</title>
<style>body{font:15px -apple-system,Helvetica,sans-serif;margin:0} .a{position:absolute;left:16px}</style></head>
<body id="page"><div id="wrap" style="position:relative;height:560px">
<h3 class="a" style="top:2px;margin:0">probe337 page</h3>
<div class="a" style="top:40px"><select id="sel" aria-label="Choice"><option>One</option><option>Two</option><option>Three</option></select></div>
<div class="a" style="top:80px"><input id="fruit" list="fruits" aria-label="Fruit" autocomplete="off" size="20"><datalist id="fruits"><option value="apple"></option><option value="apricot"></option><option value="avocado"></option><option value="banana"></option></datalist></div>
<div class="a" style="top:440px"><button id="b1" type="button">Alpha</button> <button id="b2" type="button">Beta</button> <button id="b3" type="button">Gamma</button></div>
</div>${SCRIPT}</body></html>`;
const RESULTS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe337 results</title><style>body{font:15px -apple-system,Helvetica,sans-serif;margin:16px}</style></head>
<body id="results"><h3>Results</h3><p><a id="r1" href="#r">Result 1</a></p>${SCRIPT}</body></html>`;

const events = [];
let pollers = [], queued = null;
function serve(req, res) {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?') || req.url.startsWith('/results') || req.url.startsWith('/geo'))) {
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'});
    res.end(req.url.startsWith('/results') ? RESULTS : PAGE);
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
const listen = async () => { const s = createServer(serve); await new Promise(r => s.listen(0, '127.0.0.1', r)); return s; };
const servers = [await listen()];
const URL_ = `http://127.0.0.1:${servers[0].address().port}/`;
/// A fresh origin (another port) for a permission row: a decision made on one origin never answers the next row's prompt.
const freshOrigin = async () => { const s = await listen(); servers.push(s); return `http://127.0.0.1:${s.address().port}`; };
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
const SOCK_DIR = join(process.env.RUNNER_TEMP ?? OUT, 's337'); mkdirSync(SOCK_DIR, {recursive: true, mode: 0o700});
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
const tool = spawn(TOOL, [], {stdio: ['pipe', 'pipe', 'inherit']});
const waiting = [];
createInterface({input: tool.stdout}).on('line', l => { try { waiting.shift()?.(JSON.parse(l)); } catch { waiting.shift()?.({error: 'bad answer'}); } });
const ask = (o, timeout = 30_000) => new Promise(resolve => { const t = setTimeout(() => resolve({error: 'tool timeout'}), timeout); waiting.push(v => { clearTimeout(t); resolve(v); }); tool.stdin.write(JSON.stringify(o) + '\n'); });

// ---- shared steps -------------------------------------------------------------------------------------------------
const errName = r => r?.error ? (r.error.data?.errorName ?? r.error.data?.name ?? r.error.errorName ?? r.error.name ?? r.error.code ?? 'error') : null;
const metaOf = r => r?.error ? (r.error.data?.meta ?? r.error.meta ?? null) : (r?.result?.meta ?? null);
function brief(r) {
  const m = metaOf(r) ?? {};
  return {error: errName(r), message: r?.error ? String(r.error.message ?? '') : null, route: m.inputRoute ?? null,
    stalePoint: m.stalePoint ?? null, posted: m.startedAt != null, meta: m};
}
async function observe(w, pid, label) {
  const shots = join(OUT, 'shots', fileName(label)); mkdirSync(shots, {recursive: true});
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

/// The overlay's elements a picker chooses from: its AX rows, then the two hit scans' (frames inside the overlay).
function candidates(pop) {
  const pr = rect(pop.popup.bounds);
  const out = [];
  for (const [by, xs] of [['ax', pop.axRows ?? []], ['scan', pop.scan ?? []], ['systemScan', pop.systemScan ?? []]]) {
    for (const r of xs) { const f = rect(r.frame); if (r.role && f && f.width >= 6 && f.height >= 6 && within(f, pr)) out.push({by, ...r, f}); }
  }
  return out;
}
const pick = (c, extra = {}) => c && {by: c.by, role: c.role, label: rowLabel(c), frame: c.frame, point: centre(c.f), ...extra};
/// The first element whose title, description or value matches `re`.
const byLabel = (pop, re, roles) => pick(candidates(pop).find(c => re.test(rowLabel(c)) && (!roles || roles.test(c.role))));

const OVERLAYS = {
  omnibox: {
    app: 'chrome',
    open: async c => { await c.key('cmd+l'); await c.type(`${URL_}results`); },
    // The what-you-typed row: the topmost wide row below the address field's strip.
    inside: pop => {
      const pr = rect(pop.popup.bounds), strip = pr.y + 34;
      const ok = c => c.f.width >= pr.width * 0.5 && c.f.height >= 14 && c.f.height <= 80 && c.f.y >= strip - 2;
      const c = candidates(pop).filter(c => /AX(StaticText|Row|Cell|ListItem|Group|Button|Link|MenuItem)/.test(c.role) && ok(c)).sort((a, b) => a.f.y - b.f.y || b.f.width - a.f.width)[0];
      return pick(c) ?? {by: 'geometry', point: {x: pr.x + pr.width * 0.3, y: strip + (pr.y + pr.height - strip) / 2}};
    },
    taken: c => c.loads.some(l => l.endsWith('/results')),
  },
  select: {
    app: 'chrome',
    open: async c => c.toolOpen({roles: ['AXPopUpButton', 'AXComboBox', 'AXMenuButton'], any: '^Choice'}, 'AXPress'),
    inside: pop => byLabel(pop, /^Three$/, /AXMenuItem|AXStaticText|AXListItem|AXRow|AXCell|AXOption/),
    taken: c => c.changed('sel', 'Three') || c.openerAfter?.value === 'Three',
  },
  datalist: {
    app: 'chrome',
    open: async c => { await c.toolOpen({roles: ['AXTextField', 'AXComboBox', 'AXSearchField'], any: '^Fruit'}, 'focus'); await sleep(300); await c.type('ap'); },
    inside: pop => byLabel(pop, /apricot/i),
    taken: c => c.changed('fruit', 'apricot') || c.openerAfter?.value === 'apricot',
  },
  permission: {
    app: 'chrome',
    open: async c => {
      const origin = await freshOrigin();
      const prev = lastReady()?.load ?? null;
      sendCmd(`goto:${origin}/geo`);
      c.row.origin = origin;
      if (!(await newLoad(prev, 12_000))) throw new Error('the /geo page did not load');
      await sleep(1800);
    },
    inside: pop => byLabel(pop, /never allow|^block$|don.?t allow|deny/i, /AXButton/),
    taken: c => c.geo.some(g => g.code === 1),
  },
  menu: {
    app: 'textedit',
    open: async c => c.toolOpen({roles: ['AXPopUpButton'], value: 'Helvetica'}, 'AXPress'),
    // The item after the checked one (Helvetica): its title is the value the popup must show once taken.
    inside: pop => {
      const pr = rect(pop.popup.bounds);
      const items = (pop.axRows ?? []).filter(r => r.role === 'AXMenuItem' && r.frame && r.title).map(r => ({by: 'ax', ...r, f: rect(r.frame)}))
        .filter(r => within(r.f, pr) && r.f.y >= 0 && r.f.y + r.f.height <= 760).sort((a, b) => a.f.y - b.f.y);
      const at = items.findIndex(r => r.mark || r.title === 'Helvetica');
      const next = items.slice(at + 1).find(r => r.enabled !== false && r.title !== 'Helvetica');
      return next ? pick(next, {expect: next.title}) : null;
    },
    taken: c => c.pick?.expect != null && c.openerAfter?.value === c.pick.expect,
  },
  popover: {
    app: 'textedit',
    open: async c => c.toolOpen({roles: ['AXColorWell']}, 'AXPress'),
    // A swatch: the middle one of the overlay's small elements.
    inside: pop => {
      const small = candidates(pop).filter(c => c.by === 'ax' && !/AXWindow|AXGroup|AXScrollArea|AXList|AXUnknown|AXSplitGroup|AXLayoutArea/.test(c.role) && c.f.width <= 80 && c.f.height <= 80 && c.enabled !== false);
      return small.length ? pick(small[Math.floor(small.length / 2)], {count: small.length}) : null;
    },
    taken: c => c.openerBefore?.value != null && c.openerAfter?.value != null && c.openerAfter.value !== c.openerBefore.value,
  },
};
const MODES = [
  {name: 'shared-behind', desktop: 'shared', front: false},
  {name: 'shared-front', desktop: 'shared', front: true},
  {name: 'dedicated-behind', desktop: 'dedicated', front: false},
];

// ---- the apps -----------------------------------------------------------------------------------------------------
const textEditCover = join(OUT, 'cover.txt');
writeFileSync(textEditCover, 'The cover: frontmost in the behind rows.\n');
const finderCover = join(process.env.RUNNER_TEMP ?? OUT, 'p337cover');
mkdirSync(finderCover, {recursive: true});
const TE_LINES = Array.from({length: 22}, (_, i) => `Line ${String(i + 1).padStart(2, '0')} words of a plain document ending eol${String(i + 1).padStart(2, '0')}`);
const teFile = join(OUT, 'p337.rtf');
writeFileSync(teFile, `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs28\n${TE_LINES.map(l => `${l}\\par`).join('\n')}\n}`);

async function raiseTextEditCover() {
  sh('open', ['-a', 'TextEdit', textEditCover]);
  await sleep(900);
  osa(`tell application "System Events" to tell process "TextEdit" to set position of window 1 to {${COVER.x}, ${COVER.y}}`);
  osa(`tell application "System Events" to tell process "TextEdit" to set size of window 1 to {${COVER.w}, ${COVER.h}}`);
  setFront(pidOf('TextEdit'));
  await sleep(700);
}
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
  const profileRoot = join(process.env.RUNNER_TEMP ?? OUT, 'p337q');
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
      await escapeTwice(b.pid);
      const prev = lastReady()?.load ?? null;
      sendCmd(`goto:${URL_}`);
      if (!(await newLoad(prev))) { notes.push('no reload: relaunch'); await relaunch(); }
      await ask({op: 'focusweb', pid: b.pid});
      placePid(b.pid, WIN);
      const left = await ask({op: 'popup', pid: b.pid, window: [WIN.x, WIN.y + 1, WIN.w, WIN.h - 42]});
      if (left.popup) notes.push(`overlay left ${JSON.stringify(left.popup.bounds)}`);
      if (front) { setFront(b.pid); await sleep(700); } else await raiseTextEditCover();
      return notes;
    },
    close: async () => { if (b && b.exitCode === null) { b.kill('SIGTERM'); await sleep(1500); } },
  };
}
function textEditApp() {
  const pid = () => pidOf('TextEdit');
  return {
    pid,
    reset: async front => {
      const notes = [];
      if (pid()) await escapeTwice(pid());
      osa('tell application "TextEdit" to close every document saving no');
      await sleep(500);
      if (pid()) {
        const left = await ask({op: 'popup', pid: pid(), window: [0, 0, 1, 1]});
        if (left.popup) { notes.push(`overlay left ${JSON.stringify(left.popup.bounds)}: TextEdit quit`); sh('pkill', ['-x', 'TextEdit']); await sleep(1500); }
      }
      sh('open', ['-a', 'TextEdit', teFile]);
      for (let i = 0; i < 30; i++) { await sleep(300); if (osa('tell application "System Events" to count windows of process "TextEdit"').out === '1') break; }
      osa(`tell application "System Events" to tell process "TextEdit" to set position of window 1 to {${WIN.x}, ${WIN.y}}`);
      osa(`tell application "System Events" to tell process "TextEdit" to set size of window 1 to {${WIN.w}, ${WIN.h}}`);
      await sleep(400);
      if (front) { setFront(pid()); await sleep(700); } else await raiseFinderCover();
      return notes;
    },
    close: async () => { osa('tell application "TextEdit" to close every document saving no'); },
  };
}

// ---- one row ------------------------------------------------------------------------------------------------------
const results = [];
const config = {kit: 'probe-337 qualify', head: process.env.P337_HEAD ?? null, engineRef: process.env.P337_ENGINE_REF ?? null, reps: REPS,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), commit: process.env.GITHUB_SHA ?? null, image: process.env.ImageVersion ?? null, url: URL_};
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));

async function runRow(app, overlayName, mode, side, rep) {
  const ov = OVERLAYS[overlayName];
  const lab = `${overlayName}-${mode.name}-${side}-${rep}`;
  const row = {label: lab, overlay: overlayName, app: ov.app, mode: mode.name, desktop: mode.desktop, front: mode.front, side, rep, steps: []};
  results.push(row);
  let w;
  try {
    await ask({op: 'forget'});
    row.reset = await app.reset(mode.front);
    const pid = app.pid();
    row.frontBefore = frontmost();
    w = await connect(mode.desktop);
    const sky0 = await observe(w, pid, `${lab}-obs`);
    row.window0 = sky0.window?.frame;
    const c = {
      row,
      key: async k => { const r = await w.execute('press_key', {pid, key: k}); row.steps.push({step: `key:${k}`, answer: brief(r)}); await sleep(800); },
      type: async t => { const r = await w.execute('type_text', {pid, text: t}); row.steps.push({step: `type:${t.length}`, answer: brief(r)}); await sleep(800); },
      toolOpen: async (find, action) => { const r = await ask({op: 'open', pid, find, action}, 15_000); row.steps.push({step: `open:${action}`, answer: r}); if (r.error) throw new Error(`opener ${r.error}`); row.openerBefore = {value: r.value}; await sleep(900); },
    };
    await ov.open(c);
    row.frontAtObs = frontmost();
    const sky = await observe(w, pid, `${lab}-reobs`);
    const wf = sky.window.frame;
    row.window = wf;
    row.screenshot = sky.screenshot?.url?.replace(/^.*\/shots\//, '') ?? null;
    const pop = await ask({op: 'popup', pid, window: winArr(wf)});
    row.overlayAtObs = {popup: pop.popup ?? null, target: pop.target ?? null, appWindows: pop.appWindows, axPopup: pop.axPopup ?? null, axRoots: pop.axRoots,
      rows: (pop.axRows ?? []).slice(0, 40), scan: pop.scan, systemScan: pop.systemScan};
    const pr = rect(pop.popup?.bounds);
    if (!pr) { row.problem = 'no overlay at the re-observation'; return; }
    row.nodesInOverlay = sky.nodes.filter(n => n.frame && inside(centre(n.frame), pr)).length;
    let point;
    if (side === 'inside') {
      row.pick = ov.inside(pop);
      if (!row.pick) { row.problem = 'no item in the overlay'; return; }
      point = row.pick.point;
    } else if (ov.app === 'chrome') {
      const n = findNode(sky, ['AXButton'], 'Beta');
      if (!n) { row.problem = 'no Beta button'; return; }
      row.pick = {by: 'node', role: n.role, frame: n.frame};
      point = centre(n.frame);
    } else {
      for (const [phrase, after] of [['eol20', 2], ['eol12', 2], ['Line 20', 1], ['Line 12', 1], ['eol04', 2], ['Line 04', 1]]) {
        const tp = await ask({op: 'textpoint', pid, phrase, after});
        if (!tp.error && !inside(tp, pr) && inside(tp, wf)) { row.pick = {by: 'text', phrase, frame: tp.bounds}; point = {x: tp.x, y: tp.y}; break; }
      }
      if (!point) { row.problem = 'no text outside the overlay'; return; }
    }
    const {px, screen} = toPixels(sky, point);
    row.point = {px, screen, inOverlay: inside(screen, pr)};
    const sig = await ask({op: 'signals', pid, x: screen.x, y: screen.y, window: winArr(wf)});
    row.atClick = {holdsPoint: (sig.aboveAtPoint ?? []).some(x => x.n === pop.popup.n), aboveAtPoint: sig.aboveAtPoint, hit: sig.hit?.chain?.slice(0, 6) ?? null};
    const caretBefore = ov.app === 'textedit' ? await ask({op: 'caret', pid}) : null;
    sh('screencapture', ['-x', '-t', 'jpg', join(OUT, 'screens', `${fileName(lab)}.jpg`)]);
    const mark = events.length;
    const t0 = Date.now();
    const r = await w.execute('click', {pid, x: px.x, y: px.y});
    row.clickMs = Date.now() - t0;
    row.click = brief(r);
    await sleep(1500);
    const ev = events.slice(mark);
    const after = await ask({op: 'popup', pid, window: winArr(wf)});
    const openerAfter = row.openerBefore ? await ask({op: 'opener'}) : null;
    const caretAfter = ov.app === 'textedit' ? await ask({op: 'caret', pid, phrase: row.pick?.phrase ?? undefined}) : null;
    row.after = {loads: ev.filter(e => e.type === 'ready').map(e => `${e.origin}${e.path}`), page: [...new Set(ev.filter(e => ['click', 'pointerdown', 'mousedown', 'focusin', 'submit'].includes(e.type)).map(e => `${e.type}:${e.id}`))],
      changes: ev.filter(e => ['input', 'change'].includes(e.type)).map(e => `${e.type}:${e.id}=${e.value}`), geo: ev.filter(e => e.type === 'geo'),
      overlay: after.popup ? {n: after.popup.n, layer: after.popup.layer, bounds: after.popup.bounds} : null, opener: openerAfter, caretBefore: caretBefore?.range ?? null,
      caret: caretAfter ? {range: caretAfter.range, line: caretAfter.line, phraseIndex: caretAfter.phraseIndex} : null, front: frontmost()};
    const ctx = {loads: row.after.loads, geo: row.after.geo, openerBefore: row.openerBefore, openerAfter, pick: row.pick,
      changed: (id, v) => ev.some(e => ['input', 'change'].includes(e.type) && e.id === id && e.value === v)};
    const pageClicks = row.after.page.filter(p => /^(click|mousedown):/.test(p));
    const caretMoved = caretAfter && JSON.stringify(caretAfter.range) !== JSON.stringify(caretBefore?.range);
    let landing;
    if (row.click.error) landing = `refused:${row.click.error}`;
    else if (side === 'inside' && ov.taken(ctx)) landing = 'taken';
    else if (side === 'outside' && ov.app === 'chrome' && row.after.page.some(p => /^click:b2$/.test(p))) landing = 'landed';
    else if (side === 'outside' && ov.app === 'textedit' && caretAfter?.range && caretAfter.phraseIndex >= 0 && caretAfter.range[0] >= caretAfter.phraseIndex && caretAfter.range[0] <= caretAfter.phraseIndex + 6) landing = 'landed';
    else if (row.after.loads.length) landing = `navigated:${row.after.loads.join(',')}`;
    else if (pageClicks.length) landing = `beneath:${pageClicks.join(',')}`;
    else if (caretMoved) landing = 'beneath:caret';
    else if (!after.popup) landing = 'dismissed';
    else landing = 'nothing';
    row.landing = landing;
  } catch (e) { row.exception = String(e?.stack || e).slice(0, 1500); }
  finally {
    w?.close(); save();
    const sp = row.click?.stalePoint, o = row.overlayAtObs?.popup;
    log(`${lab}: ${row.problem ?? row.exception?.split('\n')[0] ?? `${row.landing} ${sp ? `${sp.verdict}/${sp.reason}` : 'no stalePoint'} posted=${row.click?.posted} overlay=${o ? `${o.n}/L${o.layer}/${JSON.stringify(o.bounds)}` : '-'} holds=${row.atClick?.holdsPoint} pick=${row.pick?.by}:${row.pick?.role ?? ''}:${(row.pick?.label ?? row.pick?.phrase ?? '').slice(0, 30)} front=${row.frontAtObs}->${row.after?.front} msg=${(row.click?.message ?? '').slice(0, 140)}`}`);
  }
}

async function run() {
  config.chrome = version('stable');
  const overlays = Object.keys(OVERLAYS).filter(o => !ONLY_OVERLAYS || ONLY_OVERLAYS.includes(o));
  const modes = MODES.filter(m => !ONLY_MODES || ONLY_MODES.includes(m.name));
  for (const appName of ['chrome', 'textedit']) {
    const mine = overlays.filter(o => OVERLAYS[o].app === appName);
    if (!mine.length) continue;
    const app = appName === 'chrome' ? chromeApp() : textEditApp();
    if (appName === 'textedit') osa('tell application "TextEdit" to close every document saving no');
    for (let rep = 1; rep <= REPS; rep++) for (const o of mine) for (const m of modes) for (const side of SIDES) {
      if (Date.now() - STARTED > BUDGET_MS) { config.budgetStop = true; save(); return; }
      await runRow(app, o, m, side, rep);
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
tool.stdin.end(); for (const s of servers) s.close();
process.exit(0);
