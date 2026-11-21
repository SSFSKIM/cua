// #456's qualification kit: Chrome's omnibox popup opened over a page control during the element route's wait, on two
// engine heads interleaved. Built on #337's kit (scripts/probe-337/qualify.mjs: the wire, the page server, Chrome's
// launch and re-set, the side tool) with a second process, the racer (racer.swift), that posts ⌘L and a few characters
// straight to Chrome's process at a planned wall-clock time and watches the window list for the popup meanwhile.
//
// Each row: a re-set (Escape twice, the page reloaded, the web area focused, the TextEdit cover frontmost, Chrome behind
// it uncovered), one observation with the popup closed, then per cell:
//   race     a coordinate click on the page's "Under popup" button (just below the omnibox, where the popup's first row
//            opens), the racer's keys posted `delay` ms after the click is sent; the focus hold is the route's wait
//   nokeys   the same click, no keys (both heads keep and press)
//   field    a posted pointer press first (a click on Chrome's disabled Back button, posted by route 3: #359's pending
//            click), then within ~150 ms a coordinate click on the page's "Under field" text field (#283's focus
//            route, whose #359 wait on the field's range is its wait), the racer's keys `delay` ms after it is sent;
//            with `prehold`, a second connection's element click on Beta first holds Chrome's believed focus (so posted
//            keys reach an active Chrome) and stays open through the row
//   keysonly the racer's keys alone, no click (the popup's latency after the keys; with `prehold` as above)
//   plain    an ordinary background element-route click on the page's Beta button, no keys
//
//   node scripts/probe-456/race.mjs --engines main=<bin>,fix=<bin> --tool <tool337> --racer <racer> --out <dir>
//        [--cells race,nokeys,field,keysonly,plain] [--delays a,b,..] [--field-delays a,b] [--reps n] [--budget minutes]
// Runs only on a GitHub-hosted runner: it launches, places and closes its own apps.
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {launch, placePid, version} from '../probe-316/browser.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-456: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const list = name => arg(name)?.split(',').map(s => s.trim()).filter(Boolean);
const nums = name => list(name)?.map(Number);
const OUT = arg('out'), TOOL = arg('tool'), RACER = arg('racer');
const HEADS = arg('engines').split(',').map(s => { const i = s.indexOf('='); return {label: s.slice(0, i), bin: s.slice(i + 1)}; });
const REPS = Number(arg('reps') ?? 1);
const CELLS = list('cells') ?? ['race', 'nokeys', 'field', 'keysonly', 'plain'];
const DELAYS = nums('delays') ?? [-40, -20, 0, 10, 20, 30, 45, 60, 90];
const FIELD_DELAYS = nums('field-delays') ?? [0, 20, 40, 60];
const PREHOLD = (list('prehold') ?? ['0', '1']).map(v => v === '1');
const TEXT = arg('text') ?? 'probe';
/// How the race cell's keys reach Chrome: the racer (a second process, its events stamped with the engine's pid unless
/// --stamp 0) or a second engine connection's press_key and type_text.
const VIA = list('via') ?? ['typed'];
/// The field cell's: `engine` (a second connection's ⌘L and type_text inside the wait; its focus hold does not touch the
/// field route, which takes none), and whether the page moves its focus between the field and Alpha every 20 ms through
/// the wait (`jitter`: #359's sample, the range and whether the app's focus is elsewhere, never holds still, so the wait
/// runs to its 300 ms cap; a jittered row's landing is read from the meta, whether the engine posted its focus write, since
/// the page's own focus moves fire the field's focusin).
const FIELD_VIA = list('field-via') ?? ['engine'];
const JITTER = (list('jitter') ?? ['0', '1']).map(v => v === '1');
const STAMP = arg('stamp') !== '0';
const BUDGET_MS = Number(arg('budget') ?? 100) * 60_000;
const STARTED = Date.now();
mkdirSync(OUT, {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sleepUntil = async t => { for (;;) { const left = t - Date.now(); if (left <= 0) return; if (left > 3) await sleep(left - 2); else await new Promise(r => setImmediate(r)); } };
const log = (...a) => console.log('probe-456:', ...a);
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

// ---- the page: the two controls under where the popup opens, three buttons low on the page; every pointer, focus,
// input and click event beaconed with the nearest id and the page's own time, the window's focus and blur too.
const SCRIPT = `<script>(() => { const load = Math.random().toString(36).slice(2, 10);
const send = (type, extra) => navigator.sendBeacon('/ev', JSON.stringify({load, origin: location.origin, path: location.pathname, type, t: Date.now(), ...extra}));
const idOf = t => { const e = t && t.closest ? t.closest('[id]') : null; return e ? e.id : (t && t.tagName) || null; };
for (const k of ['pointerdown', 'mousedown', 'click', 'focusin', 'submit']) document.addEventListener(k, e => send(k, {id: idOf(e.target), trusted: e.isTrusted}), true);
for (const k of ['input', 'change']) document.addEventListener(k, e => send(k, {id: idOf(e.target), value: e.target.value ?? null}), true);
addEventListener('focus', () => send('wfocus', {}));
addEventListener('blur', () => send('wblur', {}));
const jitter = ms => { const f = document.getElementById('uf'), o = document.getElementById('b1'), end = Date.now() + ms; let i = 0; send('jitter', {}); const id = setInterval(() => { if (Date.now() > end) { clearInterval(id); o.focus(); send('jitterEnd', {}); return; } (i++ % 2 ? o : f).focus(); }, 20); };
const run = c => { if (c === 'reload') location.replace('/'); if (c.startsWith('goto:')) location.replace(c.slice(5)); if (c.startsWith('jitter:')) jitter(Number(c.slice(7))); };
(async () => { for (;;) { try { const r = await fetch('/cmd?load=' + load, {cache: 'no-store'}); const j = await r.json(); if (j.cmd) run(j.cmd); } catch (e) { await new Promise(r => setTimeout(r, 500)); } } })();
addEventListener('load', () => send('ready', {}));
})();</script>`;
const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe456 page</title>
<style>body{font:15px -apple-system,Helvetica,sans-serif;margin:0}</style></head>
<body id="page"><div id="wrap" style="position:relative;height:640px">
<button id="ub" type="button" style="position:absolute;left:110px;top:4px;width:210px;height:64px">Under popup</button>
<input id="uf" aria-label="Under field" autocomplete="off" style="position:absolute;left:340px;top:14px;width:170px;height:34px;font-size:15px">
<div style="position:absolute;left:16px;top:440px"><button id="b1" type="button">Alpha</button> <button id="b2" type="button">Beta</button> <button id="b3" type="button">Gamma</button></div>
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

// ---- the engine's wire (#337's) -----------------------------------------------------------------------------------
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
const SOCK_DIR = join(process.env.RUNNER_TEMP ?? OUT, 's456'); mkdirSync(SOCK_DIR, {recursive: true, mode: 0o700});
const SOCKET = join(SOCK_DIR, 'e.sock');
let engine = null, engineErr = '', head = HEADS[0];
function startEngine() {
  rmSync(SOCKET, {force: true});
  engine = spawn(head.bin, [], {env: {...process.env, CUA_ENGINE_SOCKET: SOCKET}, stdio: ['ignore', 'ignore', 'pipe']});
  engine.stderr.on('data', d => { engineErr = (engineErr + d).slice(-20_000); });
}
async function useHead(h) {
  if (h === head && engine && engine.exitCode === null) return;
  if (engine && engine.exitCode === null) {
    engine.kill('SIGTERM');
    for (let i = 0; i < 40 && engine.exitCode === null; i++) await sleep(50);
    if (engine.exitCode === null) { engine.kill('SIGKILL'); await sleep(200); }
  }
  head = h; engine = null;
}
async function connect(mode = 'shared') {
  if (!engine || engine.exitCode !== null) { log(`engine (re)start ${head.label}`); startEngine(); }
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
/// A line-server child (the #337 side tool, the racer): ask() writes one request, answers in order.
function lineServer(bin) {
  const child = spawn(bin, [], {stdio: ['pipe', 'pipe', 'inherit']});
  const waiting = [];
  createInterface({input: child.stdout}).on('line', l => { try { waiting.shift()?.(JSON.parse(l)); } catch { waiting.shift()?.({error: 'bad answer'}); } });
  const ask = (o, timeout = 30_000) => new Promise(resolve => { const t = setTimeout(() => resolve({error: 'timeout'}), timeout); waiting.push(v => { clearTimeout(t); resolve(v); }); child.stdin.write(JSON.stringify(o) + '\n'); });
  return {child, ask};
}
const tool = lineServer(TOOL), racer = lineServer(RACER);
const ask = tool.ask;

// ---- shared steps -------------------------------------------------------------------------------------------------
const errName = r => r?.error ? (r.error.data?.errorName ?? r.error.data?.name ?? r.error.errorName ?? r.error.name ?? r.error.code ?? 'error') : null;
const metaOf = r => r?.error ? (r.error.data?.meta ?? r.error.meta ?? null) : (r?.result?.meta ?? null);
function brief(r) {
  const m = metaOf(r) ?? {};
  return {error: errName(r), message: r?.error ? String(r.error.message ?? '') : null, route: m.inputRoute ?? null,
    stalePoint: m.stalePoint ?? null, posted: m.startedAt != null, receivedAt: m.receivedAt ?? null, startedAt: m.startedAt ?? null,
    endedAt: m.endedAt ?? null, activationGuardMs: m.activationGuardMs ?? null, pendingClick: m.pendingClick ?? null,
    elementClick: m.elementClick ?? null, note: r?.result?.note ?? null, meta: m};
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
/// The page's Beta button clicked by coordinate on a connection of its own (the prehold): its element route's focus hold
/// makes Chrome believe it is active, held until that connection closes.
async function holdFocus(pid, row) {
  const w = await connect();
  const sky = await observe(w, pid, `${row.label}-prehold`);
  const n = findNode(sky, ['AXButton'], 'Beta');
  if (!n) { w.close(); throw Object.assign(new Error('prehold: no Beta'), {setup: true}); }
  const {px} = toPixels(sky, centre(n.frame));
  const r = await w.execute('click', {pid, x: px.x, y: px.y});
  row.prehold = brief(r);
  delete row.prehold.meta;
  if (r.error) { w.close(); throw Object.assign(new Error(`prehold: ${errName(r)}`), {setup: true}); }
  await sleep(300);
  return w;
}

// ---- Chrome -------------------------------------------------------------------------------------------------------
const coverDoc = join(OUT, 'cover.txt');
writeFileSync(coverDoc, 'The cover: frontmost in every row.\n');
async function raiseCover() {
  sh('open', ['-a', 'TextEdit', coverDoc]);
  await sleep(900);
  osa(`tell application "System Events" to tell process "TextEdit" to set position of window 1 to {${COVER.x}, ${COVER.y}}`);
  osa(`tell application "System Events" to tell process "TextEdit" to set size of window 1 to {${COVER.w}, ${COVER.h}}`);
  setFront(pidOf('TextEdit'));
  await sleep(700);
}
async function escapeTwice(pid) {
  try { const w = await connect(); for (let i = 0; i < 2; i++) { await w.execute('press_key', {pid, key: 'Escape'}); await sleep(250); } w.close(); } catch {}
}
const profileRoot = join(process.env.RUNNER_TEMP ?? OUT, 'p456');
let browser = null, launches = 0;
async function relaunch() {
  if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); for (let i = 0; i < 20 && browser.exitCode === null; i++) await sleep(250); if (browser.exitCode === null) browser.kill('SIGKILL'); await sleep(1000); }
  launches++;
  const prev = lastReady()?.load ?? null;
  browser = await launch('stable', URL_, join(profileRoot, String(launches)), WIN);
  if (!(await newLoad(prev, 30_000))) throw new Error('Chrome did not load the page');
  const left = browser.launchedAt + 22_000 - Date.now(); if (left > 0) await sleep(left);
  placePid(browser.pid, WIN);
  await sleep(1500);
  const w = await connect();
  for (let i = 0; i < 2; i++) { await observe(w, browser.pid, `warm-${launches}-${i}`).catch(() => {}); await sleep(1200); }
  w.close();
}
async function reset() {
  const notes = [];
  if (!browser || browser.exitCode !== null) { await relaunch(); notes.push('launched'); }
  await ask({op: 'hover', x: 200, y: 600});
  await escapeTwice(browser.pid);
  const prev = lastReady()?.load ?? null;
  sendCmd(`goto:${URL_}`);
  if (!(await newLoad(prev))) { notes.push('no reload: relaunch'); await relaunch(); }
  await ask({op: 'focusweb', pid: browser.pid});
  placePid(browser.pid, WIN);
  await raiseCover();
  return notes;
}

// ---- one row ------------------------------------------------------------------------------------------------------
const results = [];
const config = {kit: 'probe-456 race', heads: HEADS.map(h => h.label), engineRefs: process.env.P456_ENGINE_REFS ?? null, reps: REPS, cells: CELLS,
  delays: DELAYS, fieldDelays: FIELD_DELAYS, prehold: PREHOLD, text: TEXT,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), commit: process.env.GITHUB_SHA ?? null, image: process.env.ImageVersion ?? null, url: URL_};
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));

