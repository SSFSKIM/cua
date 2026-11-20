// #337's measure-first kit: a click inside stable Chrome's omnibox popup that the screenshot already showed.
//
// Each row, on one engine (one process for the job, a fresh connection per row): a re-set (Escape twice, the page
// re-loaded by its own long-poll, the web area focused, the window placed, Chrome or the TextEdit cover frontmost), one
// observation, ⌘L (and, for the typed sequence, a URL typed into the address field) sent through the engine, a
// re-observation that should hold the popup, then one coordinate click placed in that re-observation's screenshot: on a
// popup row, or on a page button outside the popup. The side tool (tool.swift) reads the popup's window (number, layer,
// bounds), its rows by accessibility, and the signals at the point just before the click; after it, where the click
// went is read from the page's beacons (a navigation, a page click), the popup's window (still up or gone) and the
// frontmost app.
//
//   node scripts/probe-337/measure.mjs --engine <bin> --tool <bin> --out <dir> [--reps n] [--variants a,b] [--seqs a,b]
// Runs only on a GitHub-hosted runner: it launches, places and kills its own apps.
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {launch, placePid, version} from '../probe-316/browser.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-337: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), ENGINE = arg('engine'), TOOL = arg('tool');
const REPS = Number(arg('reps') ?? 6);
const VARIANTS = arg('variants')?.split(',').filter(Boolean);
const SEQS = arg('seqs')?.split(',').filter(Boolean);
const BUDGET_MS = Number(arg('budget') ?? 100) * 60_000;
const STARTED = Date.now();
mkdirSync(join(OUT, 'screens'), {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-337:', ...a);
const STEP_MS = 800;
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

// ---- the page (#316's, without its frames): every pointer, focus and submit event beaconed with the nearest id, and
// a long-poll the probe re-sets the page through.
const SCRIPT = `<script>(() => { const load = Math.random().toString(36).slice(2, 10);
const send = (type, extra) => navigator.sendBeacon('/ev', JSON.stringify({load, path: location.pathname, type, t: Date.now(), ...extra}));
const idOf = t => { const e = t && t.closest ? t.closest('[id]') : null; return e ? e.id : (t && t.tagName) || null; };
for (const k of ['pointerdown', 'mousedown', 'click', 'focusin', 'submit', 'change']) document.addEventListener(k, e => send(k, {id: idOf(e.target), trusted: e.isTrusted}), true);
const run = c => { if (c === 'reload') location.replace('/'); };
(async () => { for (;;) { try { const r = await fetch('/cmd?load=' + load, {cache: 'no-store'}); const j = await r.json(); if (j.cmd) run(j.cmd); } catch (e) { await new Promise(r => setTimeout(r, 500)); } } })();
addEventListener('load', () => send('ready', {}));
})();</script>`;
const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe337 page</title>
<style>body{font:15px -apple-system,Helvetica,sans-serif;margin:0} .a{position:absolute;left:16px}</style></head>
<body id="page"><div id="wrap" style="position:relative;height:560px">
<h3 class="a" style="top:2px;margin:0">probe337 page</h3>
<div class="a" style="top:206px"><button id="b1" type="button">Alpha</button> <button id="b2" type="button">Beta</button> <button id="b3" type="button">Gamma</button></div>
<textarea id="notes" class="a" aria-label="Notes" style="top:290px;width:420px;height:150px"></textarea>
</div>${SCRIPT}</body></html>`;
const RESULTS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe337 results</title><style>body{font:15px -apple-system,Helvetica,sans-serif;margin:16px}</style></head>
<body id="results"><h3>Results</h3><p><a id="r1" href="#r">Result 1</a></p>${SCRIPT}</body></html>`;

const events = [];
let pollers = [], queued = null;
function serve(req, res) {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?') || req.url.startsWith('/results'))) {
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
const server = createServer(serve);
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;
const sendCmd = c => {
  const live = pollers; pollers = [];
  if (!live.length) { queued = c; return; }
  for (const p of live) { try { p.writeHead(200, {'content-type': 'application/json'}); p.end(JSON.stringify({cmd: c})); } catch {} }
};
const lastLoad = () => [...events].reverse().find(e => e.type === 'ready')?.load ?? null;
async function newLoad(prev, ms = 9000) {
  for (let i = 0; i < ms / 100; i++) { const l = lastLoad(); if (l && l !== prev) return l; await sleep(100); }
  return null;
}

// ---- the engine's wire: a 4-byte little-endian length, then JSON-RPC 2.0; the lineage carried as the service does --
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
    stalePoint: m.stalePoint ?? null, posted: m.startedAt != null, meta: m, note: r?.result?.note ?? null};
}
async function observe(w, pid, label) {
  const shots = join(OUT, 'shots', fileName(label)); mkdirSync(shots, {recursive: true});
  const r = await w.execute('get_app_state', {pid, includeScreenshot: true, outputDirectory: shots});
  if (r.error) throw new Error(`get_app_state: ${JSON.stringify(r.error).slice(0, 400)}`);
  return r.result;
}
const label = n => [n.title, n.description, n.placeholder, n.help].filter(Boolean).join(' | ');
function findNode(sky, roles, want) {
  const ok = s => typeof s === 'string' && s.trim() === want;
  return sky.nodes.find(n => roles.includes(n.role) && n.frame && n.frame.width > 2 && n.frame.height > 2 && [n.title, n.description, n.placeholder].some(ok));
}
/// A screen point in the screenshot's pixels, and the point the engine will post from them.
function toPixels(sky, p) {
  const f = sky.window.frame, scale = sky.screenshot.width / f.width;
  const px = {x: Math.round((p.x - f.x) * scale), y: Math.round((p.y - f.y) * scale)};
  return {px, screen: {x: f.x + px.x / scale, y: f.y + px.y / scale}};
}
const centre = f => ({x: f.x + f.width / 2, y: f.y + f.height / 2});
const winArr = f => [f.x, f.y, f.width, f.height];
const rect = a => a && {x: a[0], y: a[1], width: a[2], height: a[3]};
const inside = (p, r) => r && p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;

// The sequences: ⌘L opens the omnibox popup (on a fresh profile, its zero-suggest rows); typing a URL gives it a
// what-you-typed row that navigates to /results. The click lands on a popup row, or on a page button outside the popup.
const SEQ = {
  zeroRow: {steps: ['key:cmd+l'], target: 'popup'},
  typedRow: {steps: ['key:cmd+l', 'type:URL/results'], target: 'popup'},
  outside: {steps: ['key:cmd+l'], target: 'button'},
};
// The cells: Chrome behind TextEdit in shared mode (the ticket's), the same with the keys sent while Chrome was frontmost
// and the cover raised after (in case the popup does not open in the background), and the two controls.
const CELLS = [
  {name: 'shared-behind', mode: 'shared', front: false},
  {name: 'shared-behind-primed', mode: 'shared', front: false, keysFront: true},
  {name: 'shared-front', mode: 'shared', front: true},
  {name: 'dedicated-behind', mode: 'dedicated', front: false},
];

/// The popup row to click: the topmost accessibility element in the popup that spans most of its width and lies below
/// the address field's strip (the popup window starts over the omnibox), else the hit scan's, else the popup's lower
/// half by geometry.
function popupPoint(pop) {
  const pr = rect(pop.popup?.bounds);
  if (!pr) return null;
  const strip = pr.y + 34;
  const good = r => r && r.width >= pr.width * 0.5 && r.height >= 14 && r.height <= 80 && r.y >= strip - 2 && r.y + r.height <= pr.y + pr.height + 1;
  const rowLike = /AX(Row|Cell|Button|ListItem|Group|StaticText|Link|MenuItem)/;
  const ax = (pop.axRows ?? []).filter(r => rowLike.test(r.role) && good(rect(r.frame))).sort((a, b) => a.frame[1] - b.frame[1] || b.frame[2] - a.frame[2])[0];
  if (ax) return {by: 'ax', role: ax.role, description: ax.description, title: ax.title, frame: ax.frame, point: centre(rect(ax.frame))};
  const sc = (pop.scan ?? []).filter(s => s.role && rowLike.test(s.role) && good(rect(s.frame)))[0];
  if (sc) return {by: 'scan', role: sc.role, description: sc.description, title: sc.title, frame: sc.frame, point: {x: pop.scanX ?? centre(pr).x, y: sc.frame[1] + sc.frame[3] / 2}};
  return {by: 'geometry', point: {x: pr.x + pr.width * 0.3, y: strip + (pr.y + pr.height - strip) / 2}};
}

const results = [];
const config = {kit: 'probe-337', engineRef: process.env.P337_ENGINE_REF ?? null, reps: REPS, macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '),
  commit: process.env.GITHUB_SHA ?? null, image: process.env.ImageVersion ?? null, stepMs: STEP_MS, url: URL_};
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));

