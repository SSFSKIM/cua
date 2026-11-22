// #453's qualification kit: main against fix/453-overlay-click, one engine head per dispatch, built unmodified (the
// measurement this follows is deliver.mjs; README section "#453 qual"). Every click here is the engine's own; the kit
// only opens the overlay and reads what happened. Cells, in shared-behind, shared-front and dedicated-behind:
//   omnibox/click      a coordinate click on a non-default history row of Chrome's omnibox popup, 1-3 s after the observation
//   omnibox/p-element  the engine's element click on that row's node (#470, cut from the fix by ruling 1066: main's answer expected)
//   omnibox/relayout   one more character typed through the engine after the observation, then the coordinate click at the
//                      recorded row: refused, the same text taken, or another row taken (which must never happen)
//   datalist/click, datalist/p-element   the page's <datalist> list (opened by the engine's click on the field's arrow,
//                      #463's AXPress behind), its second row
//   permission/allow, permission/block, permission/p-element   Chrome's Web MIDI prompt on a fresh origin; the site's
//                      permission state read after (the element cell alternates Block and Allow)
//   popover/click      TextEdit's colour-well popover, a swatch
// and parity (shared-behind unless named): a page button with no overlay (p-page), a page button under the omnibox popup
// after it closed (p-underclosed), a forced-route click on an omnibox row (p-forced, spikeRoute 3: must refuse), a drag
// starting on a row (p-drag: must refuse), an overlay of an unknown kind (p-unknown, site information's bubble, shared-front),
// TextEdit's font pop-up (p-font, #458) and the <input list> arrow (p-inputlist, #463).
// The row's item is picked from the engine's own observation (its nodes inside the overlay's window), never by the kit's
// hit-test: Chromium answers a first hit-test into a web area with the web area, so a kit hit-test before the click would
// prime the engine's. Each row records the answer and its meta (overlayClick, stalePoint, popUpClick), the effect (taken,
// wrong row, the page beneath), `lsappinfo front` read back to back for 4 s from the click (transient: any read other than
// the one before; end: the last), the person's key and main window every ~5 ms (the cover's; Chrome's own when frontmost),
// and the window list every 10 ms (the observed window over the cover, the start's windows reordered).
//
//   node scripts/probe-453/qual453.mjs --engine <bin> --tool <bin> --out <dir> [--reps cap] [--only re,re] [--budget minutes]
// Runs only on a GitHub-hosted runner: it launches, places and closes its own apps.
import {spawn, spawnSync, execFile} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {launch, placePid, version} from '../probe-316/browser.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-453 qual: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const list = name => arg(name)?.split(',').map(s => s.trim()).filter(Boolean);
const OUT = arg('out'), TOOL = arg('tool'), ENGINE = arg('engine');
const REPS = Number(arg('reps') || 99);
const ONLY = list('only')?.map(s => new RegExp(s));
const BUDGET_MS = Number(arg('budget') ?? 140) * 60_000;
const WATCH_MS = 3000, FRONT_MS = 4000;
const STARTED = Date.now();
mkdirSync(join(OUT, 'screens'), {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-453 qual:', ...a);
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
/// The frontmost app as LaunchServices answers it, read back to back for `ms` (#469 qual's reading): each change as
/// [epoch ms, ASN].
const frontAsn = () => new Promise(r => execFile('lsappinfo', ['front'], {timeout: 2000}, (e, out) => r((out || '').trim())));
async function sampleFront(ms) {
  const out = [], start = Date.now();
  let last = null, reads = 0;
  while (Date.now() - start < ms) { const a = await frontAsn(); reads++; if (a !== last) { out.push([Date.now(), a]); last = a; } }
  return {changes: out, reads};
}
const bundleOf = asn => (sh('lsappinfo', ['info', '-only', 'bundleid', asn]).out.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] ?? asn;

// ---- the page (deliver.mjs's, with a button under the omnibox popup's area and the Web MIDI permission's state) ----
const SCRIPT = `<script>(() => { const load = Math.random().toString(36).slice(2, 10);
const send = (type, extra) => navigator.sendBeacon('/ev', JSON.stringify({load, origin: location.origin, path: location.pathname, type, t: Date.now(), ...extra}));
const idOf = t => { const e = t && t.closest ? t.closest('[id]') : null; return e ? e.id : (t && t.tagName) || null; };
for (const k of ['pointerdown', 'mousedown', 'click', 'focusin', 'submit']) document.addEventListener(k, e => send(k, {id: idOf(e.target), trusted: e.isTrusted}), true);
for (const k of ['input', 'change']) document.addEventListener(k, e => send(k, {id: idOf(e.target), value: e.target.value ?? null}), true);
const run = c => { if (c === 'reload') location.replace('/'); if (c.startsWith('goto:')) location.replace(c.slice(5)); };
(async () => { for (;;) { try { const r = await fetch('/cmd?load=' + load, {cache: 'no-store'}); const j = await r.json(); if (j.cmd) run(j.cmd); } catch (e) { await new Promise(r => setTimeout(r, 500)); } } })();
document.addEventListener('prerenderingchange', () => send('activated', {}));
const perm = () => navigator.permissions.query({name: 'midi'}).then(p => { send('perm', {state: p.state}); p.onchange = () => send('perm', {state: p.state}); }).catch(e => send('perm', {error: String(e)}));
addEventListener('load', () => { send('ready', {prerendering: Boolean(document.prerendering)}); if (location.pathname === '/perm') { perm(); navigator.requestMIDIAccess().then(() => send('req', {ok: true}), e => send('req', {error: e.name})); } });
})();</script>`;
const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe453 page</title>
<style>body{font:15px -apple-system,Helvetica,sans-serif;margin:0} .a{position:absolute;left:16px}</style></head>
<body id="page"><div id="wrap" style="position:relative;height:560px">
<h3 class="a" style="top:2px;margin:0">probe453 page</h3>
<div class="a" style="top:80px"><input id="fruit" list="fruits" aria-label="Fruit" autocomplete="off" size="20"><datalist id="fruits"><option value="apple"></option><option value="apricot"></option><option value="avocado"></option><option value="banana"></option></datalist></div>
<div class="a" style="top:110px;left:330px"><button id="u1" type="button">Under</button></div>
<div class="a" style="top:440px"><button id="b1" type="button">Alpha</button> <button id="b2" type="button">Beta</button> <button id="b3" type="button">Gamma</button></div>
</div>${SCRIPT}</body></html>`;
const results_ = path => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe453 ${path.replace(/[^a-z0-9/-]/gi, '')}</title><style>body{font:15px -apple-system,Helvetica,sans-serif;margin:16px}</style></head>
<body id="results"><h3>Results</h3>${SCRIPT}</body></html>`;

const events = [];
let pollers = [], queued = null;
function serve(req, res) {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?') || req.url.startsWith('/results') || req.url.startsWith('/perm'))) {
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

// ---- the cells ----------------------------------------------------------------------------------------------------
const MODES = {
  'shared-behind': {name: 'shared-behind', desktop: 'shared', front: false},
  'shared-front': {name: 'shared-front', desktop: 'shared', front: true},
  'dedicated-behind': {name: 'dedicated-behind', desktop: 'dedicated', front: false},
};
const DELAYS = [1000, 2000, 3000];
const big = f => f && f.width > 4 && f.height > 4;
const fcentre = f => ({x: f.x + f.width / 2, y: f.y + f.height / 2});
const nodesIn = (sky, pr) => sky.nodes.filter(n => big(n.frame) && pr && inside(fcentre(n.frame), pr));
const widest = xs => xs.slice().sort((a, b) => b.frame.width * b.frame.height - a.frame.width * a.frame.height)[0];
const asPick = (n, extra = {}) => n && {role: n.role, text: nodeLabel(n), frame: [n.frame.x, n.frame.y, n.frame.width, n.frame.height], point: fcentre(n.frame), token: n.token ?? null, ...extra};
const pageNode = (sky, re, roles) => sky.nodes.find(n => big(n.frame) && (!roles || roles.includes(n.role)) && re.test(nodeLabel(n)) && n.role !== 'AXStaticText');
/// The omnibox's rows in the observation: the overlay's row-sized nodes below its address strip, one per band, top to
/// bottom, each band's widest node that carries text.
function omniBands(sky, pr) {
  const xs = nodesIn(sky, pr).filter(n => n.frame.y >= pr.y + 32 && n.frame.height >= 14 && n.frame.height <= 90 && n.frame.width >= pr.width * 0.4 && nodeLabel(n))
    .sort((a, b) => a.frame.y - b.frame.y);
  const bands = [];
  for (const n of xs) { const b = bands.find(b => Math.abs(b[0].frame.y - n.frame.y) < 6); if (b) b.push(n); else bands.push([n]); }
  return bands.map(widest);
}
/// The URL path a row's text names (its first http URL's), else null.
const pathOf = text => (String(text ?? '').match(/https?:\/\/[^\s,/]+(\/[^\s,]*)/) || [])[1] ?? null;
const OMNI = {
  app: 'chrome',
  open: async c => { await c.key('cmd+l'); await c.type(`${URL_}results-`); },
  // A row other than the default that loads one of the kit's pages (/results-alpha or /results-beta's history row).
  pick: (sky, pr) => {
    const bands = omniBands(sky, pr);
    const i = bands.findIndex((b, i) => i > 0 && /\/results-(alpha|beta)\b/.test(nodeLabel(b)));
    return i > 0 ? asPick(bands[i], {index: i, count: bands.length, path: pathOf(nodeLabel(bands[i])), all: bands.map(b => nodeLabel(b).slice(0, 90))}) : null;
  },
  // Taken: a page of the kit's loaded (or a prerender activated); the row taken is the clicked one when the loaded path
  // is the one the row's text names.
  effect: ctx => {
    const l = ctx.loads.find(l => /\/results/.test(l));
    if (l) { const path = l.replace(/^https?:\/\/[^/]+/, ''); return path === ctx.pick.path ? 'taken' : `wrongRow:${path}`; }
    if (ctx.omniAfter && !ctx.omniAfter.focused && ctx.pick.path && String(ctx.omniAfter.value ?? '').endsWith(ctx.pick.path)) return 'taken(address)';
    return null;
  },
};
const KINDS = {
  omnibox: OMNI,
  datalist: {
    app: 'chrome',
    // The engine's click on the field's arrow (#463: AXPress behind, the posted click frontmost) opens every option.
    open: async (c, sky0) => {
      const f = pageNode(sky0, /^Fruit/, ['AXComboBox', 'AXTextField']);
      if (!f) throw new Error('no Fruit field in the observation');
      await c.clickAt({x: f.frame.x + f.frame.width - 9, y: f.frame.y + f.frame.height / 2}, sky0);
      await sleep(700);
    },
    pick: (sky, pr) => asPick(widest(nodesIn(sky, pr).filter(n => /^apricot$/i.test(nodeLabel(n).split(' | ')[0])))),
    effect: ctx => {
      const v = [...ctx.ev].reverse().find(e => ['input', 'change'].includes(e.type) && e.id === 'fruit')?.value;
      return v == null ? null : v === 'apricot' ? 'taken' : `wrongRow:${v}`;
    },
  },
  permission: {
    app: 'chrome',
    open: async c => {
      const origin = await freshOrigin();
      const prev = lastReady()?.load ?? null;
      sendCmd(`goto:${origin}/perm`);
      c.row.origin = origin;
      if (!(await newLoad(prev, 12_000))) throw new Error('the /perm page did not load');
      await sleep(1800);
    },
    pick: (sky, pr, want) => {
      const buttons = nodesIn(sky, pr).filter(n => n.role === 'AXButton');
      const re = want === 'allow' ? /^allow\b/i : /never allow|^block$|don.?t allow/i;
      return asPick(buttons.find(n => re.test(nodeLabel(n))), {want, buttons: buttons.map(nodeLabel)});
    },
    // The origin's permission state after (its last change beaconed; every change kept) and requestMIDIAccess's answer.
    // Web MIDI, not geolocation: a runner's macOS has Location Services off, so Chrome answers geolocation's Allow with
    // the state `denied` and a "Location is turned off" bubble, and the first Allow brought Chrome to the front (smoke
    // 45045858141). MIDI's prompt has no macOS layer.
    effect: ctx => {
      const states = ctx.ev.filter(e => e.type === 'perm').map(e => e.state ?? e.error);
      const st = [...ctx.ev].reverse().find(e => e.type === 'perm' && e.state && e.state !== 'prompt')?.state ?? null;
      const req = ctx.ev.find(e => e.type === 'req');
      ctx.row.permission = {state: st, states, request: req ? (req.ok ? 'granted' : req.error) : null};
      const got = st === 'granted' || req?.ok ? 'allow' : st === 'denied' || req?.error === 'NotAllowedError' ? 'block' : null;
      return got == null ? null : got === ctx.pick.want ? 'taken' : `wrongRow:${got}`;
    },
  },
  popover: {
    app: 'textedit',
    open: async c => c.toolOpen({roles: ['AXColorWell']}, 'AXPress'),
    pick: (sky, pr) => {
      const seen = new Set();
      const sw = nodesIn(sky, pr).filter(n => n.role === 'AXButton' && /^rgb /.test(n.description ?? '') && n.description !== 'rgb 0 0 0 1' && !seen.has(n.description) && seen.add(n.description));
      return sw.length ? asPick(sw[Math.floor(sw.length / 2)], {count: sw.length}) : null;
    },
    effect: ctx => ctx.openerBefore?.value != null && ctx.openerAfter?.value != null && ctx.openerAfter.value !== ctx.openerBefore.value ? 'changed' : null,
  },
  // Parity: no overlay, a page button.
  page: {app: 'chrome', overlay: false, open: async () => {}, pick: sky => asPick(pageNode(sky, /^Beta$/, ['AXButton'])),
    effect: ctx => ctx.page.some(e => e.startsWith('click:b2')) ? 'clicked' : null},
  // Parity: the omnibox popup opened and closed (Escape twice), then a page button where its rows had been.
  underclosed: {app: 'chrome', overlay: false, open: async c => { await OMNI.open(c); await c.key('Escape'); await c.key('Escape'); },
    pick: sky => asPick(pageNode(sky, /^Under$/, ['AXButton'])), effect: ctx => ctx.page.some(e => e.startsWith('click:u1')) ? 'clicked' : null},
  // Parity: site information's bubble, an overlay of no listed kind (frontmost: AXPress on its button raises Chrome
  // behind, #469), one of its buttons.
  // Opened by the engine's click on the toolbar's node (the kit's AX walk of Chrome's windows did not reach it, smoke
  // 45045858141).
  siteinfo: {app: 'chrome', open: async (c, sky0) => {
      const top = sky0.window.frame.y + 110;
      const n = sky0.nodes.find(n => big(n.frame) && n.frame.y < top && ['AXPopUpButton', 'AXButton', 'AXMenuButton'].includes(n.role) && /site information|connection is|not secure/i.test(nodeLabel(n)));
      if (!n) { c.row.toolbar = sky0.nodes.filter(n => big(n.frame) && n.frame.y < top).map(n => [n.role, nodeLabel(n).slice(0, 60)]).slice(0, 40); throw new Error('no site information button in the observation'); }
      c.row.opener = [n.role, nodeLabel(n)];
      await c.clickAt(fcentre(n.frame), sky0);
      await sleep(900);
    },
    pick: (sky, pr) => { const xs = nodesIn(sky, pr).filter(n => ['AXButton', 'AXLink'].includes(n.role) && nodeLabel(n));
      return asPick(xs.find(n => !/close|settings/i.test(nodeLabel(n))) ?? xs[0]); },
    effect: ctx => ctx.after.overlay == null ? 'closed' : null},
  // Parity: #458's TextEdit font pop-up and #463's <input list> arrow; the effect is the menu or list opened.
  font: {app: 'textedit', overlay: false, open: async () => {},
    pick: sky => asPick(sky.nodes.find(n => n.role === 'AXPopUpButton' && n.value === 'Helvetica' && big(n.frame))), effect: ctx => ctx.menus ? 'opened' : null},
  inputlist: {app: 'chrome', overlay: false, open: async () => {},
    pick: sky => { const f = pageNode(sky, /^Fruit/, ['AXComboBox', 'AXTextField']); return f && asPick(f, {point: {x: f.frame.x + f.frame.width - 9, y: f.frame.y + f.frame.height / 2}}); },
    effect: ctx => ctx.menus ? 'opened' : null},
};
const CELLS = [];
const cell = (kind, mode, how, reps) => CELLS.push({name: `${kind}/${mode}/${how}`, kind, mode: MODES[mode], how, reps, app: KINDS[kind].app});
for (const m of Object.keys(MODES)) {
  cell('omnibox', m, 'click', 6); cell('omnibox', m, 'p-element', 5); cell('omnibox', m, 'relayout', 8);
  cell('datalist', m, 'click', 6); cell('datalist', m, 'p-element', 5);
  cell('permission', m, 'allow', 5); cell('permission', m, 'block', 5); cell('permission', m, 'p-element', 6);
  cell('popover', m, 'click', 6);
}
cell('page', 'shared-behind', 'p-page', 5);
cell('underclosed', 'shared-behind', 'p-underclosed', 5);
cell('omnibox', 'shared-behind', 'p-forced', 5);
cell('omnibox', 'shared-behind', 'p-drag', 5);
cell('siteinfo', 'shared-front', 'p-unknown', 5);
cell('font', 'shared-behind', 'p-font', 5);
cell('inputlist', 'shared-behind', 'p-inputlist', 5);

// ---- one row ------------------------------------------------------------------------------------------------------
const results = [];
const config = {kit: 'probe-453 qual453', engineRef: process.env.P453_ENGINE_REF ?? null, label: process.env.P453_ENGINE_LABEL ?? null, reps: REPS,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), commit: process.env.GITHUB_SHA ?? null, image: process.env.ImageVersion ?? null, url: URL_};
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));
/// The engine's answer: its error, and the meta the reader needs (#453's overlayClick, #452's stalePoint, #458's
/// popUpClick, the route, the delivery guard's frontmost restore).
function answer(r) {
  const m = metaOf(r) ?? {};
  return {error: errName(r), message: r?.error ? String(r.error.message ?? '').slice(0, 400) : null, route: m.inputRoute ?? null,
    overlayClick: m.overlayClick ?? null, stalePoint: m.stalePoint ?? null, popUpClick: m.popUpClick ?? null,
    frontmostRestored: m.delivery?.frontmostRestored ?? null, posted: m.startedAt != null};
}

