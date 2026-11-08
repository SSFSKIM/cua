// #316's measure-first spike (ruling cb252e88): the false-refusal price of "a modifier chord, Escape or Enter sent to an
// app since its screenshot makes coordinate clicks in that app require a re-observation", on #305's sweep pattern
// extended to typing then clicking, and the signals a narrower detector could read at click time.
//
// Each cell, on main's engine (one process for the job, a fresh connection per cell): a re-set, one observation with a
// screenshot, a sequence a model sends (clicks into a field placed in that screenshot, type_text, press_key), then a
// coordinate click on a target placed in the SAME screenshot (a re-observation only where the sequence names one). Just
// before that click the side tool (tool.swift) reads the window list, the app's focus, the hit and the controls outside
// the web area; after it, where the click landed is read from the page's own event beacons (browsers) or the app's
// state (TextEdit's caret and Bold, Finder's selection and focus). The candidate itself is a function of the sequence,
// so the reader (offline/table.mjs) prices it, and the narrower detectors, from these rows.
//
//   node scripts/probe-316/measure.mjs --group safari|chrome|firefox|native --engine <bin> --tool <bin> --out <dir>
//        [--reps n] [--only seq,...] [--variants name,...] [--budget minutes]
// Runs only on a GitHub-hosted runner: it launches, places and kills its own apps.
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, rmSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {launch, placePid, version, CFT, STABLE} from './browser.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-316: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), ENGINE = arg('engine'), TOOL = arg('tool'), GROUP = arg('group');
const REPS = Number(arg('reps') ?? 1);
const ONLY = arg('only')?.split(',');
const VARIANTS = arg('variants')?.split(',');
const BUDGET_MS = Number(arg('budget') ?? 110) * 60_000;
const STARTED = Date.now();
mkdirSync(OUT, {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-316:', ...a);
const STEP_MS = 800;  // between a sequence's actions: a model's next call comes later than this
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
const clip = text => spawnSync('pbcopy', [], {input: text});

// ---- the page: fields, an in-page suggestion list under the search field (as a site's), an in-page menu, a native
// select, a checkbox, buttons, links and a textarea; every pointer, focus, submit and key event beaconed with the
// nearest id, and a long-poll the probe re-sets the page through.
const SCRIPT = `<script>(() => { const load = Math.random().toString(36).slice(2, 10);
const send = (type, extra) => navigator.sendBeacon('/ev', JSON.stringify({load, path: location.pathname, type, t: Date.now(), ...extra}));
const idOf = t => { const e = t && t.closest ? t.closest('[id]') : null; return e ? e.id : (t && t.tagName) || null; };
for (const k of ['pointerdown', 'mousedown', 'click', 'focusin', 'submit', 'change']) document.addEventListener(k, e => send(k, {id: idOf(e.target), trusted: e.isTrusted}), true);
document.addEventListener('keydown', e => send('keydown', {key: e.key.length === 1 ? 'char' : e.key, meta: e.metaKey, id: idOf(e.target)}), true);
const $ = id => document.getElementById(id);
const sugg = $('sugg'), menu = $('menu'), q = $('q');
if (q) q.addEventListener('input', () => { sugg.style.display = q.value ? 'block' : 'none'; });
if ($('mb')) $('mb').addEventListener('click', () => { menu.style.display = menu.style.display === 'block' ? 'none' : 'block'; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (sugg) sugg.style.display = 'none'; if (menu) menu.style.display = 'none'; } });
document.addEventListener('click', e => { if (menu && e.target.id !== 'mb' && !menu.contains(e.target)) menu.style.display = 'none'; });
const run = c => { if (c === 'reload') location.replace('/'); if (c === 'state') send('state', {active: idOf(document.activeElement), hash: location.hash}); };
(async () => { for (;;) { try { const r = await fetch('/cmd?load=' + load, {cache: 'no-store'}); const j = await r.json(); if (j.cmd) run(j.cmd); } catch (e) { await new Promise(r => setTimeout(r, 500)); } } })();
addEventListener('load', () => send('ready', {}));
})();</script>`;
const items = (n, id, label, role) => Array.from({length: n}, (_, i) => `<a id="${id}${i + 1}" href="${id === 's' ? `/results?q=s${i + 1}` : '#m'}" role="${role}" style="display:block;padding:6px 8px">${label} ${i + 1}</a>`).join('');
const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe316 page</title>
<style>body{font:15px -apple-system,Helvetica,sans-serif;margin:0} .a{position:absolute;left:16px} .drop{position:absolute;left:16px;display:none;background:#fff;border:1px solid #888;z-index:5;box-shadow:0 2px 6px #0004}</style></head>
<body id="page"><div id="wrap" style="position:relative;height:560px">
<h3 class="a" style="top:2px;margin:0">probe316 page</h3>
<form id="nf" class="a" style="top:36px" onsubmit="event.preventDefault()"><input id="name" aria-label="Your name" placeholder="Your name" size="22"> <button id="save" type="submit">Save</button></form>
<form id="sf" class="a" style="top:74px" action="/results"><input id="q" name="q" aria-label="Search" placeholder="Search" autocomplete="off" size="22"> <button id="go" type="submit">Go</button></form>
<div id="sugg" class="drop" role="listbox" aria-label="Suggestions" style="top:100px;width:300px">${items(6, 's', 'Suggestion', 'option')}</div>
<div class="a" style="top:124px"><button id="mb" type="button" aria-haspopup="menu" aria-label="Menu">Menu</button> <select id="sel" aria-label="Choice"><option>One</option><option>Two</option><option>Three</option></select></div>
<div id="menu" class="drop" role="menu" aria-label="Page menu" style="top:152px;width:220px">${items(4, 'm', 'Menu item', 'menuitem')}</div>
<div class="a" style="top:170px"><label id="optl"><input type="checkbox" id="opt" aria-label="Option"> Option</label></div>
<div class="a" style="top:206px"><button id="b1" type="button">Alpha</button> <button id="b2" type="button">Beta</button> <button id="b3" type="button">Gamma</button> <button id="b4" type="button">Delta</button></div>
<div class="a" style="top:244px"><a id="l1" href="#one">Link one</a> &nbsp; <a id="l2" href="#two">Link two</a></div>
<textarea id="notes" class="a" aria-label="Notes" style="top:290px;width:420px;height:150px"></textarea>
</div>${SCRIPT}</body></html>`;
const RESULTS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe316 results</title><style>body{font:15px -apple-system,Helvetica,sans-serif;margin:16px}</style></head>
<body id="results"><h3>Results</h3>${Array.from({length: 8}, (_, i) => `<p><a id="r${i + 1}" href="#r">Result ${i + 1}</a></p>`).join('')}${SCRIPT}</body></html>`;

const events = [];
let pollers = [], queued = null;
const server = createServer((req, res) => {
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
});
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

// ---- the engine's wire: a 4-byte little-endian length, then JSON-RPC 2.0 -----------------------------------------
class Wire {
  static connect(path) { return new Promise((resolve, reject) => { const s = createConnection(path); s.once('connect', () => { s.off('error', reject); resolve(new Wire(s)); }); s.once('error', reject); }); }
  constructor(s) {
    this.s = s; this.chunks = []; this.len = 0; this.pending = new Map(); this.id = 1;
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
  execute(method, args) { return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + 60_000}); }
  close() { this.s.destroy(); }
}
// One engine process for the job (one alive at a time), restarted if it dies; its socket path stays short.
const SOCK_DIR = join(process.env.RUNNER_TEMP ?? OUT, 's316'); mkdirSync(SOCK_DIR, {recursive: true, mode: 0o700});
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
// The side tool, a line server.
const tool = spawn(TOOL, [], {stdio: ['pipe', 'pipe', 'inherit']});
const waiting = [];
createInterface({input: tool.stdout}).on('line', l => { try { waiting.shift()?.(JSON.parse(l)); } catch { waiting.shift()?.({error: 'bad answer'}); } });
const ask = (o, timeout = 30_000) => new Promise(resolve => { const t = setTimeout(() => resolve({error: 'tool timeout'}), timeout); waiting.push(v => { clearTimeout(t); resolve(v); }); tool.stdin.write(JSON.stringify(o) + '\n'); });

// ---- shared steps -------------------------------------------------------------------------------------------------
const lean = r => JSON.parse(JSON.stringify(r ?? null, (k, v) => (k === 'nodes' || k === 'menuBar' ? `[${Array.isArray(v) ? v.length : '?'}]` : v)));
const errName = r => r?.error ? (r.error.data?.errorName ?? r.error.data?.name ?? r.error.errorName ?? r.error.name ?? r.error.code ?? 'error') : null;
const metaOf = r => r?.error ? (r.error.data?.meta ?? r.error.meta ?? null) : (r?.result?.meta ?? null);
function brief(r) {
  const m = metaOf(r) ?? {};
  return {error: errName(r), message: r?.error ? String(r.error.message ?? '').slice(0, 400) : null, route: m.inputRoute ?? null,
    stalePoint: m.stalePoint ?? null, elementClick: m.elementClick ?? null, pointer: m.pointer ?? m.pointerTarget ?? null,
    note: r?.result?.note ?? null, metaKeys: Object.keys(m)};
}
async function observe(w, pid, label) {
  const shots = join(OUT, 'shots', fileName(label)); mkdirSync(shots, {recursive: true});
  const r = await w.execute('get_app_state', {pid, includeScreenshot: true, outputDirectory: shots});
  if (r.error) throw new Error(`get_app_state: ${JSON.stringify(r.error).slice(0, 400)}`);
  return r.result;
}
const label = n => [n.title, n.description, n.placeholder, n.help].filter(Boolean).join(' | ');
/// The first node of one of `roles` with a frame whose title, description or placeholder is `want` (a string, matched
/// whole after trimming) or matches it (a RegExp).
function findNode(sky, roles, want) {
  const ok = s => typeof s === 'string' && (typeof want === 'string' ? s.trim() === want : want.test(s));
  return sky.nodes.find(n => roles.includes(n.role) && n.frame && n.frame.width > 2 && n.frame.height > 2 && [n.title, n.description, n.placeholder].some(ok));
}
/// A screen point in the screenshot's pixels, and the point the engine will post from them.
function toPixels(sky, p) {
  const f = sky.window.frame, scale = sky.screenshot.width / f.width;
  const px = {x: Math.round((p.x - f.x) * scale), y: Math.round((p.y - f.y) * scale)};
  return {px, screen: {x: f.x + px.x / scale, y: f.y + px.y / scale}};
}
const centre = n => ({x: n.frame.x + n.frame.width / 2, y: n.frame.y + n.frame.height / 2});
/// The candidate (ruling cb252e88): a press_key with a modifier chord, Escape or Return (and type_text with a newline)
/// since the screenshot the click's coordinates came from.
const triggers = step => /^key:(.*\+|Escape$|Return$)/.test(step) || (/^type:/.test(step) && step.includes('\n'));
function candidateRefuses(steps) {
  let armed = false;
  for (const s of steps) { if (s === 'reobserve') armed = false; else if (triggers(s)) armed = true; }
  return armed;
}

const results = [];
const config = {group: GROUP, reps: REPS, macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), commit: process.env.GITHUB_SHA ?? null,
  image: process.env.ImageVersion ?? null, display: osa('tell application "Finder" to get bounds of window of desktop').out, stepMs: STEP_MS};
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));
const overBudget = () => Date.now() - STARTED > BUDGET_MS;

