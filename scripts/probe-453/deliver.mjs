// #453's measurement: can a click on an app's own overlay window over the observed one (Chrome's omnibox popup, its
// datalist popup and permission bubble, TextEdit's colour-well popover) be delivered to that overlay? The engine (one
// head, built unmodified) observes and opens the overlay; the kit delivers the click itself, per cell:
//   engine    the engine's own coordinate click (the baseline: #452 refuses it, appWindowOverPoint)
//   post      the engine's mouse recipe (Mouse.swift) rebuilt by the kit, stamped with the overlay's window number and a
//             point local to it (fields 91/92, CGEventSetWindowLocation), posted to the pid
//   postAct   the same inside route 3's fake activation by the kit: subtype 1 stamped with the observed window, the
//             events, subtype 2 (behind only; with Chrome frontmost the app is active and `post` is the whole recipe)
//   postMove  postAct (post when frontmost) with a mouse-moved stamped alike 200 ms before the down
//   axpress   AXPress on the first element up the AX hit chain at the point that lists it (#453's element targets)
//   axpick    AXPick the same way (AXPress's element when none lists AXPick)
//   hid       a person's click at the HID tap (the cursor warped there): the control, frontmost only
// and two timing cells for the omnibox (idle: the popup sampled 3 s after the observation; type: one more character typed
// through the engine 1 s in). Every delivery row samples the overlay (window and AX rows) between the observation and the
// click, 1, 2 or 3 s after it, reads what lies under the point just before the click, and watches the window list and the
// person's key window (the cover's AXFocusedWindow and AXMainWindow; Chrome's own when it is frontmost) through it.
// Modes: shared-behind (a TextEdit cover frontmost for Chrome, a Finder one for TextEdit), shared-front, dedicated-behind.
//
//   node scripts/probe-453/deliver.mjs --engine <bin> --tool <bin> --out <dir> [--reps n] [--only re,re] [--budget minutes]
// Runs only on a GitHub-hosted runner: it launches, places and closes its own apps.
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {launch, placePid, version} from '../probe-316/browser.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-453: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const list = name => arg(name)?.split(',').map(s => s.trim()).filter(Boolean);
const OUT = arg('out'), TOOL = arg('tool'), ENGINE = arg('engine');
const REPS = Number(arg('reps') ?? 6);
const ONLY = list('only')?.map(s => new RegExp(s));
const BUDGET_MS = Number(arg('budget') ?? 140) * 60_000;
const STARTED = Date.now();
mkdirSync(join(OUT, 'screens'), {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-453:', ...a);
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

// ---- the page (#337's qualify.mjs, with a results page titled by its path) ---------------------------------------
const SCRIPT = `<script>(() => { const load = Math.random().toString(36).slice(2, 10);
const send = (type, extra) => navigator.sendBeacon('/ev', JSON.stringify({load, origin: location.origin, path: location.pathname, type, t: Date.now(), ...extra}));
const idOf = t => { const e = t && t.closest ? t.closest('[id]') : null; return e ? e.id : (t && t.tagName) || null; };
for (const k of ['pointerdown', 'mousedown', 'click', 'focusin', 'submit']) document.addEventListener(k, e => send(k, {id: idOf(e.target), trusted: e.isTrusted}), true);
for (const k of ['input', 'change']) document.addEventListener(k, e => send(k, {id: idOf(e.target), value: e.target.value ?? null}), true);
const run = c => { if (c === 'reload') location.replace('/'); if (c.startsWith('goto:')) location.replace(c.slice(5)); };
(async () => { for (;;) { try { const r = await fetch('/cmd?load=' + load, {cache: 'no-store'}); const j = await r.json(); if (j.cmd) run(j.cmd); } catch (e) { await new Promise(r => setTimeout(r, 500)); } } })();
document.addEventListener('prerenderingchange', () => send('activated', {}));
addEventListener('load', () => { send('ready', {prerendering: Boolean(document.prerendering)}); if (location.pathname === '/geo') navigator.geolocation.getCurrentPosition(() => send('geo', {ok: true}), e => send('geo', {code: e.code})); });
})();</script>`;
const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe453 page</title>
<style>body{font:15px -apple-system,Helvetica,sans-serif;margin:0} .a{position:absolute;left:16px}</style></head>
<body id="page"><div id="wrap" style="position:relative;height:560px">
<h3 class="a" style="top:2px;margin:0">probe453 page</h3>
<div class="a" style="top:80px"><input id="fruit" list="fruits" aria-label="Fruit" autocomplete="off" size="20"><datalist id="fruits"><option value="apple"></option><option value="apricot"></option><option value="avocado"></option><option value="banana"></option></datalist></div>
<div class="a" style="top:440px"><button id="b1" type="button">Alpha</button> <button id="b2" type="button">Beta</button> <button id="b3" type="button">Gamma</button></div>
</div>${SCRIPT}</body></html>`;
const results_ = path => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe453 ${path.replace(/[^a-z0-9/-]/gi, '')}</title><style>body{font:15px -apple-system,Helvetica,sans-serif;margin:16px}</style></head>
<body id="results"><h3>Results</h3>${SCRIPT}</body></html>`;

const events = [];
let pollers = [], queued = null;
function serve(req, res) {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?') || req.url.startsWith('/results') || req.url.startsWith('/geo'))) {
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'});
    res.end(req.url.startsWith('/results') ? results_(req.url.split('?')[0]) : PAGE);
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
const freshOrigin = async () => { const s = await listen(); servers.push(s); return `http://127.0.0.1:${s.address().port}`; };
const sendCmd = c => {
  const live = pollers; pollers = [];
  if (!live.length) { queued = c; return; }
  for (const p of live) { try { p.writeHead(200, {'content-type': 'application/json'}); p.end(JSON.stringify({cmd: c})); } catch {} }
};
const lastReady = () => [...events].reverse().find(e => (e.type === 'ready' && !e.prerendering) || e.type === 'activated') ?? null;
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
const SOCK_DIR = join(process.env.RUNNER_TEMP ?? OUT, 's453'); mkdirSync(SOCK_DIR, {recursive: true, mode: 0o700});
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
// The second tool: the overlay's life and the window watch run on it while the first one, or the engine, acts.
const {t: watcher, ask: ask2} = toolProcess();

// ---- shared steps -------------------------------------------------------------------------------------------------
const errName = r => r?.error ? (r.error.data?.errorName ?? r.error.data?.name ?? r.error.errorName ?? r.error.name ?? r.error.code ?? 'error') : null;
const metaOf = r => r?.error ? (r.error.data?.meta ?? r.error.meta ?? null) : (r?.result?.meta ?? null);
function brief(r) {
  const m = metaOf(r) ?? {};
  return {error: errName(r), message: r?.error ? String(r.error.message ?? '') : null, route: m.inputRoute ?? null,
    stalePoint: m.stalePoint ?? null, posted: m.startedAt != null};
}
async function observe(w, pid, label) {
  const shots = join(OUT, 'shots', fileName(label)); mkdirSync(shots, {recursive: true});
  const r = await w.execute('get_app_state', {pid, includeScreenshot: true, outputDirectory: shots});
  if (r.error) throw new Error(`get_app_state: ${JSON.stringify(r.error).slice(0, 400)}`);
  return r.result;
}
const nodeLabel = n => [n.title, n.description, n.value, n.placeholder].filter(v => typeof v === 'string' && v).join(' | ');
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
function candidates(pop) {
  const pr = rect(pop.popup.bounds);
  const out = [];
  for (const [by, xs] of [['ax', pop.axRows ?? []], ['scan', pop.scan ?? []], ['systemScan', pop.systemScan ?? []]]) {
    for (const r of xs) { const f = rect(r.frame); if (r.role && f && f.width >= 6 && f.height >= 6 && within(f, pr)) out.push({by, ...r, f}); }
  }
  return out;
}
const pick = (c, extra = {}) => c && {by: c.by, role: c.role, label: rowLabel(c), text: c.text ?? rowLabel(c), frame: c.frame, point: centre(c.f), ...extra};
const byLabel = (pop, re, roles) => pick(candidates(pop).find(c => re.test(rowLabel(c)) && (!roles || roles.test(c.role))));

/// The omnibox's rows at the observation, from `rows` (row-sized elements below the address strip, one per band), top
/// to bottom.
function omniRows(rows) {
  const pr = rect(rows.popup?.bounds);
  if (!pr) return [];
  const strip = pr.y + 34;
  const xs = (rows.elements ?? []).filter(e => e.row && e.frame && e.frame[1] >= strip - 2 && e.frame[2] >= pr.width * 0.5 && /AX(StaticText|Row|Cell|ListItem|Group|Button|Link|MenuItem|Option)/.test(e.role))
    .map(e => ({...e, f: rect(e.frame)})).sort((a, b) => a.f.y - b.f.y || b.f.width - a.f.width || a.depth - b.depth);
  const bands = [];
  for (const e of xs) if (!bands.some(b => Math.abs(b.f.y - e.f.y) < 6)) bands.push(e);
  return bands;
}
const OVERLAYS = {
  omnibox: {
    app: 'chrome',
    open: async c => { await c.key('cmd+l'); await c.type(`${URL_}results-`); },
    // A row other than the default that loads a page of the kit's: /results-beta's history row (the smoke run's second
    // row was the search one, which loads Google), else the last row; its text names the URL it takes.
    inside: (pop, rows) => {
      const bands = omniRows(rows);
      const c = bands.find((b, i) => i > 0 && /results-(alpha|beta)/.test(b.text ?? '')) ?? bands[bands.length - 1];
      if (c) return {by: 'ax', role: c.role, text: c.text, frame: c.frame, point: centre(c.f), index: bands.indexOf(c), count: bands.length, all: bands.map(b => b.text)};
      const pr = rect(pop.popup.bounds), strip = pr.y + 34;
      return {by: 'geometry', point: {x: pr.x + pr.width * 0.3, y: strip + (pr.y + pr.height - strip) / 2}, index: -1, count: 0};
    },
    taken: c => c.loads.some(l => /\/results/.test(l)),
    // The row taken is the one clicked when the page loaded is the URL its text names.
    takenRow: c => {
      const l = c.loads.find(l => /\/results/.test(l)); if (!l) return null;
      const path = l.replace(/^https?:\/\/[^/]+/, ''), text = c.pick?.text ?? '';
      return path === '/results-' ? text.includes(path) && !/results-(alpha|beta)/.test(text) : text.includes(path);
    },
  },
  datalist: {
    app: 'chrome', modes: ['shared-front'],
    open: async c => { await c.toolOpen({roles: ['AXTextField', 'AXComboBox', 'AXSearchField'], any: '^Fruit'}, 'focus'); await sleep(300); await c.type('ap'); },
    inside: pop => byLabel(pop, /apricot/i),
    taken: c => c.changed('fruit', 'apricot') || c.openerAfter?.value === 'apricot',
  },
  permission: {
    app: 'chrome', modes: ['shared-behind', 'dedicated-behind'],
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
  popover: {
    app: 'textedit',
    open: async c => c.toolOpen({roles: ['AXColorWell']}, 'AXPress'),
    inside: pop => {
      const seen = new Set();
      const swatches = candidates(pop).filter(c => c.role === 'AXButton' && /^rgb /.test(c.description ?? '') && c.description !== 'rgb 0 0 0 1' && !seen.has(c.description) && seen.add(c.description));
      return swatches.length ? pick(swatches[Math.floor(swatches.length / 2)], {count: swatches.length}) : null;
    },
    taken: c => c.openerBefore?.value != null && c.openerAfter?.value != null && c.openerAfter.value !== c.openerBefore.value,
  },
};
const MODES = [
  {name: 'shared-behind', desktop: 'shared', front: false},
  {name: 'shared-front', desktop: 'shared', front: true},
  {name: 'dedicated-behind', desktop: 'dedicated', front: false},
];
const DELIVERIES = {behind: ['engine', 'post', 'postAct', 'postMove', 'axpress', 'axpick'], front: ['engine', 'post', 'postMove', 'axpress', 'axpick', 'hid']};
function cells() {
  const out = [];
  for (const [o, ov] of Object.entries(OVERLAYS)) for (const m of MODES) {
    if (ov.modes && !ov.modes.includes(m.name)) continue;
    for (const d of DELIVERIES[m.front ? 'front' : 'behind']) {
      if (o !== 'omnibox' && ['postMove', 'axpick'].includes(d)) continue;
      out.push({name: `${o}/${m.name}/${d}`, overlay: o, mode: m, delivery: d});
    }
    if (o === 'omnibox') for (const t of ['idle', 'type']) out.push({name: `${o}/${m.name}/${t}`, overlay: o, mode: m, delivery: t, timing: true});
  }
  return out.filter(c => !ONLY || ONLY.some(re => re.test(c.name)));
}

// ---- the apps -----------------------------------------------------------------------------------------------------
const textEditCover = join(OUT, 'cover.txt');
writeFileSync(textEditCover, 'The cover: frontmost in the behind rows.\n');
const finderCover = join(process.env.RUNNER_TEMP ?? OUT, 'p453cover');
mkdirSync(finderCover, {recursive: true});
const TE_LINES = Array.from({length: 22}, (_, i) => `Line ${String(i + 1).padStart(2, '0')} words of a plain document ending eol${String(i + 1).padStart(2, '0')}`);
const teFile = join(OUT, 'p453.rtf');
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
async function quitTextEdit() {
  if (!pidOf('TextEdit')) return;
  sh('pkill', ['-x', 'TextEdit']);
  for (let i = 0; i < 40 && pidOf('TextEdit'); i++) await sleep(100);
  if (pidOf('TextEdit')) { sh('pkill', ['-9', '-x', 'TextEdit']); await sleep(500); }
}

function chromeApp() {
  const profileRoot = join(process.env.RUNNER_TEMP ?? OUT, 'p453q');
  let b = null, launches = 0;
  // Two typed visits seed the profile's history, so the omnibox lists rows beside the what-you-typed one.
  const seed = async () => {
    const w = await connect('shared');
    for (const path of ['results-alpha', 'results-beta']) {
      const prev = lastReady()?.load ?? null;
      await w.execute('press_key', {pid: b.pid, key: 'cmd+l'}); await sleep(500);
      await w.execute('type_text', {pid: b.pid, text: `${URL_}${path}`}); await sleep(500);
      await w.execute('press_key', {pid: b.pid, key: 'Return'});
      config.seeded = Boolean(await newLoad(prev, 8000)) && (config.seeded ?? true);
      await sleep(600);
    }
    w.close();
  };
  const relaunch = async () => {
    if (b && b.exitCode === null) { b.kill('SIGTERM'); for (let i = 0; i < 20 && b.exitCode === null; i++) await sleep(250); if (b.exitCode === null) b.kill('SIGKILL'); await sleep(1000); }
    launches++;
    const prev = lastReady()?.load ?? null;
    b = await launch('stable', URL_, join(profileRoot, String(launches)), WIN);
    if (!(await newLoad(prev, 30_000))) throw new Error('Chrome did not load the page');
    const left = b.launchedAt + 22_000 - Date.now(); if (left > 0) await sleep(left);
    placePid(b.pid, WIN);
    setFront(b.pid);
    await sleep(1500);
    await seed();
    const w = await connect('shared');
    for (let i = 0; i < 2; i++) { await observe(w, b.pid, `warm-${launches}-${i}`).catch(() => {}); await sleep(1200); }
    w.close();
  };
  return {
    pid: () => b.pid,
    cover: () => pidOf('TextEdit'),
    reset: async front => {
      const notes = [];
      if (!b || b.exitCode !== null) { await relaunch(); notes.push('launched'); }
      await ask({op: 'hover', x: 200, y: 600});
      await escapeTwice(b.pid);
      const prev = lastReady()?.load ?? null;
      sendCmd(`goto:${URL_}`);
      if (!(await newLoad(prev))) { notes.push('no reload: relaunch'); await relaunch(); }
      await ask({op: 'focusweb', pid: b.pid});
      placePid(b.pid, WIN);
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
    cover: () => pidOf('Finder'),
    reset: async front => {
      await quitTextEdit();
      sh('open', ['-a', 'TextEdit', teFile]);
      for (let i = 0; i < 30; i++) { await sleep(300); if (osa('tell application "System Events" to count windows of process "TextEdit"').out === '1') break; }
      osa(`tell application "System Events" to tell process "TextEdit" to set position of window 1 to {${WIN.x}, ${WIN.y}}`);
      osa(`tell application "System Events" to tell process "TextEdit" to set size of window 1 to {${WIN.w}, ${WIN.h}}`);
      await sleep(400);
      if (front) { setFront(pid()); await sleep(700); } else await raiseFinderCover();
      return [];
    },
    close: quitTextEdit,
  };
}

// ---- one row ------------------------------------------------------------------------------------------------------
const results = [];
const config = {kit: 'probe-453 deliver', engineRef: process.env.P453_ENGINE_REF ?? null, reps: REPS,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), commit: process.env.GITHUB_SHA ?? null, image: process.env.ImageVersion ?? null, url: URL_};
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));
const DELAYS = [1000, 2000, 3000];
const isRow = (f, pr) => f && f[3] >= 14 && f[3] <= 90 && f[2] >= pr.width * 0.4;

async function runRow(app, cell, rep) {
  const ov = OVERLAYS[cell.overlay], mode = cell.mode;
  const lab = `${cell.name.replace(/\//g, '-')}-${rep}`;
  const row = {label: lab, cell: cell.name, overlay: cell.overlay, app: ov.app, mode: mode.name, desktop: mode.desktop, front: mode.front, delivery: cell.delivery, rep, steps: []};
  results.push(row);
  let w;
  try {
    await ask({op: 'forget'});
    row.reset = await app.reset(mode.front);
    const pid = app.pid();
    row.frontBefore = frontmost();
    w = await connect(mode.desktop);
    const sky0 = await observe(w, pid, `${lab}-obs`);
    const c = {
      row, pid, sky0,
      key: async k => { const r = await w.execute('press_key', {pid, key: k}); row.steps.push({step: `key:${k}`, answer: brief(r)}); await sleep(800); },
      type: async t => { const r = await w.execute('type_text', {pid, text: t}); row.steps.push({step: `type:${t.length}`, answer: brief(r)}); await sleep(800); },
      toolOpen: async (find, action) => { const r = await ask({op: 'open', pid, find, action}, 15_000); row.steps.push({step: `open:${action}`, answer: r}); if (r.error) throw new Error(`opener ${r.error}`); row.openerBefore = {value: r.value}; await sleep(900); },
    };
    await ov.open(c);
    row.frontAtObs = frontmost();
    const sky = await observe(w, pid, `${lab}-reobs`);
    const tObs = Date.now();
    const wf = sky.window.frame;
    row.window = wf;
    row.loadObserved = lastReady()?.load ?? null;
    row.screenshot = sky.screenshot?.url?.replace(/^.*\/shots\//, '') ?? null;
    const rows = await ask({op: 'rows', pid, window: winArr(wf)});
    const pop = await ask({op: 'popup', pid, window: winArr(wf)});
    row.rowsMs = rows.ms;
    row.overlayAtObs = {popup: pop.popup ?? null, target: pop.target ?? null, root: rows.root ?? null, rootBy: rows.rootBy ?? null, webAreas: rows.webAreas ?? null,
      elementCount: rows.count ?? 0, rowElements: (rows.elements ?? []).filter(e => e.row).slice(0, 30), scan: pop.scan?.slice(0, 30)};
    if (cell.overlay === 'omnibox') row.omniboxAtObs = await ask({op: 'omnibox', pid, window: winArr(wf)});
    const pr = rect(pop.popup?.bounds);
    if (!pop.target) { row.problem = 'the observed window is not on screen'; return; }
    if (!pr) { row.problem = 'no overlay at the re-observation'; return; }
    if (pop.popup.alpha === 0) row.alphaZero = true;
    // What the observation holds of the overlay: the tree's nodes whose centre lies in it, and whether any carries a
    // row's text.
    const nodesIn = sky.nodes.filter(n => n.frame && inside(centre(n.frame), pr));
    const rowTexts = (rows.elements ?? []).filter(e => e.row && e.text).map(e => e.text);
    row.observation = {nodesInOverlay: nodesIn.length, roles: [...new Set(nodesIn.map(n => n.role))].slice(0, 10),
      rowTextInTree: rowTexts.some(t => sky.nodes.some(n => { const l = nodeLabel(n); return l && l.length > 3 && t.includes(l) && !/address|search/i.test(l); }))};

    if (cell.timing) {
      // Q5: the popup sampled for 3 s from the observation; `type` types one more character through the engine at 1 s.
      const sampling = ask2({op: 'life', pid, window: winArr(wf), ms: 3000, every: 40, rows: true}, 20_000);
      if (cell.delivery === 'type') { await sleep(1000); row.typedAt = Date.now() - tObs; row.steps.push({step: 'type:x', answer: brief(await w.execute('type_text', {pid, text: 'x'}))}); }
      row.life = await sampling;
      row.lifeStartMs = 0;
      row.landing = 'timing';
      return;
    }

    row.pick = ov.inside(pop, rows);
    if (!row.pick) { row.problem = 'no item in the overlay'; return; }
    // Whether the observation's tree holds the picked item itself: a node at its frame (within 3 pt), and its label.
    const atPick = sky.nodes.filter(n => n.frame && Array.isArray(row.pick.frame) && Math.abs(n.frame.x - row.pick.frame[0]) <= 3 && Math.abs(n.frame.y - row.pick.frame[1]) <= 3
      && Math.abs(n.frame.width - row.pick.frame[2]) <= 3 && Math.abs(n.frame.height - row.pick.frame[3]) <= 3);
    row.observation.pickInTree = atPick.map(n => ({role: n.role, label: nodeLabel(n).slice(0, 60)}));
    const {px, screen} = toPixels(sky, row.pick.point);
    row.point = {px, screen, inOverlay: inside(screen, pr)};
    // The overlay between the observation and the click (Q5), the click 1, 2 or 3 s after the observation.
    row.delayMs = DELAYS[(rep - 1) % DELAYS.length];
    const left = row.delayMs - (Date.now() - tObs) - 250;
    row.lifeStartMs = Date.now() - tObs;
    row.life = left > 50 ? await ask2({op: 'life', pid, window: winArr(wf), ms: left, every: 40, rows: true}, 20_000) : null;
    // Q4: what lies under the point now, and the overlay's window now (the one the kit stamps).
    // Chromium answers its first hit-test into a web area with the web area itself (the smoke run), so three, 40 ms apart.
    const hits = [];
    for (let i = 0; i < 3; i++) { hits.push(await ask({op: 'identify', pid, x: screen.x, y: screen.y})); if (i < 2) await sleep(40); }
    row.identify = hits[hits.length - 1];
    row.identifyRoles = hits.map(h => h.chain?.[0]?.role ?? null);
    const now = await ask({op: 'overlay', pid, window: winArr(wf)});
    row.overlayAtClick = now.popup ?? null;
    // The element up the hit's chain whose frame is the picked one's (within 2 pt), else the first row-sized one.
    const sameF = f => Array.isArray(f) && Array.isArray(row.pick.frame) && f.every((v, i) => Math.abs(v - row.pick.frame[i]) <= 2);
    const norm = t => [...new Set(String(t ?? '').split(' | ').map(x => x.trim()).filter(Boolean))].join(' | ');
    const chainRow = (row.identify.chain ?? []).find(e => sameF(e.frame)) ?? (row.identify.chain ?? []).find(e => isRow(e.frame, pr));
    row.identity = {hitRole: row.identify.chain?.[0]?.role ?? null, roles: row.identifyRoles, hitWindow: row.identify.windowFrame ?? null, system: row.identify.system ?? null,
      rowText: chainRow?.text ?? null, rowFrame: chainRow?.frame ?? null,
      sameText: chainRow && row.pick.text ? norm(chainRow.text) === norm(row.pick.text) : null,
      sameFrame: chainRow ? sameF(chainRow.frame) : null,
      sameWindow: now.popup && pop.popup ? now.popup.n === pop.popup.n : null};
    if (!now.popup) { row.problem = 'the overlay closed before the click'; return; }
    // The person's window (the cover's, or none with the app frontmost) for the watch.
    const coverPid = mode.front ? null : app.cover();
    const ord = await ask({op: 'order'});
    const coverWin = coverPid ? (ord.windows ?? []).find(x => x.pid === coverPid)?.n ?? -1 : -1;
    row.coverWin = coverWin;
    if (ov.app === 'textedit') row.caretBefore = (await ask({op: 'caret', pid, window: winArr(wf)}))?.range ?? null;
    sh('screencapture', ['-x', '-t', 'jpg', join(OUT, 'screens', `${fileName(lab)}.jpg`)]);
    const mark = events.length;
    const watching = ask2({op: 'watch', pid, ms: 2500, target: pop.target.n, user: coverWin, skip: [], person: coverPid ?? pid}, 20_000);
    await sleep(150);
    const b = now.popup.bounds, win = [now.popup.n, b[0], b[1], b[2], b[3]];
    const t0 = Date.now();
    row.clickAfterObsMs = t0 - tObs;
    const d = cell.delivery;
    if (d === 'engine') row.click = brief(await w.execute('click', {pid, x: px.x, y: px.y}));
    else if (d === 'post') row.click = await ask({op: 'post', pid, x: screen.x, y: screen.y, stamp: 'overlay', win});
    else if (d === 'postAct') row.click = await ask({op: 'post', pid, x: screen.x, y: screen.y, stamp: 'overlay', win, act: pop.target.n});
    else if (d === 'postMove') row.click = await ask({op: 'post', pid, x: screen.x, y: screen.y, stamp: 'overlay', win, move: true, ...(mode.front ? {} : {act: pop.target.n})});
    else if (d === 'axpress') row.click = await ask({op: 'press', pid, x: screen.x, y: screen.y, action: 'AXPress'});
    else if (d === 'axpick') row.click = await ask({op: 'press', pid, x: screen.x, y: screen.y, action: 'AXPick'});
    else if (d === 'hid') row.click = await ask({op: 'post', pid, x: screen.x, y: screen.y, stamp: 'hid'});
    row.clickMs = Date.now() - t0;
    const watch = await watching;
    const ps = watch.personSamples ?? [];
    // The layer-0 order but the overlay's own windows (its closing is not a move of anyone's window).
    const overlayNs = new Set([pop.popup.n, now.popup.n]);
    const orders = (watch.samples ?? []).filter(x => Array.isArray(x[3])).map(x => x[3].filter(n => !overlayNs.has(n)).join(','));
    row.watch = {aboveMs: watch.aboveMs, firstAbove: watch.firstAbove, orderMoved: orders.some(o => o !== orders[0]), samples: (watch.samples ?? []).slice(0, 12),
      menus: [...new Set((watch.samples ?? []).map(s => s[1]))], person: ps.slice(0, 20), personChanges: Math.max(0, ps.length - 1), reads: watch.reads};
    const wait = 1500 - (Date.now() - t0); if (wait > 0) await sleep(wait);
    const ev = events.slice(mark);
    const after = await ask({op: 'overlay', pid, window: winArr(wf)});
    const openerAfter = row.openerBefore ? await ask({op: 'opener'}) : null;
    const omniAfter = cell.overlay === 'omnibox' ? await ask({op: 'omnibox', pid}) : null;
    const caretAfter = ov.app === 'textedit' ? await ask({op: 'caret', pid, window: winArr(wf)}) : null;
    row.after = {loads: ev.filter(e => (e.type === 'ready' && !e.prerendering) || e.type === 'activated').map(e => `${e.origin}${e.path}`),
      prerendered: ev.filter(e => e.type === 'ready' && e.prerendering).map(e => `${e.origin}${e.path}`),
      page: [...new Set(ev.filter(e => ['click', 'pointerdown', 'mousedown', 'focusin', 'submit'].includes(e.type)).map(e => `${e.type}:${e.id}${e.load === row.loadObserved ? '' : '@other'}`))],
      changes: ev.filter(e => ['input', 'change'].includes(e.type)).map(e => `${e.type}:${e.id}=${e.value}`), geo: ev.filter(e => e.type === 'geo'),
      overlay: after.popup ? {n: after.popup.n, layer: after.popup.layer, bounds: after.popup.bounds} : null, opener: openerAfter,
      omnibox: omniAfter ? {value: omniAfter.value, focused: omniAfter.focused} : null, caret: caretAfter?.range ?? null, front: frontmost()};
    const ctx = {row, loads: row.after.loads, geo: row.after.geo, openerBefore: row.openerBefore, openerAfter, pick: row.pick,
      changed: (id, v) => ev.some(e => ['input', 'change'].includes(e.type) && e.id === id && e.value === v)};
    // Anything that reached the observed window beneath: a pointer event on the observed page, or TextEdit's caret moved.
    const beneath = ev.filter(e => ['click', 'pointerdown', 'mousedown'].includes(e.type) && e.load === row.loadObserved).map(e => `${e.type}:${e.id}`);
    row.reachedBeneath = beneath.length > 0 || (ov.app === 'textedit' && row.caretBefore != null && JSON.stringify(caretAfter?.range) !== JSON.stringify(row.caretBefore));
    row.frontChanged = row.after.front !== row.frontAtObs;
    if (row.click?.error && d === 'engine') row.landing = `refused:${row.click.error}`;
    else if (row.click?.error) row.landing = `kitError:${row.click.error}`;
    else if (ov.taken(ctx)) { row.landing = 'taken'; row.takenBy = 'load'; if (ov.takenRow) row.takenRow = ov.takenRow(ctx); }
    // The address field's evidence, beside the page's: unfocused and showing the picked row's URL (Chrome's display form,
    // no scheme) once its page is the tab's.
    else if (omniAfter && !omniAfter.focused && (row.pick?.text ?? '').match(/https?:\/\/([^\s,]+)/)?.[1] === omniAfter.value) { row.landing = 'taken'; row.takenBy = 'address'; row.takenRow = true; }
    else if (row.after.loads.length) row.landing = `navigated:${row.after.loads.join(',')}`;
    else if (omniAfter && row.omniboxAtObs && !omniAfter.focused && omniAfter.value !== row.omniboxAtObs.value && !/127\.0\.0\.1/.test(omniAfter.value ?? '')) row.landing = `navigated:${String(omniAfter.value).split(/[/?]/)[0]}`;
    else if (beneath.length) row.landing = `beneath:${[...new Set(beneath)].join(',')}`;
    else if (!after.popup) row.landing = 'dismissed';
    else row.landing = 'nothing';
  } catch (e) { row.exception = String(e?.stack || e).slice(0, 1500); }
  finally {
    w?.close(); save();
    const o = row.overlayAtObs?.popup;
    log(`${lab}: ${row.problem ?? row.exception?.split('\n')[0] ?? `${row.landing}${row.takenRow != null ? ` row=${row.takenRow}` : ''} beneath=${row.reachedBeneath} front=${row.frontAtObs}->${row.after?.front} above=${row.watch?.aboveMs} person=${row.watch?.personChanges} overlay=${o ? `${o.n}/L${o.layer}/${JSON.stringify(o.bounds)}` : '-'} pick=${row.pick?.by}:${row.pick?.role ?? ''}:${(row.pick?.text ?? '').slice(0, 40)}#${row.pick?.index ?? ''}/${row.pick?.count ?? ''} id=${row.identity?.sameText}/${row.identity?.sameFrame} life=${row.life ? `${row.life.eventCount}ev/${row.life.layouts}lay/gone${row.life.goneAt}` : '-'} click=${JSON.stringify(row.click ?? null).slice(0, 220)}`}`);
  }
}

async function run() {
  config.chrome = version('stable');
  const all = cells();
  config.cells = all.map(c => c.name);
  for (const appName of ['chrome', 'textedit']) {
    const mine = all.filter(c => OVERLAYS[c.overlay].app === appName);
    if (!mine.length) continue;
    const app = appName === 'chrome' ? chromeApp() : textEditApp();
    if (appName === 'textedit') await quitTextEdit();  // the Chrome rows' cover
    for (let rep = 1; rep <= REPS; rep++) for (const cell of mine) {
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
tool.stdin.end(); watcher.stdin.end(); for (const s of servers) s.close();
process.exit(0);