async function runRow(app, cell, rep) {
  const k = KINDS[cell.kind], mode = cell.mode;
  const lab = `${cell.name.replace(/\//g, '-')}-${rep}`;
  const row = {label: lab, cell: cell.name, kind: cell.kind, how: cell.how, app: cell.app, mode: mode.name, desktop: mode.desktop, front: mode.front, rep, steps: []};
  results.push(row);
  let w;
  try {
    await ask({op: 'forget'});
    row.reset = await app.reset(mode.front);
    const pid = app.pid();
    w = await connect(mode.desktop);
    const sky0 = await observe(w, pid, `${lab}-obs`);
    const c = {
      row, pid,
      key: async key => { const r = await w.execute('press_key', {pid, key}); row.steps.push({step: `key:${key}`, answer: answer(r)}); await sleep(800); },
      type: async t => { const r = await w.execute('type_text', {pid, text: t}); row.steps.push({step: `type:${t.length}`, answer: answer(r)}); await sleep(800); },
      toolOpen: async (find, action) => { const r = await ask({op: 'open', pid, find, action}, 15_000); row.steps.push({step: `open:${action}`, answer: r}); if (r.error) throw new Error(`opener ${r.error}`); row.openerBefore = {value: r.value}; await sleep(900); },
      clickAt: async (p, sky) => { const r = await w.execute('click', {pid, ...toPixels(sky, p).px}); row.steps.push({step: 'open:click', answer: answer(r)}); if (r.error) throw new Error(`opener click ${errName(r)}`); },
    };
    await k.open(c, sky0);
    const sky = await observe(w, pid, `${lab}-reobs`);
    const tObs = Date.now();
    const wf = sky.window.frame;
    row.window = wf;
    row.loadObserved = lastReady()?.load ?? null;
    const ov = await ask({op: 'overlay', pid, window: winArr(wf)});
    if (!ov.target) { row.problem = 'the observed window is not on screen'; return; }
    // An overlay the window list puts behind the browser window while it shows over it (the tool's `behind`) is taken
    // for an overlay row only, and marked.
    row.overlayListedBehind = k.overlay !== false && !ov.popup && Boolean(ov.behind);
    const ovWin = o => o?.popup ?? (row.overlayListedBehind ? o?.behind : null) ?? null;
    row.overlayAtObs = ovWin(ov);
    const pr = rect(row.overlayAtObs?.bounds);
    if (k.overlay !== false && !pr) { row.problem = 'no overlay at the re-observation'; row.otherWindows = ov.others ?? null; return; }
    row.nodesInOverlay = pr ? nodesIn(sky, pr).length : 0;
    const want = cell.kind === 'permission' ? (cell.how === 'p-element' ? (rep % 2 ? 'block' : 'allow') : cell.how) : null;
    row.pick = k.pick(sky, pr, want);
    if (!row.pick) { row.problem = 'no item in the observation'; row.overlayNodes = pr ? nodesIn(sky, pr).slice(0, 40).map(n => [n.role, nodeLabel(n).slice(0, 60), winArr(n.frame)]) : null; return; }
    if (cell.how === 'p-element' && row.pick.token == null) { row.problem = 'the item has no token'; return; }
    const {px, screen} = toPixels(sky, row.pick.point);
    row.point = {px, screen, inOverlay: pr ? inside(screen, pr) : null};
    // #453's re-laid-out case: one more character typed through the engine, after the screenshot, before the click.
    if (cell.how === 'relayout') { row.typed = rep % 2 ? 'a' : 'b'; const r = await w.execute('type_text', {pid, text: row.typed}); row.steps.push({step: 'type:relayout', answer: answer(r)}); }
    row.delayMs = DELAYS[(rep - 1) % DELAYS.length];
    const left = tObs + row.delayMs - 300 - Date.now(); if (left > 0) await sleep(left);
    const now = await ask({op: 'overlay', pid, window: winArr(wf)});
    row.overlayAtClick = ovWin(now);
    const coverPid = mode.front ? null : app.cover();
    const ord = await ask({op: 'order'});
    const coverWin = coverPid ? (ord.windows ?? []).find(x => x.pid === coverPid)?.n ?? -1 : -1;
    row.coverWin = coverWin;
    if (cell.app === 'textedit') row.caretBefore = (await ask({op: 'caret', pid, window: winArr(wf)}))?.range ?? null;
    const asn0 = await frontAsn();
    const fronting = sampleFront(FRONT_MS);
    const watching = ask2({op: 'watch', pid, ms: WATCH_MS, target: ov.target.n, user: coverWin, skip: [], person: coverPid ?? pid}, 20_000);
    await sleep(120);
    const mark = events.length;
    const t0 = Date.now();
    row.clickAfterObsMs = t0 - tObs;
    if (cell.how === 'p-element') row.click = answer(await w.execute('click', {pid, element: row.pick.token}));
    else if (cell.how === 'p-forced') row.click = answer(await w.execute('click', {pid, x: px.x, y: px.y, spikeRoute: '3'}));
    else if (cell.how === 'p-drag') {
      const to = toPixels(sky, {x: screen.x, y: screen.y + 250}).px;
      row.click = answer(await w.execute('drag', {pid, from_x: px.x, from_y: px.y, to_x: to.x, to_y: to.y}));
    } else row.click = answer(await w.execute('click', {pid, x: px.x, y: px.y}));
    row.clickMs = Date.now() - t0;
    const wait = 1500 - (Date.now() - t0); if (wait > 0) await sleep(wait);
    sh('screencapture', ['-x', '-t', 'jpg', join(OUT, 'screens', `${fileName(lab)}.jpg`)]);
    const ev = events.slice(mark);
    const after = await ask({op: 'overlay', pid, window: winArr(wf)});
    const openerAfter = row.openerBefore ? await ask({op: 'opener'}) : null;
    const omniAfter = cell.kind === 'omnibox' ? await ask({op: 'omnibox', pid}) : null;
    const caretAfter = cell.app === 'textedit' ? await ask({op: 'caret', pid, window: winArr(wf)}) : null;
    const watch = await watching;
    const fr = await fronting;
    const page = [...new Set(ev.filter(e => ['click', 'pointerdown', 'mousedown', 'focusin', 'submit'].includes(e.type)).map(e => `${e.type}:${e.id}${e.load === row.loadObserved ? '' : '@other'}`))];
    row.after = {loads: ev.filter(e => (e.type === 'ready' && !e.prerendering) || e.type === 'activated').map(e => `${e.origin}${e.path}`), page,
      changes: ev.filter(e => ['input', 'change'].includes(e.type)).map(e => `${e.type}:${e.id}=${e.value}`),
      overlay: ovWin(after) ? {n: ovWin(after).n, layer: ovWin(after).layer, bounds: ovWin(after).bounds} : null, opener: openerAfter,
      omnibox: omniAfter ? {value: omniAfter.value, focused: omniAfter.focused} : null, caret: caretAfter?.range ?? null};
    // The frontmost app through the row, and the person's key and main window (the cover's; Chrome's own when frontmost).
    row.front = {before: bundleOf(asn0), reads: fr.reads, off: fr.changes.filter(x => x[1] !== asn0).map(x => [x[0] - t0, bundleOf(x[1])]),
      end: bundleOf(fr.changes[fr.changes.length - 1]?.[1] ?? asn0)};
    row.front.transient = row.front.off.length > 0;
    row.front.endChanged = row.front.end !== row.front.before;
    const ps = (watch.personSamples ?? []).filter(x => x[1] !== null || x[2] !== null);
    const fk = f => (Array.isArray(f) ? f.map(Math.round).join(',') : String(f));
    row.key = {samples: ps.length, reads: watch.personReads, changed: ps.some(x => fk(x[1]) !== fk(ps[0][1]) || fk(x[2]) !== fk(ps[0][2])), first: ps[0] ?? null, changes: ps.slice(1, 8)};
    // The window list: the observed window over the cover, and the start's windows (but the overlay's) reordered.
    const skipN = new Set([ovWin(ov)?.n, ovWin(now)?.n].filter(n => n != null));
    let cur = null; const orders = [];
    for (const x of watch.samples ?? []) { if (Array.isArray(x[3])) cur = x[3]; if (cur) orders.push(cur.filter(n => !skipN.has(n))); }
    const first = orders[0] ?? [];
    row.windows = {aboveMs: watch.aboveMs, firstAbove: watch.firstAbove, reordered: orders.some(o => { const common = o.filter(n => first.includes(n)); return common.join(',') !== first.filter(n => common.includes(n)).join(','); }),
      menusMax: Math.max(0, ...(watch.samples ?? []).map(s => s[1])), menusEnd: (watch.samples ?? []).slice(-1)[0]?.[1] ?? 0};
    const beneath = ev.filter(e => ['click', 'pointerdown', 'mousedown'].includes(e.type) && e.load === row.loadObserved).map(e => `${e.type}:${e.id}`);
    row.reachedBeneath = k.overlay === false ? null : beneath.length > 0 || (cell.app === 'textedit' && row.caretBefore != null && JSON.stringify(caretAfter?.range) !== JSON.stringify(row.caretBefore));
    const ctx = {row, ev, loads: row.after.loads, page, pick: row.pick, after: row.after, omniAfter, openerBefore: row.openerBefore, openerAfter, menus: row.windows.menusMax > 0};
    const eff = k.effect(ctx);
    row.effect = eff ?? (row.reachedBeneath ? `beneath:${[...new Set(beneath)].join(',')}` : row.after.loads.length ? `navigated:${row.after.loads.join(',')}`
      : k.overlay !== false && !ovWin(after) ? 'dismissed' : 'nothing');
  } catch (e) { row.exception = String(e?.stack || e).slice(0, 1500); }
  finally {
    w?.close(); save();
    const a = row.click;
    log(`${lab}: ${row.problem ?? row.exception?.split('\n')[0] ?? `${a?.error ?? 'ok'} route=${JSON.stringify(a?.route)} oc=${JSON.stringify(a?.overlayClick)} effect=${row.effect} front=${row.front?.transient}/${row.front?.endChanged} key=${row.key?.changed} above=${row.windows?.aboveMs} reordered=${row.windows?.reordered} pick=${row.pick?.role}:${(row.pick?.text ?? '').slice(0, 50)}#${row.pick?.index ?? ''}/${row.pick?.count ?? ''} at=${row.clickAfterObsMs} msg=${(a?.message ?? '').slice(0, 120)}`}`);
  }
}

async function run() {
  config.chrome = version('stable');
  const all = CELLS.filter(c => !ONLY || ONLY.some(re => re.test(c.name)));
  config.cells = all.map(c => c.name);
  for (const appName of ['chrome', 'textedit']) {
    const mine = all.filter(c => c.app === appName);
    if (!mine.length) continue;
    const app = appName === 'chrome' ? chromeApp() : textEditApp();
    if (appName === 'textedit') await quitTextEdit();  // the Chrome rows' cover
    const most = Math.max(...mine.map(c => Math.min(c.reps, REPS)));
    // Reps outermost, so a budget stop leaves every cell with rows.
    for (let rep = 1; rep <= most; rep++) for (const cell of mine) {
      if (rep > Math.min(cell.reps, REPS)) continue;
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