/// A sequence's steps through the engine. `ctx.point(stepTarget, sky)` answers a step's screen point; `ctx.setup(step)`
/// reads whether a setup click landed. Answers the sky the click is placed in (a re-observation's, where one ran).
async function runSteps(w, pid, sky, steps, ctx, row) {
  for (const step of steps) {
    const [kind, ...rest] = step.split(':');
    const value = rest.join(':');
    const rec = {step};
    row.steps.push(rec);
    if (kind === 'clip') { clip(value); continue; }
    if (kind === 'reobserve') {
      const again = await observe(w, pid, `${row.label}-reobs`);
      row.reobs = ctx.reobserved(again);
      sky = again;
      rec.ok = true;
      await sleep(300);
      continue;
    }
    const mark = events.length;
    let r;
    if (kind === 'click' || kind === 'clicktext') {
      const p = await ctx.point(step, sky);
      if (!p) { rec.problem = 'no point'; row.problem = `setup: no point for ${step}`; return null; }
      const {px} = toPixels(sky, p);
      r = await w.execute('click', {pid, x: px.x, y: px.y});
    } else if (kind === 'type') r = await w.execute('type_text', {pid, text: value});
    else if (kind === 'key') r = await w.execute('press_key', {pid, key: value});
    rec.answer = brief(r);
    await sleep(STEP_MS);
    if (kind === 'click' || kind === 'clicktext') rec.setup = await ctx.setup(step, mark);
  }
  return sky;
}