/// The point a model would click on the control: its centre across, 18 pt down from its top (the popup's first row).
const upper = f => ({x: f.x + f.width / 2, y: f.y + Math.min(18, f.height / 2)});

async function runRow(cell, delay, prehold, rep, headLabel, via = 'racer', jit = false) {
  const lab = `${cell}-${delay ?? 'x'}-${prehold ? 'held' : 'free'}-${via}${jit ? '-jitter' : ''}-${rep}-${headLabel}`;
  const row = {label: lab, head: headLabel, cell, delay, prehold, via, jitter: jit, stamp: STAMP, rep, steps: []};
  results.push(row);
  let w, held, second;
  try {
    await ask({op: 'forget'});
    row.reset = await reset();
    const pid = browser.pid;
    row.frontBefore = frontmost();
    if (prehold) held = await holdFocus(pid, row);
    if (via === 'typed') {
      // The omnibox focused by ⌘L ahead of the observation, on a connection closed before it (its focus hold released,
      // Chrome no longer believing it is focused); the keys in the wait are then plain characters (route 2', no activation).
      const b = await connect();
      const k = await b.execute('press_key', {pid, key: 'cmd+l'});
      row.prefocus = brief(k); delete row.prefocus.meta;
      await sleep(300); b.close(); await sleep(500);
    }
    w = await connect();
    const sky = await observe(w, pid, `${lab}-obs`);
    const wf = sky.window.frame;
    row.window = wf;
    row.loadObserved = lastReady()?.load ?? null;
    row.screenshot = sky.screenshot?.url?.replace(/^.*\/shots\//, '') ?? null;
    const pop = await ask({op: 'popup', pid, window: winArr(wf)});
    row.atObs = {popup: pop.popup ? {n: pop.popup.n, layer: pop.popup.layer, bounds: pop.popup.bounds, alpha: pop.popup.alpha} : null, target: pop.target ?? null,
      appWindows: pop.appWindows};
    if (!pop.target) { row.problem = 'the observed window is not on screen'; return; }
    if (pop.popup && pop.popup.alpha > 0 && pop.popup.layer === 0) { row.problem = 'a popup was up at the observation'; return; }
    let pick;
    if (cell === 'race' || cell === 'nokeys' || cell === 'keysonly') pick = findNode(sky, ['AXButton'], 'Under popup');
    else if (cell === 'field') pick = findNode(sky, ['AXTextField', 'AXTextArea', 'AXComboBox'], 'Under field');
    else if (cell === 'plain') pick = findNode(sky, ['AXButton'], 'Beta');
    if (!pick) { row.problem = `no target node for ${cell}`; return; }
    row.pick = {role: pick.role, label: label(pick), frame: pick.frame};
    const {px, screen} = toPixels(sky, cell === 'plain' ? centre(pick.frame) : upper(pick.frame));
    row.point = {px, screen};
    let pressPx = null;
    if (cell === 'field') {
      const back = sky.nodes.find(n => n.role === 'AXButton' && n.frame && n.frame.width > 2 && /^back\b/i.test(label(n)));
      if (!back) { row.problem = 'no Back button'; return; }
      row.pressPick = {role: back.role, label: label(back), frame: back.frame, enabled: back.enabled ?? null};
      pressPx = toPixels(sky, centre(back.frame)).px;
    }
    const keys = cell === 'race' || cell === 'field' || cell === 'keysonly';
    const mark = events.length;
    if (pressPx) {
      const t = Date.now();
      const r = await w.execute('click', {pid, x: pressPx.x, y: pressPx.y});
      row.press = brief(r); delete row.press.meta; row.press.ms = Date.now() - t; row.press.sentAt = t;
      if (r.error) { row.problem = `the pointer press was refused: ${errName(r)}`; return; }
      await sleep(120);
    }
    if (keys && (via === 'engine' || via === 'typed')) second = await connect();
    const base = Date.now() + 60 + Math.max(0, -(delay ?? 0));
    const byRacer = keys && via === 'racer';
    const watch = racer.ask({op: 'race', pid, target: pop.target.n, point: [screen.x, screen.y], until: base + 1300,
      keysAt: byRacer ? base + (delay ?? 0) : null, text: TEXT, gapMs: 5, axAtSeen: true, asPid: STAMP ? engine.pid : undefined}, 10_000);
    let engineKeys = null;
    if (second) {
      engineKeys = (async () => {
        await sleepUntil(base + (delay ?? 0));
        const t0 = Date.now();
        const k = via === 'typed' ? null : await second.execute('press_key', {pid, key: 'cmd+l'});
        const t1 = Date.now();
        const ty = await second.execute('type_text', {pid, text: TEXT});
        const k1 = k ? brief(k) : {error: null, skipped: true}, ty1 = brief(ty); delete k1.meta; delete ty1.meta;
        return {at: t0, keyAnswered: t1, typeAnswered: Date.now(), key: k1, type: ty1};
      })();
    }
    if (jit) { await sleepUntil(base - 40); sendCmd('jitter:700'); }
    await sleepUntil(base);
    if (cell !== 'keysonly') {
      const t0 = Date.now();
      const r = await w.execute('click', {pid, x: px.x, y: px.y});
      const t1 = Date.now();
      row.click = brief(r);
      row.click.sentAt = t0; row.click.answeredAt = t1;
      delete row.click.meta.stalePoint;
    } else row.base = base;
    row.race = await watch;
    if (engineKeys) { row.engineKeys = await engineKeys; row.race.keys = [row.engineKeys.at, row.engineKeys.keyAnswered]; }
    row.base = base;
    await sleep(250);
    const ev = events.slice(mark);
    const after = await ask({op: 'popup', pid, window: winArr(wf)});
    const focus = await ask({op: 'focus', pid});
    row.after = {popup: after.popup ? {n: after.popup.n, layer: after.popup.layer, bounds: after.popup.bounds, alpha: after.popup.alpha} : null,
      focused: focus.focused ? {role: focus.focused.role, description: focus.focused.description ?? null, title: focus.focused.title ?? null} : null,
      events: ev.map(e => ({type: e.type, id: e.id ?? null, t: e.t, load: e.load === row.loadObserved ? 'same' : e.load})), front: frontmost()};
    sh('screencapture', ['-x', '-t', 'jpg', join(OUT, 'screens', `${fileName(lab)}-after.jpg`)]);
    const pressed = id => ev.some(e => e.type === 'click' && e.id === id);
    const focused = id => ev.some(e => e.type === 'focusin' && e.id === id);
    row.landed = {ub: pressed('ub'), uf: focused('uf'), b2: pressed('b2')};
  } catch (e) { if (e.setup) row.problem = e.message; else row.exception = String(e?.stack || e).slice(0, 1500); }
  finally {
    w?.close(); held?.close(); second?.close(); save();
    const c = row.click, sp = c?.stalePoint, rc = row.race;
    const pv = rc?.firstVisible ? `${rc.firstVisible.n}@${Math.round(rc.firstVisible.t - (c?.receivedAt ?? row.base))}` : '-';
    log(`${lab}: ${row.problem ?? row.exception?.split('\n')[0] ?? `${c ? (c.error ?? 'ok') : 'noclick'} sp=${sp ? `${sp.verdict}/${sp.reason}/re=${sp.rechecked ?? '-'}/aa=${sp.afterActivation ?? '-'}/by=${sp.by ?? '-'}/ow=${sp.overWindow ?? '-'}` : '-'} route=${c?.route} guard=${c?.activationGuardMs} pend=${JSON.stringify(c?.pendingClick)} popup(n@ms from received)=${pv} keys=${rc?.keys ? Math.round(rc.keys[0] - (c?.receivedAt ?? row.base)) : '-'} end=${c ? Math.round((c.startedAt ?? c.answeredAt) - c.receivedAt) : '-'} landed=${JSON.stringify(row.landed)} msg=${(c?.message ?? '').slice(0, 120)}`}`);
  }
}

async function run() {
  config.chrome = version('stable');
  const units = [];
  for (const cell of CELLS) {
    const delays = cell === 'race' ? DELAYS : cell === 'field' || cell === 'keysonly' ? FIELD_DELAYS : [null];
    const holds = cell === 'field' || cell === 'keysonly' ? PREHOLD : [false];
    const vias = cell === 'race' || cell === 'nokeys' ? VIA : cell === 'field' ? FIELD_VIA : ['racer'];
    const jits = cell === 'field' ? JITTER : [false];
    for (const prehold of holds) for (const via of vias) for (const jit of jits) units.push({cell, delays, prehold, via, jit});
  }
  // A unit's delays run on one head, then on the other; the heads' order alternates by rep and unit.
  let k = 0;
  for (let rep = 1; rep <= REPS; rep++) for (const u of units) {
    const order = (rep + k++) % 2 ? HEADS : [...HEADS].reverse();
    for (const h of order) {
      await useHead(h);
      for (const d of u.delays) {
        if (Date.now() - STARTED > BUDGET_MS) { config.budgetStop = true; save(); return; }
        await runRow(u.cell, d, u.prehold, rep, h.label, u.via, u.jit);
      }
    }
  }
}

mkdirSync(join(OUT, 'screens'), {recursive: true});
log('config', JSON.stringify(config));
log('racer', JSON.stringify(await racer.ask({op: 'ping'})));
try { await run(); } catch (e) { config.exception = String(e?.stack || e).slice(0, 2000); log('EXCEPTION', config.exception); }
config.engineStderr = engineErr.slice(-4000);
config.minutes = Math.round((Date.now() - STARTED) / 600) / 100;
save();
engine?.kill('SIGKILL');
if (browser && browser.exitCode === null) browser.kill('SIGTERM');
tool.child.stdin.end(); racer.child.stdin.end(); server.close();
process.exit(0);