async function run() {
  const profileRoot = join(process.env.RUNNER_TEMP ?? OUT, 'p337');
  let b = null, launches = 0;
  const coverDoc = join(OUT, 'cover.txt');
  writeFileSync(coverDoc, 'The cover: frontmost in the behind cells.\n');
  const raiseCover = async () => {
    sh('open', ['-a', 'TextEdit', coverDoc]);
    await sleep(900);
    osa(`tell application "System Events" to tell process "TextEdit" to set position of window 1 to {${COVER.x}, ${COVER.y}}`);
    osa(`tell application "System Events" to tell process "TextEdit" to set size of window 1 to {${COVER.w}, ${COVER.h}}`);
    setFront(pidOf('TextEdit'));
    await sleep(700);
  };
  const relaunch = async () => {
    if (b && b.exitCode === null) { b.kill('SIGTERM'); for (let i = 0; i < 20 && b.exitCode === null; i++) await sleep(250); if (b.exitCode === null) b.kill('SIGKILL'); await sleep(1000); }
    launches++;
    const prev = lastLoad();
    b = await launch('stable', URL_, join(profileRoot, String(launches)), WIN);
    if (!(await newLoad(prev, 30_000))) throw new Error('Chrome did not load the page');
    const left = b.launchedAt + 22_000 - Date.now(); if (left > 0) await sleep(left);  // past the toolbar's re-layout
    placePid(b.pid, WIN);
    await sleep(1500);
    const w = await connect('shared');
    for (let i = 0; i < 2; i++) { await observe(w, b.pid, `warm-${launches}-${i}`).catch(() => {}); await sleep(1200); }
    w.close();
  };
  const reset = async front => {
    const notes = [];
    if (!b || b.exitCode !== null) { await relaunch(); notes.push('launched'); }
    try {
      const w = await connect('shared');
      for (let i = 0; i < 2; i++) { await w.execute('press_key', {pid: b.pid, key: 'Escape'}); await sleep(250); }
      w.close();
    } catch (e) { notes.push(`escape: ${String(e).slice(0, 120)}`); }
    const prev = lastLoad();
    sendCmd('reload');
    if (!(await newLoad(prev))) { notes.push('no reload: relaunch'); await relaunch(); }
    await ask({op: 'focusweb', pid: b.pid});
    placePid(b.pid, WIN);
    if (front) { setFront(b.pid); await sleep(700); } else await raiseCover();
    const s = await ask({op: 'signals', pid: b.pid, x: WIN.x + 300, y: WIN.y + 400, window: winArr({x: WIN.x, y: WIN.y, width: WIN.w, height: WIN.h})});
    const f = s.focused;
    if (f && !f.inWebArea && !f.isWebArea && ['AXTextField', 'AXComboBox', 'AXSearchField'].includes(f.role)) {
      notes.push(`focus left on ${f.role}: relaunch`);
      await relaunch();
      if (front) setFront(b.pid); else await raiseCover();
      await sleep(700);
    }
    return notes;
  };
  config.chrome = version('stable');
  const cells = CELLS.filter(c => !VARIANTS || VARIANTS.includes(c.name));
  const seqs = Object.keys(SEQ).filter(s => !SEQS || SEQS.includes(s));
  for (let rep = 1; rep <= REPS; rep++) for (const cell of cells) for (const seq of seqs) {
    if (Date.now() - STARTED > BUDGET_MS) { config.budgetStop = true; save(); return; }
    const {steps, target} = SEQ[seq];
    const lab = `${cell.name}-${seq}-${rep}`;
    const row = {label: lab, cell: cell.name, mode: cell.mode, front: cell.front, keysFront: Boolean(cell.keysFront), seq, target, rep, steps: []};
    results.push(row);
    let w;
    try {
      row.reset = await reset(cell.front || cell.keysFront);
      row.frontBefore = frontmost();
      w = await connect(cell.mode);
      const sky0 = await observe(w, b.pid, `${lab}-obs`);
      row.window0 = sky0.window?.frame;
      for (const step of steps) {
        const [kind, ...rest] = step.split(':');
        const value = rest.join(':');
        const r = kind === 'key' ? await w.execute('press_key', {pid: b.pid, key: value})
          : await w.execute('type_text', {pid: b.pid, text: value.replace(/^URL\//, URL_)});
        row.steps.push({step, answer: brief(r), front: frontmost()});
        await sleep(STEP_MS);
      }
      if (cell.keysFront) { await raiseCover(); row.coverRaisedAfterKeys = true; }
      row.frontAtObs = frontmost();
      const sky = await observe(w, b.pid, `${lab}-reobs`);
      const wf = sky.window.frame;
      row.window = wf;
      row.screenshot = sky.screenshot?.url?.replace(/^.*\/shots\//, '') ?? null;
      row.screenshotSize = sky.screenshot ? [sky.screenshot.width, sky.screenshot.height] : null;
      const pop = await ask({op: 'popup', pid: b.pid, window: winArr(wf)});
      row.popupAtObs = pop;
      const pr = rect(pop.popup?.bounds);
      // What of the popup the observation's tree holds: nodes whose centre lies in the popup's bounds.
      row.nodesInPopup = pr ? sky.nodes.filter(n => n.frame && inside(centre(n.frame), pr)).map(n => ({role: n.role, label: label(n).slice(0, 80), frame: n.frame})).slice(0, 30) : [];
      let point;
      if (target === 'popup') {
        if (!pr) { row.problem = 'no popup at the re-observation'; continue; }
        const pick = popupPoint(pop);
        row.pick = pick;
        point = pick.point;
      } else {
        const n = findNode(sky, ['AXButton'], 'Beta');
        if (!n) { row.problem = 'no Beta button'; continue; }
        row.pick = {by: 'node', role: n.role, frame: n.frame};
        point = centre(n.frame);
      }
      const {px, screen} = toPixels(sky, point);
      row.point = {px, screen, inPopup: inside(screen, pr)};
      row.signals = await ask({op: 'signals', pid: b.pid, x: screen.x, y: screen.y, window: winArr(wf)});
      sh('screencapture', ['-x', '-t', 'jpg', join(OUT, 'screens', `${fileName(lab)}.jpg`)]);
      const mark = events.length, loadBefore = lastLoad();
      const t0 = Date.now();
      const r = await w.execute('click', {pid: b.pid, x: px.x, y: px.y});
      row.clickMs = Date.now() - t0;
      row.click = brief(r);
      await sleep(1500);
      const ev = events.slice(mark);
      const loads = ev.filter(e => e.type === 'ready').map(e => e.path);
      const page = [...new Set(ev.filter(e => ['click', 'focusin', 'pointerdown', 'mousedown', 'submit'].includes(e.type)).map(e => `${e.type}:${e.id}`))];
      const after = await ask({op: 'popup', pid: b.pid, window: winArr(wf)});
      const popupAfter = after.popup ? {n: after.popup.n, bounds: after.popup.bounds, layer: after.popup.layer} : null;
      row.after = {loads, page, popup: popupAfter, front: frontmost(), focus: (await ask({op: 'focus', pid: b.pid})).focused ?? null, sameLoad: lastLoad() === loadBefore};
      const ids = page.map(p => p.split(':')[1]);
      let landing;
      if (row.click.error) landing = `refused:${row.click.error}`;
      else if (loads.includes('/results')) landing = 'navigated:/results';
      else if (loads.length) landing = `navigated:${loads.join(',')}`;
      else if (target === 'button' && ids.includes('b2')) landing = 'landed:b2';
      else if (page.some(p => /^click:/.test(p))) landing = `page:${page.filter(p => /^click:/.test(p)).join(',')}`;
      else if (pr && !popupAfter) landing = 'popup-dismissed';
      else landing = 'nothing';
      row.landing = landing;
    } catch (e) { row.exception = String(e?.stack || e).slice(0, 1500); }
    finally {
      w?.close(); save();
      const sp = row.click?.stalePoint;
      log(`${lab}: ${row.problem ?? row.exception?.split('\n')[0] ?? `${row.landing} ${sp ? `${sp.verdict}/${sp.reason} rec=${sp.recordedRole} hit=${sp.hitRole}` : 'no stalePoint'} route=${row.click?.route} popup=${JSON.stringify(row.popupAtObs?.popup ?? null)} by=${row.pick?.by} inPopup=${row.point?.inPopup} front=${row.frontAtObs}->${row.after?.front} msg=${(row.click?.message ?? '').slice(0, 160)}`}`);
    }
  }
  if (b && b.exitCode === null) { b.kill('SIGTERM'); await sleep(1500); }
}

log('config', JSON.stringify(config));
try { await run(); } catch (e) { config.exception = String(e?.stack || e).slice(0, 2000); log('EXCEPTION', config.exception); }
config.engineStderr = engineErr.slice(-4000);
config.minutes = Math.round((Date.now() - STARTED) / 600) / 100;
save();
engine?.kill('SIGKILL');
tool.stdin.end(); server.close();
process.exit(0);