// ---- browsers -----------------------------------------------------------------------------------------------------
const BSEQ = {
  none: [],
  type: ['click:name', 'type:hello'],
  typeEnter: ['click:name', 'type:hello', 'key:Return'],
  suggest: ['click:q', 'type:pro'],
  suggestEnter: ['click:q', 'type:pro', 'key:Return'],
  escMenu: ['click:mb', 'key:Escape'],
  escSelect: ['click:sel', 'key:Escape'],
  cmdA: ['click:name', 'type:hello', 'key:cmd+a'],
  cmdC: ['click:name', 'type:hello', 'key:cmd+a', 'key:cmd+c'],
  cmdV: ['clip:pasted words', 'click:name', 'key:cmd+v'],
  tab: ['click:name', 'key:Tab'],
  F19: ['key:F19'],
  cmdL: ['key:cmd+l'],
  cmdLesc: ['key:cmd+l', 'key:Escape'],
  cmdLtype: ['key:cmd+l', 'type:probe'],
  cmdLreobs: ['key:cmd+l', 'reobserve'],
};
const BNODES = {
  name: [['AXTextField'], 'Your name'],
  q: [['AXTextField', 'AXComboBox', 'AXSearchField'], 'Search'],
  mb: [['AXButton', 'AXMenuButton', 'AXPopUpButton'], 'Menu'],
  sel: [['AXPopUpButton', 'AXComboBox', 'AXMenuButton'], 'Choice'],
  button: [['AXButton'], 'Beta'],
  checkbox: [['AXCheckBox'], 'Option'],
  link: [['AXLink'], 'Link one'],
  textarea: [['AXTextArea'], 'Notes'],
};
const BIDS = {button: ['b2'], checkbox: ['opt', 'optl'], link: ['l1'], textarea: ['notes'], name: ['name'], q: ['q'], mb: ['mb'], sel: ['sel']};
const BTARGETS = ['button', 'checkbox', 'link', 'textarea'];
const ALL = Object.keys(BSEQ);
const CMDL = ['none', 'F19', 'cmdL', 'cmdLesc', 'cmdLtype', 'cmdLreobs'];
const BVARIANTS = {
  safari: [
    {name: 'shared-front', mode: 'shared', front: true, seqs: ALL},
    {name: 'shared-behind', mode: 'shared', front: false, seqs: [...CMDL, 'type', 'typeEnter', 'escMenu', 'cmdA']},
    {name: 'dedicated-front', mode: 'dedicated', front: true, seqs: [...CMDL, 'typeEnter', 'escMenu', 'cmdA', 'suggest']},
  ],
  cft: [
    {name: 'shared-front', mode: 'shared', front: true, seqs: ALL},
    {name: 'dedicated-front', mode: 'dedicated', front: true, seqs: ALL},
  ],
  stable: [
    {name: 'shared-front', mode: 'shared', front: true, seqs: [...CMDL, 'typeEnter', 'escMenu']},
    {name: 'dedicated-front', mode: 'dedicated', front: true, seqs: [...CMDL, 'typeEnter', 'escMenu']},
  ],
  firefox: [
    {name: 'shared-front', mode: 'shared', front: true, seqs: ALL},
    {name: 'dedicated-front', mode: 'dedicated', front: true, seqs: ALL},
  ],
};

/// The page events since `mark`, by type and id.
const since = mark => events.slice(mark).filter(e => !['ready', 'state', 'keydown'].includes(e.type));
function pageLanding(mark, ids, loadBefore) {
  const ev = since(mark);
  const hits = ev.filter(e => ['click', 'focusin', 'change'].includes(e.type));
  const loads = events.slice(mark).filter(e => e.type === 'ready').map(e => e.path);
  const onTarget = hits.some(e => ids.includes(e.id));
  const others = [...new Set(ev.filter(e => !ids.includes(e.id)).map(e => `${e.type}:${e.id}`))];
  let landing;
  if (onTarget) landing = 'landed';
  else if (loads.length) landing = 'navigated';
  else if (others.some(o => /^(click|pointerdown|mousedown|focusin):/.test(o) && !/:(page|wrap|BODY|HTML)$/.test(o))) landing = 'other';
  else if (others.length) landing = 'blank';
  else landing = 'lost';
  return {landing, others, loads, n: ev.length, sameLoad: lastLoad() === loadBefore};
}

async function runBrowser(kind) {
  const profileRoot = join(process.env.RUNNER_TEMP ?? OUT, `p316-${kind}`);
  let b = null, launches = 0;
  const textEditDoc = join(OUT, 'cover.txt');
  writeFileSync(textEditDoc, 'The cover: frontmost in the behind variant.\n');
  const relaunch = async () => {
    if (b && b.exitCode === null) { b.kill('SIGTERM'); for (let i = 0; i < 20 && b.exitCode === null; i++) await sleep(250); if (b.exitCode === null) b.kill('SIGKILL'); await sleep(1000); }
    launches++;
    const prev = lastLoad();
    b = await launch(kind, URL_, join(profileRoot, String(launches)), WIN);
    if (!(await newLoad(prev, 30_000))) throw new Error(`${kind} did not load the page`);
    if (kind === 'cft' || kind === 'stable') { const left = b.launchedAt + 22_000 - Date.now(); if (left > 0) await sleep(left); }  // past the toolbar's re-layout
    placePid(b.pid, WIN);
    await sleep(1500);
    // Firefox's first contact turns its accessibility on with a zero web-area frame (#287): two observations first.
    const w = await connect('shared');
    for (let i = 0; i < 2; i++) { await observe(w, b.pid, `${kind}-warm-${launches}-${i}`).catch(() => {}); await sleep(1200); }
    w.close();
  };
  const reset = async variant => {
    const notes = [];
    if (!b || b.exitCode !== null) { await relaunch(); notes.push('launched'); }
    // Whatever the last cell left (a menu, a popup, an address field): Escape twice by the engine (not the user's), the
    // page re-loaded by its own long-poll, the web area's focus written.
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
    if (variant.front) setFront(b.pid);
    else {
      sh('open', ['-a', 'TextEdit', textEditDoc]);
      await sleep(900);
      osa(`tell application "System Events" to tell process "TextEdit" to set position of window 1 to {${COVER.x}, ${COVER.y}}`);
      osa(`tell application "System Events" to tell process "TextEdit" to set size of window 1 to {${COVER.w}, ${COVER.h}}`);
      setFront(pidOf('TextEdit'));
    }
    await sleep(700);
    // The address field still focused after all that: a fresh browser.
    const s = await ask({op: 'signals', pid: b.pid, x: WIN.x + 300, y: WIN.y + 400, window: [WIN.x, WIN.y, WIN.w, WIN.h]});
    const f = s.focused;
    if (f && !f.inWebArea && !f.isWebArea && ['AXTextField', 'AXComboBox', 'AXSearchField'].includes(f.role)) {
      notes.push(`focus left on ${f.role} ${f.description ?? ''}: relaunch`);
      await relaunch();
      if (variant.front) setFront(b.pid); else setFront(pidOf('TextEdit'));
      await sleep(700);
    }
    return notes;
  };
  const ctx = sky0 => ({
    point: async (step, sky) => { const key = step.split(':')[1]; const n = findNode(sky, ...BNODES[key]); return n ? centre(n) : null; },
    setup: async (step, mark) => { const key = step.split(':')[1]; await sleep(200); return pageLanding(mark, BIDS[key], null).landing; },
    reobserved: null,
  });
  const variants = BVARIANTS[kind].filter(v => !VARIANTS || VARIANTS.includes(v.name));
  config[`${kind}Version`] = version(kind);
  for (let rep = 1; rep <= REPS; rep++) for (const variant of variants) for (const seq of variant.seqs.filter(s => !ONLY || ONLY.includes(s))) for (const target of BTARGETS) {
    if (overBudget()) { config.budgetStop = true; save(); return; }
    const lab = `${kind}-${variant.name}-${seq}-${target}-${rep}`;
    const row = {label: lab, app: kind, variant: variant.name, mode: variant.mode, front: variant.front, seq, target, rep, steps: [],
      candidate: candidateRefuses(BSEQ[seq])};
    results.push(row);
    let w;
    try {
      row.reset = await reset(variant);
      row.frontBefore = frontmost();
      w = await connect(variant.mode);
      const sky = await observe(w, b.pid, `${lab}-obs`);
      row.window = sky.window?.frame;
      row.screenshot = sky.screenshot?.url?.replace(/^.*\/shots\//, '');
      const tnode = findNode(sky, ...BNODES[target]);
      if (!tnode) { row.problem = `no ${target} node`; row.roles = sky.nodes.filter(n => /AX(Button|CheckBox|Link|TextArea|TextField)/.test(n.role)).map(n => `${n.role}:${label(n)}`).slice(0, 40); continue; }
      const c = ctx(sky);
      c.reobserved = again => {
        const n = findNode(again, ...BNODES[target]);
        const roles = ns => new Map(ns.map(x => [`${x.role}|${x.title ?? ''}|${x.description ?? ''}`, x]));
        const a = roles(sky.nodes), z = roles(again.nodes);
        return {targetSeen: Boolean(n), targetFrame: n?.frame ?? null, nodes: again.nodes.length, nodesBefore: sky.nodes.length,
          screenshot: again.screenshot?.url?.replace(/^.*\/shots\//, ''),
          added: [...z.keys()].filter(k => !a.has(k)).slice(0, 30), removed: [...a.keys()].filter(k => !z.has(k)).slice(0, 30),
          focused: again.nodes.find(x => x.token === again.focused) ? (({role, description, identifier}) => ({role, description, identifier}))(again.nodes.find(x => x.token === again.focused)) : again.focused ?? null,
          webArea: again.nodes.find(x => x.role === 'AXWebArea')?.frame ?? null};
      };
      const used = await runSteps(w, b.pid, sky, BSEQ[seq], c, row);
      if (!used) continue;
      const node = used === sky ? tnode : findNode(used, ...BNODES[target]);
      if (!node) { row.problem = 're-observation shows no target'; row.skippedClick = true; continue; }
      const {px, screen} = toPixels(used, centre(node));
      row.point = {px, screen};
      row.signals = await ask({op: 'signals', pid: b.pid, x: screen.x, y: screen.y, window: [used.window.frame.x, used.window.frame.y, used.window.frame.width, used.window.frame.height]});
      sh('screencapture', ['-x', '-t', 'jpg', join(OUT, 'screens', `${fileName(lab)}.jpg`)]);
      const mark = events.length, loadBefore = lastLoad();
      const t0 = Date.now();
      const r = await w.execute('click', {pid: b.pid, x: px.x, y: px.y});
      row.clickMs = Date.now() - t0;
      row.click = brief(r);
      await sleep(1300);
      row.result = pageLanding(mark, BIDS[target], loadBefore);
      if (row.click.error) row.result.landing = `refused:${row.click.error}`;
      const after = await ask({op: 'focus', pid: b.pid});
      row.focusAfter = after.focused ?? null;
    } catch (e) { row.exception = String(e?.stack || e).slice(0, 1500); }
    finally {
      w?.close(); save();
      const sp = row.click?.stalePoint;
      log(`${lab}: ${row.problem ?? row.exception?.split('\n')[0] ?? `${row.result?.landing} ${sp ? `${sp.verdict}/${sp.reason} rec=${sp.recordedRole} hit=${sp.hitRole}` : 'no stalePoint'} route=${row.click?.route} others=${JSON.stringify(row.result?.others ?? [])} cand=${row.candidate} setup=${JSON.stringify(row.steps.filter(s => s.setup).map(s => s.setup))} focus=${row.signals?.focused?.role}/${row.signals?.focused?.inWebArea} above=${(row.signals?.sameAppAbove ?? []).length}`}`);
    }
  }
  if (b && b.exitCode === null) { b.kill('SIGTERM'); await sleep(1500); }
}

// ---- TextEdit ------------------------------------------------------------------------------------------------------
const WORDS = ['amber', 'birch', 'cedar', 'dune', 'ember', 'fjord', 'grove', 'heron', 'iris', 'jade', 'kelp', 'lotus', 'maple', 'nectar', 'opal', 'pine', 'quartz', 'reed', 'sage', 'thyme', 'umber', 'violet'];
const pad = n => String(n).padStart(2, '0');
const TE_LINES = WORDS.map((w, i) => `Line ${pad(i + 1)} ${w} words of a plain document ending eol${pad(i + 1)}`);
const TE_TEXT = TE_LINES.join('\n');
const TSEQ = {
  none: [],
  type: ['clicktext:eol02', 'type:hello '],
  typeEnter: ['clicktext:eol02', 'type:hello ', 'key:Return'],
  escMenu: ['click:popup', 'key:Escape'],
  cmdA: ['clicktext:eol02', 'key:cmd+a'],
  cmdC: ['clicktext:eol02', 'key:cmd+a', 'key:cmd+c'],
  cmdV: ['clip:pasted words ', 'clicktext:eol02', 'key:cmd+v'],
  tab: ['clicktext:eol02', 'key:Tab'],
  F19: ['key:F19'],
};
const TTARGETS = ['word:ember', 'word:kelp', 'word:reed', 'bold'];

async function runTextEdit() {
  const file = join(OUT, 'p316.rtf');
  writeFileSync(file, `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs28\n${TE_LINES.map(l => `${l}\\par`).join('\n')}\n}`);
  let dirty = true;
  const pid = () => pidOf('TextEdit');
  const reopen = async () => {
    osa('tell application "TextEdit" to close every document saving no');
    await sleep(600);
    sh('open', ['-a', 'TextEdit', file]);
    for (let i = 0; i < 30; i++) { await sleep(300); if (osa('tell application "System Events" to count windows of process "TextEdit"').out === '1') break; }
    await sleep(600);
  };
  const reset = async () => {
    const notes = [];
    if (pid()) {
      try { const w = await connect('shared'); for (let i = 0; i < 2; i++) { await w.execute('press_key', {pid: pid(), key: 'Escape'}); await sleep(250); } w.close(); } catch (e) { notes.push('escape failed'); }
    }
    const windows = osa('tell application "System Events" to count windows of process "TextEdit"').out;
    const docs = osa('tell application "TextEdit" to get name of every document').out;
    if (dirty || windows !== '1' || docs !== 'p316.rtf') { await reopen(); notes.push(`reopened (${windows}/${docs})`); dirty = false; }
    else notes.push(JSON.stringify(await ask({op: 'settext', pid: pid(), text: TE_TEXT})));
    osa(`tell application "System Events" to tell process "TextEdit" to set position of window 1 to {${WIN.x}, ${WIN.y}}`);
    osa(`tell application "System Events" to tell process "TextEdit" to set size of window 1 to {${WIN.w}, ${WIN.h}}`);
    setFront(pid());
    await sleep(700);
    return notes;
  };
  const findBold = sky => sky.nodes.find(n => n.frame && n.frame.width <= 60 && /\bbold\b/i.test(label(n)));
  const findPopup = sky => sky.nodes.filter(n => n.role === 'AXPopUpButton' && n.frame && n.frame.y < sky.window.frame.y + 90).sort((a, b) => a.frame.x - b.frame.x)[0];
  for (let rep = 1; rep <= REPS; rep++) for (const seq of Object.keys(TSEQ).filter(s => !ONLY || ONLY.includes(s))) for (const target of TTARGETS) {
    if (overBudget()) { config.budgetStop = true; save(); return; }
    const lab = `textedit-${seq}-${target.replace(':', '-')}-${rep}`;
    const row = {label: lab, app: 'textedit', variant: 'shared-front', mode: 'shared', front: true, seq, target, rep, steps: [], candidate: candidateRefuses(TSEQ[seq])};
    results.push(row);
    let w;
    try {
      row.reset = await reset();
      const p = pid();
      w = await connect('shared');
      const sky = await observe(w, p, `${lab}-obs`);
      row.window = sky.window?.frame;
      let tpoint;
      if (target === 'bold') { const n = findBold(sky); if (!n) { row.problem = 'no Bold control'; row.roles = sky.nodes.filter(n => n.frame && n.frame.y < sky.window.frame.y + 90).map(n => `${n.role}:${label(n)}`).slice(0, 40); continue; } tpoint = centre(n); row.boldNode = {role: n.role, label: label(n), frame: n.frame}; }
      else { const tp = await ask({op: 'textpoint', pid: p, phrase: target.slice(5), after: 2}); if (tp.error) { row.problem = `textpoint ${tp.error}`; continue; } tpoint = {x: tp.x, y: tp.y}; }
      const c = {
        point: async step => {
          if (step === 'click:popup') { const n = findPopup(sky); return n ? centre(n) : null; }
          const tp = await ask({op: 'textpoint', pid: p, phrase: step.split(':')[1], after: 4});
          return tp.error ? null : {x: tp.x + 4, y: tp.y};
        },
        setup: async step => step.startsWith('clicktext') ? ((await ask({op: 'caret', pid: p})).line ?? '').includes('eol02') ? 'landed' : 'other' : 'n/a',
        reobserved: () => null,
      };
      const used = await runSteps(w, p, sky, TSEQ[seq], c, row);
      if (!used) continue;
      const {px, screen} = toPixels(sky, tpoint);
      row.point = {px, screen};
      row.signals = await ask({op: 'signals', pid: p, x: screen.x, y: screen.y, window: [sky.window.frame.x, sky.window.frame.y, sky.window.frame.width, sky.window.frame.height]});
      const before = target === 'bold' ? await ask({op: 'value', pid: p, x: screen.x, y: screen.y}) : null;
      sh('screencapture', ['-x', '-t', 'jpg', join(OUT, 'screens', `${fileName(lab)}.jpg`)]);
      const r = await w.execute('click', {pid: p, x: px.x, y: px.y});
      row.click = brief(r);
      await sleep(1000);
      if (target === 'bold') {
        dirty = true;
        const after = await ask({op: 'value', pid: p, x: screen.x, y: screen.y});
        const v0 = before?.hit?.value, v1 = after?.hit?.value;
        row.result = {landing: v0 == null || v1 == null ? 'unknown' : v0 !== v1 ? 'landed' : 'lost', before: before?.hit ?? null, after: after?.hit ?? null};
      } else {
        const word = target.slice(5);
        const cr = await ask({op: 'caret', pid: p, phrase: word});
        const loc = cr.range?.[0];
        row.result = {landing: loc != null && cr.phraseIndex >= 0 && loc >= cr.phraseIndex && loc <= cr.phraseIndex + word.length ? 'landed' : 'other', caret: cr};
      }
      if (row.click.error) row.result.landing = `refused:${row.click.error}`;
      if (seq === 'escMenu') dirty = true;
    } catch (e) { row.exception = String(e?.stack || e).slice(0, 1500); dirty = true; }
    finally {
      w?.close(); save();
      const sp = row.click?.stalePoint;
      log(`${lab}: ${row.problem ?? row.exception?.split('\n')[0] ?? `${row.result?.landing} ${sp ? `${sp.verdict}/${sp.reason} rec=${sp.recordedRole} hit=${sp.hitRole}` : 'no stalePoint'} cand=${row.candidate} setup=${JSON.stringify(row.steps.filter(s => s.setup).map(s => s.setup))} line=${row.result?.caret?.line ?? ''}`}`);
    }
  }
  osa('tell application "TextEdit" to close every document saving no');
}

// ---- Finder --------------------------------------------------------------------------------------------------------
const FILES = ['apple', 'banana', 'cherry', 'date', 'elder', 'fig', 'grape', 'hazel', 'kiwi', 'lemon', 'mango', 'nectar'].map(f => `${f}.txt`);
const FSEQ = {
  none: [],
  type: ['click:search', 'type:zz'],
  typeEnter: ['click:search', 'type:zz', 'key:Return'],
  escMenu: ['click:action', 'key:Escape'],
  cmdA: ['click:row:apple.txt', 'key:cmd+a'],
  cmdC: ['click:row:apple.txt', 'key:cmd+c'],
  cmdV: ['click:row:apple.txt', 'key:cmd+c', 'key:cmd+v'],
  tab: ['click:row:apple.txt', 'key:Tab'],
  enter: ['click:row:apple.txt', 'key:Return'],
  typeSelect: ['click:row:apple.txt', 'type:k'],
  F19: ['key:F19'],
};
const FTARGETS = ['row:cherry.txt', 'row:grape.txt', 'row:lemon.txt', 'search'];

async function runFinder() {
  const folder = join(process.env.RUNNER_TEMP ?? OUT, 'p316f');
  mkdirSync(folder, {recursive: true});
  for (const f of FILES) writeFileSync(join(folder, f), `${f}\n`);
  const pid = () => pidOf('Finder');
  const selection = () => osa('tell application "Finder"\nset r to {}\nrepeat with i in (get selection)\nset end of r to name of i\nend repeat\nreturn r\nend tell').out;
  const reset = async () => {
    const notes = [];
    try { const w = await connect('shared'); for (let i = 0; i < 2; i++) { await w.execute('press_key', {pid: pid(), key: 'Escape'}); await sleep(250); } w.close(); } catch (e) { notes.push('escape failed'); }
    for (const f of readdirSync(folder)) if (!FILES.includes(f)) { rmSync(join(folder, f), {force: true, recursive: true}); notes.push(`removed ${f}`); }
    osa('tell application "Finder" to close every Finder window');
    await sleep(500);
    sh('open', [folder]);
    for (let i = 0; i < 20; i++) { await sleep(300); if (osa('tell application "Finder" to get name of front Finder window').out === 'p316f') break; }
    osa('tell application "Finder" to set current view of front Finder window to list view');
    osa(`tell application "Finder" to set bounds of front Finder window to {${WIN.x}, ${WIN.y}, ${WIN.x + WIN.w}, ${WIN.y + WIN.h}}`);
    setFront(pid());
    await sleep(1200);
    return notes;
  };
  const row = (sky, name) => sky.nodes.find(n => ['AXTextField', 'AXStaticText'].includes(n.role) && n.frame && [n.value, n.title].some(v => v === name || v === name.replace(/\.txt$/, '')));
  const search = sky => sky.nodes.find(n => n.frame && (n.role === 'AXSearchField' || n.subrole === 'AXSearchField')) ?? findNode(sky, ['AXButton', 'AXMenuButton', 'AXTextField'], /search/i);
  const action = sky => findNode(sky, ['AXMenuButton', 'AXPopUpButton'], /action|more/i) ?? findNode(sky, ['AXMenuButton', 'AXPopUpButton'], /group|sort/i);
  const pointOf = (sky, key) => {
    const n = key === 'search' ? search(sky) : key === 'action' ? action(sky) : row(sky, key.slice(4));
    return n ? centre(n) : null;
  };
  const isSearch = f => f && (f.subrole === 'AXSearchField' || /search/i.test(`${f.description ?? ''} ${f.identifier ?? ''}`));
  for (let rep = 1; rep <= REPS; rep++) for (const seq of Object.keys(FSEQ).filter(s => !ONLY || ONLY.includes(s))) for (const target of FTARGETS) {
    if (overBudget()) { config.budgetStop = true; save(); return; }
    const lab = `finder-${seq}-${target.replace(/[:.]/g, '-')}-${rep}`;
    const r0 = {label: lab, app: 'finder', variant: 'shared-front', mode: 'shared', front: true, seq, target, rep, steps: [], candidate: candidateRefuses(FSEQ[seq])};
    results.push(r0);
    let w;
    try {
      r0.reset = await reset();
      const p = pid();
      w = await connect('shared');
      const sky = await observe(w, p, `${lab}-obs`);
      r0.window = sky.window?.frame;
      const tpoint = pointOf(sky, target);
      if (!tpoint) { r0.problem = `no ${target} node`; r0.roles = sky.nodes.filter(n => n.frame).map(n => `${n.role}:${label(n)}:${n.value ?? ''}`).slice(0, 60); continue; }
      const c = {
        point: async step => pointOf(sky, step.split(':').slice(1).join(':')),
        setup: async step => {
          const key = step.split(':').slice(1).join(':');
          if (key === 'search') return isSearch((await ask({op: 'focus', pid: p})).focused) ? 'landed' : 'other';
          if (key.startsWith('row:')) return selection() === key.slice(4) ? 'landed' : `other:${selection()}`;
          return 'n/a';
        },
        reobserved: () => null,
      };
      const used = await runSteps(w, p, sky, FSEQ[seq], c, r0);
      if (!used) continue;
      const {px, screen} = toPixels(sky, tpoint);
      r0.point = {px, screen};
      r0.signals = await ask({op: 'signals', pid: p, x: screen.x, y: screen.y, window: [sky.window.frame.x, sky.window.frame.y, sky.window.frame.width, sky.window.frame.height]});
      r0.selectionBefore = selection();
      sh('screencapture', ['-x', '-t', 'jpg', join(OUT, 'screens', `${fileName(lab)}.jpg`)]);
      const r = await w.execute('click', {pid: p, x: px.x, y: px.y});
      r0.click = brief(r);
      await sleep(1000);
      const sel = selection();
      const f = (await ask({op: 'focus', pid: p})).focused;
      r0.result = target === 'search' ? {landing: isSearch(f) ? 'landed' : 'other', focus: f, selection: sel}
        : {landing: sel === target.slice(4) ? 'landed' : 'other', selection: sel, focus: f};
      r0.result.files = readdirSync(folder).length;
      r0.result.window = osa('tell application "Finder" to get name of front Finder window').out;
      if (r0.click.error) r0.result.landing = `refused:${r0.click.error}`;
    } catch (e) { r0.exception = String(e?.stack || e).slice(0, 1500); }
    finally {
      w?.close(); save();
      const sp = r0.click?.stalePoint;
      log(`${lab}: ${r0.problem ?? r0.exception?.split('\n')[0] ?? `${r0.result?.landing} ${sp ? `${sp.verdict}/${sp.reason} rec=${sp.recordedRole} hit=${sp.hitRole}` : 'no stalePoint'} cand=${r0.candidate} setup=${JSON.stringify(r0.steps.filter(s => s.setup).map(s => s.setup))} sel=${r0.result?.selection} win=${r0.result?.window}`}`);
    }
  }
  osa('tell application "Finder" to close every Finder window');
}

mkdirSync(join(OUT, 'screens'), {recursive: true});
log('config', JSON.stringify(config));
try {
  if (GROUP === 'safari') await runBrowser('safari');
  else if (GROUP === 'chrome') { await runBrowser('cft'); await runBrowser('stable'); }
  else if (GROUP === 'firefox') await runBrowser('firefox');
  else if (GROUP === 'native') { await runTextEdit(); await runFinder(); }
  else throw new Error(`unknown group ${GROUP}`);
} catch (e) { config.exception = String(e?.stack || e).slice(0, 2000); log('EXCEPTION', config.exception); }
config.engineStderr = engineErr.slice(-4000);
config.minutes = Math.round((Date.now() - STARTED) / 600) / 100;
save();
engine?.kill('SIGKILL');
tool.stdin.end(); server.close();
process.exit(0);
